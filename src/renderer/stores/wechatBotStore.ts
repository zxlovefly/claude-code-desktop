import { create } from 'zustand'
import type { BotStatus } from '../../shared/wechat-types'
import type { BotPersona } from '../../shared/bot-personas'

interface WechatBotStoreState {
  status: BotStatus
  qrcodeUrl: string | null
  qrcodeData: string | null
  qrcodeSvg: string | null  // Locally generated SVG QR code
  connectedAt: number | null
  error: string | null
  recentMessages: Array<{ userId: string; text: string; direction: 'in' | 'out'; ts: number }>
  isAutoConnect: boolean
  personas: BotPersona[]
  activePersonaId: string

  setStatus: (status: BotStatus, error?: string | null) => void
  setQrCode: (qrcode: string, url: string, svg?: string | null) => void
  addMessage: (userId: string, text: string, direction: 'in' | 'out') => void
  setAutoConnect: (v: boolean) => void
  setPersonas: (personas: BotPersona[]) => void
  setActivePersona: (personaId: string) => void
}

export const useWechatBotStore = create<WechatBotStoreState>((set) => ({
  status: 'disconnected',
  qrcodeUrl: null,
  qrcodeData: null,
  qrcodeSvg: null,
  connectedAt: null,
  error: null,
  recentMessages: [],
  isAutoConnect: false,
  personas: [],
  activePersonaId: 'default',

  setStatus: (status, error) => set({ status, error: error ?? null, connectedAt: status === 'connected' ? Date.now() : null }),
  setQrCode: (qrcode, url, svg) => set({ qrcodeData: qrcode, qrcodeUrl: url, qrcodeSvg: svg ?? null }),
  addMessage: (userId, text, direction) =>
    set((state) => ({
      recentMessages: [
        { userId, text, direction, ts: Date.now() },
        ...state.recentMessages,
      ].slice(0, 20),
    })),
  setAutoConnect: (v) => set({ isAutoConnect: v }),
  setPersonas: (personas) => set({ personas }),
  setActivePersona: (personaId) => set({ activePersonaId: personaId }),
}))
