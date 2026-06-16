import { useMonitorStore } from '../../stores/monitorStore'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n || 0)
}

export function TrafficMonitor() {
  const { stats } = useMonitorStore()

  const totalRequests = stats?.total_requests || 0
  const inputTokens = stats?.total_input_tokens || 0
  const outputTokens = stats?.total_output_tokens || 0
  const cacheRead = stats?.total_cache_read_tokens || 0
  const cacheWrite = stats?.total_cache_write_tokens || 0
  const cost = stats?.total_cost_estimate || 0
  const currency = stats?.cost_currency || 'CNY'

  const totalPrompt = inputTokens + cacheRead
  const totalAll = totalPrompt + outputTokens
  const hitRate = totalPrompt > 0 ? (cacheRead / totalPrompt * 100) : 0
  const requests = Array.isArray(stats?.last_24h_requests) ? stats.last_24h_requests : []

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-2">
        {/* Token 用量 */}
        <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">Token 总用量</div>
          <div className="text-lg font-bold text-[#e6edf3] mt-1 tabular-nums">{fmt(totalAll)}</div>
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="text-[#3fb950]">输入 {fmt(totalPrompt)}</span>
            <span className="text-[#a371f7]">输出 {fmt(outputTokens)}</span>
          </div>
        </div>

        {/* 缓存命中 & 请求数 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0d1117] rounded-lg p-2.5 border border-[#30363d]">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">缓存命中率</div>
            <div className={`text-sm font-bold mt-0.5 tabular-nums ${
              hitRate >= 70 ? 'text-[#3fb950]' : hitRate >= 30 ? 'text-[#d2991d]' : 'text-[#f85149]'
            }`}>
              {hitRate.toFixed(1)}%
            </div>
            <div className="text-[10px] text-[#8b949e] mt-0.5">读 {fmt(cacheRead)} · 写 {fmt(cacheWrite)}</div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-2.5 border border-[#30363d]">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">预估费用</div>
            <div className="text-sm font-bold text-[#e6edf3] mt-0.5 tabular-nums">
              {currency === 'CNY' ? '¥' : '$'}{cost.toFixed(4)}
            </div>
            <div className="text-[10px] text-[#8b949e] mt-0.5">{totalRequests} 次请求</div>
          </div>
        </div>

        {/* 按模型统计 */}
        {stats?.by_model && Object.keys(stats.by_model).length > 0 && (
          <div className="bg-[#0d1117] rounded-lg p-2.5 border border-[#30363d]">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2">按模型</div>
            {Object.entries(stats.by_model).map(([model, data]) => (
              <div key={model} className="flex items-center justify-between text-[10px] py-0.5">
                <span className="text-[#8b949e] truncate flex-1 mr-2">{model}</span>
                <span className="text-[#e6edf3] tabular-nums">{fmt(data.input + data.output)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 最近请求 */}
      {requests.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-2">
            最近请求
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {requests.slice(-20).reverse().map((req, i) => {
              const hr = req.cache_hit_rate || 0
              return (
                <div key={i} className="flex items-center gap-2 text-[10px] text-[#8b949e] bg-[#0d1117] rounded px-2 py-1 border border-[#30363d]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    req.status === 200 ? 'bg-[#3fb950]' : 'bg-[#f85149]'
                  }`} />
                  <span className="flex-1 truncate">{req.model}</span>
                  <span className="tabular-nums">{fmt(req.input_tokens + req.output_tokens)}</span>
                  <span style={{color: hr >= 70 ? '#3fb950' : hr >= 30 ? '#d2991d' : '#f85149'}}>
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
        <div className="flex items-center gap-2 text-[10px] text-[#8b949e]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse-dot" />
          数据源: ~/.claude/projects/*/session.jsonl
        </div>
      </div>
    </div>
  )
}
