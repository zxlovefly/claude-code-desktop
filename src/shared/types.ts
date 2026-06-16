// ── Provider & Model Types (matches real providers.json) ──

export interface ModelPricing {
  input_per_1M: number
  output_per_1M: number
  cache_write_per_1M?: number
  cache_hit_per_1M?: number
  currency: string
}

// features is an array of strings: ["anthropic_compatible","prompt_caching",...]
export type ModelFeature = 'anthropic_compatible' | 'prompt_caching' | 'tool_use' | 'streaming' | 'vision'

export interface ModelEntry {
  display: string
  model_id: string
  context_window: number
  max_output: number
  pricing: ModelPricing
  features: ModelFeature[]
}

// providers.json: { providers: { [id]: { name, website, api_base, auth_env, auth_prefix, models: { [id]: ModelEntry } } } }
export interface ProviderRaw {
  name: string
  website: string
  api_base: string
  auth_env: string
  auth_prefix?: string
  models: Record<string, ModelEntry>
}

export interface ProvidersConfigRaw {
  __comment?: string
  active?: string
  quick_switch_presets?: Record<string, unknown>
  providers: Record<string, ProviderRaw>
}

// Normalized for UI
export interface ProviderEntry {
  id: string
  name: string
  display: string
  website: string
  api_base: string
  auth_env: string
  models: ModelEntry[]
}

// ── Settings Types ──

export interface SettingsEnv {
  ANTHROPIC_AUTH_TOKEN?: string
  ANTHROPIC_BASE_URL?: string
  ANTHROPIC_MODEL?: string
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC?: string
  CLAUDE_CODE_EFFORT_LEVEL?: string
  [key: string]: string | undefined
}

export interface ClaudeSettings {
  env?: SettingsEnv
  theme?: string
  model?: string
  agent?: string
  statusLine?: { type: string; command: string }
  enabledPlugins?: Record<string, boolean>
  [key: string]: unknown
}

// ── Proxy Stats ──

export interface ProxyStats {
  total_requests?: number
  tokens_in?: number
  tokens_out?: number
  cache_hit_tokens?: number
  cache_miss_tokens?: number
  requests?: Array<{
    time: number
    status: number
    tokens_in: number
    tokens_out: number
    cache_hit: boolean
  }>
  [key: string]: unknown
}

// ── Session Types ──

export interface SessionInfo {
  id: string
  name: string
  cwd: string
  createdAt: number
}
