import { useState } from 'react'
import { useChatStore } from '../../stores/chatStore'

interface Props {
  onResume: (convId: string) => void
}

export function HistoryPage({ onResume }: Props) {
  const conversations = useChatStore(s => s.getAllConversations())
  const [search, setSearch] = useState('')

  const filtered = conversations.filter(c =>
    c.messages.length > 0 && (!search || c.title.includes(search))
  )

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <h2 className="text-sm font-bold text-[#1a1a2e]">历史记录</h2>
        <p className="text-[10px] text-[#9a9ab0] mt-0.5">查看历史对话 · 点击 Resume 继续对话</p>
      </div>
      <div className="p-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索历史记录..." className="w-full bg-white border border-[#e5e6eb] rounded-xl px-4 py-2 text-xs text-[#1a1a2e] outline-none focus:border-[#6c5ce7]" />
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[#9a9ab0] text-sm">{search ? '没有匹配记录' : '暂无历史记录'}</div>
        ) : filtered.map(c => {
          const firstUser = c.messages.find(m => m.role === 'user')
          const lastMsg = c.messages[c.messages.length - 1]
          const date = new Date(c.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          return (
            <button key={c.id} onClick={() => onResume(c.id)} className="w-full text-left bg-white border border-[#e5e6eb] rounded-xl p-3 hover:border-[#6c5ce7]/30 hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1a1a2e] truncate">{c.title}</div>
                  <div className="text-[10px] text-[#9a9ab0] mt-0.5 truncate">{lastMsg?.content?.slice(0, 80) || '(空)'}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-[#c0c0d0]">{date}</span>
                    <span className="text-[9px] text-[#9a9ab0]">{c.messages.length} 条消息</span>
                  </div>
                </div>
                <span className="flex-shrink-0 ml-3 px-3 py-1.5 bg-[#6c5ce7]/5 text-[#6c5ce7] rounded-lg text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">Resume</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
