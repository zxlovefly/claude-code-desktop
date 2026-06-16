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
    this.timer = setInterval(() => this.poll(), 2000)
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

    // DeepSeek pricing: input ¥2/M, cache_hit ¥0.25/M, cache_write ¥4/M, output ¥8/M
    stats.total_cost_estimate =
      stats.total_input_tokens / 1_000_000 * 2.0 +
      stats.total_cache_read_tokens / 1_000_000 * 0.25 +
      stats.total_cache_write_tokens / 1_000_000 * 4.0 +
      stats.total_output_tokens / 1_000_000 * 8.0

    stats.last_24h_requests.sort((a, b) => a.ts - b.ts)
    return stats
  }
}
