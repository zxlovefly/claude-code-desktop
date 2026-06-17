import { useState } from 'react'

interface SkillDef { id: string; name: string; desc: string; category: string; color: string; builtin: boolean; prompt: string }

const SKILL_PROMPTS: Record<string, string> = {
  'frontend-design': '【Frontend Design Skill 激活】请严格遵循以下前端设计规范：\n1. 字体：必须通过 <link> 标签加载 Google Fonts。显示字体选用有特色的（如 Instrument Serif、Cormorant Garamond、Playfair Display、Bebas Neue），正文选用易读的（如 DM Sans、Lora、Source Serif 4）。禁止使用 Inter、Roboto、Arial、Space Grotesk 作为主字体。\n2. 色彩：使用 CSS 自定义属性在 :root 定义完整色板。深色主题用深色背景+金色/暖色点缀；浅色主题用米白/浅灰+深色文字。避免紫色渐变白底、等权彩虹配色。\n3. 布局：采用非对称、重叠、斜线流动等有记忆点的构图。避免居中 hero + 三列卡片 + CTA 的默认 AI 模板。\n4. 动画：使用 @keyframes 实现页面载入的错落渐显效果，hover 使用 transition + letter-spacing 等意外效果。\n5. 质感：添加纹理叠加（grain noise SVG）、渐变网格背景、多层透明度，避免纯色单调背景。\n6. 响应式：使用媒体查询适配手机端。',
  'prd-standard': '【PRD Standard Skill 激活】请严格按照以下结构输出可开发级 PRD，每个章节不得省略：\n# 1. 产品概述（定位、目标用户画像、核心价值主张）\n# 2. 功能需求\n  - 功能清单表（优先级 | 功能名 | 描述 | 验收标准）\n  - 核心功能详细说明：用户故事(As a/I want/So that)、详细业务规则（含边界条件和异常分支）、交互流程（含状态流转）、异常处理方案\n# 3. 非功能需求（性能指标、安全要求、兼容性）\n# 4. 数据埋点方案（事件表：事件名 | 触发时机 | 属性 | 用途）\n# 5. 灰度上线策略（分组方案、回滚条件、监控指标）\n# 6. 排期建议（里程碑拆解表）\n# 7. 风险评估与应对',
  'competitive-analysis': '【Competitive Analysis Skill 激活】请使用以下分析框架：\n1. 市场概况：TAM/SAM/SOM 估算、增长率、关键趋势\n2. 竞品矩阵表：从产品定位、目标用户、核心功能、技术栈、商业模式、融资情况 6 个维度逐一对比\n3. SWOT 分析：对每家竞品分别进行 SWOT\n4. 波特五力分析：供应商议价力、买方议价力、新进入者威胁、替代品威胁、行业竞争强度\n5. 用户体验地图对比：从获客→激活→留存→变现→推荐 各环节对比\n6. 市场空白与机会点：基于分析得出未被满足的需求\n7. 差异化策略建议：明确的切入角度和打法',
  'data-viz': '【Data Visualization Skill 激活】生成 Dashboard 原型时：\n1. 使用 CSS 或内联 SVG 绘制图表（柱状图、折线图、饼图、环形图）\n2. 布局采用卡片网格，每张卡片包含图表+关键指标+趋势标签\n3. 颜色方案使用数据可视化专用配色（避免红绿同时使用以照顾色盲用户）\n4. 添加加载态骨架屏动画和数字滚动动画\n5. 图表需有坐标轴标签、图例、数据标注\n6. 包含时间范围筛选器和数据导出按钮等交互元素',
  'user-story': '【User Story Mapper Skill 激活】请按以下层级结构拆解需求：\nLevel 1 - Epic（大型功能模块）\nLevel 2 - Feature（具体功能）\nLevel 3 - User Story（用户故事，格式：As a [角色], I want [目标], So that [价值]）\nLevel 4 - Acceptance Criteria（验收标准，使用 Given/When/Then 格式）\nLevel 5 - Technical Tasks（技术任务拆解）\n每个 Story 需标注优先级(P0/P1/P2)、故事点估算、依赖关系。',
  'prompt-engineering': '【Prompt Engineering Skill 激活】为 AI 功能设计 Prompt 时：\n1. System Prompt 结构：角色定义 → 能力边界 → 输出格式 → 安全约束\n2. 必须包含 Few-shot 示例（至少 2 个正例 + 1 个反例）\n3. 使用 Chain-of-Thought 引导复杂推理\n4. 定义明确的输出 JSON Schema（当需要结构化输出时）\n5. 添加对抗性测试建议（边界输入、注入攻击防护）\n6. 给出 Prompt 迭代优化的方向和评估指标',
  'accessibility': '【Accessibility Skill 激活】确保生成的 UI 符合 WCAG 2.1 AA 标准：\n1. 颜色对比度 ≥ 4.5:1（正文）和 ≥ 3:1（大字/图标）\n2. 所有交互元素可通过键盘 Tab 访问，有清晰的 focus 样式\n3. 图片有 alt 属性，图标按钮有 aria-label\n4. 表单有关联的 label，错误信息有 aria-describedby\n5. 不仅依赖颜色传达信息（添加图标/文字辅助）\n6. 使用语义化 HTML 标签（nav/main/section/article）',
  'responsive': '【Responsive Design Skill 激活】原型必须包含响应式适配：\n1. 使用 CSS Grid / Flexbox 实现自适应布局\n2. 设置合理的断点：手机(<768px)、平板(768-1024px)、桌面(>1024px)\n3. 图片使用 max-width:100% 和 object-fit\n4. 字体使用 clamp() 实现流体排版\n5. 导航在移动端转为汉堡菜单或底部标签栏\n6. 触摸目标最小 44x44px',
}

