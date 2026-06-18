import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ClaudeSettings } from '../../shared/types'
import defaultProviders from '../../shared/default-providers.json'

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
  private appSettingsPath = join(homedir(), '.claude', 'app-settings.json')
  private providersPath = join(homedir(), '.claude', 'providers.json')

  /** Read app-level settings (takes priority over CLI settings.json) */
  private readAppSettings(): { baseURL?: string; model?: string; authToken?: string } {
    try {
      if (!existsSync(this.appSettingsPath)) return {}
      return JSON.parse(readFileSync(this.appSettingsPath, 'utf-8'))
    } catch { return {} }
  }

  private writeAppSettings(s: { baseURL?: string; model?: string; authToken?: string }): void {
    const dir = join(homedir(), '.claude')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.appSettingsPath, JSON.stringify(s, null, 2))
  }

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

  /** Read-only: get current model info for display */
  getCurrentModel(): CurrentModel | null {
    try {
      // Always sync providers.json with latest bundled default on startup
      const dir = join(homedir(), '.claude')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.providersPath, JSON.stringify(defaultProviders, null, 2))

      // Read app-settings first, fallback to CLI settings.json
      const appSettings = this.readAppSettings()
      const cliSettings = this.readSettings()
      const cliEnv = cliSettings.env || {}

      // Use app settings if available, otherwise CLI settings
      const baseUrl = appSettings.baseURL || cliEnv.ANTHROPIC_BASE_URL || ''
      const modelId = (appSettings.model || cliEnv.ANTHROPIC_MODEL || 'deepseek-v4-pro').replace(/\[1m\]/i, '')
      const authToken = appSettings.authToken || cliEnv.ANTHROPIC_AUTH_TOKEN || ''

      console.log('[ModelService] modelId:', modelId, 'baseUrl:', baseUrl, 'fromAppSettings:', !!appSettings.model)

      const raw = JSON.parse(readFileSync(this.providersPath, 'utf-8'))
      const providersObj = raw.providers || {}

      let providerName = 'Unknown'
      let displayName = modelId
      for (const [, p]: [string, any] of Object.entries(providersObj)) {
        if (p.api_base === baseUrl) providerName = p.name
        const models = p.models || {}
        for (const [, m]: [string, any] of Object.entries(models)) {
          const storedId = (m.model_id || '').replace(/\[1m\]/i, '')
          if (storedId === modelId) {
            displayName = m.display || modelId
            providerName = p.name
            console.log('[ModelService] Matched:', displayName, 'provider:', providerName)
            break
          }
        }
      }

      // Check configured status
      let configured = !!(authToken || cliEnv.ANTHROPIC_AUTH_TOKEN || cliEnv.DASHSCOPE_API_KEY)
      const keysPath = join(homedir(), '.claude', 'keys.json')
      if (existsSync(keysPath)) {
        try {
          const keys = JSON.parse(readFileSync(keysPath, 'utf-8'))
          for (const [pid, p]: [string, any] of Object.entries(providersObj)) {
            if (p.api_base === baseUrl && keys[pid]) { configured = true; break }
          }
        } catch {}
      }

      return { provider: providerName, modelId, display: displayName, baseUrl, configured }
    } catch (e) {
      console.error('[ModelService] getCurrentModel error:', (e as Error).message)
      return null
    }
  }

  /** Get ALL available models from ALL providers (for cross-provider switching) */
  getAvailableModels(): Array<{ id: string; name: string; description: string; provider: string; providerName: string }> {
    try {
      console.log('[ModelService] getAvailableModels: providersPath=', this.providersPath)
      if (!existsSync(this.providersPath)) {
        console.log('[ModelService] providers.json not found, creating from default')
        const dir = join(homedir(), '.claude')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(this.providersPath, JSON.stringify(defaultProviders, null, 2))
      }
      const raw = JSON.parse(readFileSync(this.providersPath, 'utf-8'))
      const providersObj = raw.providers || {}
      const appSettings = this.readAppSettings()
      const cliSettings = this.readSettings()
      const cliEnv = cliSettings.env || {}
      const currentBaseUrl = appSettings.baseURL || cliEnv.ANTHROPIC_BASE_URL || ''
      const currentModel = (appSettings.model || cliEnv.ANTHROPIC_MODEL || '').replace(/\[1m\]/i, '')

      console.log('[ModelService] Current:', currentBaseUrl, currentModel)

      const result: Array<{ id: string; name: string; description: string; provider: string; providerName: string }> = []
      for (const [pid, p]: [string, any] of Object.entries(providersObj)) {
        const models = p.models || {}
        for (const [mid, m]: [string, any] of Object.entries(models)) {
          result.push({
            id: `${pid}/${mid}`,
            name: m.display || mid,
            description: (m as any).description || '',
            provider: pid,
            providerName: p.name,
            isCurrent: (m.model_id || mid).replace(/\[1m\]/i, '') === currentModel && p.api_base === currentBaseUrl,
          } as any)
        }
      }
      console.log('[ModelService] Found', result.length, 'models:', result.map(r => r.id).join(', '))
      return result
    } catch (e) {
      console.error('[ModelService] getAvailableModels error:', (e as Error).message)
      return []
    }
  }

  /** Switch model — simpler: always read key from CLI settings, write to app-settings */
  switchModel(qualifiedId: string): boolean {
    try {
      // Sync providers first
      const dir = join(homedir(), '.claude')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.providersPath, JSON.stringify(defaultProviders, null, 2))

      const [providerId, modelKey] = qualifiedId.split('/')
      if (!providerId || !modelKey) { console.error('[Switch] bad id:', qualifiedId); return false }

      const raw = JSON.parse(readFileSync(this.providersPath, 'utf-8'))
      const provider = raw.providers?.[providerId]
      const model = provider?.models?.[modelKey]
      if (!provider || !model) { console.error('[Switch] not found:', providerId, modelKey); return false }

      const newBaseUrl = provider.api_base
      const newModelId = (model.model_id || modelKey).replace(/\[1m\]/i, '')

      // Read token from settings.json — map provider to correct env key
      const KEY_MAP: Record<string, string> = {
        deepseek: 'ANTHROPIC_AUTH_TOKEN', anthropic: 'ANTHROPIC_AUTH_TOKEN',
        qwen: 'DASHSCOPE_API_KEY', openrouter: 'ANTHROPIC_AUTH_TOKEN',
      }
      let authToken = ''
      try {
        const rawS = readFileSync(this.settingsPath, 'utf-8')
        const allEnv = JSON.parse(rawS)?.env || {}
        const keyName = KEY_MAP[providerId] || provider.auth_env || 'ANTHROPIC_AUTH_TOKEN'
        authToken = allEnv[keyName] || ''
        if (!authToken) {
          // brute-force: try ALL known keys
          for (const v of Object.values(allEnv)) {
            if (typeof v === 'string' && v.startsWith('sk-')) { authToken = v; break }
          }
        }
      } catch {}
      console.log('[Switch] provider=', providerId, 'token=', authToken ? authToken.substring(0, 10) + '...' : 'EMPTY')

      const appSettings = { baseURL: newBaseUrl, model: newModelId, authToken }
      writeFileSync(this.appSettingsPath, JSON.stringify(appSettings, null, 2))

      // Also update CLI settings.json so the embedded terminal uses the new model
      try {
        const sRaw = readFileSync(this.settingsPath, 'utf-8')
        const s = JSON.parse(sRaw)
        s.env = { ...(s.env || {}), ANTHROPIC_BASE_URL: newBaseUrl, ANTHROPIC_MODEL: newModelId, ANTHROPIC_AUTH_TOKEN: authToken }
        writeFileSync(this.settingsPath, JSON.stringify(s, null, 2))
      } catch {}

      console.log('[Switch] Wrote both settings for', newModelId)
      return true
    } catch (e) {
      console.error('[Switch] error:', (e as Error).message)
      return false
    }
  }
}
