import { create } from 'zustand'
import type { ChatMessage } from '../components/Chat/types'

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface ChatStoreState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  streaming: boolean
  pendingResumeId: string | null

  // Actions
  getMessages: (convId: string) => ChatMessage[]
  initConversation: (convId: string) => void
  addMessage: (convId: string, msg: ChatMessage) => void
  updateLastMessage: (convId: string, content: string, streaming?: boolean) => void
  setStreaming: (s: boolean) => void
  deleteMessages: (convId: string, messageIds: string[]) => void
  clearConversation: (convId: string) => void
  getConversation: (convId: string) => Conversation | null
  setActiveConversation: (id: string | null) => void
  getConversationTitle: (convId: string) => string
  getAllConversations: () => Conversation[]
  loadConversation: (conv: Conversation) => void
  setPendingResume: (id: string | null) => void
  resumeIntoSession: (targetConvId: string, newSessionId: string) => boolean
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  conversations: {},
  activeConversationId: null,
  streaming: false,
  pendingResumeId: null,

  getMessages: (convId) => get().conversations[convId]?.messages || [],

  initConversation: (convId) => {
    if (!get().conversations[convId]) {
      set((s) => ({
        conversations: {
          ...s.conversations,
          [convId]: { id: convId, title: '新建任务', messages: [], createdAt: Date.now(), updatedAt: Date.now() },
        },
        activeConversationId: s.activeConversationId || convId,
      }))
    } else {
      set({ activeConversationId: convId })
    }
  },

  addMessage: (convId, msg) => {
    set((s) => {
      const conv = s.conversations[convId]
      if (!conv) return s
      const updated = [...conv.messages, msg]
      // Auto-title: first user message
      let title = conv.title
      if (title === '新建任务' && msg.role === 'user') {
        title = msg.content.slice(0, 30) + (msg.content.length > 30 ? '...' : '')
      }
      return {
        conversations: { ...s.conversations, [convId]: { ...conv, messages: updated, title, updatedAt: Date.now() } },
      }
    })
  },

  updateLastMessage: (convId, content, streaming = true) => {
    set((s) => {
      const conv = s.conversations[convId]
      if (!conv) return s
      const msgs = [...conv.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content, streaming }
      }
      return {
        conversations: { ...s.conversations, [convId]: { ...conv, messages: msgs, updatedAt: Date.now() } },
      }
    })
  },

  setStreaming: (s) => set({ streaming: s }),

  deleteMessages: (convId, messageIds) => {
    set((s) => {
      const conv = s.conversations[convId]
      if (!conv) return s
      const idSet = new Set(messageIds)
      const updated = conv.messages.filter(m => !idSet.has(m.id))
      return {
        conversations: { ...s.conversations, [convId]: { ...conv, messages: updated, updatedAt: Date.now() } },
      }
    })
  },

  clearConversation: (convId) => {
    set((s) => {
      const conv = s.conversations[convId]
      if (!conv) return s
      return {
        conversations: { ...s.conversations, [convId]: { ...conv, messages: [], title: '新建任务', updatedAt: Date.now() } },
      }
    })
  },

  getConversation: (convId) => get().conversations[convId] || null,

  setActiveConversation: (id) => set({ activeConversationId: id }),

  getConversationTitle: (convId) => get().conversations[convId]?.title || '新建任务',

  getAllConversations: () =>
    Object.values(get().conversations).sort((a, b) => b.updatedAt - a.updatedAt),

  loadConversation: (conv) => {
    set((s) => ({
      conversations: { ...s.conversations, [conv.id]: conv },
      activeConversationId: conv.id,
    }))
  },

  setPendingResume: (id) => set({ pendingResumeId: id }),

  resumeIntoSession: (targetConvId, newSessionId) => {
    const state = get()
    const target = state.conversations[targetConvId]
    if (!target) return false
    // Copy the target conversation's messages into the new session
    set((s) => ({
      pendingResumeId: null,
      conversations: {
        ...s.conversations,
        [newSessionId]: {
          ...target,
          id: newSessionId,
          title: target.title,
          messages: [...target.messages],
        },
      },
      activeConversationId: newSessionId,
    }))
    return true
  },
}))
