import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ToolState {
  prdOutput: string
  analysisOutput: string
  protoOutput: string
  setPrdOutput: (v: string) => void
  setAnalysisOutput: (v: string) => void
  setProtoOutput: (v: string) => void
}

export const useToolStore = create<ToolState>()(
  persist(
    (set) => ({
      prdOutput: '',
      analysisOutput: '',
      protoOutput: '',
      setPrdOutput: (v) => set({ prdOutput: v }),
      setAnalysisOutput: (v) => set({ analysisOutput: v }),
      setProtoOutput: (v) => set({ protoOutput: v }),
    }),
    { name: 'zxcode-tool-outputs' }
  )
)
