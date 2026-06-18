import { EventEmitter } from 'events'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface RequestEntry {
  ts: number
  model: string
  input_tokens: number
  output_tokens: number
  cache_read: number
  cache_write: number
  cache_hit_rate: number
  total_input: number
  elapsed_ms: number
  status: number
}

export interface MonitorStats {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  total_cost_estimate: number
  cost_currency: string
  by_model: Record<string, { requests: number; input: number; output: number; cache_read: number; cache_write: number; cost: number }>
  last_24h_requests: RequestEntry[]
  balance?: BalanceInfo
}

interface BalanceInfo {
  available: number
  currency: string
  checkedAt: number
  lowBalance: boolean
}

export class ProxyService extends EventEmitter {
  private static instance: ProxyService
  private latestStats: MonitorStats | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private projectsDir: string

  static getInstance(): ProxyService {
    if (!ProxyService.instance) ProxyService.instance = new ProxyService()
    return ProxyService.instance
  }

  private constructor() {
    super()
    this.projectsDir = join(homedir(), '.claude', 'projects')
  }

  start(): void {
    console.log('[Monitor] Starting JSONL-based traffic monitor')
    this.poll()
    this.checkBalance() // initial balance check
    this.timer = setInterval(() => this.poll(), 2000)
    // Check balance every 5 minutes
    setInterval(() => this.checkBalance(), 300_000)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  getLatestStats(): MonitorStats | null {
    return this.latestStats
  }

  getStatus() {
    return { running: this.timer !== null, port: 0 }
  }

  // ── Core: parse JSONL session files (same approach as claude_monitor_dashboard.py) ──

  private poll(): void {
    try {
      const stats = this.aggregateStats()
      this.latestStats = stats
      this.emit('stats', stats)
    } catch (e) {
      // silently retry
    }
  }

  private findSessionFiles(): string[] {
    const files: { path: string; mtime: number }[] = []
    if (!existsSync(this.projectsDir)) return []

    try {
      for (const dir of readdirSync(this.projectsDir)) {
        const projDir = join(this.projectsDir, dir)
        if (!statSync(projDir).isDirectory()) continue
        try {
          for (const f of readdirSync(projDir)) {
            if (f.endsWith('.jsonl')) {
              const fp = join(projDir, f)
              files.push({ path: fp, mtime: statSync(fp).mtimeMs })
            }
          }
        } catch { /* skip bad directories */ }
      }
    } catch { /* skip */ }

    files.sort((a, b) => b.mtime - a.mtime)
    return files.slice(0, 10).map(f => f.path)
  }

  private parseSessionJsonl(path: string): RequestEntry[] {
    const results: RequestEntry[] = []
    try {
      const content = readFileSync(path, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const obj = JSON.parse(trimmed)
          const msg = obj.message || {}
          const usage = msg.usage
          if (!usage || typeof usage !== 'object') continue

          const input_tokens = Number(usage.input_tokens) || 0
          const output_tokens = Number(usage.output_tokens) || 0
          const cache_read = Number(usage.cache_read_input_tokens) || 0
          const cache_write = Number(usage.cache_creation_input_tokens) || 0
          const model = msg.model || 'unknown'

          if (input_tokens === 0 && output_tokens === 0 && cache_read === 0) continue

          const total_input = input_tokens + cache_read + cache_write
          const cache_hit_rate = total_input > 0 ? cache_read / total_input * 100 : 0

          let ts = Date.now()
          if (obj.timestamp) {
            try {
              ts = new Date(obj.timestamp.replace('Z', '+00:00')).getTime()
            } catch { /* use now */ }
          }

          results.push({
            ts,
            model,
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            cache_hit_rate,
            total_input,
            elapsed_ms: 0,
            status: 200,
          })
        } catch { /* skip bad lines */ }
      }
    } catch { /* skip bad files */ }
    return results
  }

