import { EventEmitter } from 'events'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir, tmpdir } from 'os'
import { ChatService } from './chat.service'
import { getPersona, DEFAULT_PERSONA_ID, BOT_PERSONAS } from '../../shared/bot-personas'
import { createRequire } from 'module'

// Reuse file parsing libs (same as chat.service.ts)
const _require = createRequire(import.meta.url)
const _pdfParseRaw: any = _require('pdf-parse')
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _pdfParseRaw?.default || _pdfParseRaw
const _mammothRaw: any = _require('mammoth')
const mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } = _mammothRaw?.default || _mammothRaw
const XLSX: any = (_require('xlsx') as any)?.default || _require('xlsx')
const AdmZip: any = (_require('adm-zip') as any)?.default || _require('adm-zip')
const QRCode: any = _require('qrcode')
const silkWasm: any = _require('silk-wasm')
import type { BotPersona } from '../../shared/bot-personas'
import type {
  BotStatus,
  WechatBotAuth,
  WechatBotPersistedState,
  WechatBotStatus,
  WechatIncomingMessage,
  WechatUserSession,
  GetUpdatesResponse,
  QrCodeResponse,
  QrCodeStatusResponse,
  SendMessageResponse,
  SendTypingResponse,
  BotConfigResponse,
} from '../../shared/wechat-types'

const API_DEFAULT_BASE = 'https://ilinkai.weixin.qq.com'
const POLL_TIMEOUT_MS = 35000
const QR_POLL_INTERVAL_MS = 3000
const QR_POLL_MAX_ATTEMPTS = 40 // ~2 minutes
const MAX_RETRY_DELAY_MS = 30000
const INITIAL_RETRY_DELAY_MS = 1000
const MAX_CONSECUTIVE_FAILURES = 5
const INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h
const MAX_MESSAGE_LENGTH = 2000
const TYPING_REFRESH_INTERVAL_MS = 4000
const MESSAGE_DEDUP_WINDOW_MS = 5000

export class WechatBotService extends EventEmitter {
  private static instance: WechatBotService

  private status: BotStatus = 'disconnected'
  private auth: WechatBotAuth | null = null
  private cursor: string = ''
  private pollController: AbortController | null = null
  private qrPollController: AbortController | null = null
  private userSessions: Map<string, WechatUserSession> = new Map()
  private storePath: string
  private settingsPath: string
  private personaStorePath: string
  private userPersonas: Map<string, string> = new Map() // userId → personaId
  private defaultPersonaId: string = DEFAULT_PERSONA_ID
  private consecutiveFailures: number = 0
  private retryDelay: number = INITIAL_RETRY_DELAY_MS
  private autoConnect: boolean = true
  private connectedAt: number | null = null
  private lastError: string | null = null
  private cachedUin: string = '' // Persisted X-WECHAT-UIN for token continuity
  private lastQrData: { qrcode: string; url: string; svg: string | null } | null = null

  // Dedup: track recently seen message fingerprints
  private recentMessages: Map<string, number> = new Map()

  private constructor() {
    super()
    const dir = join(homedir(), '.claude')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.storePath = join(dir, 'wechat-bot.json')
    this.settingsPath = join(dir, 'wechat-bot-settings.json')
    this.personaStorePath = join(dir, 'wechat-bot-personas.json')
    this.loadSettings()
    this.loadPersistedAuth()
    this.loadPersonas()
  }

  static getInstance(): WechatBotService {
    if (!WechatBotService.instance) {
      WechatBotService.instance = new WechatBotService()
    }
    return WechatBotService.instance
  }

  // ── Public API ──

  getStatus(): WechatBotStatus {
    return {
      status: this.status,
      connectedAt: this.connectedAt,
      error: this.lastError,
      qrcodeUrl: this.lastQrData?.url || null,
      qrcodeData: this.lastQrData?.qrcode || null,
      qrcodeSvg: this.lastQrData?.svg || null,
    }
  }

  getSettings(): { autoConnect: boolean } {
    return { autoConnect: this.autoConnect }
  }

  updateSettings(settings: { autoConnect?: boolean }): void {
    if (typeof settings.autoConnect === 'boolean') {
      this.autoConnect = settings.autoConnect
    }
    this.saveSettings()
  }

  /** Full QR login flow. Call this to start the connection process. */
  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting' || this.status === 'qr_pending') return

    // If we have persisted auth, use it directly — skip connection test
    // If the token is actually expired, the first poll will get 401/403
    // and handleAuthExpired() will reset state + emit QR automatically
    if (this.auth?.bot_token) {
      this.setStatus('connected')
      console.log('[WechatBot] Auto-connecting with persisted token')
      this.startPolling()
      return
    }

