import { useEffect, useState } from 'react'
import { useMonitorStore } from '../../stores/monitorStore'

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

// Provider pricing reference (CNY/1M tokens)
const PRICING_INFO: Record<string, { input: number; output: number; label: string }> = {
  deepseek: { input: 2.0, output: 8.0, label: 'DeepSeek' },
  glm: { input: 5.0, output: 20.0, label: '智谱 GLM' },
  qwen: { input: 3.5, output: 14.0, label: '通义千问' },
  moonshot: { input: 12.0, output: 12.0, label: '月之暗面' },
  minimax: { input: 5.0, output: 15.0, label: 'MiniMax' },
  claude: { input: 21.6, output: 108.0, label: 'Claude (换算)' },
}

function detectProvider(modelId: string): string {
  const lower = modelId.toLowerCase()
  for (const key of Object.keys(PRICING_INFO)) {
    if (lower.includes(key)) return key
  }
  return 'deepseek'
}

export function TrafficMonitor() {
  const { stats } = useMonitorStore()
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null)

  useEffect(() => {
    window.electron.invoke('model:current').then((d: unknown) => {
      if (d) setCurrentModel(d as CurrentModel)
    })
  }, [])

  const totalRequests = stats?.total_requests || 0
  const inputTokens = stats?.total_input_tokens || 0
  const outputTokens = stats?.total_output_tokens || 0
  const cacheRead = stats?.total_cache_read_tokens || 0
  const cacheWrite = stats?.total_cache_write_tokens || 0
  const cost = stats?.total_cost_estimate || 0
  const currency = stats?.cost_currency || 'CNY'

  const totalPrompt = inputTokens + cacheRead
  const totalAll = totalPrompt + outputTokens
  const hitRate = totalPrompt > 0 ? (cacheRead / totalPrompt) * 100 : 0
  const requests = Array.isArray(stats?.last_24h_requests) ? stats.last_24h_requests : []

  // Detect current provider and pricing
  const modelId = currentModel?.modelId || ''
  const provider = detectProvider(modelId)
  const pricing = PRICING_INFO[provider] || PRICING_INFO.deepseek

  return (
    <div className="flex flex-col bg-[#f5f6f8]">
      <div className="p-3 space-y-2">
        {/* HUD: Context 使用率 */}
        <div className="bg-white rounded-lg p-3 border border-[#e5e6eb] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#9a9ab0] uppercase tracking-wider font-medium">上下文使用率</span>
            <span className="text-[10px] text-[#4a4a6a] tabular-nums font-semibold">
              {fmt(totalPrompt)} / {modelId.includes('deepseek') ? '1M' : '200K'}
            </span>
          </div>
          <div className="h-2.5 bg-[#f0f0f5] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#6c5ce7] via-[#fdcb6e] to-[#e17055]"
              style={{ width: `${Math.min(100, (totalPrompt / (modelId.includes('deepseek') ? 1_000_000 : 200_000)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Token 用量 */}
        <div className="bg-white rounded-lg p-3 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider font-medium">Token 总用量</div>
          <div className="text-lg font-bold text-[#1a1a2e] mt-1 tabular-nums">{fmt(totalAll)}</div>
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="text-[#6c5ce7] font-medium">输入 {fmt(totalPrompt)}</span>
            <span className="text-[#00b894] font-medium">输出 {fmt(outputTokens)}</span>
          </div>
        </div>

        {/* 缓存命中 & 费用 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider">缓存命中率</div>
            <div className={`text-sm font-bold mt-0.5 tabular-nums ${
              hitRate >= 70 ? 'text-[#00b894]' : hitRate >= 30 ? 'text-[#fdcb6e]' : 'text-[#e17055]'
            }`}>
              {hitRate.toFixed(1)}%
            </div>
            <div className="text-[10px] text-[#9a9ab0] mt-0.5">读 {fmt(cacheRead)} · 写 {fmt(cacheWrite)}</div>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider">预估费用</div>
            <div className="text-sm font-bold text-[#1a1a2e] mt-0.5 tabular-nums">
              {currency === 'CNY' ? '¥' : '$'}{cost.toFixed(4)}
            </div>
            <div className="text-[10px] text-[#9a9ab0] mt-0.5">{totalRequests} 次请求</div>
          </div>
        </div>

        {/* 当前套餐定价 */}
        <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider font-medium mb-2">
            📦 {pricing.label} 套餐参考
          </div>
          <div className="flex items-center justify-between text-[10px] py-0.5">
            <span className="text-[#9a9ab0]">输入</span>
            <span className="text-[#1a1a2e] tabular-nums font-medium">¥{pricing.input}/M tokens</span>
          </div>
          <div className="flex items-center justify-between text-[10px] py-0.5">
            <span className="text-[#9a9ab0]">输出</span>
            <span className="text-[#1a1a2e] tabular-nums font-medium">¥{pricing.output}/M tokens</span>
          </div>
        </div>

        {/* 按模型统计 */}
        {stats?.by_model && Object.keys(stats.by_model).length > 0 && (
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider font-medium mb-2">按模型用量</div>
            {Object.entries(stats.by_model).map(([model, data]) => (
              <div key={model} className="flex items-center justify-between text-[10px] py-0.5">
                <span className="text-[#4a4a6a] truncate flex-1 mr-2">{model}</span>
                <span className="text-[#1a1a2e] tabular-nums font-medium">{fmt(data.input + data.output)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 最近请求 */}
      {requests.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider font-medium mb-2">
            最近请求 ({requests.length})
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {requests.slice(-20).reverse().map((req, i) => {
              const hr = req.cache_hit_rate || 0
              return (
                <div key={i} className="flex items-center gap-2 text-[10px] bg-white rounded px-2 py-1 border border-[#e5e6eb]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    hr >= 70 ? 'bg-[#00b894]' : hr >= 30 ? 'bg-[#fdcb6e]' : 'bg-[#e17055]'
                  }`} />
                  <span className="flex-1 truncate text-[#4a4a6a]">{req.model}</span>
                  <span className="tabular-nums text-[#1a1a2e] font-medium">{fmt(req.input_tokens + req.output_tokens)}</span>
                  <span className="tabular-nums" style={{color: hr >= 70 ? '#00b894' : hr >= 30 ? '#fdcb6e' : '#e17055'}}>
                    {hr.toFixed(0)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 数据源 */}
      <div className="px-3 pb-3 mt-auto">
        <div className="flex items-center gap-2 text-[10px] text-[#9a9ab0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] animate-pulse-dot" />
          数据源: ~/.claude/projects/*/session.jsonl
        </div>
      </div>
    </div>
  )
}
