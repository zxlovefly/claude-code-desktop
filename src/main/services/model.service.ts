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

  /** Read-only: get current model info for display */
  getCurrentModel(): CurrentModel | null {
    try {
      const settings = this.readSettings()
      const env = settings.env || {}
      const modelId = env.ANTHROPIC_MODEL || 'unknown'
      const baseUrl = env.ANTHROPIC_BASE_URL || ''

      // Auto-create providers.json if missing (first run)
      if (!existsSync(this.providersPath)) {
        const dir = join(homedir(), '.claude')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(this.providersPath, JSON.stringify(defaultProviders, null, 2))
      }

      const raw = JSON.parse(readFileSync(this.providersPath, 'utf-8'))
      const providersObj = raw.providers || {}

      let providerName = 'Unknown'
      let displayName = modelId
      for (const [, p]: [string, any] of Object.entries(providersObj)) {
        if (p.api_base === baseUrl) providerName = p.name
        const models = p.models || {}
        for (const [, m]: [string, any] of Object.entries(models)) {
          if (m.model_id === modelId) {
            displayName = m.display || modelId
            providerName = p.name
            break
          }
        }
      }

      // Check configured status
      let configured = !!env['ANTHROPIC_AUTH_TOKEN']
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
    } catch { return null }
  }
}
