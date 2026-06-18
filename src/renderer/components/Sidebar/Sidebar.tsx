import { useState } from 'react'
import { TrafficMonitor } from './TrafficMonitor'
import { IconChart } from '../Icons'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="flex flex-col items-center bg-[#f5f6f8] border-l border-[#e5e6eb] px-1 py-2">
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#9a9ab0] hover:bg-white hover:shadow-sm transition-colors"
          title="展开流量监控"
        >
          <IconChart />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#9a9ab0] hover:bg-white transition-colors"
          title="展开"
        >
          ◂
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-[340px] bg-[#f5f6f8] border-l border-[#e5e6eb] select-none overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e5e6eb] bg-white flex-shrink-0">
        <span className="text-xs font-semibold text-[#1a1a2e] uppercase tracking-wider">
          <IconChart className="inline align-middle mr-1" />流量监控
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="w-6 h-6 flex items-center justify-center rounded text-[#9a9ab0] hover:text-[#1a1a2e] hover:bg-[#f0f0f5] transition-colors"
          title="收起"
        >
          ▸
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <TrafficMonitor />
      </div>
    </div>
  )
}
