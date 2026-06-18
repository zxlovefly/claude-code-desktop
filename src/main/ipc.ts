import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { homedir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { TerminalService } from './services/terminal.service'
import { ModelService } from './services/model.service'
import { ProxyService } from './services/proxy.service'
import { ConfigService } from './services/config.service'
import { SchedulerService } from './services/scheduler.service'
import { ChatService } from './services/chat.service'
import { WechatBotService } from './services/wechat-bot.service'
import { getPersona } from '../shared/bot-personas'
import type { ProxyStats, SessionInfo } from '../shared/types'

export function registerIpcHandlers(): void {
  const terminal = TerminalService.getInstance()
  const model = ModelService.getInstance()
  const proxy = ProxyService.getInstance()
  const config = ConfigService.getInstance()
  const scheduler = SchedulerService.getInstance()
  const chat = ChatService.getInstance()
  scheduler.start()

  // ── Terminal IPC ──

  ipcMain.handle('terminal:create', (_event, cwd: string) => {
    const session = terminal.createSession(cwd)
    return session
  })

  ipcMain.on('terminal:input', (_event, sessionId: string, data: string) => {
    terminal.write(sessionId, data)
  })

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    terminal.resize(sessionId, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, sessionId: string) => {
    terminal.killSession(sessionId)
    return true
  })

  ipcMain.handle('terminal:list', () => {
    return terminal.listSessions()
  })

  // Forward PTY output to renderer
  terminal.onData((sessionId: string, data: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('terminal:data', sessionId, data)
  })

  terminal.onExit((sessionId: string, exitCode: number) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('terminal:exit', sessionId, exitCode)
  })

  // ── Model IPC (read-only) ──

  ipcMain.handle('model:current', () => {
    return model.getCurrentModel()
  })

  ipcMain.handle('model:list', () => {
    return model.getAvailableModels()
  })

  ipcMain.handle('model:switch', (_event, newModelId: string) => {
    return model.switchModel(newModelId)
  })

  // ── Keys IPC (centralized API key storage) ──

  ipcMain.handle('keys:save', (_event, providerId: string, apiKey: string) => {
    const keysPath = join(homedir(), '.claude', 'keys.json')
    let keys: Record<string, string> = {}
    if (existsSync(keysPath)) {
      try { keys = JSON.parse(readFileSync(keysPath, 'utf-8')) } catch {}
    }
    keys[providerId] = apiKey
    const dir = join(homedir(), '.claude')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(keysPath, JSON.stringify(keys, null, 2))
    return true
  })

  // ── Config IPC ──

  ipcMain.handle('config:get', () => {
    return config.getSettings()
  })

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    config.setSetting(key, value)
    return true
  })

  // ── Proxy IPC ──

  ipcMain.handle('proxy:status', () => {
    return proxy.getStatus()
  })

  ipcMain.handle('proxy:toggle', (_event, enable: boolean) => {
    if (enable) {
      proxy.start()
    } else {
      proxy.stop()
    }
    return proxy.getStatus()
  })

  // ── App IPC ──

  ipcMain.handle('app:get-version', () => {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
      return pkg.version
    } catch {
      return '1.0.0'
    }
  })

  ipcMain.handle('app:check-claude', async () => {
    const { exec } = require('child_process')
    try {
      const result = await new Promise<string>((resolve, reject) => {
        exec('claude --version', { encoding: 'utf-8', timeout: 5000 }, (error, stdout) => {
          if (error) reject(error)
          else resolve(stdout.trim())
        })
      })
      return { installed: true, version: result }
    } catch {
      return { installed: false, version: '' }
    }
  })

  ipcMain.handle('app:cwd', () => {
    return process.cwd()
  })

  // ── Scheduler IPC ──

  ipcMain.handle('scheduler:list', () => {
    return JSON.parse(JSON.stringify(scheduler.listTasks()))
  })

  ipcMain.handle('scheduler:add', (_event, task: any) => {
    const t = scheduler.addTask({
      name: task.name,
      prompt: task.prompt,
      frequency: task.frequency || 'daily',
      dailyTime: task.dailyTime || '09:00',
      intervalMinutes: task.intervalMinutes || 60,
      weekDay: task.weekDay ?? 1,
      activeFrom: task.activeFrom || '',
      activeTo: task.activeTo || '',
      enabled: true,
      skill: task.skill || '',
    })
    return JSON.parse(JSON.stringify(t))
  })

  ipcMain.handle('scheduler:delete', (_event, id: string) => {
    return scheduler.deleteTask(id)
  })

  ipcMain.handle('scheduler:toggle', (_event, id: string, enabled: boolean) => {
    return scheduler.updateTask(id, { enabled })
  })

  ipcMain.handle('scheduler:update', (_event, id: string, updates: any) => {
    return scheduler.updateTask(id, updates)
  })

  ipcMain.handle('scheduler:runNow', (_event, id: string) => {
    return scheduler.runNow(id)
  })

  // Forward execution events to renderer
  scheduler.on('executed', (task) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('scheduler:executed', JSON.parse(JSON.stringify(task)))
  })

  // ── Chat IPC ──

  ipcMain.handle('chat:create-session', (_event, sessionId: string) => {
    chat.createSession(sessionId)
    return true
  })

  ipcMain.handle('chat:reset-session', (_event, sessionId: string) => {
    chat.resetSession(sessionId)
    return true
  })

  ipcMain.handle('chat:delete-session', (_event, sessionId: string) => {
    chat.deleteSession(sessionId)
    return true
  })

  ipcMain.handle('chat:send-message', (_event, sessionId: string, message: string, images?: string[]) => {
    chat.sendMessage(sessionId, message, images)
    return true
  })

  ipcMain.handle('chat:cancel', (_event, sessionId: string) => {
    chat.cancel(sessionId)
    return true
  })

  // AI generate (one-shot for tool pages: PRD/Analysis/Prototype)
  ipcMain.handle('ai:generate', (_event, sessionId: string, systemPrompt: string, userMessage: string) => {
    chat.generate(sessionId, systemPrompt, userMessage)
    return true
  })

  // AI polish description (one-shot, returns polished text synchronously)
  ipcMain.handle('ai:polish-description', async (_event, text: string) => {
    const sessionId = 'polish-' + Date.now()
    return new Promise<string>((resolve, reject) => {
      let result = ''
      const onDelta = (sId: string, delta: string) => {
        if (sId === sessionId) result += delta
      }
      const onDone = (sId: string) => {
        if (sId === sessionId) {
          cleanup()
          resolve(result || text)
        }
      }
      const onError = (sId: string, msg: string) => {
        if (sId === sessionId) {
          cleanup()
          reject(new Error(msg))
        }
      }
      const onCancelled = (sId: string) => {
        if (sId === sessionId) {
          cleanup()
          resolve(result || text)
        }
      }
      const cleanup = () => {
        chat.removeListener('delta', onDelta)
        chat.removeListener('done', onDone)
        chat.removeListener('error', onError)
        chat.removeListener('cancelled', onCancelled)
      }

      chat.on('delta', onDelta)
      chat.on('done', onDone)
      chat.on('error', onError)
      chat.on('cancelled', onCancelled)

      const systemPrompt = `你是一位产品需求描述润色助手。你的任务是对用户输入的需求描述做**最小限度**的优化：

【核心原则】
1. **保留用户原话**：尽量保留用户原本的用词、语气和表达方式，不要改写为你认为"更专业"的说法
2. **只修明显问题**：仅修正明显的错别字、语法错误、语句不通顺的地方
3. **保留具体细节**：用户提到的具体数字、颜色、布局、功能名称等细节一个字都不要改
4. **不添加抽象包装**：不要把"登录页面"改成"用户认证入口模块"，不要把"红色按钮"改成"具有视觉冲击力的行动号召元素"
5. **简洁优先**：如果用户原话已经很清楚了，就不要改动；大白话比虚浮的专业术语更好

【禁止行为】
❌ 不要添加用户没说过的功能或需求
❌ 不要用抽象术语替换具体描述
❌ 不要为追求"专业感"而牺牲清晰度
❌ 不要添加营销话术或包装性语言

直接输出润色后的文本，不要加任何前缀、后缀或解释。如果原文已经很好，直接输出原文。`
      chat.generate(sessionId, systemPrompt, `请优化以下产品需求描述，使其更加清晰、具体和专业：\n\n${text}`)
    })
  })

  // Forward Chat events to renderer
  chat.on('delta', (sessionId: string, text: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('chat:delta', sessionId, text)
  })
  chat.on('tool_result', (sessionId: string, toolId: string, name: string, input: unknown, result: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('chat:tool-result', sessionId, { id: toolId, name, input, result })
  })
  chat.on('done', (sessionId: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('chat:done', sessionId)
  })
  chat.on('cancelled', (sessionId: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('chat:cancelled', sessionId)
  })
  chat.on('error', (sessionId: string, message: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('chat:error', sessionId, message)
  })

  // ── WeChat Bot IPC ──

  const wechatBot = WechatBotService.getInstance()

  ipcMain.handle('wechat-bot:status', () => {
    return wechatBot.getStatus()
  })

  ipcMain.handle('wechat-bot:connect', async () => {
    await wechatBot.connect()
    return wechatBot.getStatus()
  })

  ipcMain.handle('wechat-bot:disconnect', async () => {
    await wechatBot.disconnect()
    return wechatBot.getStatus()
  })

  ipcMain.handle('wechat-bot:settings', () => {
    return wechatBot.getSettings()
  })

  ipcMain.handle('wechat-bot:update-settings', (_event, settings: { autoConnect?: boolean }) => {
    wechatBot.updateSettings(settings)
    return wechatBot.getSettings()
  })

  // Persona IPC
  ipcMain.handle('wechat-bot:personas', () => {
    return wechatBot.getPersonas()
  })

  ipcMain.handle('wechat-bot:get-user-persona', (_event, userId: string) => {
    return {
      userId,
      personaId: wechatBot.getUserPersonaId(userId),
      persona: wechatBot.getUserPersona(userId),
    }
  })

  ipcMain.handle('wechat-bot:set-user-persona', (_event, userId: string, personaId: string) => {
    wechatBot.setUserPersona(userId, personaId)
    return {
      userId,
      personaId,
      persona: wechatBot.getUserPersona(userId),
    }
  })

  ipcMain.handle('wechat-bot:all-personas', () => {
    return wechatBot.getAllUserPersonas()
  })

  ipcMain.handle('wechat-bot:default-persona', () => {
    return {
      personaId: wechatBot.getDefaultPersonaId(),
      persona: getPersona(wechatBot.getDefaultPersonaId()),
    }
  })

  ipcMain.handle('wechat-bot:set-default-persona', (_event, personaId: string) => {
    wechatBot.setDefaultPersona(personaId)
    return {
      personaId,
      persona: getPersona(personaId),
    }
  })

  // Forward WeChat bot events to renderer
  wechatBot.on('status-changed', (data) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('wechat-bot:status-changed', data)
  })

  wechatBot.on('qrcode', (data) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('wechat-bot:qrcode', data)
  })

  wechatBot.on('message-received', (data) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('wechat-bot:message-received', data)
  })

  wechatBot.on('message-sent', (data) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('wechat-bot:message-sent', data)
  })

  // ── File/Directory Dialog ──

  ipcMain.handle('dialog:open-directory', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // ── Export: DOCX / PDF ──

  ipcMain.handle('export:docx', async (_event, markdown: string, filename?: string) => {
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = await import('docx')

      const lines = markdown.split('\n')
      const children: any[] = []

      let i = 0
      while (i < lines.length) {
        const line = lines[i]

        // Headers
        const h1 = line.match(/^# (.+)$/)
        const h2 = line.match(/^## (.+)$/)
        const h3 = line.match(/^### (.+)$/)
        if (h1) {
          children.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } }))
          i++; continue
        }
        if (h2) {
          children.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }))
          i++; continue
        }
        if (h3) {
          children.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 100 } }))
          i++; continue
        }

        // Horizontal rules
        if (line.match(/^---$/)) {
          children.push(new Paragraph({ children: [new TextRun({ text: '─'.repeat(60), color: '999999', size: 16 })], spacing: { before: 100, after: 100 } }))
          i++; continue
        }

        // Bold text in paragraphs
        if (line.trim()) {
          const parts = line.split(/(\*\*[^*]+\*\*)/g)
          const runs = parts.map(part => {
            const boldMatch = part.match(/^\*\*(.+)\*\*$/)
            if (boldMatch) return new TextRun({ text: boldMatch[1], bold: true })
            return new TextRun({ text: part })
          })
          children.push(new Paragraph({ children: runs, spacing: { before: 60, after: 60 } }))
        } else {
          children.push(new Paragraph({ spacing: { before: 60, after: 60 } }))
        }
        i++
      }

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: 'Microsoft YaHei', size: 22 },
            },
          },
        },
        sections: [{ children }],
      })

      const buffer = await Packer.toBuffer(doc)
      const exportDir = join(app.getPath('temp'), 'zxcode-exports')
      if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })
      const outName = filename || `export-${Date.now()}.docx`
      const outPath = join(exportDir, outName)
      writeFileSync(outPath, buffer)
      return { success: true, path: outPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('export:pdf', async (_event, markdown: string, filename?: string) => {
    try {
      // Render markdown to basic HTML
      const htmlContent = renderMarkdownToHtml(markdown)
      const exportDir = join(app.getPath('temp'), 'zxcode-exports')
      if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })
      const outName = filename || `export-${Date.now()}.pdf`
      const outPath = join(exportDir, outName)

      // Create hidden BrowserWindow for PDF generation
      const pdfWin = new BrowserWindow({
        width: 800, height: 600, show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      })
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
      await new Promise(r => setTimeout(r, 500)) // wait for render
      const data = await pdfWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
      writeFileSync(outPath, data)
      pdfWin.close()
      return { success: true, path: outPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('export:open-html', async (_event, html: string) => {
    try {
      const exportDir = join(app.getPath('temp'), 'zxcode-exports')
      if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })
      const outPath = join(exportDir, `prototype-${Date.now()}.html`)
      writeFileSync(outPath, html, 'utf-8')
      await shell.openPath(outPath)
      return { success: true, path: outPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('file:open', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Skill Loading ──
  ipcMain.handle('skill:load-all', async () => {
    try {
      const skillsDir = join(homedir(), '.claude', 'skills')
      if (!existsSync(skillsDir)) return { success: true, skills: [] }

      const entries = readdirSync(skillsDir, { withFileTypes: true })
      const skills: Array<{ name: string; description: string; content: string; path: string }> = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillMdPath = join(skillsDir, entry.name, 'SKILL.md')
        if (!existsSync(skillMdPath)) continue

        try {
          const raw = readFileSync(skillMdPath, 'utf-8')
          // Parse YAML frontmatter
          const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
          if (!fmMatch) continue

          const frontmatter = fmMatch[1]
          const body = fmMatch[2].trim()

          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
          const descMatch = frontmatter.match(/^description:\s*(.+)$/m)

          skills.push({
            name: nameMatch?.[1]?.trim() || entry.name,
            description: descMatch?.[1]?.trim() || '',
            content: body,
            path: skillMdPath,
          })
        } catch {
          // Skip unparseable skills
        }
      }

      return { success: true, skills }
    } catch (err: any) {
      return { success: false, error: err.message, skills: [] }
    }
  })

  // ── File Upload ──

// ── Helper: Extract text from PPTX (ZIP-based) ──
async function extractPptxText(filePath: string): Promise<string> {
  // PPTX is a ZIP containing XML files
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(filePath)
  const slideFiles = zip.getEntries().filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml$/)).sort((a, b) => {
    const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || '0')
    const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || '0')
    return numA - numB
  })
  const slides: string[] = []
  for (const slide of slideFiles) {
    const xml = zip.readAsText(slide).toString()
    // Extract text from <a:t> tags
    const texts: string[] = []
    const regex = /<a:t>([^<]*)<\/a:t>/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(xml)) !== null) { if (m[1].trim()) texts.push(m[1].trim()) }
    if (texts.length > 0) slides.push(`--- Slide ${slides.length + 1} ---\n${texts.join('\n')}`)
  }
  return slides.length > 0 ? slides.join('\n\n') : '(PPTX 文件无可提取的文本内容)'
}

