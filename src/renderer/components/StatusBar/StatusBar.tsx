import { useEffect, useState } from 'react'
import { useMonitorStore } from '../../stores/monitorStore'
import { useSessionStore } from '../../stores/sessionStore'

interface CurrentModel {
  provider: string
  modelId: string
  display: string
  baseUrl: string
  configured: boolean
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n || 0)
}

// Context window sizes per model (in tokens)
const CONTEXT_SIZES: Record<string, number> = {
  'deepseek-v4-pro': 1_000_000,
  'deepseek-v4-flash': 1_000_000,
  'deepseek-chat': 128_000,
  'deepseek': 1_000_000,
  'glm': 128_000,
  'qwen': 131_072,
  'claude-sonnet': 200_000,
  'claude-opus': 200_000,
  'claude-haiku': 200_000,
  default: 200_000,
}

function getContextSize(modelId: string): number {
  const lower = modelId.toLowerCase()
  for (const [key, size] of Object.entries(CONTEXT_SIZES)) {
    if (lower.includes(key)) return size
  }
  return CONTEXT_SIZES.default
}

export function StatusBar() {
  const { stats } = useMonitorStore()
  const { sessions, activeSessionId } = useSessionStore()
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null)

  useEffect(() => {
    window.electron.invoke('model:current').then((d: unknown) => {
      if (d) setCurrentModel(d as CurrentModel)
    })
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const cost = stats?.total_cost_estimate || 0
  const currency = stats?.cost_currency || 'CNY'
  const totalTokens = (stats?.total_input_tokens || 0) + (stats?.total_output_tokens || 0)

  // Context usage
  const modelId = currentModel?.modelId || ''
  const contextSize = getContextSize(modelId)
  const contextUsed = stats?.total_input_tokens || 0
  const contextPct = contextSize > 0 ? Math.min(100, (contextUsed / contextSize) * 100) : 0

  return (
    <div className="flex items-center h-8 px-4 bg-white border-t border-[#e5e6eb] text-[11px] select-none gap-3 font-medium">
      {/* Context 使用率 bar (HUD 风格) */}
      <div className="flex items-center gap-2 min-w-[160px]">
        <span className="text-[#9a9ab0] text-[10px] whitespace-nowrap">
          {fmt(contextUsed)}/{fmt(contextSize)}
        </span>
        <div className="flex-1 h-2 bg-[#f0f0f5] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              contextPct > 80 ? 'bg-[#e17055]' : contextPct > 50 ? 'bg-[#fdcb6e]' : 'bg-[#6c5ce7]'
            }`}
            style={{ width: `${Math.max(contextPct, 2)}%` }}
          />
        </div>
        <span className={`text-[10px] tabular-nums font-semibold whitespace-nowrap ${
          contextPct > 80 ? 'text-[#e17055]' : contextPct > 50 ? 'text-[#fdcb6e]' : 'text-[#6c5ce7]'
        }`}>
          {contextPct.toFixed(0)}%
        </span>
      </div>

      <div className="w-px h-4 bg-[#e5e6eb]" />

      {/* 模型 */}
      <div className="flex items-center gap-1.5 text-[#4a4a6a]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7]" />
        <span className="text-[#1a1a2e] font-medium">{currentModel?.display || '未选择'}</span>
      </div>

      <div className="w-px h-4 bg-[#e5e6eb]" />

      {/* Token 用量 */}
      {totalTokens > 0 && (
        <>
          <span className="text-[#9a9ab0]">
            Token <span className="text-[#1a1a2e] tabular-nums font-medium">{fmt(totalTokens)}</span>
          </span>
          <div className="w-px h-4 bg-[#e5e6eb]" />
        </>
      )}

      {/* 费用 */}
      {cost > 0 && (
        <>
          <span className="text-[#9a9ab0]">
            费用 <span className="text-[#1a1a2e] tabular-nums font-medium">
              {currency === 'CNY' ? '¥' : '$'}{cost.toFixed(4)}
            </span>
          </span>
          <div className="w-px h-4 bg-[#e5e6eb]" />
        </>
      )}

      <div className="flex-1" />

      {/* 会话数 */}
      {sessions.length > 0 && (
        <>
          <span className="text-[#9a9ab0]">
            <span className="text-[#1a1a2e] font-medium">{sessions.length}</span> 会话
          </span>
          <div className="w-px h-4 bg-[#e5e6eb]" />
        </>
      )}

      {/* 工作目录 */}
      {activeSession && (
        <span className="text-[#9a9ab0] truncate max-w-[250px] text-[10px]" title={activeSession.cwd}>
          📂 {activeSession.cwd}
        </span>
      )}
    </div>
  )
}
