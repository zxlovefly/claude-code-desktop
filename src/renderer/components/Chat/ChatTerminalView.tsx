import { useEffect, useCallback, useState } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PromptTemplates } from '../Main/PromptTemplates'
import { useChatStore } from '../../stores/chatStore'

interface ChatTerminalViewProps {
  sessionId: string; visible: boolean; scenario: string
  onPromptFill: (prompt: string) => void; filledPrompt: string
  workspace: string; onWorkspaceChange: (w: string) => void
  /** Automation auto-send prompt */
  autoSendPrompt?: string
  onAutoSent?: () => void
}

let msgIdCounter = 0
const nextId = () => `msg_${++msgIdCounter}_${Date.now()}`

export function ChatTerminalView({ sessionId, visible, scenario, onPromptFill, filledPrompt, workspace, onWorkspaceChange, autoSendPrompt, onAutoSent }: ChatTerminalViewProps) {
  const messages = useChatStore(s => s.getMessages(sessionId))
  const addMessage = useChatStore(s => s.addMessage)
  const updateLastMessage = useChatStore(s => s.updateLastMessage)
  const streaming = useChatStore(s => s.streaming)
  const setStreaming = useChatStore(s => s.setStreaming)
  const clearConversation = useChatStore(s => s.clearConversation)
  const initConversation = useChatStore(s => s.initConversation)
  const [subCategory, setSubCategory] = useState('daily-dev')

  // Init conversation on mount
  useEffect(() => {
    if (visible) {
      initConversation(sessionId)
    }
  }, [sessionId, visible])

  const handleSend = useCallback((text: string, files?: Array<{ fileName: string; content: string; isImage: boolean; base64?: string; isDocument?: boolean; fileType?: string }>) => {
    if ((!text.trim() && !files?.length) || streaming) return
    const msgs = useChatStore.getState().getMessages(sessionId); const last = msgs[msgs.length - 1]
    if (last?.streaming) updateLastMessage(sessionId, last.content, false)

    let fullText = text
    const images: string[] = []
    if (files?.length) {
      const fileCtx = files.map(f => {
        if (f.isImage) {
          images.push(f.content) // content is base64 data URL
          return `[上传图片: ${f.fileName}]`
        }
        if (f.isDocument) {
          // Document files: include extracted text content
          return `[上传文档: ${f.fileName} (${(f.fileType || '').toUpperCase()})]\n内容:\n\`\`\`\n${f.content.slice(0, 30000)}\n\`\`\`${f.content.length > 30000 ? '\n(已截断至30000字符)' : ''}`
        }
        return `[上传文件: ${f.fileName}]\n内容:\n\`\`\`\n${f.content.slice(0, 30000)}\n\`\`\`${f.content.length > 30000 ? '\n(已截断至30000字符)' : ''}`
      })
      fullText = fullText ? fullText + '\n\n' + fileCtx.join('\n\n') : fileCtx.join('\n\n')
    }
    // Add workspace context
    if (workspace) fullText = `[工作目录: ${workspace}]\n${fullText}`

    addMessage(sessionId, { id: nextId(), role: 'user', content: text || `[上传了 ${files?.length} 个文件]`, timestamp: Date.now() })
    const asst = { id: nextId(), role: 'assistant' as const, content: '', timestamp: Date.now(), streaming: true }
    addMessage(sessionId, asst); setStreaming(true)
    window.electron.invoke('chat:send-message', sessionId, fullText, images.length > 0 ? images : undefined)
  }, [sessionId, streaming, workspace])

  if (!visible) return null

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="flex items-center justify-between px-4 py-0.5 bg-[#f5f6f8]">
        <WorkspaceBadge workspace={workspace} onChange={onWorkspaceChange} />
        {messages.length > 0 && <button onClick={() => { clearConversation(sessionId); setStreaming(false) }} className="text-[10px] text-[#9a9ab0] hover:text-[#e17055]">清除对话</button>}
      </div>
      <MessageList messages={messages} />
      <PromptTemplates onSelect={onPromptFill} category={scenario} subCategory={subCategory} onSubCategoryChange={setSubCategory} />
      <ChatInput onSend={handleSend} streaming={streaming} onCancel={() => window.electron.invoke('chat:cancel', sessionId)} prepopulate={filledPrompt} onConsumed={() => onPromptFill('')} autoSendPrompt={autoSendPrompt} onAutoSent={onAutoSent} />
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
      {/* Folder icon = directory picker */}
      <button onClick={pickFolder} className="text-[#9a9ab0] hover:text-[#6c5ce7] transition-colors p-0.5" title="选择工作目录">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-1.5-2H5a2 2 0 00-2 2z"/></svg>
      </button>
      {/* Text = manual input */}
      <button onClick={() => { setVal(workspace); setEditing(true) }}
        className="text-[10px] text-[#9a9ab0] hover:text-[#6c5ce7] transition-colors"
        title="点击手动输入工作目录路径">
        {workspace ? workspace.split(/[/\\]/).pop() : '选择工作空间'}
      </button>
    </div>
  )
}
