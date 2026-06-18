import { useEffect, useCallback, useState, useRef } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PromptTemplates } from '../Main/PromptTemplates'
import { useChatStore } from '../../stores/chatStore'
import { useHistoryStore, type ChatHistoryEntry } from '../../stores/historyStore'
import { ConfirmDialog } from '../ConfirmDialog'

interface ChatTerminalViewProps {
  sessionId: string; visible: boolean; scenario: string
  onPromptFill: (prompt: string) => void; filledPrompt: string
  workspace: string; onWorkspaceChange: (w: string) => void
  autoSendPrompt?: string
  onAutoSent?: () => void
  onNavigateToSession?: (sessionId: string) => void
}

let msgIdCounter = 0
const nextId = () => `msg_${++msgIdCounter}_${Date.now()}`

export function ChatTerminalView({ sessionId, visible, scenario, onPromptFill, filledPrompt, workspace, onWorkspaceChange, autoSendPrompt, onAutoSent, onNavigateToSession }: ChatTerminalViewProps) {
  const messages = useChatStore(s => s.getMessages(sessionId))
  const addMessage = useChatStore(s => s.addMessage)
  const updateLastMessage = useChatStore(s => s.updateLastMessage)
  const streaming = useChatStore(s => s.streaming)
  const setStreaming = useChatStore(s => s.setStreaming)
  const clearConversation = useChatStore(s => s.clearConversation)
  const deleteMessages = useChatStore(s => s.deleteMessages)
  const initConversation = useChatStore(s => s.initConversation)
  const [subCategory, setSubCategory] = useState('daily-dev')
  // ── History store (unified) ──
  const chatHistory = useHistoryStore(s => s.chatHistory)
  const loadChatHistory = useHistoryStore(s => s.loadChatHistory)
  const upsertChatEntry = useHistoryStore(s => s.upsertChatEntry)
  const deleteChatEntries = useHistoryStore(s => s.deleteChatEntries)
  const clearAllChatHistory = useHistoryStore(s => s.clearAllChatHistory)
  const [showHistory, setShowHistory] = useState(false)
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [confirmClearChat, setConfirmClearChat] = useState(false)
  const navigatingRef = useRef(false)

  // Init conversation on mount / session change
  useEffect(() => {
    if (visible) {
      initConversation(sessionId)
      navigatingRef.current = true
      setTimeout(() => { navigatingRef.current = false }, 500)
    }
  }, [sessionId, visible])

  // Save to history when messages change (debounced) — skip during navigation
  useEffect(() => {
    if (messages.length === 0 || streaming || navigatingRef.current) return
    const timer = setTimeout(() => {
      if (navigatingRef.current) return
      const firstUser = messages.find(m => m.role === 'user')
      const entry: ChatHistoryEntry = {
        id: sessionId,
        title: firstUser?.content.slice(0, 40) || '新对话',
        messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
        createdAt: chatHistory.find(h => h.id === sessionId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
      upsertChatEntry(entry)
    }, 1000)
    return () => clearTimeout(timer)
  }, [messages, streaming])

  const handleSend = useCallback((text: string, files?: Array<{ fileName: string; content: string; isImage: boolean; base64?: string; isDocument?: boolean; fileType?: string }>) => {
    if ((!text.trim() && !files?.length) || streaming) return
    const msgs = useChatStore.getState().getMessages(sessionId); const last = msgs[msgs.length - 1]
    if (last?.streaming) updateLastMessage(sessionId, last.content, false)

    let fullText = text
    const images: string[] = []
    if (files?.length) {
      const fileCtx = files.map(f => {
        if (f.isImage) {
          images.push(f.content)
          return `[上传图片: ${f.fileName}]`
        }
        if (f.isDocument) {
          return `[上传文档: ${f.fileName} (${(f.fileType || '').toUpperCase()})]\n内容:\n\`\`\`\n${f.content.slice(0, 30000)}\n\`\`\`${f.content.length > 30000 ? '\n(已截断至30000字符)' : ''}`
        }
        return `[上传文件: ${f.fileName}]\n内容:\n\`\`\`\n${f.content.slice(0, 30000)}\n\`\`\`${f.content.length > 30000 ? '\n(已截断至30000字符)' : ''}`
      })
      fullText = fullText ? fullText + '\n\n' + fileCtx.join('\n\n') : fileCtx.join('\n\n')
    }
    if (workspace) fullText = `[工作目录: ${workspace}]\n${fullText}`

    addMessage(sessionId, { id: nextId(), role: 'user', content: text || `[上传了 ${files?.length} 个文件]`, timestamp: Date.now() })
    const asst = { id: nextId(), role: 'assistant' as const, content: '', timestamp: Date.now(), streaming: true }
    addMessage(sessionId, asst); setStreaming(true)
    window.electron.invoke('chat:send-message', sessionId, fullText, images.length > 0 ? images : undefined)
  }, [sessionId, streaming, workspace])

  const handleDeleteMessages = useCallback((ids: string[]) => {
    deleteMessages(sessionId, ids)
  }, [sessionId])

  const handleLoadHistory = (entry: ChatHistoryEntry) => {
    setShowHistory(false)
    // If the history entry is the current session, do nothing
    if (entry.id === sessionId) return

    // ── Save current conversation to history before navigating away ──
    const currentMsgs = useChatStore.getState().getMessages(sessionId)
    if (currentMsgs.length > 0) {
      const firstUser = currentMsgs.find(m => m.role === 'user')
      upsertChatEntry({
        id: sessionId,
        title: firstUser?.content.slice(0, 40) || '新对话',
        messages: currentMsgs.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
        createdAt: chatHistory.find(h => h.id === sessionId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      })
    }

    // Ensure the conversation exists in chatStore
    const store = useChatStore.getState()
    const existing = store.getConversation(entry.id)
    if (!existing) {
      // Load history entry into chatStore
      store.loadConversation({
        id: entry.id,
        title: entry.title,
        messages: entry.messages.map(m => ({ ...m, streaming: false })),
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
    }
    // Navigate to the history session — creates new backend session and switches
    onNavigateToSession?.(entry.id)
  }

  if (!visible) return null

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="flex items-center justify-between px-4 py-0.5 bg-[#f5f6f8]">
        <WorkspaceBadge workspace={workspace} onChange={onWorkspaceChange} />
        <div className="flex items-center gap-2">
          {/* Chat history button — always visible when there's any history */}
          {chatHistory.length > 0 && (
            <div className="relative">
              <button onClick={() => { setShowHistory(!showHistory); loadChatHistory() }}
                className="text-[10px] text-[#6c5ce7] hover:text-[#5a4bd1] flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                历史 ({chatHistory.length})
              </button>
              {showHistory && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowHistory(false)} />
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-[#e5e6eb] rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[9px] text-[#9a9ab0] uppercase border-b border-[#e5e6eb] sticky top-0 bg-white">最近对话 — 点击加载</div>
                    {chatHistory.map(h => (
                      <div key={h.id}
                        onClick={() => handleLoadHistory(h)}
                        className={`px-3 py-2 text-xs border-b border-[#e5e6eb]/30 cursor-pointer transition-colors ${h.id === sessionId ? 'bg-[#6c5ce7]/5' : 'hover:bg-[#f0f0f5]'}`}
                      >
                        <div className="font-medium text-[#1a1a2e] truncate">{h.title}</div>
                        <div className="text-[9px] text-[#9a9ab0] mt-0.5">
                          {new Date(h.updatedAt).toLocaleString()} · {h.messages.length} 条消息
                          {h.id === sessionId && <span className="ml-1 text-[#6c5ce7]">(当前)</span>}
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-2">
                      <button onClick={() => setConfirmClearHistory(true)} className="text-[9px] text-[#e17055] hover:underline">清空所有历史</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {messages.length > 0 && (
            <button onClick={() => setConfirmClearChat(true)}
              className="text-[10px] text-[#9a9ab0] hover:text-[#e17055]">清除对话</button>
          )}
        </div>
      </div>
      <MessageList messages={messages} onDeleteMessages={handleDeleteMessages} />
      <PromptTemplates onSelect={onPromptFill} category={scenario} subCategory={subCategory} onSubCategoryChange={setSubCategory} />
      <ChatInput onSend={handleSend} streaming={streaming} onCancel={() => window.electron.invoke('chat:cancel', sessionId)} prepopulate={filledPrompt} onConsumed={() => onPromptFill('')} autoSendPrompt={autoSendPrompt} onAutoSent={onAutoSent} />

      {/* Clear history confirmation */}
      <ConfirmDialog
        open={confirmClearHistory}
        title="清空聊天历史"
        message={`确定要清空全部 ${chatHistory.length} 条聊天历史记录吗？此操作不可撤销，所有对话将被永久删除。`}
        confirmLabel="全部清空"
        cancelLabel="取消"
        onConfirm={() => {
          deleteChatEntries(chatHistory.map(h => h.id))
          setShowHistory(false)
          setConfirmClearHistory(false)
        }}
        onCancel={() => setConfirmClearHistory(false)}
      />

      {/* Clear current chat confirmation */}
      <ConfirmDialog
        open={confirmClearChat}
        title="清除当前对话"
        message="确定要清除当前对话吗？此操作不可撤销，当前对话的所有消息将被清除。"
        confirmLabel="清除"
        cancelLabel="取消"
        onConfirm={() => {
          clearConversation(sessionId)
          setStreaming(false)
          setConfirmClearChat(false)
        }}
        onCancel={() => setConfirmClearChat(false)}
      />
    </div>
  )
}

function WorkspaceBadge({ workspace, onChange }: { workspace: string; onChange: (w: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(workspace)

  const save = () => { onChange(val); setEditing(false) }

  const pickFolder = async () => {
    const dir: any = await window.electron.invoke('dialog:open-directory')
    if (dir) { setVal(dir); onChange(dir) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="bg-white border border-[#e5e6eb] rounded px-2 py-0.5 text-[10px] text-[#1a1a2e] outline-none focus:border-[#6c5ce7] w-48" autoFocus />
        <button onClick={save} className="text-[9px] text-[#6c5ce7] font-medium">保存</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={pickFolder} className="text-[#9a9ab0] hover:text-[#6c5ce7] transition-colors p-0.5" title="选择工作目录">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-1.5-2H5a2 2 0 00-2 2z"/></svg>
      </button>
      <button onClick={() => { setVal(workspace); setEditing(true) }}
        className="text-[10px] text-[#9a9ab0] hover:text-[#6c5ce7] transition-colors"
        title="点击手动输入工作目录路径">
        {workspace ? workspace.split(/[/\\]/).pop() : '选择工作空间'}
      </button>
    </div>
  )
}