// ── Helper: Render markdown to styled HTML (for PDF export) ──
function renderMarkdownToHtml(markdown: string): string {
  const body = markdown
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;color:#1a1a2e">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:20px 0 10px;font-size:20px;color:#1a1a2e;border-bottom:1px solid #e5e6eb;padding-bottom:4px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:24px 0 12px;font-size:24px;color:#1a1a2e">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f5;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:13px;color:#6c5ce7">$1</code>')
    .replace(/^---$/gm, '<hr style="margin:12px 0;border:none;border-top:1px solid #e5e6eb">')
    .replace(/^- (.+)$/gm, '<li style="margin-left:20px;color:#4a4a6a">• $1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 14px; color: #2d2d3f; line-height: 1.8; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1,h2,h3 { font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    td,th { border: 1px solid #e5e6eb; padding: 6px 10px; text-align: left; font-size: 13px; }
    th { background: #f5f6f8; font-weight: 600; }
  </style></head><body>${body}</body></html>`
}

  ipcMain.handle('dialog:open-file', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: '所有支持的文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'css', 'scss', 'less', 'sql', 'sh', 'bat', 'ps1', 'md', 'txt', 'csv', 'log', 'env', 'cfg', 'ini', 'toml', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
        { name: '图片 (PNG/JPG/GIF/WebP/SVG)', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
        { name: '代码 (JS/TS/Py/Java/Go/Rust/C/C++/HTML/CSS/JSON/YAML)', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'css', 'scss', 'less', 'sql', 'sh', 'bat', 'ps1'] },
        { name: '文档 (MD/TXT/CSV/LOG/ENV/TOML)', extensions: ['md', 'txt', 'csv', 'log', 'env', 'cfg', 'ini', 'toml'] },
        { name: 'Office (PDF/Word/Excel/PPT)', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
      ],
    })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    try {
      const ext = extname(filePath).toLowerCase()
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
      const isImage = imageExts.includes(ext)
      const documentExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
      const isDocument = documentExts.includes(ext)
      const stats = statSync(filePath)
      const maxSize = 10 * 1024 * 1024

      if (stats.size > maxSize) {
        return { error: `文件过大 (${(stats.size / 1024 / 1024).toFixed(1)}MB)，请压缩或分割后上传。` }
      }

      // ── Document files (PDF/DOC/XLS/PPT): extract text ──
      if (isDocument) {
        let content = ''
        let fileType = ext.replace('.', '')
        try {
          if (ext === '.pdf') {
            const pdfBuf = readFileSync(filePath)
            const pdfData = await pdfParse(pdfBuf)
            content = pdfData.text || '(PDF 无可提取文本)'
            fileType = 'pdf'
          } else if (ext === '.docx') {
            const docxBuf = readFileSync(filePath)
            const mammothResult = await mammoth.extractRawText({ buffer: docxBuf })
            content = mammothResult.value || '(DOCX 无可提取文本)'
            fileType = 'docx'
          } else if (ext === '.doc') {
            // .doc format - try mammoth (limited support) or warn
            content = `(注意：.doc 格式支持有限，建议转换为 .docx 后重新上传)\n文件路径: ${filePath}`
            fileType = 'doc'
          } else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = XLSX.readFile(filePath)
            const sheets: string[] = []
            workbook.SheetNames.forEach(name => {
              const sheet = workbook.Sheets[name]
              const csv = XLSX.utils.sheet_to_csv(sheet)
              sheets.push(`### ${name}\n${csv}`)
            })
            content = sheets.join('\n\n') || '(Excel 无数据)'
            fileType = ext === '.xlsx' ? 'xlsx' : 'xls'
          } else if (ext === '.pptx') {
            content = await extractPptxText(filePath)
            fileType = 'pptx'
          } else if (ext === '.ppt') {
            content = `(注意：.ppt 格式支持有限，建议转换为 .pptx 后重新上传)\n文件路径: ${filePath}`
            fileType = 'ppt'
          }

          // Truncate large documents
          if (content.length > 50000) {
            content = content.slice(0, 50000) + '\n...(内容过长，已截断至50000字符。如需完整分析请分段上传)'
          }

          return {
            filePath,
            fileName: filePath.split(/[/\\]/).pop(),
            content,
            size: stats.size,
            isImage: false,
            isDocument: true,
            fileType,
            note: `${ext.toUpperCase()} 文件已解析，提取了 ${content.length} 字符的文本内容。`
          }
        } catch (extractErr: any) {
          return {
            error: `${ext.toUpperCase()} 解析失败: ${extractErr.message}\n建议: 确认文件未损坏，或尝试另存为其他格式后上传`,
            filePath,
            fileName: filePath.split(/[/\\]/).pop(),
            isBinary: true
          }
        }
      }

      let content: string
      try {
        content = readFileSync(filePath, 'utf-8')
      } catch {
        return {
          error: `无法以文本格式读取 ${ext} 文件。\n如果是二进制文件(PDF/Word/Excel)：请导出为文本格式\n如果是图片：请确保是 PNG/JPG 格式`,
          filePath, fileName: filePath.split(/[/\\]/).pop()
        }
      }

      // Check for binary content (skip for images - they're handled differently)
      if (!isImage && (content.includes('\x00') || (content.length < 100 && /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)))) {
        return {
          error: `检测到 ${ext} 文件包含二进制内容，无法正确解析。\n建议：转换为纯文本格式(.txt/.md/.csv)后上传`,
          filePath, fileName: filePath.split(/[/\\]/).pop()
        }
      }

      // For images, read as base64 for multimodal models
      if (isImage) {
        const imageBuffer = readFileSync(filePath)
        const base64 = imageBuffer.toString('base64')
        const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : ext === '.svg' ? 'image/svg+xml' : 'image/png'
        const dataUrl = `data:${mimeType};base64,${base64}`
        return {
          filePath, fileName: filePath.split(/[/\\]/).pop(), content: dataUrl, size: stats.size, isImage: true,
          base64: dataUrl,
          note: '图片已上传为 base64 格式。当前模型支持多模态识别（vision），AI 将能直接分析图片内容。'
        }
      }

      return { filePath, fileName: filePath.split(/[/\\]/).pop(), content, size: stats.size, isImage }
    } catch (err: any) {
      return { error: `读取失败: ${err.message}`, filePath }
    }
  })

  // ── Proxy ──

  proxy.start()
  setInterval(() => {
    const stats = proxy.getLatestStats()
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('proxy:stats', stats)
  }, 2000)
}