    await this.startQrFlow()
  }

  async disconnect(): Promise<void> {
    console.log('[WechatBot] Disconnecting...')
    this.abortAll()
    this.setStatus('disconnected')
    this.consecutiveFailures = 0
    this.retryDelay = INITIAL_RETRY_DELAY_MS
  }

  async start(): Promise<void> {
    // Small delay to let renderer initialize before firing events
    await this.sleep(500)

    if (this.autoConnect && this.auth?.bot_token) {
      console.log('[WechatBot] Auto-connect enabled, using persisted token...')
      await this.connect()
    } else if (this.autoConnect) {
      console.log('[WechatBot] Auto-connect enabled but no saved token. Starting QR flow...')
      await this.connect()
    } else {
      console.log('[WechatBot] Auto-connect disabled. Waiting for manual connect.')
    }
  }

  // ── Status management ──

  private setStatus(status: BotStatus, error?: string): void {
    const prev = this.status
    this.status = status
    if (error !== undefined) this.lastError = error
    else if (status !== 'error') this.lastError = null
    if (status === 'connected') this.connectedAt = Date.now()
    if (status === 'disconnected') this.connectedAt = null

    if (prev !== status || error) {
      console.log(`[WechatBot] Status: ${prev} → ${status}`, error || '')
      this.emit('status-changed', { status, error: error || null })
    }
  }

  // ── Auth flow ──

  private async startQrFlow(): Promise<void> {
    this.setStatus('qr_pending')
    this.abortAll()
    this.qrPollController = new AbortController()

    try {
      // Step 1: Get QR code (GET with bot_type=3, no auth needed)
      const qrResp = await this.apiGet<QrCodeResponse>(
        '/ilink/bot/get_bot_qrcode',
        { bot_type: '3' },
        { skipAuth: true }
      )
      if (!qrResp || qrResp.ret !== 0) {
        this.setStatus('error', `获取二维码失败: ${qrResp?.err_msg || '未知错误'}`)
        return
      }

      const qrUrl = qrResp.qrcode_img_content || qrResp.url || ''
      console.log('[WechatBot] QR code obtained:', qrUrl)

      // Generate QR code SVG locally (no external API dependency)
      let qrSvg: string | null = null
      try {
        qrSvg = await QRCode.toString(qrUrl, {
          type: 'svg',
          width: 220,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        })
        console.log('[WechatBot] QR SVG generated locally')
      } catch (e: any) {
        console.warn('[WechatBot] Failed to generate QR SVG locally:', e.message)
      }

      // Save QR data for getStatus() (so page can get it even if event was missed)
      this.lastQrData = { qrcode: qrResp.qrcode, url: qrUrl, svg: qrSvg }

      this.emit('qrcode', { qrcode: qrResp.qrcode, url: qrUrl, svg: qrSvg })

      // Step 2: Poll for scan confirmation
      let scanned = false
      for (let i = 0; i < QR_POLL_MAX_ATTEMPTS; i++) {
        if (this.qrPollController?.signal.aborted) return

        await this.sleep(QR_POLL_INTERVAL_MS)
        if (this.qrPollController?.signal.aborted) return

        try {
          const statusResp = await this.apiGet<QrCodeStatusResponse>(
            '/ilink/bot/get_qrcode_status',
            { qrcode: qrResp.qrcode, bot_type: '3' },
            { skipAuth: true }
          )

          if (!statusResp) continue

          if (statusResp.status === 'scanned' && !scanned) {
            scanned = true
            console.log('[WechatBot] QR code scanned by user')
            this.emit('status-changed', { status: 'qr_pending', error: null })
          }

          if (statusResp.status === 'confirmed' && statusResp.bot_token) {
            console.log('[WechatBot] Auth confirmed!')
            this.auth = {
              bot_token: statusResp.bot_token,
              baseurl: statusResp.baseurl || API_DEFAULT_BASE,
            }
            this.persistAuth()
            this.setStatus('connected')
            this.startPolling()
            return
          }

          if (statusResp.status === 'expired') {
            console.log('[WechatBot] QR code expired, regenerating...')
            // Restart QR flow
            this.qrPollController?.abort()
            await this.startQrFlow()
            return
          }
        } catch (e: any) {
          if (e.name === 'AbortError') return
          console.warn('[WechatBot] QR status poll error:', e.message)
        }
      }

      // Timeout
      this.setStatus('error', '二维码已过期，请重新连接')
    } catch (e: any) {
      if (e.name === 'AbortError') return
      this.setStatus('error', `连接失败: ${e.message}`)
    }
  }

  // ── Message polling loop ──

  private startPolling(): void {
    if (this.pollController) {
      this.pollController.abort()
    }
    this.pollController = new AbortController()
    this.consecutiveFailures = 0
    this.retryDelay = INITIAL_RETRY_DELAY_MS
    this.pollLoop()
  }

  private async pollLoop(): Promise<void> {
    console.log('[WechatBot] Polling loop started')

    while (this.status === 'connected' && !this.pollController?.signal.aborted) {
      try {
        const resp = await this.apiPost<GetUpdatesResponse>(
          '/ilink/bot/getupdates',
          {
            get_updates_buf: this.cursor || '',
            base_info: {
              channel_version: '1.0.0',
              bot_agent: 'ZXBot',
            },
          },
          { timeout: POLL_TIMEOUT_MS + 5000 }
        )

        if (this.pollController?.signal.aborted) break

        if (!resp) {
          this.handlePollError(new Error('Empty response'))
          continue
        }

        if (resp.ret !== 0 && resp.ret !== undefined) {
          // Handle specific WeChat error codes
          if (resp.ret === -14) {
            // Session expired (24h inactivity) — requires re-login
            console.warn('[WechatBot] Session expired (errcode -14), re-authentication needed')
            this.handleAuthExpired()
            break
          }
          this.handlePollError(new Error(`API error ret=${resp.ret}: ${resp.err_msg || ''}`))
          continue
        }

        // Success — reset backoff
        this.consecutiveFailures = 0
        this.retryDelay = INITIAL_RETRY_DELAY_MS

        // Update cursor and persist
        if (resp.get_updates_buf) {
          this.cursor = resp.get_updates_buf
          // Persist cursor periodically (every successful poll with new cursor)
          this.persistAuth()
        }

        // Process messages
        if (resp.msgs && resp.msgs.length > 0) {
          console.log(`[WechatBot] Received ${resp.msgs.length} messages`)
          for (const msg of resp.msgs) {
            await this.handleMessage(msg)
          }
        }

        // Clear stale dedup entries
        this.cleanDedupCache()
      } catch (e: any) {
        if (e.name === 'AbortError') break
        this.handlePollError(e)
      }
    }

    console.log('[WechatBot] Polling loop ended')
  }

  private handlePollError(err: Error): void {
    this.consecutiveFailures++
    console.warn(`[WechatBot] Poll error (#${this.consecutiveFailures}):`, err.message)

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.setStatus('error', `连续 ${MAX_CONSECUTIVE_FAILURES} 次轮询失败: ${err.message}`)
      // Don't give up — retry after longer delay
      this.retryDelay = MAX_RETRY_DELAY_MS
      this.consecutiveFailures = 0 // reset to keep trying
    } else {
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY_MS)
    }
  }

  // ── Message handling ──

  private async handleMessage(msg: WechatIncomingMessage): Promise<void> {
    // Only process finished user messages (not bot's own messages)
    if (msg.message_state !== 2) return // not FINISH
    if (msg.message_type !== 1) return // not USER

    const userId = msg.from_user_id
    if (!userId) return

    // Deduplicate
    const fingerprint = `${userId}:${msg.context_token}`
    const now = Date.now()
    if (this.recentMessages.has(fingerprint)) {
      const prev = this.recentMessages.get(fingerprint)!
      if (now - prev < MESSAGE_DEDUP_WINDOW_MS) {
        console.log('[WechatBot] Duplicate message, skipping')
        return
      }
    }
    this.recentMessages.set(fingerprint, now)

    // Extract text content AND process file attachments
    const textParts: string[] = []
    const fileTextParts: string[] = []
    const images: string[] = [] // base64 data URLs

    for (const item of msg.item_list) {
      if (item.type === 1 && item.text_item?.text) {
        textParts.push(item.text_item.text)
      } else if (item.type === 2 && item.image_item?.url) {
        // IMAGE: download → base64 for vision models
        console.log(`[WechatBot] Processing image from ${userId}`)
        try {
          const dataUrl = await this.downloadImageAsBase64(item.image_item.url)
          if (dataUrl) images.push(dataUrl)
        } catch (e: any) {
          console.warn('[WechatBot] Failed to download image:', e.message)
        }
      } else if (item.type === 4 && item.file_item?.url) {
        // FILE: download → extract text content
        console.log(`[WechatBot] Processing file from ${userId}: ${item.file_item.name}`)
        try {
          const extracted = await this.downloadAndExtractFile(
            item.file_item.url,
            item.file_item.name || 'file'
          )
          if (extracted) fileTextParts.push(extracted)
        } catch (e: any) {
          console.warn('[WechatBot] Failed to extract file:', e.message)
          fileTextParts.push(`[收到文件: ${item.file_item.name || '未知'}，无法解析内容]`)
        }
      } else if (item.type === 3 && item.voice_item?.url) {
        // VOICE: download SILK → decode to WAV → get duration
        console.log(`[WechatBot] Processing voice from ${userId}`)
        try {
          const voiceInfo = await this.downloadAndDecodeVoice(item.voice_item.url)
          if (voiceInfo) {
            fileTextParts.push(`[收到语音消息: ${voiceInfo.duration}秒]`)
            // Save decoded WAV for potential transcription
            if (voiceInfo.wavPath) {
              fileTextParts.push(`[语音文件已保存: ${voiceInfo.wavPath}]`)
            }
          } else {
            fileTextParts.push('[收到语音消息]')
          }
        } catch (e: any) {
          console.warn('[WechatBot] Failed to process voice:', e.message)
          fileTextParts.push('[收到语音消息，无法处理]')
        }
      } else if (item.type === 3) {
        fileTextParts.push('[收到语音消息]')
      } else if (item.type === 5 && item.video_item?.url) {
        // VIDEO: download → get metadata → AI description
        console.log(`[WechatBot] Processing video from ${userId}`)
        try {
          const videoInfo = await this.downloadAndGetVideoInfo(item.video_item.url)
          if (videoInfo) {
            fileTextParts.push(`[收到视频消息: ${videoInfo.size}MB, ${videoInfo.format || 'mp4'}格式, 时长约${videoInfo.duration || '未知'}秒]`)
          } else {
            fileTextParts.push('[收到视频消息]')
          }
        } catch (e: any) {
          console.warn('[WechatBot] Failed to process video:', e.message)
          fileTextParts.push('[收到视频消息，无法处理]')
        }
      } else if (item.type === 5) {
        fileTextParts.push('[收到视频消息]')
      }
    }

    // Combine text and file content
    let text = textParts.join('\n').trim()
    if (fileTextParts.length > 0) {
      const fileContent = fileTextParts.join('\n\n')
      if (text) {
        text = `[用户消息]\n${text}\n\n[附带文件内容]\n${fileContent}`
      } else {
        text = `[用户发送了文件，请分析以下内容]\n\n${fileContent}`
      }
    }

    // Skip only if there's truly nothing (no text, no files, no images)
    if (!text && images.length === 0) {
      console.log('[WechatBot] No processable content in message, skipping')
      return
    }

    console.log(`[WechatBot] Message from ${userId}: text="${text.slice(0, 50)}...", images=${images.length}`)

    // Get or create user session
    let session = this.userSessions.get(userId)
    if (!session) {
      const chatSessionId = `wechat-${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      session = {
        userId,
        contextToken: '',
        lastActivityAt: now,
        chatSessionId,
        pendingMessages: [],
        isProcessing: false,
      }
      this.userSessions.set(userId, session)

      // Create ChatService session with persona system prompt
      const persona = this.getUserPersona(userId)
      const chat = ChatService.getInstance()
      chat.createSession(chatSessionId, persona.systemPrompt)
    }

    // Update context token and activity
    session.contextToken = msg.context_token
    session.lastActivityAt = now

    // Queue message
    if (session.isProcessing) {
      session.pendingMessages.push(text)
      console.log(`[WechatBot] Queued message for ${userId} (currently processing)`)
      return
    }

    await this.processUserMessage(session, text, images)
  }

  private async processUserMessage(
    session: WechatUserSession,
    text: string,
    images: string[] = []
  ): Promise<void> {
    session.isProcessing = true

    try {
      this.emit('message-received', { userId: session.userId, text })

      // Send typing indicator
      await this.sendTyping(session.userId, 'send')

      // Set up typing refresh interval
      const typingInterval = setInterval(async () => {
        if (!session.isProcessing) return
        await this.sendTyping(session.userId, 'send')
      }, TYPING_REFRESH_INTERVAL_MS)

      // Listen for AI response
      const chat = ChatService.getInstance()
      let fullText = ''
      let hasError = false
      let errorMessage = ''

      const onDelta = (sId: string, delta: string) => {
        if (sId !== session.chatSessionId) return
        fullText += delta
      }

      const onDone = (sId: string) => {
        if (sId !== session.chatSessionId) return
        // Handled after finalMessage
      }

      const onError = (sId: string, errMsg: string) => {
        if (sId !== session.chatSessionId) return
        hasError = true
        errorMessage = errMsg
      }

      const onCancelled = (sId: string) => {
        if (sId !== session.chatSessionId) return
        hasError = true
        errorMessage = '已取消'
      }

      chat.on('delta', onDelta)
      chat.on('done', onDone)
      chat.on('error', onError)
      chat.on('cancelled', onCancelled)

      // Send message to AI
      try {
        await new Promise<void>((resolve) => {
          const checkDone = (sId: string) => {
            if (sId === session.chatSessionId) {
              chat.removeListener('done', checkDone)
              chat.removeListener('error', checkError)
              chat.removeListener('cancelled', checkCancelled)
              resolve()
            }
          }
          const checkError = (sId: string) => {
            if (sId === session.chatSessionId) {
              chat.removeListener('done', checkDone)
              chat.removeListener('error', checkError)
              chat.removeListener('cancelled', checkCancelled)
              resolve()
            }
          }
          const checkCancelled = (sId: string) => {
            if (sId === session.chatSessionId) {
              chat.removeListener('done', checkDone)
              chat.removeListener('error', checkError)
              chat.removeListener('cancelled', checkCancelled)
              resolve()
            }
          }

          chat.on('done', checkDone)
          chat.on('error', checkError)
          chat.on('cancelled', checkCancelled)

          chat.sendMessage(session.chatSessionId, text, images.length > 0 ? images : undefined)
        })
      } finally {
        clearInterval(typingInterval)
        chat.removeListener('delta', onDelta)
        chat.removeListener('done', onDone)
        chat.removeListener('error', onError)
        chat.removeListener('cancelled', onCancelled)
      }

      // Prepare response text
      let responseText: string
      if (hasError) {
        responseText = `❌ ${errorMessage}`
      } else if (!fullText.trim()) {
        responseText = '(AI 未返回内容)'
      } else {
        responseText = fullText.trim()
      }

      // Send response back to WeChat
      await this.sendAiResponse(session, responseText)

      // Cancel typing
      await this.sendTyping(session.userId, 'cancel')
    } catch (e: any) {
      console.error('[WechatBot] Error processing message:', e.message)
      try {
        await this.sendAiResponse(session, `❌ 内部错误: ${e.message}`)
        await this.sendTyping(session.userId, 'cancel')
      } catch {}
    } finally {
      session.isProcessing = false

      // Process next queued message
      const next = session.pendingMessages.shift()
      if (next) {
        await this.processUserMessage(session, next)
      }
    }
  }

  private async sendAiResponse(session: WechatUserSession, text: string): Promise<void> {
    // Check 24h inactivity window
    if (!this.isActive(session.userId)) {
      console.log(`[WechatBot] User ${session.userId} inactive >24h, skipping send`)
      return
    }

    // Split long messages
    const chunks = this.splitMessage(text)

    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}] ` : ''
      const chunkText = prefix + chunks[i]

      try {
        const resp = await this.apiPost<SendMessageResponse>(
          '/ilink/bot/sendmessage',
          {
            msg: {
              from_user_id: '',
              to_user_id: session.userId,
              client_id: `zxbot-${Date.now()}-${i}`,
              message_type: 2, // BOT
              message_state: 2, // FINISH
              context_token: session.contextToken,
              item_list: [
                { type: 1, text_item: { text: chunkText } },
              ],
            },
            base_info: {
              channel_version: '1.0.0',
              bot_agent: 'ZXBot',
            },
          }
        )

        if (resp && resp.ret === 0) {
          this.emit('message-sent', { userId: session.userId, text: chunkText })
          console.log(`[WechatBot] Sent to ${session.userId}: "${chunkText.slice(0, 50)}..."`)
        } else {
          console.warn(`[WechatBot] Send failed ret=${resp?.ret}: ${resp?.err_msg || ''}`)
          // Check for 24h block or session expiry
          if (resp?.ret === -14 || resp?.err_msg?.includes('inactive') || resp?.err_msg?.includes('24')) {
            console.log(`[WechatBot] User ${session.userId} session expired (24h inactivity)`)
            this.userSessions.delete(session.userId)
            return
          }
        }
      } catch (e: any) {
        console.error(`[WechatBot] Send error to ${session.userId}:`, e.message)
      }

      // Small delay between chunks
      if (chunks.length > 1 && i < chunks.length - 1) {
        await this.sleep(500)
      }
    }
  }

  // ── Voice Message Decoding ──

  private async downloadAndDecodeVoice(url: string): Promise<{ duration: number; wavPath?: string } | null> {
    try {
      const resp = await fetch(url, { headers: this.buildHeaders() })
      if (!resp.ok) return null
      const silkBuf = Buffer.from(await resp.arrayBuffer())

      // Check if it's a valid SILK file
      if (!silkWasm.isSilk(silkBuf)) {
        console.warn('[WechatBot] Voice file is not SILK format')
        return null
      }

      // Get duration
      let duration = 0
      try {
        duration = Math.round(silkWasm.getDuration(silkBuf) / 1000)
      } catch {
        // Duration estimation based on file size (rough: ~2KB/s for SILK)
        duration = Math.round(silkBuf.length / 2000)
      }

      // Decode to WAV
      try {
        const wavBuf: Buffer = silkWasm.decode(silkBuf)
        const wavPath = join(tmpdir(), `wechat-voice-${Date.now()}.wav`)
        writeFileSync(wavPath, wavBuf)
        console.log(`[WechatBot] Voice decoded: ${duration}s, saved to ${wavPath}`)
        return { duration, wavPath }
      } catch (e: any) {
        console.warn('[WechatBot] SILK decode failed:', e.message)
        return { duration } // Return duration even if decode fails
      }
    } catch (e: any) {
      console.warn('[WechatBot] Voice download failed:', e.message)
      return null
    }
  }

  // ── Video Message Info ──

  private async downloadAndGetVideoInfo(url: string): Promise<{ size: number; format: string; duration?: number } | null> {
    try {
      const resp = await fetch(url, { headers: this.buildHeaders() })
      if (!resp.ok) return null
      const buf = Buffer.from(await resp.arrayBuffer())

      const sizeMB = parseFloat((buf.length / 1024 / 1024).toFixed(1))
      // Try to detect format from magic bytes or URL extension
      const ext = extname(url).toLowerCase().replace('.', '') || 'mp4'
      const formatMap: Record<string, string> = {
        mp4: 'MP4', mov: 'MOV', avi: 'AVI', mkv: 'MKV',
        wmv: 'WMV', flv: 'FLV', webm: 'WebM',
      }
      const format = formatMap[ext] || ext.toUpperCase()

      // Attempt to get video duration by parsing MP4/MOV header
      // MP4: mvhd atom at offset; MOV: similar structure
      let duration: number | undefined
      try {
        // Look for mvhd atom in MP4/MOV files
        const mvhdIdx = buf.indexOf(Buffer.from('mvhd'))
        if (mvhdIdx > 0 && mvhdIdx + 24 < buf.length) {
          const version = buf[mvhdIdx + 4]
          const timeScaleOffset = version === 1 ? 20 : 12
          const durationOffset = version === 1 ? 24 : 16
          if (mvhdIdx + durationOffset + 8 < buf.length) {
            const timeScale = version === 1
              ? Number(buf.readBigUInt64BE(mvhdIdx + timeScaleOffset))
              : buf.readUInt32BE(mvhdIdx + timeScaleOffset)
            const rawDuration = version === 1
              ? Number(buf.readBigUInt64BE(mvhdIdx + durationOffset))
              : buf.readUInt32BE(mvhdIdx + durationOffset)
            if (timeScale > 0) {
              duration = Math.round(rawDuration / timeScale)
            }
          }
        }
      } catch {
        // Duration parsing is best-effort
      }

      console.log(`[WechatBot] Video info: ${sizeMB}MB, ${format}${duration ? `, ${duration}s` : ''}`)
      return { size: sizeMB, format, duration }
    } catch (e: any) {
      console.warn('[WechatBot] Video download failed:', e.message)
      return null
    }
  }

  // ── File Download & Extraction ──

  private async downloadImageAsBase64(url: string): Promise<string | null> {
    try {
      const resp = await fetch(url, { headers: this.buildHeaders() })
      if (!resp.ok) return null
      const buf = Buffer.from(await resp.arrayBuffer())
      const ext = extname(url).toLowerCase().replace('.', '') || 'png'
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      }
      const mime = mimeMap[ext] || 'image/png'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch (e: any) {
      console.warn('[WechatBot] Image download failed:', e.message)
      return null
    }
  }

  private async downloadAndExtractFile(url: string, fileName: string): Promise<string | null> {
    try {
      const resp = await fetch(url, { headers: this.buildHeaders() })
      if (!resp.ok) return null
      const buf = Buffer.from(await resp.arrayBuffer())
      const ext = extname(fileName).toLowerCase()

      // PDF
      if (ext === '.pdf') {
        try {
          const data = await pdfParse(buf)
          const text = (data as any).text || ''
          return `[PDF: ${fileName}]\n${text.slice(0, 30000)}${text.length > 30000 ? '\n...(内容已截断)' : ''}`
        } catch { return `[PDF: ${fileName}，无法解析内容]` }
      }

      // DOCX
      if (ext === '.docx') {
        try {
          const result = await mammoth.extractRawText({ buffer: buf })
          const text = result.value || ''
          return `[DOCX: ${fileName}]\n${text.slice(0, 30000)}${text.length > 30000 ? '\n...(内容已截断)' : ''}`
        } catch { return `[DOCX: ${fileName}，无法解析内容]` }
      }

      // XLSX / XLS
      if (ext === '.xlsx' || ext === '.xls') {
        try {
          const wb = XLSX.read(buf, { type: 'buffer' })
          const sheets: string[] = []
          wb.SheetNames.forEach((name: string) => {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name])
            sheets.push(`### ${name}\n${csv}`)
          })
          const text = sheets.join('\n\n')
          return `[Excel: ${fileName}]\n${text.slice(0, 30000)}${text.length > 30000 ? '\n...(内容已截断)' : ''}`
        } catch { return `[Excel: ${fileName}，无法解析内容]` }
      }

      // PPTX
      if (ext === '.pptx') {
        try {
          const zip = new AdmZip(buf)
          const slides = zip.getEntries()
            .filter((e: any) => e.entryName.match(/ppt\/slides\/slide\d+\.xml$/))
            .sort((a: any, b: any) => {
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
          const text = parts.join('\n')
          return `[PPTX: ${fileName}]\n${text.slice(0, 30000)}${text.length > 30000 ? '\n...(内容已截断)' : ''}`
        } catch { return `[PPTX: ${fileName}，无法解析内容]` }
      }

      // Text files
      if (['.txt', '.md', '.json', '.csv', '.xml', '.html', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.log'].includes(ext)) {
        try {
          const text = buf.toString('utf-8')
          return `[${ext.toUpperCase()}: ${fileName}]\n${text.slice(0, 30000)}${text.length > 30000 ? '\n...(内容已截断)' : ''}`
        } catch { return `[文件: ${fileName}，编码不支持]` }
      }

      // Unknown format — report file info
      return `[收到文件: ${fileName} (${(buf.length / 1024).toFixed(1)} KB, ${ext || '未知格式'})，请在电脑上查看]`
    } catch (e: any) {
      console.warn('[WechatBot] File download failed:', e.message)
      return `[文件下载失败: ${fileName}]`
    }
  }

  // ── Typing indicator ──

  async sendTyping(userId: string, action: 'send' | 'cancel'): Promise<void> {
    const session = this.userSessions.get(userId)
    if (!session?.contextToken) return

    try {
      await this.apiPost<SendTypingResponse>(
        '/ilink/bot/sendtyping',
        {
          msg: {
            to_user_id: userId,
            context_token: session.contextToken,
          },
          action,
          base_info: {
            channel_version: '1.0.0',
            bot_agent: 'ZXBot',
          },
        }
      )
    } catch (e: any) {
      // Typing failures are non-critical
      if (e.name !== 'AbortError') {
        console.warn('[WechatBot] Typing indicator failed:', e.message)
      }
    }
  }

  // ── Utility ──

  isActive(userId: string): boolean {
    const session = this.userSessions.get(userId)
    if (!session) return true
    return Date.now() - session.lastActivityAt < INACTIVITY_WINDOW_MS
  }

  private splitMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_LENGTH) return [text]

    const chunks: string[] = []
    let remaining = text
    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(remaining)
        break
      }
      // Split at nearest newline or space before the limit
      let splitAt = MAX_MESSAGE_LENGTH
      const lastNewline = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH)
      const lastSpace = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH)
      if (lastNewline > MAX_MESSAGE_LENGTH * 0.8) {
        splitAt = lastNewline + 1
      } else if (lastSpace > MAX_MESSAGE_LENGTH * 0.8) {
        splitAt = lastSpace + 1
      }
      chunks.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt)
    }
    return chunks
  }

  private cleanDedupCache(): void {
    const now = Date.now()
    for (const [key, ts] of this.recentMessages) {
      if (now - ts > MESSAGE_DEDUP_WINDOW_MS * 2) {
        this.recentMessages.delete(key)
      }
    }
  }

  // ── Connection test (use getupdates — the most basic endpoint) ──

  private async testConnection(): Promise<boolean> {
    try {
      const resp = await this.apiPost<GetUpdatesResponse>(
        '/ilink/bot/getupdates',
        {
          get_updates_buf: this.cursor || '',
          base_info: {
            channel_version: '1.0.0',
            bot_agent: 'ZXBot',
          },
        },
        { timeout: 10000 }
      )
      // ret === 0 means token is valid (even if no messages)
      return resp !== null && resp.ret === 0
    } catch {
      return false
    }
  }

  // ── HTTP helpers ──

  private buildHeaders(): Record<string, string> {
    if (!this.cachedUin) {
      const randomUin = Math.floor(1000000000 + Math.random() * 8999999999).toString()
      this.cachedUin = Buffer.from(randomUin).toString('base64')
      // Persist UIN for token continuity across restarts
      this.persistAuth()
    }
    return {
      'Content-Type': 'application/json',
      'AuthorizationType': 'ilink_bot_token',
      'X-WECHAT-UIN': this.cachedUin,
      'Authorization': `Bearer ${this.auth?.bot_token || ''}`,
    }
  }

  private async apiGet<T>(
    path: string,
    params?: Record<string, string>,
    opts?: { skipAuth?: boolean }
  ): Promise<T | null> {
    const base = this.auth?.baseurl || API_DEFAULT_BASE
    let url = `${base}${path}`
    if (params) {
      const qs = new URLSearchParams(params).toString()
      url += `?${qs}`
    }

    const headers: Record<string, string> = opts?.skipAuth
      ? { 'Content-Type': 'application/json' }
      : this.buildHeaders()

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers,
      })
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          console.warn('[WechatBot] Auth failed (token expired?)')
          if (!opts?.skipAuth) this.handleAuthExpired()
        }
        return null
      }
      return await resp.json() as T
    } catch (e: any) {
      if (e.name === 'AbortError') return null
      throw e
    }
  }

  private async apiPost<T>(
    path: string,
    body: Record<string, unknown>,
    opts?: { timeout?: number }
  ): Promise<T | null> {
    const base = this.auth?.baseurl || API_DEFAULT_BASE
    const url = `${base}${path}`
    const signal = opts?.timeout
      ? AbortSignal.timeout(opts.timeout)
      : undefined

    try {
      // Merge signals if we have a poll controller
      const controller = new AbortController()
      const onPollAbort = () => controller.abort()
      this.pollController?.signal.addEventListener('abort', onPollAbort, { once: true })

      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true })
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      this.pollController?.signal.removeEventListener('abort', onPollAbort)

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          this.handleAuthExpired()
        }
        const errText = await resp.text().catch(() => '')
        console.warn(`[WechatBot] HTTP ${resp.status} for ${path}:`, errText.slice(0, 200))
        return null
      }

      return await resp.json() as T
    } catch (e: any) {
      if (e.name === 'AbortError') return null
      if (e.name === 'TimeoutError') return null
      throw e
    }
  }

  private handleAuthExpired(): void {
    console.warn('[WechatBot] Auth expired, resetting state')
    this.auth = null
    this.cursor = ''
    this.lastQrData = null
    this.clearPersistedAuth()
    this.abortAll()
    this.userSessions.clear()
    this.setStatus('disconnected')
    // Auto-restart QR flow if auto-connect is enabled
    if (this.autoConnect) {
      console.log('[WechatBot] Auto-reconnecting...')
      setTimeout(() => this.startQrFlow(), 1000)
    }
  }

  // ── Persistence ──

  private persistAuth(): void {
    if (!this.auth) return
    const data: WechatBotPersistedState = {
      bot_token: this.auth.bot_token,
      baseurl: this.auth.baseurl,
      connectedAt: this.connectedAt || Date.now(),
      cursor: this.cursor || '',
      uin: this.cachedUin || '',
    }
    try {
      writeFileSync(this.storePath, JSON.stringify(data, null, 2))
    } catch (e: any) {
      console.error('[WechatBot] Failed to persist auth:', e.message)
    }
  }

  private loadPersistedAuth(): void {
    try {
      if (!existsSync(this.storePath)) return
      const data: WechatBotPersistedState = JSON.parse(readFileSync(this.storePath, 'utf-8'))
      if (data.bot_token) {
        this.auth = { bot_token: data.bot_token, baseurl: data.baseurl }
        if (data.cursor) {
          this.cursor = data.cursor
        }
        if (data.uin) {
          this.cachedUin = data.uin
        }
        console.log('[WechatBot] Loaded persisted auth (cursor=' + (this.cursor ? 'yes' : 'no') + ', uin=' + (this.cachedUin ? 'yes' : 'no') + ')')
      }
    } catch (e: any) {
      console.warn('[WechatBot] Failed to load persisted auth:', e.message)
    }
  }

  private clearPersistedAuth(): void {
    try {
      if (existsSync(this.storePath)) {
        writeFileSync(this.storePath, JSON.stringify({}))
      }
    } catch {}
  }

  private loadSettings(): void {
    try {
      if (existsSync(this.settingsPath)) {
        const data = JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
        // Only override default (true) if explicitly set to false
        if (typeof data.autoConnect === 'boolean') {
          this.autoConnect = data.autoConnect
        }
      }
    } catch {}
  }

  private saveSettings(): void {
    try {
      writeFileSync(this.settingsPath, JSON.stringify({ autoConnect: this.autoConnect }, null, 2))
    } catch {}
  }

  // ── Persona Management ──

  /** Get all available personas */
  getPersonas(): BotPersona[] {
    return BOT_PERSONAS
  }

  /** Get the global default persona */
  getDefaultPersonaId(): string {
    return this.defaultPersonaId
  }

  /** Set the global default persona and apply to all existing sessions */
  setDefaultPersona(personaId: string): void {
    this.defaultPersonaId = personaId
    this.savePersonas()

    // Apply to all existing user sessions — clear history, set new prompt
    const persona = getPersona(personaId)
    const chat = ChatService.getInstance()
    for (const [userId, session] of this.userSessions) {
      // Only update users who are using the default (no per-user override)
      if (!this.userPersonas.has(userId)) {
        chat.createSession(session.chatSessionId, persona.systemPrompt)
        console.log(`[WechatBot] Updated persona for ${userId} to "${persona.name}" (history cleared)`)
      }
    }
  }

  /** Get persona for a specific user */
  getUserPersona(userId: string): BotPersona {
    const personaId = this.userPersonas.get(userId) || this.defaultPersonaId
    return getPersona(personaId)
  }

  /** Set persona for a user and recreate their chat session (clears history) */
  setUserPersona(userId: string, personaId: string): void {
    this.userPersonas.set(userId, personaId)
    this.savePersonas()

    // Recreate chat session with new persona prompt + clear conversation history
    const session = this.userSessions.get(userId)
    if (session) {
      const persona = getPersona(personaId)
      const chat = ChatService.getInstance()
      chat.createSession(session.chatSessionId, persona.systemPrompt)
      console.log(`[WechatBot] Persona for ${userId} set to "${persona.name}" (history cleared)`)
    }
  }

  /** Get persona for a specific user ID (IPC-friendly) */
  getUserPersonaId(userId: string): string {
    return this.userPersonas.get(userId) || this.defaultPersonaId
  }

  /** Get all user persona mappings (IPC-friendly) */
  getAllUserPersonas(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [userId, personaId] of this.userPersonas) {
      result[userId] = personaId
    }
    return result
  }

  private loadPersonas(): void {
    try {
      if (existsSync(this.personaStorePath)) {
        const data = JSON.parse(readFileSync(this.personaStorePath, 'utf-8'))
        if (data.defaultPersonaId) {
          this.defaultPersonaId = data.defaultPersonaId
        }
        if (data.userPersonas) {
          for (const [userId, personaId] of Object.entries(data.userPersonas)) {
            this.userPersonas.set(userId, personaId as string)
          }
        }
      }
    } catch {}
  }

  private savePersonas(): void {
    try {
      const userPersonas: Record<string, string> = {}
      for (const [userId, personaId] of this.userPersonas) {
        userPersonas[userId] = personaId
      }
      writeFileSync(this.personaStorePath, JSON.stringify({
        defaultPersonaId: this.defaultPersonaId,
        userPersonas,
      }, null, 2))
    } catch {}
  }

  // ── Cleanup ──

  private abortAll(): void {
    if (this.pollController) {
      this.pollController.abort()
      this.pollController = null
    }
    if (this.qrPollController) {
      this.qrPollController.abort()
      this.qrPollController = null
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
