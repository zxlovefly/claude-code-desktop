import { useState } from 'react'

interface PromptDef {
  id: string; title: string; desc: string; tag: string; tagColor: string; prompt: string; builtin: boolean
}

const BUILTIN_PROMPTS: PromptDef[] = [
  {
    id: 'prd-dev', tag: 'PRD · 可开发级', tagColor: '#d4a843',
    title: '可开发级 PRD 文档生成',
    desc: '输入项目背景，生成包含业务规则、交互逻辑、异常处理、验收标准和灰度策略的完整 PRD。',
    prompt: '你是一位有10年经验的资深AI产品经理。请根据以下项目信息，生成一份可直接指导开发团队的PRD文档。\n\n【输出结构 - 严格按此输出，不得省略】\n\n# 1. 产品概述\n- 产品定位与核心价值主张\n- 目标用户画像（含用户分层、典型使用场景）\n- 北极星指标 + 关键过程指标（OKR 形式）\n\n# 2. 功能需求\n## 2.1 功能清单（表格：P0/P1/P2 | 功能名 | 描述 | 验收标准）\n## 2.2 核心功能详细说明\n  - 用户故事（As a / I want / So that）\n  - 详细业务规则（覆盖所有边界情况）\n  - 交互流程（状态流转）\n  - 异常处理\n\n# 3. 非功能需求（性能、安全、兼容性）\n# 4. 数据埋点方案（表格）\n# 5. 灰度与上线策略\n# 6. 排期建议（里程碑表格）\n# 7. 风险评估\n\n---\n项目名称：{{name}}\n项目背景：{{background}}\n目标用户：{{users}}\n核心功能：{{features}}\n商业目标：{{goals}}\n补充说明：{{extra}}',
    builtin: true
  },
  {
    id: 'compete', tag: '竞品 · 深度分析', tagColor: '#f472b6',
    title: '竞品多维度深度分析',
    desc: '输入市场领域和竞品列表，获得 SWOT、波特五力、用户体验地图等多维分析报告。',
    prompt: '你是一位资深行业分析师兼产品战略顾问。请对以下市场和竞品进行深度分析。\n\n【分析框架】\n# 1. 市场概况（TAM/SAM/SOM、增长率、关键趋势）\n# 2. 竞品矩阵（6 维度表格对比）\n# 3. 各竞品 SWOT 分析\n# 4. 波特五力分析（每项评分1-5+说明）\n# 5. 用户体验路径对比（获客→推荐全链路）\n# 6. 市场空白与机会点\n# 7. 战略建议\n\n---\n市场领域：{{market}}\n竞品列表：{{competitors}}\n分析重点：{{focus}}\n我的产品想法：{{mine}}',
    builtin: true
  },
  {
    id: 'user-story', tag: '用户故事 · 拆解', tagColor: '#22d3ee',
    title: '用户故事地图拆解',
    desc: '将产品需求拆解为 Epic → Feature → Story 层级结构，包含验收标准和优先级。',
    prompt: '你是一位资深敏捷教练兼产品负责人。请将以下产品需求拆解为完整的用户故事地图。\n\n# 1. 用户角色定义（Persona）\n# 2. 用户活动流（横向主干）\n# 3. 用户任务分解（纵向展开）\n# 4. 故事卡片详情（表格：Epic|Feature|Story|验收标准|优先级|故事点|依赖）\n# 5. Release Planning（MVP / V1.1 / V1.2）\n# 6. 技术风险与依赖关系\n\n---\n产品名称：{{name}}\n产品描述：{{desc}}\n目标用户：{{users}}\n核心场景：{{scenarios}}',
    builtin: true
  },
  {
    id: 'checklist', tag: '评审 · Checklist', tagColor: '#4ade80',
    title: '需求评审 Checklist',
    desc: '输入需求文档，自动生成评审检查清单，覆盖完整性、一致性、可行性等维度。',
    prompt: '你是一位严谨的技术负责人和测试负责人。请对以下需求文档进行全面评审，输出评审 Checklist。\n\n# 1. 完整性检查（目标/用户/流程/异常/边界/前后端职责）\n# 2. 一致性检查（术语/清单对应/状态机）\n# 3. 可行性检查（技术/排期/第三方依赖）\n# 4. 体验检查（加载态/空态/错误态/确认撤销/无障碍）\n# 5. 数据与安全（埋点/合规/权限）\n# 6. 风险与建议（按严重程度排序）\n\n---\n需求文档内容：\n{{doc}}',
    builtin: true
  },
  {
    id: 'metrics', tag: '数据 · 指标体系', tagColor: '#a78bfa',
    title: '数据指标体系设计',
    desc: '根据产品目标设计完整的数据指标体系，包含北极星指标、过程指标和监控看板方案。',
    prompt: '你是一位资深数据产品经理。请为以下产品设计完整的数据指标体系。\n\n# 1. 北极星指标（名称/公式/目标/选择理由）\n# 2. AARRR 漏斗指标（表格：阶段|指标名|计算方式|基准|目标|策略）\n# 3. 过程指标（功能行为指标+健康度指标）\n# 4. 监控看板设计（3个看板+报警规则）\n# 5. 埋点事件清单（表格）\n# 6. A/B 测试建议\n\n---\n产品名称：{{name}}\n产品描述：{{desc}}\n核心目标：{{goals}}',
    builtin: true
  },
  {
    id: 'release', tag: '发版 · Release Notes', tagColor: '#fb923c',
    title: '发版说明撰写',
    desc: '输入本次迭代的功能变更，生成面向不同受众的发版说明（内部/用户/应用商店）。',
    prompt: '你是一位资深技术文档工程师。请根据以下迭代信息，生成三个版本的发版说明。\n\n## 版本一：内部 Release Notes（技术细节+数据库变更+回滚方案）\n## 版本二：用户更新日志（友好语言+新功能/优化/修复分类+emoji）\n## 版本三：应用商店描述（500字以内+要点bullet+CTA+关键词建议）\n\n---\n产品名称：{{name}}\n版本号：{{version}}\n迭代内容：{{changes}}\n已知问题：{{issues}}',
    builtin: true
  },
  {
    id: 'interview', tag: '用户研究 · 访谈', tagColor: '#f97316',
    title: '用户访谈提纲设计',
    desc: '输入研究目标和用户群体，生成结构化访谈提纲，含暖场、核心、收尾问题和访谈技巧。',
    prompt: '你是一位资深用户研究员。请为以下研究目标设计结构化用户访谈提纲。\n\n# 1. 研究目标与背景\n# 2. 受访者画像与招募标准\n# 3. 访谈提纲\n  - 暖场问题（5分钟）- 建立信任\n  - 核心问题（30分钟）- 行为/态度/痛点/动机\n  - 收尾问题（5分钟）- 总结确认\n# 4. 每道题标注：提问目的、追问策略、预期回答形式\n# 5. 访谈员注意事项与技巧\n\n---\n研究目标：{{goal}}\n目标用户：{{users}}\n产品/场景：{{product}}\n已有假设：{{hypotheses}}',
    builtin: true
  },
  {
    id: 'roadmap', tag: '路线图 · Roadmap', tagColor: '#06b6d4',
    title: '产品路线图规划',
    desc: '输入产品愿景和资源约束，生成季度路线图，包含里程碑、依赖关系和资源配置建议。',
    prompt: '你是一位资深产品总监。请为以下产品制定未来 12 个月的路线图。\n\n# 1. 产品愿景与战略目标（OKR）\n# 2. 季度路线图（Q1-Q4，每季度含主题、关键交付物、成功标准）\n# 3. 里程碑依赖关系图\n# 4. 资源规划（团队规模、关键技术栈、预算估算）\n# 5. 风险与应对（技术/市场/组织）\n# 6. 关键假设与验证计划\n\n---\n产品名称：{{name}}\n产品愿景：{{vision}}\n当前阶段：{{stage}}\n资源约束：{{constraints}}\n竞品动态：{{competition}}',
    builtin: true
  },
  {
    id: 'ab-test', tag: 'A/B · 实验设计', tagColor: '#8b5cf6',
    title: 'A/B 实验方案设计',
    desc: '输入实验目标和场景，生成完整 A/B 测试方案，含假设、变量、样本量和评估标准。',
    prompt: '你是一位数据科学家兼增长产品经理。请设计完整的 A/B 实验方案。\n\n# 1. 实验背景与核心假设\n# 2. 实验设计（对照组/实验组/变量定义/分流策略）\n# 3. 样本量计算（显著性水平/检验力/最小可检测效应）\n# 4. 核心指标（主指标/护栏指标/反向指标）\n# 5. 实验流程（预热期/观察期/决策规则）\n# 6. 风险与降级方案\n\n---\n实验场景：{{scenario}}\n当前指标基线：{{baseline}}\n期望提升：{{lift}}\n用户群体：{{users}}\n实验周期：{{duration}}',
    builtin: true
  },
  {
    id: 'growth', tag: '增长 · 北极星拆解', tagColor: '#ec4899',
    title: '增长模型与北极星指标拆解',
    desc: '输入产品商业模式，生成增长模型公式和北极星指标拆解，含输入指标和杠杆分析。',
    prompt: '你是一位增长产品负责人。请为以下产品构建增长模型并拆解北极星指标。\n\n# 1. 北极星指标定义（名称/公式/为什么选它）\n# 2. 增长模型公式（因子分解到可操作粒度）\n# 3. 输入指标树（每个因子对应的输入指标和团队）\n# 4. 当前基线 + 月度目标 + 年度目标\n# 5. 增长杠杆分析（按影响力×可行性排序 Top 5）\n# 6. 监控看板方案与预警阈值\n\n---\n产品名称：{{name}}\n商业模式：{{model}}\n当前核心指标：{{metrics}}\n增长瓶颈：{{bottleneck}}',
    builtin: true
  },
  {
    id: 'tech-eval', tag: '技术 · 方案评估', tagColor: '#14b8a6',
    title: '技术方案对比评估',
    desc: '输入技术选型场景，生成多方案对比评估报告，含架构、成本、风险和迁移路径。',
    prompt: '你是一位资深技术架构师。请对以下技术选型进行多方案对比评估。\n\n# 1. 业务场景与技术需求分析\n# 2. 候选方案概述（每方案 1-2 段）\n# 3. 对比矩阵（维度含：性能/扩展性/开发效率/运维成本/生态/团队匹配）\n# 4. 各方案风险评估\n# 5. 推荐方案 + 理由 + 妥协点\n# 6. 迁移路径建议（POC→灰度→全量）\n\n---\n选型场景：{{scenario}}\n性能要求：{{perf}}\n团队技术栈：{{stack}}\n预算约束：{{budget}}\n候选方案：{{options}}',
    builtin: true
  },
  {
    id: 'ops', tag: '运营 · 活动方案', tagColor: '#e11d48',
    title: '运营活动方案策划',
    desc: '输入活动目标和预算，生成完整活动运营方案，含玩法设计、资源需求、效果预估和复盘框架。',
    prompt: '你是一位资深运营总监。请策划完整的运营活动方案。\n\n# 1. 活动背景与目标（SMART 原则）\n# 2. 目标用户与触达策略\n# 3. 活动玩法设计（核心机制/奖励体系/裂变路径）\n# 4. 资源需求（设计/研发/运营/预算/时间线）\n# 5. 效果预估（参与率/转化率/ROI 估算）\n# 6. 风险预案（羊毛党/舆情/降级方案）\n# 7. 复盘框架（活动后评估 Checklist）\n\n---\n活动名称：{{name}}\n核心目标：{{goal}}\n预算范围：{{budget}}\n目标人群：{{users}}\n活动周期：{{duration}}',
    builtin: true
  },
]