const BUILTIN_SKILLS: SkillDef[] = [
  { id: 'frontend-design', name: 'Frontend Design', desc: '注入 15 种设计方向，自动优化字体、配色、布局，生成高品质 UI 代码。', category: '设计', color: '#818cf8', builtin: true, prompt: SKILL_PROMPTS['frontend-design'] },
  { id: 'prd-standard', name: 'PRD Standard', desc: '内置可开发级 PRD 模板：含业务规则、交互逻辑、异常处理、验收标准、埋点方案、灰度策略。', category: '产品', color: '#d4a843', builtin: true, prompt: SKILL_PROMPTS['prd-standard'] },
  { id: 'data-viz', name: 'Data Visualization', desc: '数据可视化设计 Skill，生成包含精美图表的 HTML Dashboard 原型。', category: '设计', color: '#4ade80', builtin: true, prompt: SKILL_PROMPTS['data-viz'] },
  { id: 'competitive-analysis', name: 'Competitive Analysis', desc: '竞品分析框架 Skill，自动注入 SWOT、波特五力、用户体验地图等分析模型。', category: '分析', color: '#f472b6', builtin: true, prompt: SKILL_PROMPTS['competitive-analysis'] },
  { id: 'user-story', name: 'User Story Mapper', desc: '用户故事地图 Skill，将需求拆解为 Epic > Feature > Story 层级结构。', category: '产品', color: '#22d3ee', builtin: true, prompt: SKILL_PROMPTS['user-story'] },
  { id: 'prompt-engineering', name: 'Prompt Engineering', desc: 'Prompt 工程 Skill，为 AI 功能设计高质量 System Prompt 和 Few-shot 示例。', category: 'AI', color: '#fbbf24', builtin: true, prompt: SKILL_PROMPTS['prompt-engineering'] },
  { id: 'accessibility', name: 'Accessibility Checker', desc: '无障碍设计 Skill，确保生成的 UI 符合 WCAG 2.1 AA 标准。', category: '质量', color: '#a78bfa', builtin: true, prompt: SKILL_PROMPTS['accessibility'] },
  { id: 'responsive', name: 'Responsive Design', desc: '响应式设计 Skill，自动适配桌面、平板、手机多端布局。', category: '设计', color: '#fb923c', builtin: true, prompt: SKILL_PROMPTS['responsive'] },
]

