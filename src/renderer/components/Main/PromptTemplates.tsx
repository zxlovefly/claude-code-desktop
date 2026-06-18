import { useState } from 'react'

interface PromptTemplatesProps {
  onSelect: (prompt: string) => void
  category: string
  subCategory: string
  onSubCategoryChange: (c: string) => void
}

const CODE_SUB = [
  { id: 'daily-dev', label: '日常开发' },
  { id: 'web-dev', label: '网站开发' },
  { id: 'agent', label: 'Agent应用' },
  { id: 'skill-dev', label: 'Skill开发' },
  { id: 'cicd', label: 'CI/CD' },
  { id: 'docs', label: '文档' },
]

const TEMPLATES: Record<string, Record<string, { title: string; prompt: string }[]>> = {
  code: {
    'daily-dev': [
      { title: '添加功能', prompt: '帮我给当前项目添加一个新功能，具体需求如下：' },
      { title: '修复Bug', prompt: '帮我修复这个Bug，错误信息如下：' },
      { title: '重构优化', prompt: '帮我重构这段代码，提升可读性、可维护性和性能：' },
      { title: '写单元测试', prompt: '帮我给以下模块编写完整的单元测试，覆盖核心逻辑和边界情况：' },
      { title: '排查报错', prompt: '帮我排查并修复以下报错：' },
      { title: '代码审查', prompt: '请帮我审查以下代码，指出潜在的问题、安全隐患和优化建议：' },
    ],
    'web-dev': [
      { title: 'React组件', prompt: '帮我创建一个 React 组件来实现以下功能：' },
      { title: 'Vue页面', prompt: '帮我用 Vue 3 Composition API 开发一个页面：' },
      { title: 'API接口', prompt: '帮我设计并实现一个 RESTful API 接口：' },
      { title: '全栈功能', prompt: '帮我实现一个前后端联调的全栈功能：' },
    ],
    'agent': [
      { title: 'Agent开发', prompt: '帮我开发一个 AI Agent 来自动化处理以下任务：' },
      { title: 'RAG应用', prompt: '帮我搭建一个 RAG 知识库检索应用：' },
    ],
    'skill-dev': [
      { title: '自定义技能', prompt: '帮我开发一个自定义 Skill 插件来实现：' },
    ],
    'cicd': [
      { title: 'Docker部署', prompt: '帮我编写 Dockerfile 和 docker-compose 配置：' },
      { title: 'CI流水线', prompt: '帮我配置 GitHub Actions CI/CD 流水线：' },
    ],
    'docs': [
      { title: 'API文档', prompt: '帮我根据以下代码生成 API 接口文档：' },
      { title: 'README', prompt: '帮我根据项目结构生成完整的 README 文档：' },
    ],
  },
  office: {
    default: [
      { title: '数据分析', prompt: '帮我分析以下数据并生成可视化报告：' },
      { title: '文档处理', prompt: '帮我把以下文档转换格式并优化排版：' },
      { title: '生成周报', prompt: '帮我根据以下工作内容生成一份结构化周报：' },
    ],
  },
  design: {
    default: [
      { title: '网页设计', prompt: '帮我设计一个现代化网页界面，需求如下：' },
      { title: 'App界面', prompt: '帮我设计移动端 App 界面，功能包括：' },
      { title: 'UI组件', prompt: '帮我设计一套 UI 组件库，包含以下组件：' },
    ],
  },
}

export function PromptTemplates({ onSelect, category, subCategory, onSubCategoryChange }: PromptTemplatesProps) {
  const templates = (TEMPLATES[category]?.[subCategory] || TEMPLATES[category]?.default || []) as { title: string; prompt: string }[]
  const [expanded, setExpanded] = useState(false)

  const visibleTemplates = expanded ? templates : templates.slice(0, 3)

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-t border-[#e5e6eb] overflow-x-auto custom-scrollbar min-h-[36px]">
      {/* Subcategory tabs — show all in scrollable row */}
      {category === 'code' && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {CODE_SUB.map(c => {
            const isActive = subCategory === c.id
            return (
              <button key={c.id} onClick={() => onSubCategoryChange(c.id)}
                className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all
                  ${isActive ? 'bg-[#6c5ce7] text-white' : 'text-[#9a9ab0] bg-[#f0f0f5] hover:bg-[#e5e5f0] hover:text-[#4a4a6a]'}`}
              >{c.label}</button>
            )
          })}
        </div>
      )}
      {/* Templates — 3 visible, expandable */}
      <span className="w-px h-4 bg-[#e5e6eb] flex-shrink-0 mx-1" />
      {visibleTemplates.map((t, i) => (
        <button key={i} onClick={() => onSelect(t.prompt)}
          className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] text-[#4a4a6a] bg-[#f0f0f5] hover:bg-[#e5e5f0] hover:text-[#6c5ce7] transition-all whitespace-nowrap"
        >{t.title}</button>
      ))}
      {templates.length > 3 && !expanded && (
        <button onClick={() => setExpanded(true)}
          className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] text-[#6c5ce7] bg-[#6c5ce7]/5 hover:bg-[#6c5ce7]/15 transition-all whitespace-nowrap font-medium"
        >+{templates.length - 3}</button>
      )}
      {expanded && templates.length > 3 && (
        <button onClick={() => setExpanded(false)}
          className="flex-shrink-0 px-1.5 py-1 rounded-full text-[10px] text-[#9a9ab0] hover:text-[#4a4a6a] transition-all"
        >收起</button>
      )}
    </div>
  )
}