// Props kept for backward compatibility — onUsePrompt no longer wired to UI
interface Props {
  onUsePrompt?: (prompt: string) => void
}

export function PromptLibraryPage(_props: Props) {
  const [customPrompts, setCustomPrompts] = useState<PromptDef[]>([])
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<PromptDef | null>(null)
  const [editing, setEditing] = useState<PromptDef | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', desc: '', tag: '自定义', tagColor: '#a78bfa', prompt: '' })
  const [copied, setCopied] = useState<string | null>(null)

  const allPrompts = [...BUILTIN_PROMPTS, ...customPrompts]
  const filtered = allPrompts.filter(p => !search || p.title.includes(search) || p.desc.includes(search) || p.tag.includes(search))

  const copyPrompt = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { window.electron.clipboard.writeText(text) }
    setCopied(id); setTimeout(() => setCopied(null), 1500)
  }

  const saveCustom = () => {
    if (!form.title || !form.prompt) return
    if (editing) {
      setCustomPrompts(prev => prev.map(p => p.id === editing.id ? { ...editing, ...form } : p))
    } else {
      setCustomPrompts(prev => [...prev, { id: 'custom-' + Date.now(), ...form, builtin: false }])
    }
    setForm({ title: '', desc: '', tag: '自定义', tagColor: '#a78bfa', prompt: '' })
    setShowAdd(false); setEditing(null)
  }

  const deleteCustom = (id: string) => {
    setCustomPrompts(prev => prev.filter(p => p.id !== id))
    if (viewing?.id === id) setViewing(null)
  }

  if (viewing) {
    return (
      <div className="flex flex-col h-full bg-[#f5f6f8]">
        <div className="px-4 py-3 bg-white border-b border-[#e5e6eb] flex items-center gap-3">
          <button onClick={() => setViewing(null)} className="text-[#9a9ab0] hover:text-[#6c5ce7]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ backgroundColor: viewing.tagColor + '18', color: viewing.tagColor }}>{viewing.tag}</span>
              <span className="text-sm font-bold text-[#1a1a2e]">{viewing.title}</span>
            </div>
          </div>
          <button onClick={() => copyPrompt(viewing.id, viewing.prompt)} className="px-3 py-1.5 bg-[#6c5ce7] text-white rounded-lg text-[10px] font-medium">
            {copied === viewing.id ? '已复制 ✓' : '复制'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <pre className="bg-white border border-[#e5e6eb] rounded-xl p-4 text-xs text-[#1a1a2e] whitespace-pre-wrap font-mono leading-relaxed">{viewing.prompt}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a2e]">提示词模板库</h2>
            <p className="text-[10px] text-[#9a9ab0] mt-0.5">精选高频场景 Prompt · 点击卡片查看详情 · 可复制使用</p>
          </div>
          <button onClick={() => { setShowAdd(!showAdd); setEditing(null); setForm({ title: '', desc: '', tag: '自定义', tagColor: '#a78bfa', prompt: '' }) }} className="px-3 py-1.5 border border-[#6c5ce7] text-[#6c5ce7] rounded-lg text-xs font-medium hover:bg-[#6c5ce7]/5">+ 自定义</button>
        </div>

        {/* Add/Edit form */}
        {(showAdd || editing) && (
          <div className="mt-3 p-3 bg-[#f5f6f8] rounded-xl border border-[#e5e6eb] space-y-2">
            <div className="flex gap-2">
              <input placeholder="模板名称 *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="flex-1 bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
              <input placeholder="标签" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} className="w-28 bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
            </div>
            <input placeholder="描述" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} className="w-full bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
            <textarea placeholder="Prompt 内容 *" value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} rows={4} className="w-full bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7] resize-none font-mono" />
            <div className="flex gap-2">
              <button onClick={saveCustom} className="px-3 py-1 bg-[#6c5ce7] text-white rounded-lg text-[10px]">{editing ? '保存修改' : '添加'}</button>
              <button onClick={() => { setShowAdd(false); setEditing(null) }} className="px-3 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded-lg text-[10px]">取消</button>
            </div>
          </div>
        )}

        <div className="mt-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模板..." className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-xl px-4 py-1.5 text-xs text-[#1a1a2e] outline-none focus:border-[#6c5ce7]" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="grid gap-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-white border border-[#e5e6eb] rounded-xl p-3 hover:border-[#6c5ce7]/20 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => setViewing(p)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ backgroundColor: p.tagColor + '18', color: p.tagColor }}>{p.tag}</span>
                    {!p.builtin && <span className="px-1.5 py-0.5 bg-[#6c5ce7]/5 rounded text-[9px] text-[#6c5ce7]">自定义</span>}
                    <span className="text-sm font-medium text-[#1a1a2e]">{p.title}</span>
                  </div>
                  <div className="text-[10px] text-[#9a9ab0] mt-0.5 truncate">{p.desc}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => copyPrompt(p.id, p.prompt)} className="px-2 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">
                    {copied === p.id ? '已复制' : '复制'}
                  </button>
                  {!p.builtin && (
                    <>
                      <button onClick={() => { setEditing(p); setForm({ title: p.title, desc: p.desc, tag: p.tag, tagColor: p.tagColor, prompt: p.prompt }) }} className="px-2 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px]">编辑</button>
                      <button onClick={() => deleteCustom(p.id)} className="px-2 py-1 bg-[#e17055]/5 text-[#e17055] rounded text-[9px]">删除</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-8 text-[#9a9ab0] text-sm">没有匹配的模板</div>}
        </div>
      </div>
    </div>
  )
}
