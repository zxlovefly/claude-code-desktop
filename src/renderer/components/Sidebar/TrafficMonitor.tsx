import { useEffect, useState, useRef } from 'react'
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

function fmtMs(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
  return ms + 'ms'
}

function hitColor(rate: number): string {
  if (rate >= 70) return '#00b894'
  if (rate >= 30) return '#fdcb6e'
  return '#e17055'
}

const COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#bc8cff', '#f0883e', '#39d2c0', '#e17055', '#9a9ab0']
const COLORS_BG = ['rgba(108,92,231,0.15)', 'rgba(0,184,148,0.15)', 'rgba(253,203,110,0.15)',
  'rgba(188,140,255,0.15)', 'rgba(240,136,62,0.15)', 'rgba(57,210,192,0.15)',
  'rgba(225,112,85,0.15)', 'rgba(154,154,176,0.15)']

// ── Canvas Chart Helpers ─────────────────────────────────────────────────────

function setupCanvas(canvas: HTMLCanvasElement | null, height: number): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  if (!canvas) return null
  const rect = canvas.parentElement?.getBoundingClientRect() || { width: 260 }
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(rect.width - 4, 100)
  canvas.width = w * dpr
  canvas.height = height * dpr
  canvas.style.width = w + 'px'
  canvas.style.height = height + 'px'
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, height)
  return { ctx, w, h: height }
}

function drawEmpty(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#9a9ab0'
  ctx.font = '13px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('暂无数据', w / 2, h / 2 + 5)
}

function drawGauge(canvas: HTMLCanvasElement | null, rate: number, label: string, sub: string) {
  const s = setupCanvas(canvas, 130)
  if (!s) return
  const { ctx, w, h } = s
  const cx = w / 2, cy = h / 2 + 2
  const r = Math.min(w, h) / 2 - 22

  // Background arc
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25)
  ctx.strokeStyle = '#e5e6eb'
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.stroke()

  // Progress arc
  const angle = Math.PI * 0.75 + (rate / 100) * Math.PI * 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.min(angle, Math.PI * 2.25))
  ctx.strokeStyle = hitColor(rate)
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.stroke()

  // Center text
  ctx.fillStyle = '#1a1a2e'
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(rate.toFixed(1) + '%', cx, cy - 6)
  ctx.fillStyle = '#9a9ab0'
  ctx.font = '11px sans-serif'
  ctx.fillText(label, cx, cy + 18)
  ctx.font = '10px sans-serif'
  ctx.fillText(sub, cx, h - 8)
}

function drawBarChart(canvas: HTMLCanvasElement | null, byModel: Record<string, any>) {
  const s = setupCanvas(canvas, 180)
  if (!s) return
  const { ctx, w, h } = s

  const models = Object.keys(byModel || {})
  if (!models.length) { drawEmpty(ctx, w, h); return }

  const pad = { top: 24, bottom: 36, left: 46, right: 14 }
  const cw = w - pad.left - pad.right
  const ch = h - pad.top - pad.bottom

  // Max value
  let maxTotal = 0
  const data = models.map(m => {
    const d = byModel[m]
    const stacks = [d.input || 0, d.output || 0, d.cache_read || 0, d.cache_write || 0]
    const t = stacks.reduce((s: number, v: number) => s + v, 0)
    if (t > maxTotal) maxTotal = t
    return { name: m, stacks }
  })
  if (maxTotal === 0) maxTotal = 1

  // Y axis grid
  ctx.strokeStyle = '#e5e6eb'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ch * (1 - i / 4)
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(w - pad.right, y)
    ctx.stroke()
    ctx.fillStyle = '#9a9ab0'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(fmt(Math.round(maxTotal * i / 4)), pad.left - 4, y + 3)
  }

  // Bars
  const barW = Math.min(50, cw / data.length - 8)
  const gap = (cw - barW * data.length) / (data.length + 1)
  const barColors = ['#6c5ce7', '#00b894', '#fdcb6e', '#bc8cff']
  const barLabels = ['Input', 'Output', 'CacheR', 'CacheW']

  data.forEach((d, idx) => {
    const x = pad.left + gap + idx * (barW + gap)
    let yBase = pad.top + ch
    d.stacks.forEach((val: number, si: number) => {
      const barH = (val / maxTotal) * ch
      yBase -= barH
      if (barH > 1) {
        ctx.fillStyle = barColors[si]
        ctx.fillRect(x, yBase, barW, barH)
      }
    })
    // Label
    ctx.fillStyle = '#4a4a6a'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    const shortName = d.name.length > 12 ? d.name.substring(0, 11) + '…' : d.name
    ctx.fillText(shortName, x + barW / 2, h - 12)
  })

  // Legend
  let lx = pad.left + 2
  barLabels.forEach((lb, i) => {
    ctx.fillStyle = barColors[i]
    ctx.fillRect(lx, 5, 9, 9)
    ctx.fillStyle = '#9a9ab0'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(lb, lx + 12, 13)
    lx += ctx.measureText(lb).width + 22
  })
}

