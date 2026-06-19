import { EventEmitter } from 'events'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'
import { spawn, ChildProcess } from 'child_process'
import { createRequire } from 'module'
import type { ClaudeSettings } from '../../shared/types'

// Use createRequire for CJS modules — handle electron-vite bundling interop
const _require = createRequire(import.meta.url)
const _pdfParseRaw: any = _require('pdf-parse')
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _pdfParseRaw?.default || _pdfParseRaw
const _mammothRaw: any = _require('mammoth')
const mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } = _mammothRaw?.default || _mammothRaw
const XLSX: any = (_require('xlsx') as any)?.default || _require('xlsx')
const AdmZip: any = (_require('adm-zip') as any)?.default || _require('adm-zip')

interface ChatSession {
  id: string
  messages: Anthropic.MessageParam[]
  abortController: AbortController | null
  systemPromptOverride?: string // Per-session system prompt (for WeChat personas)
  // Message queue for mid-task messaging
  pendingMessages: Array<{ text: string; images?: string[] }>
  // Batched delta output
  deltaBuffer: string
  deltaTimer: ReturnType<typeof setTimeout> | null
}

// ── Background Task Worker (BTW) Sub-agent ──
export interface BtwSession {
  id: string
  task: string
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'queued'
  createdAt: number
  messages: Anthropic.MessageParam[]
  abortController: AbortController | null
  output: string
  error?: string
  // Batched delta output for BTW to prevent renderer flood
  deltaBuffer: string
  deltaTimer: ReturnType<typeof setTimeout> | null
  parentSessionId: string
}

// ── BTW concurrency limiter ──
const MAX_CONCURRENT_BTW = 3

export class ChatService extends EventEmitter {
  private static instance: ChatService
  private sessions = new Map<string, ChatSession>()
  private btwSessions = new Map<string, BtwSession>()

  static getInstance(): ChatService {
    if (!ChatService.instance) ChatService.instance = new ChatService()
    return ChatService.instance
  }

  // ── Event batching: flush deltas every 80ms to prevent renderer flood ──
  private flushDelta(session: ChatSession): void {
    if (session.deltaTimer) {
      clearTimeout(session.deltaTimer)
      session.deltaTimer = null
    }
    if (session.deltaBuffer) {
      const text = session.deltaBuffer
      session.deltaBuffer = ''
      this.emit('delta', session.id, text)
    }
  }

  private scheduleDelta(session: ChatSession, text: string): void {
    session.deltaBuffer += text
    if (!session.deltaTimer) {
      session.deltaTimer = setTimeout(() => {
        this.flushDelta(session)
      }, 30) // Batch every 30ms (~33fps) for smooth streaming
    }
  }

  private getApiConfig(): { apiKey: string; baseURL: string; model: string; providerName: string; providerId: string; modelDisplay: string; apiFormat: string } {
    let apiKey = ''
    let baseURL = 'https://api.deepseek.com/anthropic'
    let model = 'deepseek-v4-pro'
    let providerName = 'DeepSeek'
    let providerId = 'deepseek'
    let modelDisplay = 'DeepSeek V4 Pro'
    let apiFormat = 'anthropic'

    // 1. app-settings.json (written by model switcher — NEVER overridden)
    const appPath = join(homedir(), '.claude', 'app-settings.json')
    if (existsSync(appPath)) {
      try {
        const app = JSON.parse(readFileSync(appPath, 'utf-8'))
        baseURL = app.baseURL || baseURL
        model = (app.model || model).replace(/\[1m\]/i, '')
        apiKey = app.authToken || ''
        console.log('[Chat] app-settings:', model, baseURL, 'key=', !!apiKey)
      } catch (e) { console.error('[Chat] app-settings error:', (e as Error).message) }
    }

    // 2. Fallbacks for apiKey
    if (!apiKey) apiKey = process.env.DASHSCOPE_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || ''
    if (!apiKey) {
      const sPath = join(homedir(), '.claude', 'settings.json')
      if (existsSync(sPath)) {
        try {
          const s = JSON.parse(readFileSync(sPath, 'utf-8'))
          apiKey = s?.env?.ANTHROPIC_AUTH_TOKEN || s?.env?.DASHSCOPE_API_KEY || ''
        } catch {}
      }
    }
    if (!apiKey) {
      const fb = join(homedir(), '.claude', '.api-key')
      if (existsSync(fb)) { try { apiKey = readFileSync(fb, 'utf-8').trim() } catch {} }
    }

    // 3. Provider matching from providers.json
    const pp = join(homedir(), '.claude', 'providers.json')
    if (existsSync(pp)) {
      try {
        const pd = JSON.parse(readFileSync(pp, 'utf-8'))
        const po = pd.providers || {}
        for (const [pid, p]: [string, any] of Object.entries(po)) {
          const models = p.models || {}
          for (const [, m]: [string, any] of Object.entries(models)) {
            if ((m.model_id || '').replace(/\[1m\]/i, '') === model) {
              providerId = pid; providerName = p.name; modelDisplay = m.display || model
              apiFormat = (p as any).api_format || 'anthropic'
            }
          }
        }
      } catch {}
    }

    console.log('[Chat] Config:', model, providerName, 'format=', apiFormat, 'keyLen=', apiKey.length)
    return { apiKey, baseURL, model, providerName, providerId, modelDisplay, apiFormat }
  }

