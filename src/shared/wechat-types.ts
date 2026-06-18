// ── WeChat iLink Bot Protocol Types ──
// Based on @tencent-weixin/openclaw-weixin protocol analysis
// API base: https://ilinkai.weixin.qq.com

export type BotStatus = 'disconnected' | 'qr_pending' | 'connecting' | 'connected' | 'error'

export interface WechatBotAuth {
  bot_token: string
  baseurl: string // e.g., "https://ilinkai.weixin.qq.com"
}

export interface WechatBotPersistedState {
  bot_token: string
  baseurl: string
  connectedAt: number
  cursor?: string // get_updates_buf cursor for resuming message stream
  uin?: string // Persisted X-WECHAT-UIN for token continuity across restarts
}

// ── Message types ──

export type MessageItemType = 1 | 2 | 3 | 4 | 5
// 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO

export interface TextItem {
  text: string
}

export interface ImageItem {
  url: string
  width: number
  height: number
}

export interface FileItem {
  url: string
  name: string
  size: number
}

export interface VideoItem {
  url: string
  duration: number
}

export interface VoiceItem {
  url: string
  duration: number
}

export interface WechatMessageItem {
  type: MessageItemType
  text_item?: TextItem
  image_item?: ImageItem
  file_item?: FileItem
  video_item?: VideoItem
  voice_item?: VoiceItem
}

export interface WechatIncomingMessage {
  from_user_id: string // e.g., "user@im.wechat"
  to_user_id: string
  context_token: string // MUST be echoed back in reply
  item_list: WechatMessageItem[]
  message_type: 1 | 2 // 1=USER, 2=BOT
  message_state: 0 | 1 | 2 // 0=NEW, 1=GENERATING, 2=FINISH
}

// ── API Response types ──

export interface GetUpdatesResponse {
  ret: number
  err_msg?: string
  msgs?: WechatIncomingMessage[]
  get_updates_buf?: string // cursor for next poll
  longpolling_timeout_ms?: number
}

export interface SendMessageResponse {
  ret: number
  err_msg?: string
  msg_id?: string
}

export interface QrCodeResponse {
  ret: number
  qrcode: string // QR code token for polling status
  qrcode_img_content?: string // QR code display URL (WeChat internal)
  url?: string // Alternative URL field
  err_msg?: string
}

export interface QrCodeStatusResponse {
  ret: number
  status: 'pending' | 'scanned' | 'confirmed' | 'expired'
  bot_token?: string
  baseurl?: string
  err_msg?: string
}

export interface BotConfigResponse {
  ret: number
  typing_ticket?: string
  err_msg?: string
  [key: string]: unknown
}

export interface SendTypingResponse {
  ret: number
  err_msg?: string
}

export interface GetUploadUrlResponse {
  ret: number
  upload_url?: string
  upload_param?: Record<string, string>
  thumb_upload_url?: string
  thumb_upload_param?: Record<string, string>
  encrypt_query_param?: string
  err_msg?: string
}

// ── Request types ──

export interface SendMessageRequest {
  to_user_id: string
  context_token: string
  item_list: WechatMessageItem[]
  message_type: 1 | 2
}

export interface SendTypingRequest {
  to_user_id: string
  context_token: string
  action: 'send' | 'cancel'
}

export interface GetUpdatesRequest {
  get_updates_buf: string
  base_info: {
    channel_version: string
    bot_agent: string
  }
}

// ── Internal session tracking ──

export interface WechatUserSession {
  userId: string
  contextToken: string
  lastActivityAt: number
  chatSessionId: string
  pendingMessages: string[] // queue for sequential processing
  isProcessing: boolean
}

export interface WechatBotStatus {
  status: BotStatus
  connectedAt: number | null
  error: string | null
  qrcodeUrl: string | null
  qrcodeData?: string | null
  qrcodeSvg?: string | null
}