  private aggregateStats(): MonitorStats {
    const stats: MonitorStats = {
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_write_tokens: 0,
      total_cost_estimate: 0,
      cost_currency: 'CNY',
      by_model: {},
      last_24h_requests: [],
    }

    const cutoff = Date.now() - 24 * 3600 * 1000
    const files = this.findSessionFiles()

    for (const path of files) {
      const records = this.parseSessionJsonl(path)
      for (const r of records) {
        if (r.ts < cutoff) continue

        stats.total_requests++
        stats.total_input_tokens += r.input_tokens
        stats.total_output_tokens += r.output_tokens
        stats.total_cache_read_tokens += r.cache_read
        stats.total_cache_write_tokens += r.cache_write

        const m = r.model
        if (!stats.by_model[m]) {
          stats.by_model[m] = { requests: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 0 }
        }
        stats.by_model[m].requests++
        stats.by_model[m].input += r.input_tokens
        stats.by_model[m].output += r.output_tokens
        stats.by_model[m].cache_read += r.cache_read
        stats.by_model[m].cache_write += r.cache_write

        stats.last_24h_requests.push(r)
      }
    }

    // ── Multi-provider pricing (CNY per 1M tokens) ──
    // input_tokens = cache-miss (uncached) input tokens
    // cache_read_input_tokens = cache-hit tokens (read from cache)
    // cache_creation_input_tokens = tokens written to cache (priced same as cache-miss input)
    const pricing: Record<string, { input: number; cache_hit: number; cache_write: number; output: number; currency: string }> = {
      // DeepSeek V4 Flash: ¥1/M input (cache miss), ¥0.02/M cache hit, ¥2/M output
      'deepseek-v4-flash': { input: 1.0, cache_hit: 0.02, cache_write: 1.0, output: 2.0, currency: 'CNY' },
      // DeepSeek V4 Pro: ¥3/M input (cache miss), ¥0.025/M cache hit, ¥6/M output
      'deepseek-v4-pro':   { input: 3.0, cache_hit: 0.025, cache_write: 3.0, output: 6.0, currency: 'CNY' },
      // DeepSeek generic / V3 fallback
      deepseek: { input: 1.0, cache_hit: 0.02, cache_write: 1.0, output: 2.0, currency: 'CNY' },
      // GLM (智谱): https://open.bigmodel.cn/pricing
      glm: { input: 5.0, cache_hit: 1.0, cache_write: 5.0, output: 20.0, currency: 'CNY' },
      // Qwen (通义千问): https://help.aliyun.com/document_detail/2586397.html
      qwen: { input: 3.5, cache_hit: 0.7, cache_write: 3.5, output: 14.0, currency: 'CNY' },
      // Moonshot (月之暗面): https://platform.moonshot.cn/docs/pricing
      moonshot: { input: 12.0, cache_hit: 3.0, cache_write: 12.0, output: 12.0, currency: 'CNY' },
      // MiniMax: https://platform.minimaxi.com/document/Price
      minimax: { input: 5.0, cache_hit: 1.0, cache_write: 5.0, output: 15.0, currency: 'CNY' },
      // Anthropic (Claude): https://www.anthropic.com/pricing
      claude: { input: 3.0 * 7.2, cache_hit: 0.375 * 7.2, cache_write: 3.75 * 7.2, output: 15.0 * 7.2, currency: 'CNY' },
    }

    // Match provider from model name (check most specific first)
    const modelLower = stats.last_24h_requests.slice(-1)[0]?.model?.toLowerCase() || ''
    let matchedPricing = pricing.deepseek // default fallback
    // Try exact model match first (e.g. deepseek-v4-pro)
    if (pricing[modelLower]) {
      matchedPricing = pricing[modelLower]
    } else {
      // Try prefix match
      for (const [key, p] of Object.entries(pricing)) {
        if (modelLower.startsWith(key)) { matchedPricing = p; break }
      }
    }

    stats.total_cost_estimate =
      stats.total_input_tokens / 1_000_000 * matchedPricing.input +
      stats.total_cache_read_tokens / 1_000_000 * matchedPricing.cache_hit +
      stats.total_cache_write_tokens / 1_000_000 * matchedPricing.cache_write +
      stats.total_output_tokens / 1_000_000 * matchedPricing.output
    stats.cost_currency = matchedPricing.currency

    stats.last_24h_requests.sort((a, b) => a.ts - b.ts)
    return stats
  }

  // ── DeepSeek Balance Check ──

  private async checkBalance(): Promise<void> {
    try {
      // Read API key from settings or env
      const settingsPath = join(homedir(), '.claude', 'settings.json')
      let apiKey = ''
      let baseUrl = 'https://api.deepseek.com'

      if (existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
          apiKey = settings?.env?.ANTHROPIC_AUTH_TOKEN || ''
          baseUrl = (settings?.env?.ANTHROPIC_BASE_URL || baseUrl).replace('/anthropic', '').replace(/\/$/, '')
        } catch { /* ignore parse errors */ }
      }

      // Fallback: check process.env
      if (!apiKey) apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.DEEPSEEK_API_KEY || ''

      if (!apiKey || !apiKey.startsWith('sk-')) {
        console.log('[Balance] No valid API key found (must start with sk-)')
        return
      }

      console.log('[Balance] Checking DeepSeek balance...')
      const resp = await fetch(`${baseUrl}/user/balance`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      })

      if (!resp.ok) {
        console.log(`[Balance] API returned ${resp.status}`)
        return
      }
      const data = await resp.json() as any
      console.log('[Balance] Response:', JSON.stringify(data))

      // DeepSeek: { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '...', granted_balance: '...', topped_up_balance: '...' }] }
      const infos = data?.balance_infos
      if (!infos || !Array.isArray(infos)) {
        console.log('[Balance] Unexpected response format')
        return
      }

      const cny = infos.find((b: any) => b.currency === 'CNY') || infos[0]
      const available = parseFloat(cny.total_balance) || 0
      const balance: BalanceInfo = {
        available,
        currency: cny.currency || 'CNY',
        checkedAt: Date.now(),
        lowBalance: available < 10,
      }

      console.log(`[Balance] ¥${available.toFixed(2)} (low: ${balance.lowBalance})`)

      if (this.latestStats) {
        this.latestStats.balance = balance
        this.emit('stats', this.latestStats)
      }
    } catch (e) {
      console.log('[Balance] Check failed:', (e as Error).message)
    }
  }
}