  createSession(id: string, systemPrompt?: string): void {
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { id, messages: [], abortController: null, systemPromptOverride: systemPrompt, pendingMessages: [], deltaBuffer: '', deltaTimer: null })
    } else if (systemPrompt) {
      // Update system prompt on existing session AND clear history
      // so the new persona starts fresh without old conversation context
      const sess = this.sessions.get(id)!
      sess.systemPromptOverride = systemPrompt
      sess.messages = []
      sess.abortController?.abort()
      sess.abortController = null
      sess.pendingMessages = []
      this.flushDelta(sess)
    }
  }

  resetSession(id: string): void {
    this.cancel(id)
    const sess = this.sessions.get(id)
    if (sess) {
      sess.messages = []
      sess.systemPromptOverride = undefined
      sess.abortController = null
      sess.pendingMessages = []
      this.flushDelta(sess)
    } else {
      this.sessions.set(id, { id, messages: [], abortController: null, pendingMessages: [], deltaBuffer: '', deltaTimer: null })
    }
  }

  deleteSession(id: string): void {
    this.cancel(id)
    this.sessions.delete(id)
  }

  cancel(sessionId: string): void {
    const sess = this.sessions.get(sessionId)
    if (sess) {
      this.flushDelta(sess)
      sess.pendingMessages = []
      sess.abortController?.abort()
    }
  }

  // ── One-shot generation (for PRD / Analysis / Prototype tools) ──

  async generate(sessionId: string, systemPrompt: string, userMessage: string): Promise<void> {
    const config = this.getApiConfig()
    if (!config.apiKey) {
      this.emit('error', sessionId, '未配置 API Key — 请在模型设置中配置')
      return
    }

    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL })
    const ac = new AbortController()
    // Store abort controller keyed by sessionId
    const s = this.sessions.get(sessionId)
    if (s) { this.flushDelta(s); s.abortController?.abort(); s.abortController = ac }
    else { this.sessions.set(sessionId, { id: sessionId, messages: [], abortController: ac, pendingMessages: [], deltaBuffer: '', deltaTimer: null }) }

    try {
      const stream = client.messages.stream({
        model: config.model,
        max_tokens: 65536,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      const onAbort = () => {
        try { (stream as any).abort?.() } catch {}
        try { (stream as any).controller?.abort() } catch {}
      }
      ac.signal.addEventListener('abort', onAbort, { once: true })

      stream.on('text', (text: string) => {
        // Use batched delta to prevent renderer flooding
        const sess = this.sessions.get(sessionId)
        if (sess) this.scheduleDelta(sess, text)
        else this.emit('delta', sessionId, text)
      })

      await stream.finalMessage()
      ac.signal.removeEventListener('abort', onAbort)

      if (!ac.signal.aborted) {
        // Flush remaining delta before done
        const sess = this.sessions.get(sessionId)
        if (sess) this.flushDelta(sess)
        this.emit('done', sessionId)
      }
    } catch (err: unknown) {
      if (ac.signal.aborted) {
        this.emit('cancelled', sessionId)
      } else {
        this.emit('error', sessionId, err instanceof Error ? err.message : String(err))
      }
    }
  }

  // ── Multimodal Vision Routing (llama.cpp / Qwen3.5-9B VLM) ──

  /** Send images to local llama.cpp Qwen3.5-9B VLM for analysis, return text description */
  private async analyzeImagesWithLlamaCpp(images: string[], context?: string, signal?: AbortSignal): Promise<string | null> {
    const llamaUrl = 'http://localhost:8080/v1/chat/completions'
    const model = 'qwen3.5-9b'

    try {
      // Check if already cancelled before starting
      if (signal?.aborted) return null

      // Build multimodal message content for llama.cpp (OpenAI-compatible format)
      const userContent: any[] = [
        {
          type: 'text',
          text: context
            ? `请详细描述以下图片的内容。用户的问题是: "${context.slice(0, 500)}"。请用中文回答，描述图片中的关键元素、文字、颜色和布局。`
            : '请详细描述这张图片的内容，包括主要元素、文字、颜色、布局等信息。用中文回答。',
        },
      ]

      for (const img of images) {
        userContent.push({ type: 'image_url', image_url: { url: img } })
      }

      const resp = await fetch(llamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: userContent }],
          stream: false,
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal, // Abort fetch if cancelled
      })

      // Check abort after response
      if (signal?.aborted) return null

      if (!resp.ok) {
        console.warn(`[Chat] llama.cpp API returned ${resp.status}`)
        return null
      }

      const data: any = await resp.json()
      const text = data?.choices?.[0]?.message?.content || ''
      if (!text.trim()) return null

      return `[Qwen3.5-9B VLM 视觉分析结果]\n${text.trim()}`
    } catch (e: any) {
      if (e.name === 'AbortError' || signal?.aborted) {
        console.log('[Chat] Image analysis cancelled by user')
        return null
      }
      // llama.cpp not running or unreachable — this is expected if not started
      console.warn(`[Chat] llama.cpp unavailable: ${e.message}`)
      return null
    }
  }

  // ── Tools ──

  private readonly tools: Anthropic.Tool[] = [
    {
      name: 'read_file',
      description: 'Read file contents. Supports text files (.txt,.md,.json,.csv,.js,.ts,.py,etc.), images (.png,.jpg,.gif,.webp - returns base64 for vision), PDF (extracts text), DOCX (extracts text), XLSX/XLS (extracts data as CSV), PPTX (extracts slide text). Max 50000 chars.',
      input_schema: {
        type: 'object' as const,
        properties: { file_path: { type: 'string', description: 'Absolute path to file' } },
        required: ['file_path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
      input_schema: {
        type: 'object' as const,
        properties: {
          file_path: { type: 'string', description: 'Absolute path' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['file_path', 'content'],
      },
    },
    {
      name: 'list_directory',
      description: 'List directory contents',
      input_schema: {
        type: 'object' as const,
        properties: { path: { type: 'string', description: 'Directory path' } },
        required: ['path'],
      },
    },
    {
      name: 'execute_command',
      description: 'Run a shell command',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Command to run' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
    },
  ]

  private async executeTool(name: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    try {
      switch (name) {
        case 'read_file': {
          const p = input.file_path as string
          if (!existsSync(p)) return `Error: file not found: ${p}`
          const ext = extname(p).toLowerCase()

          // ── Image files: return metadata only (NOT base64) ──
          // Reason: Anthropic API does NOT support image type content blocks in tool_result.
          // Sending base64 as text would create a huge payload (~MB) that the model
          // cannot interpret as visual input — it would just see garbled text.
          // Users who want AI to "see" an image should upload it via the chat UI,
          // which correctly sends images as `image` content blocks in user messages.
          if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
            try {
              const buf = readFileSync(p)
              const stats = statSync(p)
              const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/bmp'
              // For PNG, try to extract dimensions from IHDR chunk (first 24 bytes)
              let dimInfo = ''
              if (ext === '.png' && buf.length >= 24) {
                const w = buf.readUInt32BE(16)
                const h = buf.readUInt32BE(20)
                dimInfo = `\n尺寸: ${w} x ${h} 像素`
              } else if ((ext === '.jpg' || ext === '.jpeg') && buf.length > 2) {
                // JPEG dimensions require parsing markers; just note it's a JPEG
                dimInfo = ''
              }
              return `[图片文件] ${basename(p)}\n格式: ${mime}\n文件大小: ${(stats.size / 1024).toFixed(1)} KB${dimInfo}\n\n注意: 此工具无法将图片内容传递给模型视觉识别。如需 AI 分析图片，请通过聊天输入框的"上传文件"按钮上传图片，系统会自动将图片作为视觉输入发送给多模态模型。`
            } catch (e: any) {
              return `Error reading image: ${e.message}`
            }
          }

          // ── PDF: extract text ──
          if (ext === '.pdf') {
            try {
              const pdfBuf = readFileSync(p)
              const pdfData = pdfParse(pdfBuf)
              const text = (pdfData as any).text || '(无可提取文本)'
              return text.length > 50000 ? text.slice(0, 50000) + '\n...(truncated)' : text
            } catch (e: any) {
              return `Error extracting PDF: ${e.message}. Ensure the PDF file is valid.`
            }
          }

          // ── DOCX: extract text from XML (ZIP format) ──
          if (ext === '.docx') {
            try {
              const zip = new AdmZip(p)
              // Main document content is in word/document.xml
              const docXml = zip.readAsText('word/document.xml').toString()
              // Extract text from <w:t> tags
              const texts: string[] = []
              const re = /<w:t[^>]*>([^<]*)<\/w:t>/g
              let m: RegExpExecArray | null
              while ((m = re.exec(docXml)) !== null) { if (m[1].trim()) texts.push(m[1].trim()) }
              const result = texts.join('\n') || '(DOCX 无可提取文本)'
              return result.length > 50000 ? result.slice(0, 50000) + '\n...(truncated)' : result
            } catch (e: any) {
              return `Error reading DOCX: ${e.message}`
            }
          }

          // ── XLSX/XLS: extract data as CSV ──
          if (ext === '.xlsx' || ext === '.xls') {
            try {
              const wb = XLSX.readFile(p)
              const sheets: string[] = []
              wb.SheetNames.forEach(name => {
                const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name])
                sheets.push(`### Sheet "${name}"\n${csv}`)
              })
              const result = sheets.join('\n\n') || '(空工作表)'
              return result.length > 50000 ? result.slice(0, 50000) + '\n...(truncated)' : result
            } catch (e: any) {
              return `Error reading Excel: ${e.message}`
            }
          }

          // ── PPT (legacy binary format): unsupported ──
          if (ext === '.ppt') {
            return '不支持旧版 .ppt 格式，请用 PowerPoint 另存为 .pptx 格式后重新上传'
          }

          // ── PPTX: extract text from slides (ZIP+XML) ──
          if (ext === '.pptx') {
            try {
              const zip = new AdmZip(p)
              const slides = zip.getEntries()
                .filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml$/))
                .sort((a, b) => {
                  const na = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || '0')
                  const nb = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || '0')
                  return na - nb
                })
              const parts: string[] = []
              for (const slide of slides) {
                const xml = zip.readAsText(slide).toString()
                const texts: string[] = []
                const re = /<a:t>([^<]*)<\/a:t>/g
                let m: RegExpExecArray | null
                while ((m = re.exec(xml)) !== null) { if (m[1].trim()) texts.push(m[1].trim()) }
                parts.push(`Slide ${parts.length + 1}: ${texts.join(' | ') || '(空白)'}`)
              }
              const result = parts.length > 0 ? parts.join('\n') : '(PPTX 无可提取文本)'
              return result.length > 50000 ? result.slice(0, 50000) + '\n...(truncated)' : result
            } catch (e: any) {
              return `Error reading PPTX: ${e.message}`
            }
          }

          // ── Default: UTF-8 text file ──
          const c = readFileSync(p, 'utf-8')
          return c.length > 50000 ? c.slice(0, 50000) + '\n...(truncated)' : c
        }
        case 'write_file': {
          const p = input.file_path as string
          const c = (input.content as string) || ''
          const dir = p.split(/[/\\]/).slice(0, -1).join('/')
          if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(p, c, 'utf-8')
          return `Wrote ${c.length} bytes to ${p}`
        }
        case 'list_directory': {
          const p = (input.path as string) || process.cwd()
          if (!existsSync(p)) return `Error: directory not found: ${p}`
          return readdirSync(p).map((n) => {
            const fp = join(p, n)
            try { return `${statSync(fp).isDirectory() ? '📁' : '📄'} ${n}` } catch { return `??? ${n}` }
          }).join('\n') || '(empty)'
        }
        case 'execute_command': {
          const cmd = input.command as string
          const cwd = (input.cwd as string) || process.cwd()
          const isWin = process.platform === 'win32'
          // Use async spawn (NOT execSync) to avoid blocking the main event loop.
          // On Windows, force chcp 65001 (UTF-8) before running the command so
          // Chinese output doesn't get garbled by the default GBK/CP936 code page.
          // LANG/LC_ALL env vars also help many CLI tools output UTF-8.
          let output = ''
          let child: ChildProcess | null = null
          try {
            output = await new Promise<string>((resolve, reject) => {
              const utf8Env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', PYTHONIOENCODING: 'utf-8' }
              // shell:true on Windows uses cmd.exe /d /s /c which handles
              // nested quotes correctly (like Claude Code CLI). This avoids
              // the quoting issues that happen with explicit cmd.exe /c.
              child = spawn(cmd, [], {
                cwd, env: utf8Env,
                shell: isWin ? true : '/bin/bash',
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
              })
              const chunks: Buffer[] = []
              const errChunks: Buffer[] = []
              child.stdout!.on('data', (d: Buffer) => chunks.push(d))
              child.stderr!.on('data', (d: Buffer) => errChunks.push(d))
              child.on('error', reject)
              child.on('close', (code) => {
                const stdout = Buffer.concat(chunks).toString('utf-8').trim()
                const stderr = Buffer.concat(errChunks).toString('utf-8').trim()
                if (code === 0 || stdout) resolve(stdout || stderr)
                else reject(new Error(stderr || `Command exited with code ${code}`))
              })
              // Support abort for instant cancellation. No timeout — model
              // can try alternative approaches if this command fails.
              if (signal) {
                const onAbort = () => {
                  if (!child || child.killed) return
                  if (isWin) {
                    child.kill() // TerminateProcess
                  } else {
                    child.kill('SIGTERM')
                    setTimeout(() => { if (child && !child.killed) child.kill('SIGKILL') }, 3000)
                  }
                }
                signal.addEventListener('abort', onAbort, { once: true })
                if (!signal.aborted) child.on('close', () => { signal.removeEventListener('abort', onAbort) })
              }
            })
          } catch (e: any) {
            output = (e.stdout || e.stderr || e.message || '').trim()
            if (!output) throw e
          }
          // Strip ANSI escape codes from output, keep valid UTF-8
          return output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') || '(ok)'
        }
        default:
          return `Unknown tool: ${name}`
      }
    } catch (err: unknown) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // ── Skill injection ──

  private getSkillsPrompt(): string {
    try {
      const settingsPath = join(homedir(), '.claude', 'settings.json')
      if (!existsSync(settingsPath)) return ''
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const skills = settings.enabledSkills || settings.skills || {}
      // Check which skills are enabled
      const enabledSkills = Object.entries(skills).filter(([_, v]) => v === true).map(([k]) => k)
      if (enabledSkills.length === 0) return ''

      // Read skill prompts from providers.json skills or built-in
      const skillsPath = join(homedir(), '.claude', 'providers.json')
      let skillPrompts: Record<string, string> = {}
      if (existsSync(skillsPath)) {
        const providersData = JSON.parse(readFileSync(skillsPath, 'utf-8'))
        if (providersData.skillPrompts) skillPrompts = providersData.skillPrompts
      }

      // Fallback built-in skill prompts
      const builtinPrompts: Record<string, string> = {
        'frontend-design': '【Frontend Design Skill 激活】请严格遵循以下前端设计规范：\n1. 字体：通过 <link> 加载 Google Fonts。显示字体选有特色的（Instrument Serif/Cormorant Garamond），正文选易读的（DM Sans/Lora）。禁止 Inter/Roboto/Arial。\n2. 色彩：:root 定义完整色板。\n3. 布局：非对称、重叠等有记忆点的构图。\n4. 动画：@keyframes 错落渐显，hover 使用 transition。\n5. 质感：纹理叠加、渐变网格背景。\n6. 响应式：媒体查询适配手机。',
        'prd-standard': '【PRD Standard Skill 激活】严格按此结构输出可开发级 PRD：\n#1 产品概述\n#2 功能需求（含业务规则+交互流程+异常处理）\n#3 非功能需求\n#4 数据埋点方案\n#5 灰度上线策略\n#6 排期建议\n#7 风险评估',
        'competitive-analysis': '【Competitive Analysis Skill 激活】使用以下框架：市场概况、竞品矩阵、SWOT、波特五力、用户体验地图对比、市场空白、差异化策略。',
        'data-viz': '【Data Visualization Skill 激活】Dashboard 原型：CSS/SVG 图表、卡片网格、色盲友好配色、骨架屏动画、坐标轴标签+图例+数据标注。',
        'user-story': '【User Story Mapper Skill 激活】拆解层级：Epic > Feature > User Story(As a/I want/So that) > Acceptance Criteria(Given/When/Then) > Technical Tasks。每 Story 标注 P0/P1/P2、故事点、依赖。',
        'prompt-engineering': '【Prompt Engineering Skill 激活】System Prompt: 角色→能力边界→输出格式→安全约束。Few-shot(≥2正例+1反例)。Chain-of-Thought。JSON Schema。对抗性测试。',
        'accessibility': '【Accessibility Skill 激活】WCAG 2.1 AA：对比度≥4.5:1、键盘Tab可访问、图片alt、表单label、语义化HTML。',
        'responsive': '【Responsive Design Skill 激活】响应式：CSS Grid/Flexbox、断点(手机<768/平板768-1024/桌面>1024)、max-width:100%、clamp()流体排版、触摸≥44px。',
      }

      const prompts = enabledSkills.map(id => skillPrompts[id] || builtinPrompts[id] || '').filter(Boolean)
      return prompts.length > 0 ? '\n\n--- 已激活的 Skill 指令 ---\n' + prompts.join('\n\n') : ''
    } catch { return '' }
  }

  // ── Send message ──

  // ── OpenAI-compatible API path (for Qwen/DashScope) ──
  private async sendMessageOpenAI(
    sessionId: string, userText: string,
    config: { apiKey: string; baseURL: string; model: string; modelDisplay: string; providerName: string },
    session: ChatSession, images?: string[]
  ): Promise<void> {
    const ac = new AbortController()
    session.abortController?.abort()
    session.abortController = ac

    // Build messages
    const msgs: any[] = [
      { role: 'system', content: `You are ${config.modelDisplay}, by ${config.providerName}. Respond in user's language.` }
    ]
    // Convert existing session messages to OpenAI format
    for (const m of session.messages) {
      if (typeof m.content === 'string') {
        msgs.push({ role: m.role, content: m.content })
      } else if (Array.isArray(m.content)) {
        const textBlocks = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text)
        const imgBlocks = m.content.filter((b: any) => b.type === 'image')
        let content = textBlocks.join('\n')
        if (imgBlocks.length > 0) {
          content = '[包含图片]\n' + content
        }
        msgs.push({ role: m.role, content })
      }
    }
    // Add current user message with images
    const userContent: any[] = []
    if (images?.length) {
      for (const img of images) {
        const base64 = img.startsWith('data:') ? img.split(',')[1] : img
        const mime = img.startsWith('data:image/png') ? 'image/png' : img.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
        userContent.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } })
      }
    }
    userContent.push({ type: 'text', text: userText })
    msgs.push({ role: 'user', content: userContent })
    session.messages.push({ role: 'user', content: userText })

    try {
      const resp = await fetch(config.baseURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages: msgs, stream: true }),
        signal: ac.signal,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        this.emit('error', sessionId, `API ${resp.status}: ${errText}`)
        return
      }

      const reader = resp.body?.getReader()
      if (!reader) { this.emit('error', sessionId, 'No response body'); return }
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      while (!ac.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try {
            const json = JSON.parse(line.slice(6))
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              fullText += delta
              this.scheduleDelta(session, delta)
            }
          } catch {}
        }
      }

      this.flushDelta(session)
      session.messages.push({ role: 'assistant', content: fullText })
      this.emit('done', sessionId)
    } catch (e: any) {
      this.flushDelta(session)
      if (e.name === 'AbortError') {
        this.emit('cancelled', sessionId)
      } else {
        this.emit('error', sessionId, e.message)
      }
    } finally {
      if (session.abortController === ac) session.abortController = null
    }
  }

  async sendMessage(sessionId: string, userText: string, images?: string[]): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // ── /btw command: spawn a background sub-agent ──
    const btwMatch = userText.trim().match(/^\/btw\s+(.+)$/i)
    if (btwMatch) {
      const task = btwMatch[1].trim()
      this.spawnBtw(task, sessionId)
      return
    }

    // ── Message queue for mid-task messaging ──
    // If a request is already in-flight, queue the new message.
    // It will be processed after the current one finishes (like Claude Code CLI).
    if (session.abortController && !session.abortController.signal.aborted) {
      session.pendingMessages.push({ text: userText, images })
      this.emit('delta', sessionId, `\n\n> *[队列中] 将在当前任务完成后处理: ${userText.slice(0, 50)}${userText.length > 50 ? '...' : ''}*\n\n`)
      return
    }

    const config = this.getApiConfig()
    if (!config.apiKey) {
      this.emit('error', sessionId, '未配置 API Key')
      return
    }

    // Route to OpenAI format for qwen/dashscope providers
    if (config.apiFormat === 'openai') {
      return this.sendMessageOpenAI(sessionId, userText, config, session, images)
    }

    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL })

    // Abort previous
    session.abortController?.abort()
    const ac = new AbortController()
    session.abortController = ac

    // Build user message content — handle images based on provider capability
    const userContent: Anthropic.ContentBlockParam[] = []
    const providerSupportsVision = config.providerId === 'qwen' // Qwen via DashScope supports vision

    // Multimodal routing: if images present and provider doesn't support vision,
    // try local Qwen3.5-9B VLM (llama.cpp) for image analysis first
    if (images && images.length > 0) {
      if (providerSupportsVision) {
        // Direct vision — send images inline
        for (const img of images) {
          const base64 = img.startsWith('data:') ? img.split(',')[1] : img
          const mediaType = img.startsWith('data:image/png') ? 'image/png'
            : img.startsWith('data:image/jpeg') ? 'image/jpeg'
            : img.startsWith('data:image/gif') ? 'image/gif'
            : img.startsWith('data:image/webp') ? 'image/webp'
            : 'image/png'
          userContent.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType as any, data: base64 },
          } as any)
        }
      } else {
        // Route images through local Qwen3.5-9B VLM (llama.cpp) for vision analysis
        // Check if user cancelled before starting expensive image analysis
        if (ac.signal.aborted) {
          console.log('[Chat] Aborted before image analysis')
          return
        }
        console.log(`[Chat] Provider ${config.providerName} lacks vision support, trying local Qwen3.5-9B VLM (llama.cpp)...`)
        try {
          const descriptions = await this.analyzeImagesWithLlamaCpp(images, userText, ac.signal)
          // Check if user cancelled during image analysis
          if (ac.signal.aborted) {
            console.log('[Chat] Aborted during image analysis')
            return
          }
          if (descriptions) {
            userText = `${descriptions}\n\n[用户原文]\n${userText}`
            console.log('[Chat] Image analysis via local Qwen3.5-9B VLM successful')
          } else {
            userText = `[用户上传了 ${images.length} 张图片，本地视觉模型未返回分析结果。]\n\n${userText}`
          }
        } catch (e: any) {
          if (ac.signal.aborted) {
            console.log('[Chat] Image analysis cancelled')
            return
          }
          console.warn('[Chat] Local Qwen3.5-9B VLM (llama.cpp) unavailable:', e.message)
          userText = `[用户上传了 ${images.length} 张图片。如需图片识别，请：\n1. 启动 llama.cpp: F:\\llama.cpp\\start-server.bat\n2. 确保 Qwen3.5-9B VLM 模型已下载到 F:\\llama.cpp\\models\n3. 重启应用]\n\n${userText}`
        }
      }
    }
    userContent.push({ type: 'text', text: userText })
    session.messages.push({ role: 'user', content: userContent })

    // Use per-session system prompt override if set (e.g. WeChat persona)
    const sessionSystemOverride = session.systemPromptOverride
    const basePrompt = sessionSystemOverride || `You are ${config.modelDisplay}, a large language model by ${config.providerName}. You are running inside ZXCODE, an AI-powered developer assistant desktop application.

## CRITICAL: Execution Rules
1. **Complete tasks in ONE GO.** When the user asks you to do something, plan the full sequence of actions and execute them all. Do NOT stop after one step unless you hit an unrecoverable error.
2. **Use multiple tool calls per response.** You can call read_file, execute_command, write_file, and list_directory all in the same response. Batch them to reduce round-trips.
3. **Don't ask for confirmation.** Just execute. If a command might be destructive, warn the user but still execute.
4. **On error, try alternatives.** If a command fails (e.g., curl with SSL issues), immediately try a different approach (e.g., --insecure flag, python, wget) without asking.
5. **Be decisive.** Pick the right tool for each job and use it.

## Formatting
Respond in the user's language. Use Markdown for formatting. When asked about your identity, always answer that you are ${config.modelDisplay} by ${config.providerName} — never say you are Claude unless you are actually running on Anthropic's Claude model.`
    const skillsPrompt = sessionSystemOverride ? '' : this.getSkillsPrompt()
    const systemPrompt = basePrompt + (skillsPrompt || '')

    const maxRounds = 5
    let round = 0

    try {
      while (round < maxRounds && !ac.signal.aborted) {
        round++

        const stream = client.messages.stream({
          model: config.model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: session.messages,
          tools: this.tools,
        })

        const onAbort = () => {
          try { (stream as any).abort?.() } catch {}
          try { (stream as any).controller?.abort() } catch {}
        }
        ac.signal.addEventListener('abort', onAbort, { once: true })

        let textContent = ''

        stream.on('text', (text: string) => {
          textContent += text
          // Batched delta to prevent renderer flooding
          this.scheduleDelta(session, text)
        })

        // Race finalMessage against abort so the user can always cancel.
        // No timeout — model keeps working until it finishes or user intervenes.
        const msg = await new Promise<Anthropic.Message>((resolve, reject) => {
          let settled = false
          const finish = (fn: () => void) => {
            if (!settled) { settled = true; fn() }
          }
          // User-triggered abort
          const onAbortReject = () => finish(() => reject(new Error('Aborted')))
          ac.signal.addEventListener('abort', onAbortReject, { once: true })
          // Stream completes normally (or with API error)
          stream.finalMessage().then((m) => {
            finish(() => { ac.signal.removeEventListener('abort', onAbortReject); resolve(m) })
          }).catch((e) => {
            finish(() => { ac.signal.removeEventListener('abort', onAbortReject); reject(e) })
          })
        })
        ac.signal.removeEventListener('abort', onAbort)

        if (ac.signal.aborted) break

        // Flush remaining buffered delta before moving on
        this.flushDelta(session)

        // Build assistant blocks (ensure valid input JSON)
        const assistantBlocks: Anthropic.ContentBlockParam[] = msg.content.map((b) => {
          if (b.type === 'text') return { type: 'text', text: b.text }
          if (b.type === 'tool_use') {
            const input = (b.input && typeof b.input === 'object') ? b.input as Record<string, unknown> : {}
            return { type: 'tool_use', id: b.id, name: b.name, input }
          }
          return { type: 'text', text: '' }
        }).filter(b => b.type === 'text' ? (b as any).text : true)
        session.messages.push({ role: 'assistant', content: assistantBlocks })

        const toolBlocks = msg.content.filter((b) => b.type === 'tool_use')
        if (toolBlocks.length === 0) {
          this.flushDelta(session)
          this.emit('done', sessionId)
          return
        }

        // Execute tools (with abort checking between each tool)
        const toolResults: Anthropic.ContentBlockParam[] = []
        for (const tb of toolBlocks) {
          // Check abort BEFORE executing each tool
          if (ac.signal.aborted) break
          // Emit tool-start so renderer can show task-specific status (安装中/修复中/读取中...)
          this.emit('tool-start', sessionId, tb.id, tb.name, tb.input)
          const result = await this.executeTool(tb.name, tb.input as Record<string, unknown>, ac.signal)
          this.emit('tool_result', sessionId, tb.id, tb.name, tb.input, result)
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result })
          // Check abort AFTER each tool (so user can stop during long multi-tool sequences)
          if (ac.signal.aborted) break
        }
        // If aborted during tool execution, don't send results back — just stop
        if (ac.signal.aborted) {
          this.flushDelta(session)
          this.emit('cancelled', sessionId)
          return
        }
        session.messages.push({ role: 'user', content: toolResults })
      }
      // Max rounds exhausted (5) — model kept using tools. Emit done so the
      // UI doesn't stay stuck in "streaming" mode forever.
      if (!ac.signal.aborted) {
        this.flushDelta(session)
        this.emit('done', sessionId)
      }
    } catch (err: unknown) {
      this.flushDelta(session)
      if (ac.signal.aborted) {
        this.emit('cancelled', sessionId)
      } else {
        this.emit('error', sessionId, err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (session.abortController === ac) session.abortController = null
      // Process next queued message (mid-task messaging — like Claude Code CLI)
      this.processMessageQueue(session)
    }
  }

  // ── Message queue processing ──
  private processMessageQueue(session: ChatSession): void {
    const next = session.pendingMessages.shift()
    if (next) {
      // Notify renderer that a queued message is about to start,
      // so it can create a new assistant message placeholder.
      this.emit('message-start', session.id)
      this.sendMessage(session.id, next.text, next.images)
    }
  }

  // ── Background Task Worker (BTW) Sub-agent System ──

  /** Spawn a background sub-agent to handle a task independently */
  private spawnBtw(task: string, parentSessionId: string): void {
    const btwId = 'btw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const runningCount = Array.from(this.btwSessions.values()).filter(b => b.status === 'running').length

    const btwSession: BtwSession = {
      id: btwId,
      task,
      status: runningCount >= MAX_CONCURRENT_BTW ? 'queued' : 'running',
      createdAt: Date.now(),
      messages: [],
      abortController: new AbortController(),
      output: '',
      deltaBuffer: '',
      deltaTimer: null,
      parentSessionId,
    }
    this.btwSessions.set(btwId, btwSession)

    // Notify renderer — emit a standalone message event so the main chat
    // shows a clear notification (no streaming placeholder needed).
    const notifyText = btwSession.status === 'queued'
      ? `🔀 **后台子任务已排队** \`${btwId}\`\n> ${task}\n\n(已有 ${runningCount} 个任务运行中，最多 ${MAX_CONCURRENT_BTW} 个并发。完成后自动开始。)`
      : `🔀 **后台子任务已启动** \`${btwId}\`\n> ${task}\n\n子任务在后台独立运行，进度见下方面板。`
    this.emit('btw-started', btwId, task, parentSessionId)
    this.emit('btw-spawned', parentSessionId, notifyText)
    // Run the sub-agent asynchronously if not queued
    if (btwSession.status === 'running') {
      this.runBtwAgent(btwId, task, parentSessionId)
    }
  }

  // ── BTW delta batching (same pattern as main chat to prevent renderer flood) ──
  private flushBtwDelta(btw: BtwSession): void {
    if (btw.deltaTimer) {
      clearTimeout(btw.deltaTimer)
      btw.deltaTimer = null
    }
    if (btw.deltaBuffer) {
      const text = btw.deltaBuffer
      btw.deltaBuffer = ''
      this.emit('btw-delta', btw.id, text)
    }
  }

  private scheduleBtwDelta(btw: BtwSession, text: string): void {
    btw.deltaBuffer += text
    if (!btw.deltaTimer) {
      btw.deltaTimer = setTimeout(() => {
        this.flushBtwDelta(btw)
      }, 30) // 30ms batch for BTW too — keeps sub-agent output flowing
    }
  }

  /** Kick queued BTWs when a running one finishes */
  private dequeueBtw(): void {
    const runningCount = Array.from(this.btwSessions.values()).filter(b => b.status === 'running').length
    if (runningCount >= MAX_CONCURRENT_BTW) return
    // Find the oldest queued BTW
    const queued = Array.from(this.btwSessions.values())
      .filter(b => b.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)
    if (queued.length > 0) {
      const next = queued[0]
      next.status = 'running'
      next.abortController = new AbortController()
      this.emit('btw-started', next.id, next.task, next.parentSessionId)
      this.emit('delta', next.parentSessionId, `\n\n🔀 **排队子任务开始执行** \`${next.id}\`\n> ${next.task}\n`)
      this.runBtwAgent(next.id, next.task, next.parentSessionId)
    }
  }

  /** Run a BTW sub-agent — independent lifecycle, no blocking */
  private async runBtwAgent(btwId: string, task: string, parentSessionId: string): Promise<void> {
    const btw = this.btwSessions.get(btwId)
    if (!btw) return

    const config = this.getApiConfig()
    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL })
    const ac = btw.abortController!

    const systemPrompt = `You are a background sub-agent (BTW) running inside ZXCODE. You have been assigned a specific task by the user. Focus exclusively on completing this task. Use available tools as needed. Respond in the user's language.

Your task: ${task}

IMPORTANT: Be thorough and complete the task fully. Report your results clearly.`

    // Push the task as user message
    btw.messages.push({ role: 'user', content: task })

    const maxRounds = 5
    let round = 0

    try {
      while (round < maxRounds && !ac.signal.aborted) {
        round++

        const stream = client.messages.stream({
          model: config.model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: btw.messages,
          tools: this.tools,
        })

        const onAbort = () => {
          try { (stream as any).abort?.() } catch {}
          try { (stream as any).controller?.abort() } catch {}
        }
        ac.signal.addEventListener('abort', onAbort, { once: true })

        let textContent = ''

        stream.on('text', (text: string) => {
          textContent += text
          btw.output += text
          // Batched delta to prevent renderer flooding
          this.scheduleBtwDelta(btw, text)
        })

        // Race finalMessage against abort so BTW can be cancelled by user.
        // No timeout — BTW sub-agent keeps working until it finishes or user cancels.
        const msg = await new Promise<Anthropic.Message>((resolve, reject) => {
          let settled = false
          const finish = (fn: () => void) => {
            if (!settled) { settled = true; fn() }
          }
          const onAbortReject = () => finish(() => reject(new Error('Aborted')))
          ac.signal.addEventListener('abort', onAbortReject, { once: true })
          stream.finalMessage().then((m) => {
            finish(() => { ac.signal.removeEventListener('abort', onAbortReject); resolve(m) })
          }).catch((e) => {
            finish(() => { ac.signal.removeEventListener('abort', onAbortReject); reject(e) })
          })
        })
        ac.signal.removeEventListener('abort', onAbort)

        if (ac.signal.aborted) break

        // Flush buffered deltas
        this.flushBtwDelta(btw)

        const assistantBlocks: Anthropic.ContentBlockParam[] = msg.content.map((b) => {
          if (b.type === 'text') return { type: 'text', text: b.text }
          if (b.type === 'tool_use') {
            const input = (b.input && typeof b.input === 'object') ? b.input as Record<string, unknown> : {}
            return { type: 'tool_use', id: b.id, name: b.name, input }
          }
          return { type: 'text', text: '' }
        }).filter(b => b.type === 'text' ? (b as any).text : true)
        btw.messages.push({ role: 'assistant', content: assistantBlocks })

        const toolBlocks = msg.content.filter((b) => b.type === 'tool_use')
        if (toolBlocks.length === 0) {
          this.flushBtwDelta(btw)
          btw.status = 'completed'
          this.emit('btw-done', btwId, btw.output)
          this.emit('btw-result', parentSessionId, btwId, btw.output)
          this.dequeueBtw() // Kick next queued BTW
          return
        }

        const toolResults: Anthropic.ContentBlockParam[] = []
        for (const tb of toolBlocks) {
          if (ac.signal.aborted) break
          // Emit tool-start for BTW sub-agent so renderer can show execution status
          this.emit('btw-tool-start', btwId, tb.id, tb.name, tb.input)
          const result = await this.executeTool(tb.name, tb.input as Record<string, unknown>, ac.signal)
          const toolDelta = `\n\n**${tb.name}**\n\`\`\`\n${result}\n\`\`\`\n`
          btw.output += toolDelta
          this.scheduleBtwDelta(btw, toolDelta)
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result })
          if (ac.signal.aborted) break
        }
        if (ac.signal.aborted) break
        btw.messages.push({ role: 'user', content: toolResults })
      }
      // Max rounds exhausted — mark BTW as completed with what we have
      if (!ac.signal.aborted) {
        this.flushBtwDelta(btw)
        btw.status = 'completed'
        this.emit('btw-done', btwId, btw.output)
        this.emit('btw-result', parentSessionId, btwId, btw.output)
        this.dequeueBtw()
        return
      }
    } catch (err: unknown) {
      this.flushBtwDelta(btw)
      if (ac.signal.aborted) {
        btw.status = 'cancelled'
        this.emit('btw-cancelled', btwId)
      } else {
        btw.status = 'error'
        btw.error = err instanceof Error ? err.message : String(err)
        this.emit('btw-error', btwId, btw.error)
      }
      this.dequeueBtw() // Kick next queued BTW
      return
    }

    // If loop exhausted without finishing
    this.flushBtwDelta(btw)
    btw.status = btw.status === 'running' ? 'completed' : btw.status
    if (btw.status === 'completed') {
      this.emit('btw-done', btwId, btw.output)
      this.emit('btw-result', parentSessionId, btwId, btw.output)
    }
    this.dequeueBtw() // Kick next queued BTW
  }

  // ── BTW Management API ──

  /** Cancel a running BTW sub-agent */
  cancelBtw(btwId: string): boolean {
    const btw = this.btwSessions.get(btwId)
    if (!btw) return false
    btw.abortController?.abort()
    btw.status = 'cancelled'
    this.emit('btw-cancelled', btwId)
    return true
  }

  /** List all BTW sessions */
  listBtw(): Array<{ id: string; task: string; status: string; createdAt: number; outputPreview: string }> {
    return Array.from(this.btwSessions.values()).map(b => ({
      id: b.id,
      task: b.task,
      status: b.status,
      createdAt: b.createdAt,
      outputPreview: b.output.slice(-500), // Last 500 chars
    }))
  }

  /** Get a specific BTW session's full output */
  getBtwOutput(btwId: string): { task: string; status: string; output: string; error?: string } | null {
    const btw = this.btwSessions.get(btwId)
    if (!btw) return null
    return { task: btw.task, status: btw.status, output: btw.output, error: btw.error }
  }
}
