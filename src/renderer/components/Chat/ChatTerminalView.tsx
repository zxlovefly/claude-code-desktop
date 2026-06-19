import { useEffect, useCallback, useState, useRef } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PromptTemplates } from '../Main/PromptTemplates'
import { useChatStore } from '../../stores/chatStore'
import { useHistoryStore, type ChatHistoryEntry } from '../../stores/historyStore'
import { ConfirmDialog } from '../ConfirmDialog'
import type { BtwInfo } from '../../App'

interface ChatTerminalViewProps {
  sessionId: string; visible: boolean; scenario: string
  onPromptFill: (prompt: string) => void; filledPrompt: string
  workspace: string; onWorkspaceChange: (w: string) => void
  autoSendPrompt?: string
  onAutoSent?: () => void
  onNavigateToSession?: (sessionId: string) => void
  btwTasks?: Record<string, BtwInfo>
}

let msgIdCounter = 0
const nextId = () => `msg_${++msgIdCounter}_${Date.now()}`

export function ChatTerminalView({ sessionId, visible, scenario, onPromptFill, filledPrompt, workspace, onWorkspaceChange, autoSendPrompt, onAutoSent, onNavigateToSession, btwTasks }: ChatTerminalViewProps) {
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
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<string | null>(null)
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
    if (!text.trim() && !files?.length) return
    // Mid-task messaging: don't touch the current streaming message!
    // BUGFIX: Previously we set streaming=false on the last message, which
    // caused all subsequent deltas to be silently dropped (the delta handler
    // checks last.streaming before appending). The backend will finish the
    // current stream and auto-process the queued message via processMessageQueue.
    const msgs = useChatStore.getState().getMessages(sessionId); const last = msgs[msgs.length - 1]
    const isMidTask = !!(last?.streaming && streaming)

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
    // Don't create assistant placeholder for /btw commands — they spawn
    // independent sub-agents tracked in the BTW panel. A notification
    // message is created by the btw:spawned event handler.
    const isBtw = text.trim().startsWith('/btw')
    if (!isBtw) {
      // Only create assistant placeholder if NOT mid-task (no current stream).
      // For mid-task messages, the placeholder is created when the queued task
      // actually starts (via chat:message-start event from processMessageQueue).
      if (!isMidTask) {
        const asst = { id: nextId(), role: 'assistant' as const, content: '', timestamp: Date.now(), streaming: true, streamingStatus: 'thinking' as const }
        addMessage(sessionId, asst); setStreaming(true)
      }
    }
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

  const historyDeleteEntry = (entryId: string) => {
    // Remove from history store
    deleteChatEntries([entryId])
    // If deleting the current session's history, also clear the chat
    if (entryId === sessionId) {
      clearConversation(sessionId)
      setStreaming(false)
    }
    setShowHistory(false)
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
                        className={`group px-3 py-2 text-xs border-b border-[#e5e6eb]/30 cursor-pointer transition-colors flex items-center justify-between ${h.id === sessionId ? 'bg-[#6c5ce7]/5' : 'hover:bg-[#f0f0f5]'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#1a1a2e] truncate">{h.title}</div>
                          <div className="text-[9px] text-[#9a9ab0] mt-0.5">
                            {new Date(h.updatedAt).toLocaleString()} · {h.messages.length} 条消息
                            {h.id === sessionId && <span className="ml-1 text-[#6c5ce7]">(当前)</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteEntry(h.id)
                          }}
                          className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#e17055]/10 hover:text-[#e17055] text-[#9a9ab0] transition-all ml-2"
                          title="删除此历史记录"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
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
      {/* ── BTW (Background Task Worker) Panel ── */}
      {btwTasks && Object.keys(btwTasks).length > 0 && <BtwPanel btwTasks={btwTasks} />}
      <PromptTemplates onSelect={onPromptFill} category={scenario} subCategory={subCategory} onSubCategoryChange={setSubCategory} />
      {/* Streaming status bar — shows current task & phase at bottom, Claude Code CLI style */}
      <StreamingStatusBar messages={messages} />
      <ChatInput onSend={handleSend} streaming={streaming} onCancel={() => {
        // Stop streaming immediately and signal the backend to cancel.
        // The chat:cancelled event will finalize the message content.
        const store = useChatStore.getState()
        store.setStreaming(false)
        window.electron.invoke('chat:cancel', sessionId)
      }} prepopulate={filledPrompt} onConsumed={() => onPromptFill('')} autoSendPrompt={autoSendPrompt} onAutoSent={onAutoSent} />

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

      {/* Delete single history entry confirmation */}
      <ConfirmDialog
        open={confirmDeleteEntry !== null}
        title="删除历史记录"
        message="确定要删除这条聊天历史记录吗？删除后无法恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={() => {
          if (confirmDeleteEntry) {
            historyDeleteEntry(confirmDeleteEntry)
          }
          setConfirmDeleteEntry(null)
        }}
        onCancel={() => setConfirmDeleteEntry(null)}
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

// ── Streaming Status Bar: shows current AI task & phase at bottom ──
function StreamingStatusBar({ messages }: { messages: Array<{ role: string; streaming?: boolean; streamingStatus?: string }> }) {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant' || !last.streaming) return null

  const status = last.streamingStatus
  const isThinking = !status || status === 'thinking'
  const isResponding = status === 'responding'
  const isExecuting = !isThinking && !isResponding

  return (
    <div className="flex-shrink-0 px-4 py-1 border-t border-[#e5e6eb]/50 bg-[#fafbfc] flex items-center gap-2 text-[10px]">
      {/* Spinner icon */}
      {isExecuting ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e17055" strokeWidth="2" className="animate-spin">
          <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round"/>
        </svg>
      ) : (
        <span className="inline-flex gap-0.5">
          <span className="w-1 h-1 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      )}
      {/* Status text */}
      <span className={isExecuting ? 'text-[#e17055] font-medium' : 'text-[#9a9ab0]'}>
        {isExecuting ? `执行中: ${status}` : isResponding ? '生成回复中' : 'AI 思考中'}
      </span>
      {/* Tool icon for executing state */}
      {isExecuting && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e17055" strokeWidth="2" className="opacity-60">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      )}
    </div>
  )
}

// ── BTW Panel: shows active background sub-agents ──
function BtwPanel({ btwTasks }: { btwTasks: Record<string, BtwInfo> }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const entries = Object.values(btwTasks)

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCancelBtw = async (btwId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.electron.invoke('btw:cancel', btwId)
  }

  const statusColors: Record<string, string> = {
    running: '#6c5ce7',
    completed: '#00b894',
    cancelled: '#9a9ab0',
    error: '#e17055',
    queued: '#f0a500',
  }

  const statusLabels: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    cancelled: '已取消',
    error: '出错',
    queued: '排队中',
  }

  const statusIcons: Record<string, string> = {
    running: '⟳',
    completed: '✓',
    cancelled: '✕',
    error: '⚠',
    queued: '⏳',
  }

  return (
    <div className="flex-shrink-0 border-t border-[#e5e6eb] bg-[#fafbfc]">
      <div className="px-4 py-1.5 text-[10px] text-[#9a9ab0] font-medium flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        后台子任务 ({entries.length})
        <span className="text-[#6c5ce7]">{entries.filter(e => e.status === 'running').length} 运行中</span>
      </div>
      <div className="max-h-40 overflow-y-auto custom-scrollbar">
        {entries.map(btw => (
          <div key={btw.id}>
            <div
              onClick={() => toggleExpand(btw.id)}
              className={`px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-[#f0f0f5] transition-colors border-b border-[#e5e6eb]/50 ${btw.status === 'running' ? 'bg-[#6c5ce7]/[0.02]' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span style={{ color: statusColors[btw.status] }} className="text-xs font-bold">{statusIcons[btw.status]}</span>
                <span className="text-[11px] text-[#1a1a2e] truncate">{btw.task.slice(0, 60)}{btw.task.length > 60 ? '...' : ''}</span>
                <span style={{ color: statusColors[btw.status] }} className="text-[9px] ml-1 flex-shrink-0">{statusLabels[btw.status]}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <span className="text-[9px] text-[#9a9ab0]">{new Date(btw.createdAt).toLocaleTimeString()}</span>
                {(btw.status === 'running' || btw.status === 'queued') && (
                  <button onClick={(e) => handleCancelBtw(btw.id, e)}
                    className="text-[9px] text-[#e17055] hover:underline">取消</button>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-[#9a9ab0] transition-transform ${expanded[btw.id] ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>
            {/* Expanded output preview */}
            {expanded[btw.id] && (
              <div className="px-4 py-2 bg-[#f5f6f8] border-b border-[#e5e6eb]/50 text-[10px] text-[#4a4a6a] max-h-48 overflow-y-auto custom-scrollbar">
                {btw.error && (
                  <div className="text-[#e17055] mb-1">错误: {btw.error}</div>
                )}
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{btw.output || '(尚输出)'}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
