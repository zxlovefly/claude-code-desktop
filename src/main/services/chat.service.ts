import { EventEmitter } from 'events'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import type { ClaudeSettings } from '../../shared/types'

interface ChatSession {
  id: string
  messages: Anthropic.MessageParam[]
  abortController: AbortController | null
}

export class ChatService extends EventEmitter {
  private static instance: ChatService
  private sessions = new Map<string, ChatSession>()

  static getInstance(): ChatService {
    if (!ChatService.instance) ChatService.instance = new ChatService()
    return ChatService.instance
  }

  private getApiConfig(): { apiKey: string; baseURL: string; model: string; providerName: string; providerId: string; modelDisplay: string } {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    const keysPath = join(homedir(), '.claude', 'keys.json')
    let apiKey = ''
    let baseURL = 'https://api.deepseek.com/anthropic'
    let model = 'deepseek-v4-pro[1m]'
    let providerName = 'DeepSeek'
    let providerId = 'deepseek'
    let modelDisplay = 'DeepSeek V4 Pro [1M]'

    if (existsSync(settingsPath)) {
      try {
        const settings: ClaudeSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        const env = settings.env || {}
        baseURL = env.ANTHROPIC_BASE_URL || baseURL
        model = env.ANTHROPIC_MODEL || model

        // Look up provider info from providers.json (match by model_id first, then base URL)
        const providersPath = join(homedir(), '.claude', 'providers.json')
        if (existsSync(providersPath)) {
          const providersData = JSON.parse(readFileSync(providersPath, 'utf-8'))
          const providersObj = providersData.providers || {}
          // Primary match: by model_id (more reliable than base URL which can change)
          let matched = false
          for (const [pid, p]: [string, any] of Object.entries(providersObj)) {
            const models = p.models || {}
            for (const [_mid, m]: [string, any] of Object.entries(models)) {
              if (m.model_id === model) {
                providerId = pid
                providerName = p.name
                modelDisplay = m.display || model
                matched = true
                break
              }
            }
            if (matched) break
          }
          // Fallback: match by base URL if model_id didn't match (e.g. custom models)
          if (!matched) {
            for (const [pid, p]: [string, any] of Object.entries(providersObj)) {
              if (p.api_base === baseURL) {
                providerId = pid
                providerName = p.name
                const models = p.models || {}
                for (const [_mid, m]: [string, any] of Object.entries(models)) {
                  if (m.model_id === model) { modelDisplay = m.display || model; break }
                }
                break
              }
            }
          }
        }

        // ── Key lookup (multi-source, same as ModelService) ──
        // Priority: keys.json[providerId] → env[authEnv] → env[apiKeyEnv] → process.env
        const matchedProvider = matched ? (providersObj as any)[providerId] : null
        const authEnv = matchedProvider?.auth_env || 'ANTHROPIC_AUTH_TOKEN'
        const apiKeyEnv = matchedProvider?.api_key_env || authEnv

        if (existsSync(keysPath)) {
          try {
            const keys = JSON.parse(readFileSync(keysPath, 'utf-8'))
            if (keys[providerId]) { apiKey = keys[providerId] }
          } catch {}
        }
        // Fallback: per-provider env slot (e.g. DEEPSEEK_API_KEY — not overwritten on switch)
        if (!apiKey && env[apiKeyEnv]) { apiKey = (env as any)[apiKeyEnv] }
        // Last resort: shared runtime slot (may be overwritten by other provider's key)
        if (!apiKey && env[authEnv]) { apiKey = (env as any)[authEnv] }
      } catch {}
    }
    return { apiKey, baseURL, model, providerName, providerId, modelDisplay }
  }

