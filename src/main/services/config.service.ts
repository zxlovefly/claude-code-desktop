import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ClaudeSettings } from '../../shared/types'

export class ConfigService {
  private static instance: ConfigService
  private settingsPath = join(homedir(), '.claude', 'settings.json')

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService()
    }
    return ConfigService.instance
  }

  getSettings(): ClaudeSettings | null {
    try {
      if (!existsSync(this.settingsPath)) return null
      return JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
    } catch {
      return null
    }
  }

  setSetting(key: string, value: unknown): void {
    let settings: ClaudeSettings = {}

    if (existsSync(this.settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
      } catch {
        // Start fresh if file is corrupt
      }
    }

    // Auto-correct type: convert "true"/"false" string → boolean
    let finalValue = value
    if (value === 'true') finalValue = true
    else if (value === 'false') finalValue = false
    else if (typeof value === 'string' && /^\d+$/.test(value)) finalValue = Number(value)

    // Support dot notation for nested keys
    const keys = key.split('.')
    let current: Record<string, unknown> = settings
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {}
      }
      current = current[keys[i]] as Record<string, unknown>
    }
    current[keys[keys.length - 1]] = finalValue

    // Atomic write
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2))
  }
}
