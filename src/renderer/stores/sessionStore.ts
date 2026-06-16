import { create } from 'zustand'
import type { SessionInfo } from '../../shared/types'

interface SessionState {
  sessions: SessionInfo[]
  activeSessionId: string | null
  streamBuffers: Map<string, string>
  createSession: (info: SessionInfo) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
  addSessionFromIpc: (info: SessionInfo) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  streamBuffers: new Map(),

  createSession: (info: SessionInfo) => {
    set((state) => ({
      sessions: [...state.sessions, info],
      activeSessionId: state.activeSessionId || info.id,
    }))
  },

  removeSession: (id: string) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const activeSessionId =
        state.activeSessionId === id
          ? sessions[0]?.id || null
          : state.activeSessionId
      return { sessions, activeSessionId }
    })
    // Kill the PTY
    window.electron.send('terminal:kill', id)
  },

  setActiveSession: (id: string) => {
    set({ activeSessionId: id })
  },

  addSessionFromIpc: (info: SessionInfo) => {
    get().createSession(info)
  },
}))
