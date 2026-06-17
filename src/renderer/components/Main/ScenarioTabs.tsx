import { IconCode, IconOffice, IconDesign } from '../Icons'

export type Scenario = 'code' | 'office' | 'design'

interface ScenarioTabsProps {
  activeScenario: Scenario
  onScenarioChange: (s: Scenario) => void
}

const SCENARIOS: { id: Scenario; label: string; Icon: typeof IconCode }[] = [
  { id: 'code', label: '代码开发', Icon: IconCode },
  { id: 'office', label: '日常办公', Icon: IconOffice },
  { id: 'design', label: '设计创意', Icon: IconDesign },
]

export function ScenarioTabs({ activeScenario, onScenarioChange }: ScenarioTabsProps) {
  return (
    <div className="flex items-center justify-center gap-1 px-6 py-2 bg-white border-b border-[#e5e6eb]">
      {SCENARIOS.map((s) => {
        const isActive = activeScenario === s.id
        return (
          <button key={s.id} onClick={() => onScenarioChange(s.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
              ${isActive ? 'bg-[#6c5ce7] text-white shadow-sm' : 'text-[#4a4a6a] hover:bg-[#f0f0f5] hover:text-[#1a1a2e]'}`}
          >
            <s.Icon /><span>{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}
