import { useState } from 'react'
import { ModelSwitcher } from './ModelSwitcher'
import { TrafficMonitor } from './TrafficMonitor'
import { AutomationPanel } from './AutomationPanel'

type PanelId = 'model' | 'traffic' | 'automation'

export function Sidebar() {
  const [activePanel, setActivePanel] = useState<PanelId>('model')
  const [collapsed, setCollapsed] = useState(false)

  const tabs: { id: PanelId; label: string; icon: string }[] = [
    { id: 'model', label: '模型', icon: '⚡' },
    { id: 'traffic', label: '流量', icon: '📊' },
    { id: 'automation', label: '自动化', icon: '🤖' },
  ]

  if (collapsed) {
    return (
      <div className="flex flex-col items-center bg-[#161b22] border-r border-[#30363d] px-1 py-2 gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActivePanel(tab.id); setCollapsed(false) }}
            className="w-8 h-8 flex items-center justify-center rounded-md text-sm
                       hover:bg-[#21262d] transition-colors"
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#8b949e] hover:bg-[#21262d] transition-colors"
          title="展开"
        >
          ▸
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-72 bg-[#161b22] border-r border-[#30363d] select-none">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#30363d]">
        <span className="text-xs font-semibold text-[#e6edf3] uppercase tracking-wider">
          {tabs.find(t => t.id === activePanel)?.label}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="w-6 h-6 flex items-center justify-center rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          title="收起"
        >
          ◂
        </button>
      </div>

      <div className="flex border-b border-[#30363d]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              activePanel === tab.id
                ? 'text-[#e6edf3] border-b-2 border-[#58a6ff] bg-[#0d1117]/50'
                : 'text-[#8b949e] border-b-2 border-transparent hover:text-[#e6edf3] hover:bg-[#21262d]'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activePanel === 'model' && <ModelSwitcher />}
        {activePanel === 'traffic' && <TrafficMonitor />}
        {activePanel === 'automation' && <AutomationPanel />}
      </div>
    </div>
  )
}
