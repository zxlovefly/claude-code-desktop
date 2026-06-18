import { useState } from 'react'

interface UserMessageProps {
  content: string
  onCopy?: () => void
  onToggleSelect?: () => void
  isSelected?: boolean
  showSelect?: boolean
  onDelete?: () => void
}

export function UserMessage({ content, onCopy, onToggleSelect, isSelected = false, showSelect = false, onDelete }: UserMessageProps) {
  const [showActions, setShowActions] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    onCopy?.()
  }

  return (
    <div className="flex justify-end mb-4 px-4 group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start gap-1">
        {/* Message bubble */}
        <div className={`w-fit max-w-[75%] bg-[#6c5ce7] text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm ${isSelected ? 'ring-2 ring-[#6c5ce7] ring-offset-1' : ''}`}>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {content}
          </p>
        </div>

        {/* Action buttons — right side of user message */}
        <div className={`flex flex-col items-center gap-0.5 pt-1 transition-all duration-150 ${showActions || showSelect ? 'opacity-100' : 'opacity-0'}`}>
          {showSelect && (
            <button onClick={onToggleSelect}
              className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${isSelected ? 'bg-[#6c5ce7] text-white' : 'bg-white border border-[#e5e6eb] text-transparent hover:border-[#6c5ce7]'}`}
              title={isSelected ? '取消选择' : '选择'}
            >
              {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
          )}
          <button onClick={handleCopy}
            className="w-5 h-5 rounded-md bg-white border border-[#e5e6eb] flex items-center justify-center hover:border-[#6c5ce7] hover:text-[#6c5ce7] transition-colors"
            title={copied ? '已复制' : '复制消息'}
          >
            {copied ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            )}
          </button>
          {onDelete && (
            <button onClick={onDelete}
              className="w-5 h-5 rounded-md bg-white border border-[#e5e6eb] flex items-center justify-center hover:border-[#e17055] hover:text-[#e17055] transition-colors"
              title="删除消息"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