function drawLineChart(canvas: HTMLCanvasElement | null, requests: any[]) {
  const s = setupCanvas(canvas, 150)
  if (!s) return
  const { ctx, w, h } = s

  const reqs = (requests || []).slice(-30)
  if (!reqs.length) { drawEmpty(ctx, w, h); return }

  const pad = { top: 16, bottom: 32, left: 36, right: 14 }
  const cw = w - pad.left - pad.right
  const ch = h - pad.top - pad.bottom

  // Y grid
  ctx.strokeStyle = '#e5e6eb'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ch * (1 - i / 4)
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(w - pad.right, y)
    ctx.stroke()
    ctx.fillStyle = '#9a9ab0'
    ctx.font = '8px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(String(i * 25) + '%', pad.left - 4, y + 3)
  }

  // Data points
  const stepX = cw / Math.max(reqs.length - 1, 1)
  const points = reqs.map((r, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + ch * (1 - (r.cache_hit_rate || 0) / 100),
    rate: r.cache_hit_rate || 0
  }))

  // Fill area
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch)
  grad.addColorStop(0, 'rgba(108,92,231,0.2)')
  grad.addColorStop(1, 'rgba(108,92,231,0.02)')
  ctx.beginPath()
  ctx.moveTo(points[0].x, pad.top + ch)
  points.forEach(p => ctx.lineTo(p.x, p.y))
  ctx.lineTo(points[points.length - 1].x, pad.top + ch)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Line
  ctx.beginPath()
  ctx.strokeStyle = '#6c5ce7'
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
  ctx.stroke()

  // Dots
  points.forEach(p => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = hitColor(p.rate)
    ctx.fill()
  })

  // X labels
  const labelIdx = reqs.length <= 8
    ? reqs.map((_, i) => i)
    : [0, Math.floor(reqs.length / 2), reqs.length - 1]
  labelIdx.forEach(i => {
    if (i < points.length) {
      const d = new Date(reqs[i].ts)
      ctx.fillStyle = '#9a9ab0'
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), points[i].x, h - 14)
    }
  })
}

