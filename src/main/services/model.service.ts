import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ProviderEntry, ModelEntry, ClaudeSettings } from '../../shared/types'
import defaultProviders from '../../shared/default-providers.json'

interface SwitchResult {
  success: boolean
  restartNeeded: boolean
  message: string
}

interface CurrentModel {
  provider: string
  modelId: string
  display: string
  baseUrl: string
  configured: boolean
}

export class ModelService {
  private static instance: ModelService
  private settingsPath = join(homedir(), '.claude', 'settings.json')
  private providersPath = join(homedir(), '.claude', 'providers.json')

  static getInstance(): ModelService {
    if (!ModelService.instance) ModelService.instance = new ModelService()
    return ModelService.instance
  }

  private readSettings(): ClaudeSettings {
    try {
      if (!existsSync(this.settingsPath)) return {}
      return JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
    } catch { return {} }
  }

  /** Check if a provider's required API key is set in settings.json env */
  private isProviderConfigured(authEnv: string): boolean {
    const settings = this.readSettings()
    const env = settings.env || {}

    // Check if the env var is set in settings.json
    if (env[authEnv]) return true

    // Also check process env
    if (process.env[authEnv]) return true

    return false
  }

  /** Returns normalized provider list with configuration status */
  getProviders(): ProviderEntry[] {
    try {
      // First run: auto-create from bundled default
      if (!existsSync(this.providersPath)) {
        const dir = join(homedir(), '.claude')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(this.providersPath, JSON.stringify(defaultProviders, null, 2))
        console.log('[ModelService] Created default providers.json for new user')
      }
      const raw = JSON.parse(readFileSync(this.providersPath, 'utf-8'))
      const providersObj = raw.providers
      if (!providersObj || typeof providersObj !== 'object') return []

      return Object.entries(providersObj).map(([id, p]: [string, any]) => ({
        id,
        name: p.name,
        display: p.name,
        website: p.website,
        api_base: p.api_base,
        auth_env: p.auth_env,
        configured: this.isProviderConfigured(p.auth_env),
        models: (p.models && typeof p.models === 'object')
          ? Object.values(p.models) as ModelEntry[]
          : [],
      }))
    } catch (e) {
      console.error('[ModelService] Error:', e)
      return []
    }
  }

  getCurrentModel(): CurrentModel | null {
    try {
      const settings = this.readSettings()
      const env = settings.env || {}
      const modelId = env.ANTHROPIC_MODEL || 'unknown'
      const baseUrl = env.ANTHROPIC_BASE_URL || ''

      // Find provider name and check if it's configured
      const providers = this.getProviders()
      let providerName = 'Unknown'
      let configured = false
      for (const p of providers) {
        if (p.api_base === baseUrl) { providerName = p.name; configured = p.configured; break }
        for (const m of p.models) {
          if (m.model_id === modelId) { providerName = p.name; configured = p.configured; break }
        }
      }

      return { provider: providerName, modelId, display: modelId, baseUrl, configured }
    } catch { return null }
  }

  switchModel(providerId: string, modelId: string): SwitchResult {
    try {
      const providers = this.getProviders()
      if (!providers.length) {
        return { success: false, restartNeeded: false, message: 'providers.json 未找到' }
      }

      const provider = providers.find(p => p.id === providerId || p.name === providerId)
      if (!provider) {
        return { success: false, restartNeeded: false, message: '提供商未找到' }
      }

      if (!provider.configured) {
        return {
          success: false,
          restartNeeded: false,
          message: `${provider.name} 未配置 API Key，请在 settings.json 的 env 中设置 ${provider.auth_env}`,
        }
      }

      const model = provider.models.find(m => m.model_id === modelId)
      if (!model) {
        return { success: false, restartNeeded: false, message: '模型未找到' }
      }

      const settings = this.readSettings()
      const env = { ...settings.env }

      // Update core settings
      env.ANTHROPIC_BASE_URL = provider.api_base
      env.ANTHROPIC_MODEL = model.model_id
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = model.model_id
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = model.model_id

      // Set Haiku to a different model if available, otherwise same
      const altModel = provider.models.find(m => m.model_id !== modelId)
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = altModel?.model_id || model.model_id

      // For providers that use a different auth env, copy the key
      // (Claude Code reads ANTHROPIC_AUTH_TOKEN primarily)
      if (provider.auth_env !== 'ANTHROPIC_AUTH_TOKEN') {
        // Try to find the key from process env or settings
        const keyValue = env[provider.auth_env] || process.env[provider.auth_env]
        if (keyValue) {
          env.ANTHROPIC_AUTH_TOKEN = keyValue
        }
      }

      writeFileSync(this.settingsPath, JSON.stringify({ ...settings, env }, null, 2))

      return {
        success: true,
        restartNeeded: true,
        message: `已切换到 ${provider.name} / ${model.display}。请创建新终端以应用更改。`,
      }
    } catch (err) {
      return { success: false, restartNeeded: false, message: `错误: ${String(err)}` }
    }
  }
}
