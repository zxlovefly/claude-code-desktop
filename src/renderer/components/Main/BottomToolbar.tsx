import { useMemo } from 'react'
import { IconTarget, IconCoin, IconMonitor } from '../Icons'
import { useMonitorStore } from '../../stores/monitorStore'

interface BottomToolbarProps {
  monitorVisible: boolean
  onToggleMonitor: () => void
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n || 0)
}

export function BottomToolbar({ monitorVisible, onToggleMonitor }: BottomToolbarProps) {
  const { stats } = useMonitorStore()

  const liveStats = useMemo(() => {
    if (!stats) return null
    const ti = stats.total_input_tokens || 0
    const to = stats.total_output_tokens || 0
    const cr = stats.total_cache_read_tokens || 0
    const totalPrompt = ti + cr
    const hitRate = totalPrompt > 0 ? (cr / totalPrompt * 100) : 0
    const totalAll = totalPrompt + to
    const cost = stats.total_cost_estimate || 0
    const currency = stats.cost_currency || 'CNY'
    return { totalAll, hitRate, cost, currency }
  }, [stats])

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-white border-t border-[#e5e6eb]">
      <div className="flex-1" />

      {/* Live traffic stats (compact) */}
      {liveStats && (
        <div className="flex items-center gap-3 px-2 text-[10px] text-[#9a9ab0] select-none">
          <span title="Token 总用量" className="flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-[#6c5ce7]" />
            {fmt(liveStats.totalAll)}
          </span>
          <span title="缓存命中率" className="flex items-center gap-1" style={{ color: liveStats.hitRate >= 70 ? '#00b894' : liveStats.hitRate >= 30 ? '#e17055' : '#d63031' }}>
            <IconTarget />{liveStats.hitRate.toFixed(0)}%
          </span>
          <span title="预估费用" className="flex items-center gap-1">
            <IconCoin />{liveStats.currency === 'CNY' ? '¥' : '$'}{liveStats.cost.toFixed(3)}
          </span>
        </div>
      )}

      {/* Traffic monitor toggle */}
      <button
        onClick={onToggleMonitor}
        title="流量监控仪表盘"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
          ${monitorVisible
            ? 'bg-[#6c5ce7]/10 text-[#6c5ce7] border border-[#6c5ce7]/20'
            : 'text-[#4a4a6a] hover:bg-[#f0f0f5] border border-transparent'
          }`}
      >
        <IconMonitor />
        <span>流量</span>
      </button>
    </div>
  )
}
