import { create } from 'zustand'
import type { ProviderEntry } from '../../shared/types'

interface CurrentModel {
  provider: string
  modelId: string
  display: string
  baseUrl: string
  configured?: boolean
}

interface ModelState {
  providers: ProviderEntry[]
  currentModel: CurrentModel | null
  isSwitching: boolean
  switchMessage: string | null
  setProviders: (providers: unknown) => void
  setCurrentModel: (model: unknown) => void
  switchModel: (providerName: string, modelId: string) => Promise<void>
}

export const useModelStore = create<ModelState>((set, get) => ({
  providers: [],
  currentModel: null,
  isSwitching: false,
  switchMessage: null,

  setProviders: (providers: unknown) => {
    const list = Array.isArray(providers) ? providers : []
    set({ providers: list as ProviderEntry[] })
  },

  setCurrentModel: (model: unknown) => {
    set({ currentModel: model as CurrentModel | null })
  },

  switchModel: async (providerName: string, modelId: string) => {
    set({ isSwitching: true, switchMessage: null })
    try {
      const result: any = await window.electron.invoke('model:switch', providerName, modelId)
      set({ switchMessage: result?.message || '切换完成' })

      // Refresh current model
      const updated: any = await window.electron.invoke('model:current')
      if (updated) set({ currentModel: updated as CurrentModel })

      // Auto-clear message after 5s
      setTimeout(() => set({ switchMessage: null }), 5000)
    } catch (err) {
      set({ switchMessage: `切换失败: ${String(err)}` })
    } finally {
      set({ isSwitching: false })
    }
  },
}))