export function SkillsPage() {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(BUILTIN_SKILLS.filter(s => s.id === 'frontend-design' || s.id === 'prd-standard' || s.id === 'responsive').map(s => s.id)))
  const [customSkills, setCustomSkills] = useState<SkillDef[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', desc: '', category: '自定义', color: '#a78bfa', prompt: '' })
  const [activeCat, setActiveCat] = useState('全部')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = (id: string) => setEnabled(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const addCustom = () => {
    if (!newSkill.name || !newSkill.desc || !newSkill.prompt) return
    setCustomSkills(prev => [...prev, { id: 'custom-' + Date.now(), ...newSkill, builtin: false }])
    setNewSkill({ name: '', desc: '', category: '自定义', color: '#a78bfa', prompt: '' }); setShowAdd(false)
  }

  const deleteCustom = (id: string) => {
    setCustomSkills(prev => prev.filter(s => s.id !== id))
    setEnabled(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const allSkills = [...BUILTIN_SKILLS, ...customSkills]
  const categories = ['全部', ...new Set(allSkills.map(s => s.category))]
  const filtered = activeCat === '全部' ? allSkills : allSkills.filter(s => s.category === activeCat)

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a2e]">Skill 扩展管理</h2>
            <p className="text-[10px] text-[#9a9ab0] mt-0.5">开启后自动注入 Skill 指令增强 AI 输出 · 已启用 {enabled.size} 个</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 border border-[#6c5ce7] text-[#6c5ce7] rounded-lg text-xs font-medium hover:bg-[#6c5ce7]/5">+ 自定义</button>
        </div>
        {showAdd && (
          <div className="mt-3 p-3 bg-[#f5f6f8] rounded-xl border border-[#e5e6eb] space-y-2">
            <div className="flex gap-2">
              <input placeholder="Skill 名称 *" value={newSkill.name} onChange={e => setNewSkill({ ...newSkill, name: e.target.value })} className="flex-1 bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
              <input placeholder="分类" value={newSkill.category} onChange={e => setNewSkill({ ...newSkill, category: e.target.value })} className="w-24 bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
            </div>
            <input placeholder="描述" value={newSkill.desc} onChange={e => setNewSkill({ ...newSkill, desc: e.target.value })} className="w-full bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
            <textarea placeholder="Skill 指令内容 *（激活时注入到 AI System Prompt 中）" value={newSkill.prompt} onChange={e => setNewSkill({ ...newSkill, prompt: e.target.value })} rows={4} className="w-full bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7] resize-none font-mono" />
            <div className="flex gap-2"><button onClick={addCustom} className="px-3 py-1 bg-[#6c5ce7] text-white rounded-lg text-[10px]">添加</button><button onClick={() => setShowAdd(false)} className="px-3 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded-lg text-[10px]">取消</button></div>
          </div>
        )}
        <div className="flex gap-1 mt-3 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setActiveCat(c)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${activeCat === c ? 'bg-[#6c5ce7] text-white' : 'text-[#4a4a6a] bg-[#f0f0f5] hover:bg-[#e5e5f0]'}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="grid gap-2">
          {filtered.map(s => {
            const isOn = enabled.has(s.id); const isExpanded = expandedId === s.id
            return (
              <div key={s.id} className={`bg-white border rounded-xl transition-all ${isOn ? 'border-[#6c5ce7]/20 shadow-sm' : 'border-[#e5e6eb] opacity-60'}`}>
                <div className="flex items-start gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1a1a2e]">{s.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ backgroundColor: s.color + '18', color: s.color }}>{s.category}</span>
                      {s.builtin && <span className="px-1.5 py-0.5 bg-[#6c5ce7]/5 rounded text-[9px] text-[#6c5ce7]">内置</span>}
                    </div>
                    <div className="text-[10px] text-[#9a9ab0] mt-0.5">{s.desc}</div>
                    {isExpanded && (
                      <pre className="mt-2 p-2 bg-[#f5f6f8] rounded-lg text-[10px] text-[#4a4a6a] whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">{s.prompt}</pre>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : s.id)} className="text-[9px] text-[#6c5ce7] hover:underline mt-1">{isExpanded ? '收起指令' : '查看指令'}</button>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggle(s.id)} className={`relative w-[40px] h-[22px] rounded-full transition-colors duration-200 flex-shrink-0 overflow-hidden ${isOn ? 'bg-[#6c5ce7]' : 'bg-[#d1d5db]'}`}>
                      <span className={`absolute top-[3px] left-[3px] w-[16px] h-[16px] rounded-full bg-white transition-transform duration-200 ${isOn ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                    </button>
                    {!s.builtin && <button onClick={() => deleteCustom(s.id)} className="text-[#e17055] text-[9px] hover:underline">删除</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
