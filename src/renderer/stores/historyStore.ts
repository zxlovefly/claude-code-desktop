import { create } from 'zustand'

// ── Types ──

export interface ToolHistoryEntry {
  id: string
  pageType: string // 'prd' | 'analysis' | 'prototype'
  title: string
  label: string
  content: string
  format: string
  timestamp: number
  /** Serialized form data for restoring form fields when loading from history */
  formData?: Record<string, string>
}

export interface ChatHistoryMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatHistoryEntry {
  id: string
  title: string
  messages: ChatHistoryMessage[]
  createdAt: number
  updatedAt: number
}

// ── Constants ──

const MAX_HISTORY = 25
const TOOL_HISTORY_KEY = 'zxcode-tool-history'
const CHAT_HISTORY_KEY = 'zxcode-chat-history'

// ── Helpers ──

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// ── Store ──

interface HistoryStoreState {
  // Tool history
  toolHistory: ToolHistoryEntry[]
  loadToolHistory: () => ToolHistoryEntry[]
  addToolEntry: (entry: ToolHistoryEntry) => void
  upsertToolEntry: (entry: ToolHistoryEntry) => void
  deleteToolEntries: (ids: string[]) => void

  // Chat history
  chatHistory: ChatHistoryEntry[]
  loadChatHistory: () => ChatHistoryEntry[]
  upsertChatEntry: (entry: ChatHistoryEntry) => void
  deleteChatEntries: (ids: string[]) => void
  clearAllChatHistory: () => void

  // Cross-page pending load
  pendingLoad: { pageType: string; content: string } | null
  setPendingLoad: (load: { pageType: string; content: string } | null) => void
}

export const useHistoryStore = create<HistoryStoreState>((set, get) => ({
  // ── Tool History ──

  toolHistory: loadJson<ToolHistoryEntry[]>(TOOL_HISTORY_KEY, []),

  loadToolHistory: () => {
    const data = loadJson<ToolHistoryEntry[]>(TOOL_HISTORY_KEY, [])
    set({ toolHistory: data })
    return data
  },

  addToolEntry: (entry) => {
    const current = get().toolHistory
    const updated = [entry, ...current].slice(0, MAX_HISTORY)
    saveJson(TOOL_HISTORY_KEY, updated)
    set({ toolHistory: updated })
  },

  upsertToolEntry: (entry) => {
    const current = get().toolHistory
    const existingIdx = current.findIndex(h => h.id === entry.id)
    let updated: ToolHistoryEntry[]
    if (existingIdx >= 0) {
      updated = [...current]
      updated[existingIdx] = entry
    } else {
      updated = [entry, ...current]
    }
    updated = updated.slice(0, MAX_HISTORY)
    saveJson(TOOL_HISTORY_KEY, updated)
    set({ toolHistory: updated })
  },

  deleteToolEntries: (ids) => {
    const idSet = new Set(ids)
    const updated = get().toolHistory.filter(h => !idSet.has(h.id))
    saveJson(TOOL_HISTORY_KEY, updated)
    set({ toolHistory: updated })
  },

  // ── Chat History ──

  chatHistory: loadJson<ChatHistoryEntry[]>(CHAT_HISTORY_KEY, []),

  loadChatHistory: () => {
    const data = loadJson<ChatHistoryEntry[]>(CHAT_HISTORY_KEY, [])
    set({ chatHistory: data })
    return data
  },

  upsertChatEntry: (entry) => {
    const current = get().chatHistory
    const existingIdx = current.findIndex(h => h.id === entry.id)
    let updated: ChatHistoryEntry[]
    if (existingIdx >= 0) {
      updated = [...current]
      updated[existingIdx] = entry
    } else {
      updated = [entry, ...current]
    }
    updated = updated.slice(0, MAX_HISTORY)
    saveJson(CHAT_HISTORY_KEY, updated)
    set({ chatHistory: updated })
  },

  deleteChatEntries: (ids) => {
    const idSet = new Set(ids)
    const updated = get().chatHistory.filter(h => !idSet.has(h.id))
    saveJson(CHAT_HISTORY_KEY, updated)
    set({ chatHistory: updated })
  },

  clearAllChatHistory: () => {
    saveJson(CHAT_HISTORY_KEY, [])
    set({ chatHistory: [] })
  },

  // ── Cross-page pending load ──

  pendingLoad: null,

  setPendingLoad: (load) => set({ pendingLoad: load }),
}))
