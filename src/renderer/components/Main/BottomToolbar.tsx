import { IconCraft, IconAuto, IconSkill, IconConnector, IconPermission } from '../Icons'

interface BottomToolbarProps {
  onCraft: () => void
  onAuto: () => void
  onSkill: () => void
  onConnector: () => void
  craftActive: boolean
  autoActive: boolean
}

const TOOLS = [
  { id: 'craft', label: 'Craft', Icon: IconCraft, desc: '工程化' },
  { id: 'auto', label: 'Auto', Icon: IconAuto, desc: '自动调试' },
  { id: 'skill', label: '技能', Icon: IconSkill, desc: '插件' },
  { id: 'connector', label: '连接器', Icon: IconConnector, desc: 'Git/文件夹' },
  { id: 'permission', label: '权限', Icon: IconPermission, desc: '访问控制' },
] as const

export function BottomToolbar({ onCraft, onAuto, onSkill, onConnector, craftActive, autoActive }: BottomToolbarProps) {
  const handleClick = (id: string) => {
    switch (id) {
      case 'craft': onCraft(); break
      case 'auto': onAuto(); break
      case 'skill': onSkill(); break
      case 'connector': onConnector(); break
    }
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-white border-t border-[#e5e6eb]">
      {TOOLS.map((tool) => {
        let isActive = false
        if (tool.id === 'craft') isActive = craftActive
        if (tool.id === 'auto') isActive = autoActive

        return (
          <button
            key={tool.id}
            onClick={() => handleClick(tool.id)}
            title={tool.desc}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
              ${isActive
                ? 'bg-[#6c5ce7]/10 text-[#6c5ce7] border border-[#6c5ce7]/20'
                : 'text-[#4a4a6a] hover:bg-[#f0f0f5] border border-transparent'
              }`}
          >
            <tool.Icon />
            <span>{tool.label}</span>
          </button>
        )
      })}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#4a4a6a] bg-[#f0f0f5]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M3 9h18M9 3v18" strokeWidth="1" opacity="0.4" />
        </svg>
        <span>默认空间</span>
      </div>
    </div>
  )
}
