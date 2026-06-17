import { useEffect, useRef } from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import type { ChatMessage } from './types'

interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const streamingMsg = messages.find((m) => m.streaming)
    if (streamingMsg) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages.map((m) => m.content).join('')])

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
    <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <UserMessage key={msg.id} content={msg.content} />
        ) : (
          <AssistantMessage key={msg.id} message={msg} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  )
}
