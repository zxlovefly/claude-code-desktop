import { useState } from 'react'
import { TrafficMonitor } from './TrafficMonitor'
import { AutomationPanel } from './AutomationPanel'

type PanelId = 'traffic' | 'automation'

export function Sidebar() {
  const [activePanel, setActivePanel] = useState<PanelId>('traffic')
  const [collapsed, setCollapsed] = useState(false)

  const tabs: { id: PanelId; label: string; icon: string }[] = [
    { id: 'traffic', label: '流量', icon: '📊' },
    { id: 'automation', label: '自动化', icon: '🤖' },
  ]

  if (collapsed) {
    return (
      <div className="flex flex-col items-center bg-[#f5f6f8] border-r border-[#e5e6eb] px-1 py-2 gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActivePanel(tab.id); setCollapsed(false) }}
            className="w-8 h-8 flex items-center justify-center rounded-md text-sm
                       hover:bg-white hover:shadow-sm transition-colors"
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#9a9ab0] hover:bg-white transition-colors"
          title="展开"
        >
          ▸
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-72 bg-[#f5f6f8] border-r border-[#e5e6eb] select-none">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e5e6eb] bg-white">
        <span className="text-xs font-semibold text-[#1a1a2e] uppercase tracking-wider">
          {tabs.find((t) => t.id === activePanel)?.label}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="w-6 h-6 flex items-center justify-center rounded text-[#9a9ab0] hover:text-[#1a1a2e] hover:bg-[#f0f0f5] transition-colors"
          title="收起"
        >
          ◂
        </button>
      </div>

      <div className="flex border-b border-[#e5e6eb] bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              activePanel === tab.id
                ? 'text-[#6c5ce7] border-b-2 border-[#6c5ce7]'
                : 'text-[#9a9ab0] border-b-2 border-transparent hover:text-[#4a4a6a] hover:bg-[#f0f0f5]'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activePanel === 'traffic' && <TrafficMonitor />}
        {activePanel === 'automation' && <AutomationPanel />}
      </div>
    </div>
  )
}
