import { IconNewTask, IconExperts, IconAutomation, IconMore, IconWechat } from '../Icons'
import type { SVGProps } from 'react'

// Additional icons needed
function IconPrd(props: SVGProps<SVGSVGElement>) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
}
function IconAnalysis(props: SVGProps<SVGSVGElement>) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 21H4.6c-.56 0-.84 0-1.054-.109a1 1 0 01-.437-.437C3 20.24 3 19.96 3 19.4V3"/><path d="m7 14 4-4 4 4 6-6"/><circle cx="21" cy="3" r="2"/></svg>
}
function IconPrototype(props: SVGProps<SVGSVGElement>) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
}
function IconPrompts(props: SVGProps<SVGSVGElement>) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
}

export type NavPage = 'new-task' | 'experts' | 'automation' | 'prd' | 'analysis' | 'prototype' | 'prompts' | 'wechat-bot'

interface LeftNavProps {
  activePage: NavPage
  onNavigate: (page: NavPage) => void
}

const NAV_ITEMS: { id: NavPage; label: string; Icon: typeof IconNewTask; section?: string }[] = [
  { id: 'new-task', label: '新建任务', Icon: IconNewTask, section: '主功能' },
  { id: 'experts', label: '技能', Icon: IconExperts },
  { id: 'automation', label: '自动化', Icon: IconAutomation },
  { id: 'prd', label: 'PRD 撰写', Icon: IconPrd, section: '产品工具' },
  { id: 'analysis', label: '竞品分析', Icon: IconAnalysis },
  { id: 'prototype', label: '原型设计', Icon: IconPrototype },
  { id: 'prompts', label: '提示词库', Icon: IconPrompts, section: '资源' },
  { id: 'wechat-bot', label: '微信机器人', Icon: IconWechat, section: '集成' },
]

export function LeftNav({ activePage, onNavigate }: LeftNavProps) {
  let lastSection = ''
  return (
    <div className="flex flex-col h-full bg-[#f5f6f8] border-r border-[#e5e6eb] select-none w-[200px]">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-[#e5e6eb]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center">
          <span className="text-white text-[10px] font-extrabold">ZX</span>
        </div>
        <span className="text-sm font-bold text-[#1a1a2e] tracking-tight">ZXCODE</span>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id
          const showSection = item.section && item.section !== lastSection
          if (showSection) lastSection = item.section!
          return (
            <div key={item.id}>
              {showSection && <div className="px-4 pt-3 pb-1 text-[9px] font-semibold text-[#9a9ab0] uppercase tracking-wider">{item.section}</div>}
              <button
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150
                  ${isActive
                    ? 'bg-white text-[#6c5ce7] font-medium border-r-2 border-[#6c5ce7] shadow-sm'
                    : 'text-[#4a4a6a] hover:bg-white/60 hover:text-[#1a1a2e]'
                  }`}
              >
                <item.Icon className="flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            </div>
          )
        })}
      </nav>

      <div className="px-4 py-2 border-t border-[#e5e6eb] text-[10px] text-[#9a9ab0]">v1.0.0</div>
    </div>
  )
}
