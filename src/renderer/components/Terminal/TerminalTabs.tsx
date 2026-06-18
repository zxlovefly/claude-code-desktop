import { useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'

export function TerminalTabs() {
  const { sessions, activeSessionId, setActiveSession, removeSession, createSession } =
    useSessionStore()
  const [showDirInput, setShowDirInput] = useState(false)
  const [customDir, setCustomDir] = useState('')

  const handleNewSession = async (dir?: string) => {
    const cwd = dir || ''
    const session: any = await window.electron.invoke('terminal:create', cwd)
    if (session) createSession(session as Parameters<typeof createSession>[0])
    setShowDirInput(false)
    setCustomDir('')
  }

  if (sessions.length === 0 && !activeSessionId) return null

  return (
    <>
      {/* 标签页 */}
      <div className="flex-1 flex items-center overflow-x-auto custom-scrollbar gap-0.5">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          return (
            <div
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`
                group flex items-center gap-2 px-3 py-1.5 rounded-t-md cursor-pointer
                text-xs font-medium transition-all duration-150 whitespace-nowrap min-w-0 max-w-[220px]
                ${isActive
                  ? 'bg-[#0d1117] text-[#e6edf3] border-t border-l border-r border-[#30363d] shadow-sm'
                  : 'bg-transparent text-[#8b949e] hover:bg-[#1c2128] hover:text-[#c9d1d9] border border-transparent'
                }
              `}
              title={session.cwd}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-[#3fb950] shadow-[0_0_4px_rgba(63,185,80,0.4)]' : 'bg-[#484f58]'}`} />
              <span className="truncate flex-1">{session.name}</span>
              {sessions.length > 1 && (
                <span
                  className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#30363d] transition-all text-[10px] leading-none"
                  onClick={(e) => { e.stopPropagation(); removeSession(session.id) }}
                >
                  ×
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* 新建 + 目录选择 */}
      <div className="flex items-center gap-1 ml-1">
        {showDirInput ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              placeholder="输入目录路径..."
              value={customDir}
              onChange={(e) => setCustomDir(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNewSession(customDir)
                if (e.key === 'Escape') setShowDirInput(false)
              }}
              className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-0.5 text-[10px] text-[#e6edf3] outline-none focus:border-[#58a6ff] w-40"
            />
            <button
              onClick={() => handleNewSession(customDir)}
              className="text-[10px] px-2 py-0.5 bg-[#1c2a3e] text-[#58a6ff] rounded hover:bg-[#243656]"
            >
              确定
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDirInput(true)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md
                       text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d] transition-colors"
            title="新建会话（可指定目录）"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
