import { create } from 'zustand'

interface MonitorStats {
  total_requests?: number
  total_input_tokens?: number
  total_output_tokens?: number
  total_cache_read_tokens?: number
  total_cache_write_tokens?: number
  total_cost_estimate?: number
  cost_currency?: string
  by_model?: Record<string, { requests: number; input: number; output: number; cache_read: number; cache_write: number; cost: number }>
  last_24h_requests?: Array<{
    ts: number; model: string; input_tokens: number; output_tokens: number
    cache_read: number; cache_write: number; cache_hit_rate: number; status: number
  }>
}

interface MonitorState {
  stats: MonitorStats | null
  setStats: (stats: unknown) => void
}

export const useMonitorStore = create<MonitorState>((set) => ({
  stats: null,
  setStats: (stats: unknown) => {
    if (stats && typeof stats === 'object') {
      set({ stats: stats as MonitorStats })
    }
  },
}))
