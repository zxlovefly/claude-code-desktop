import { useEffect, useRef, useState, useCallback } from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import type { ChatMessage } from './types'
import { ConfirmDialog } from '../ConfirmDialog'

interface MessageListProps {
  messages: ChatMessage[]
  onDeleteMessages?: (ids: string[]) => void
}

export function MessageList({ messages, onDeleteMessages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; single: boolean } | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const streamingMsg = messages.find((m) => m.streaming)
    if (streamingMsg) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages.map((m) => m.content).join('')])

  // Clear selection when messages change (new conversation)
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }, [messages.length === 0])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    setConfirmDelete({ ids: Array.from(selectedIds), single: false })
  }

  const handleDeleteSingle = (id: string) => {
    setConfirmDelete({ ids: [id], single: true })
  }

  const executeDelete = () => {
    if (!confirmDelete) return
    onDeleteMessages?.(confirmDelete.ids)
    setSelectedIds(new Set())
    setSelectMode(false)
    setConfirmDelete(null)
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center select-none">
        <div className="text-center">
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none" className="mx-auto mb-4 opacity-40">
            <circle cx="24" cy="18" r="12" fill="white" stroke="#6c5ce7" strokeWidth="2"/>
            <circle cx="19" cy="17" r="2.5" fill="#1a1a2e"/><circle cx="29" cy="17" r="2.5" fill="#1a1a2e"/>
            <ellipse cx="24" cy="21" rx="1.8" ry="1.2" fill="#e17055"/>
            <path d="M21 23.5c1 1.5 3 1.5 4 0" stroke="#1a1a2e" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M20 11l-3 3 3 3M28 11l3 3-3 3" stroke="#6c5ce7" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          </svg>
          <div className="text-sm text-[#9a9ab0] mb-1">新建任务</div>
          <div className="text-xs text-[#c0c0d0]">输入开发需求开始对话，或点击快捷指令模板</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Selection toolbar */}
      <div className="flex items-center justify-between px-4 py-1 bg-white/80 border-b border-[#e5e6eb]">
        <button
          onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
          className={`text-[10px] font-medium transition-colors ${selectMode ? 'text-[#6c5ce7]' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}
        >
          {selectMode ? '退出选择' : '选择消息'}
        </button>
        {selectMode && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#9a9ab0]">已选 {selectedIds.size} 条</span>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${selectedIds.size > 0 ? 'text-[#e17055] hover:bg-[#e17055]/10' : 'text-[#c0c0d0] cursor-not-allowed'}`}
            >
              删除选中
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserMessage
              key={msg.id}
              content={msg.content}
              showSelect={selectMode}
              isSelected={selectedIds.has(msg.id)}
              onToggleSelect={() => toggleSelect(msg.id)}
              onDelete={() => handleDeleteSingle(msg.id)}
            />
          ) : (
            <AssistantMessage
              key={msg.id}
              message={msg}
              showSelect={selectMode}
              isSelected={selectedIds.has(msg.id)}
              onToggleSelect={() => toggleSelect(msg.id)}
              onDelete={() => handleDeleteSingle(msg.id)}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="确认删除"
        message={confirmDelete?.single
          ? '确定要删除这条消息吗？此操作不可撤销。'
          : `确定要删除选中的 ${confirmDelete?.ids.length} 条消息吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
