import { useModelStore } from '../../stores/modelStore'
import { useMonitorStore } from '../../stores/monitorStore'
import { useSessionStore } from '../../stores/sessionStore'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n || 0)
}

export function StatusBar() {
  const { currentModel } = useModelStore()
  const { stats } = useMonitorStore()
  const { sessions, activeSessionId } = useSessionStore()

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const cost = stats?.total_cost_estimate || 0
  const currency = stats?.cost_currency || 'CNY'

  return (
    <div className="flex items-center h-7 px-3 bg-[#161b22] border-t border-[#30363d] text-[10px] select-none gap-3 font-medium">
      {/* 模型 */}
      <div className="flex items-center gap-1.5 text-[#8b949e]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] shadow-[0_0_4px_rgba(63,185,80,0.4)]" />
        <span className="text-[#e6edf3]">{currentModel?.display || '未选择'}</span>
      </div>

      <div className="w-px h-3 bg-[#30363d]" />

      {/* 费用 */}
      {cost > 0 && (
        <>
          <div className="text-[#8b949e]">
            费用 <span className="text-[#e6edf3] tabular-nums">{currency === 'CNY' ? '¥' : '$'}{cost.toFixed(4)}</span>
          </div>
          <div className="w-px h-3 bg-[#30363d]" />
        </>
      )}

      {/* 会话数 */}
      {sessions.length > 0 && (
        <>
          <span className="text-[#8b949e]"><span className="text-[#e6edf3]">{sessions.length}</span> 会话</span>
          <div className="w-px h-3 bg-[#30363d]" />
        </>
      )}

      <div className="flex-1" />

      {/* 工作目录 */}
      {activeSession && (
        <span className="text-[#484f58] truncate max-w-[300px]" title={activeSession.cwd}>
          {activeSession.cwd}
        </span>
      )}
    </div>
  )
}