  createSession(id: string): void {
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { id, messages: [], abortController: null })
    }
  }

  deleteSession(id: string): void {
    this.cancel(id)
    this.sessions.delete(id)
  }

  cancel(sessionId: string): void {
    this.sessions.get(sessionId)?.abortController?.abort()
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
    if (s) { s.abortController?.abort(); s.abortController = ac }
    else { this.sessions.set(sessionId, { id: sessionId, messages: [], abortController: ac }) }

    try {
      const stream = client.messages.stream({
        model: config.model,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      const onAbort = () => stream.abort()
      ac.signal.addEventListener('abort', onAbort, { once: true })

      stream.on('text', (text: string) => {
        this.emit('delta', sessionId, text)
      })

      await stream.finalMessage()
      ac.signal.removeEventListener('abort', onAbort)

      if (!ac.signal.aborted) {
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

  private executeTool(name: string, input: Record<string, unknown>): string {
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
          // Use cmd.exe on Windows (handles common shell syntax like ||, &&, etc.)
          // PowerShell wrapping breaks bash/cmd syntax (||, && are not valid in PS)
          const shellCmd = isWin ? cmd : cmd
          const shell = isWin ? 'cmd.exe' : '/bin/bash'
          let output = ''
          try {
            output = execSync(shellCmd, { encoding: 'utf-8', cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024, shell: shell, windowsHide: true }).trim()
          } catch (e: any) {
            output = e.stdout?.trim() || e.stderr?.trim() || ''
            if (!output) throw e
          }
          // Strip ANSI escape codes from output
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

  async sendMessage(sessionId: string, userText: string, images?: string[]): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const config = this.getApiConfig()
    if (!config.apiKey) {
      this.emit('error', sessionId, '未配置 API Key (ANTHROPIC_AUTH_TOKEN)')
      return
    }

    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL })

    // Abort previous
    session.abortController?.abort()
    const ac = new AbortController()
    session.abortController = ac

    // Build user message content (support text + images)
    const userContent: Anthropic.ContentBlockParam[] = []
    if (images && images.length > 0) {
      for (const img of images) {
        // img is base64 data URL or raw base64
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
    }
    userContent.push({ type: 'text', text: userText })
    session.messages.push({ role: 'user', content: userContent })

    const basePrompt = `You are ${config.modelDisplay}, a large language model by ${config.providerName}. You are running inside ZXCODE, an AI-powered developer assistant desktop application. Respond in the same language as the user. Use Markdown for formatting. When helping with code, use the available tools to read/write files and run commands. When asked about your identity, always answer that you are ${config.modelDisplay} by ${config.providerName} — never say you are Claude unless you are actually running on Anthropic's Claude model.`
    const skillsPrompt = this.getSkillsPrompt()
    const systemPrompt = basePrompt + (skillsPrompt || '')

    const maxRounds = 5
    let round = 0

    try {
      while (round < maxRounds && !ac.signal.aborted) {
        round++

        const stream = client.messages.stream({
          model: config.model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: session.messages,
          tools: this.tools,
        })

        const onAbort = () => stream.abort()
        ac.signal.addEventListener('abort', onAbort, { once: true })

        let textContent = ''

        stream.on('text', (text: string) => {
          textContent += text
          this.emit('delta', sessionId, text)
        })

        const msg = await stream.finalMessage()
        ac.signal.removeEventListener('abort', onAbort)

        if (ac.signal.aborted) break

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
          this.emit('done', sessionId)
          return
        }

        // Execute tools (with abort checking between each tool)
        const toolResults: Anthropic.ContentBlockParam[] = []
        for (const tb of toolBlocks) {
          // Check abort BEFORE executing each tool
          if (ac.signal.aborted) break
          const result = this.executeTool(tb.name, tb.input as Record<string, unknown>)
          this.emit('tool_result', sessionId, tb.id, tb.name, tb.input, result)
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result })
          // Check abort AFTER each tool (so user can stop during long multi-tool sequences)
          if (ac.signal.aborted) break
        }
        // If aborted during tool execution, don't send results back — just stop
        if (ac.signal.aborted) {
          this.emit('cancelled', sessionId)
          return
        }
        session.messages.push({ role: 'user', content: toolResults })
      }
    } catch (err: unknown) {
      if (ac.signal.aborted) {
        this.emit('cancelled', sessionId)
      } else {
        this.emit('error', sessionId, err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (session.abortController === ac) session.abortController = null
    }
  }
}
