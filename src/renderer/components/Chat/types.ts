export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  streaming?: boolean
  /** Current streaming phase: 'thinking' (waiting for model), tool-specific label (e.g. '📦 安装中'), 'responding' (streaming text) */
  streamingStatus?: string
  /** Tool execution results — stored separately to keep content clean.
      Only the AI's text response goes into `content`. Tool results are
      shown in a collapsed section below the bubble. */
  toolResults?: Array<{ name: string; result: string }>
}