function drawPieChart(canvas: HTMLCanvasElement | null, byModel: Record<string, any>) {
  const s = setupCanvas(canvas, 180)
  if (!s) return
  const { ctx, w, h } = s

  const models = Object.keys(byModel || {})
  if (!models.length) { drawEmpty(ctx, w, h); return }

  const data = models.map(m => ({
    name: m,
    tokens: (byModel[m].input || 0) + (byModel[m].output || 0)
  }))
  const total = data.reduce((s, d) => s + d.tokens, 0) || 1

  const cx = w / 2, cy = h / 2 - 6
  const r = Math.min(w, h) / 2 - 32
  let angle = -Math.PI / 2

  data.forEach((d, i) => {
    const slice = (d.tokens / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, angle + slice)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Label
    const mid = angle + slice / 2
    const pct = (d.tokens / total * 100)
    if (pct > 3) {
      const lx = cx + Math.cos(mid) * (r + 20)
      const ly = cy + Math.sin(mid) * (r + 20)
      ctx.fillStyle = '#4a4a6a'
      ctx.font = '9px sans-serif'
      ctx.textAlign = mid > Math.PI / 2 ? 'right' : 'left'
      ctx.fillText(d.name.length > 10 ? d.name.substring(0, 9) + '…' : d.name, lx, ly - 4)
      ctx.fillStyle = '#9a9ab0'
      ctx.font = '8px sans-serif'
      ctx.fillText(pct.toFixed(1) + '%', lx, ly + 8)
    }
    angle += slice
  })
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TrafficMonitor() {
  const { stats } = useMonitorStore()
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null)
  const gaugeRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)
  const lineRef = useRef<HTMLCanvasElement>(null)
  const pieRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    window.electron.invoke('model:current').then((d: unknown) => {
      if (d) setCurrentModel(d as CurrentModel)
    })
  }, [])

  // Redraw charts whenever stats update
  useEffect(() => {
    if (!stats) return
    const ti = stats.total_input_tokens || 0
    const cr = stats.total_cache_read_tokens || 0
    const totalPrompt = ti + cr
    const rate = totalPrompt > 0 ? (cr / totalPrompt) * 100 : 0

    drawGauge(gaugeRef.current, rate, '缓存命中率', '读 ' + fmt(cr) + ' / 总 ' + fmt(totalPrompt))
    drawBarChart(barRef.current, stats.by_model)
    drawLineChart(lineRef.current, stats.last_24h_requests)
    drawPieChart(pieRef.current, stats.by_model)
  }, [stats])

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

  return (
    <div className="flex flex-col bg-[#f5f6f8]">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">

        {/* Top summary cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider">总请求</div>
            <div className="text-sm font-bold text-[#6c5ce7] mt-0.5 tabular-nums">{totalRequests}</div>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider">
              费用 <span className="font-normal">({currency === 'CNY' ? '¥' : '$'})</span>
            </div>
            <div className="text-sm font-bold text-[#1a1a2e] mt-0.5 tabular-nums">{cost.toFixed(4)}</div>
          </div>
        </div>

        {/* Token total */}
        <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider">Token 总用量</div>
          <div className="text-base font-bold text-[#1a1a2e] mt-0.5 tabular-nums">{fmt(totalAll)}</div>
          <div className="flex gap-2 mt-1 text-[10px]">
            <span className="text-[#6c5ce7] font-medium">输入 {fmt(totalPrompt)}</span>
            <span className="text-[#00b894] font-medium">输出 {fmt(outputTokens)}</span>
            <span className="text-[#fdcb6e]" title="缓存写入">写 {fmt(cacheWrite)}</span>
          </div>
        </div>

        {/* Cache hit gauge */}
        <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider mb-1">🎯 缓存命中率</div>
          <canvas ref={gaugeRef} />
        </div>

        {/* Token flow bar chart */}
        <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider mb-1">📊 Token 流向 (按模型)</div>
          <canvas ref={barRef} />
        </div>

        {/* Cache hit trend line chart */}
        <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider mb-1">📈 缓存命中率趋势</div>
          <canvas ref={lineRef} />
        </div>

        {/* Model token share pie */}
        <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
          <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider mb-1">🔵 模型 Token 占比</div>
          <canvas ref={pieRef} />
        </div>

        {/* By model detail */}
        {stats?.by_model && Object.keys(stats.by_model).length > 0 && (
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider mb-2">按模型明细</div>
            {Object.entries(stats.by_model).map(([model, data], i) => (
              <div key={model} className="flex items-center gap-2 text-[10px] py-1 border-b border-[#e5e6eb]/50 last:border-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="flex-1 truncate text-[#4a4a6a]">{model}</span>
                <span className="tabular-nums text-[#1a1a2e] font-medium">{fmt(data.input + data.output)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent requests */}
        {requests.length > 0 && (
          <div className="bg-white rounded-lg p-2.5 border border-[#e5e6eb] shadow-sm">
            <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wider mb-2">最近请求 ({requests.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {requests.slice(-20).reverse().map((req, i) => {
                const hr = req.cache_hit_rate || 0
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px] bg-[#f5f6f8] rounded px-2 py-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hr >= 70 ? 'bg-[#00b894]' : hr >= 30 ? 'bg-[#fdcb6e]' : 'bg-[#e17055]'}`} />
                    <span className="flex-1 truncate text-[#4a4a6a]">{req.model}</span>
                    <span className="tabular-nums text-[#1a1a2e] font-medium">{fmt(req.input_tokens + req.output_tokens)}</span>
                    <span className="tabular-nums" style={{ color: hr >= 70 ? '#00b894' : hr >= 30 ? '#fdcb6e' : '#e17055' }}>
                      {hr.toFixed(0)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Data source */}
        <div className="flex items-center gap-2 text-[10px] text-[#9a9ab0] pb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] animate-pulse-dot" />
          数据源: ~/.claude/projects/*/session.jsonl · 每 2s 刷新
        </div>
      </div>
    </div>
  )
}
