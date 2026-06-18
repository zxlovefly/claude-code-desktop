import { useCallback } from 'react'
import { ToolPageLayout, useToolStream, usePersistedForm, PolishButton, type OutputFormat } from './ToolPage'
import type { ToolHistoryEntry } from '../../stores/historyStore'
import type { NavPage } from '../Sidebar/LeftNav'

interface Props { sessionId: string; onNavigateToPage: (page: NavPage) => void }

const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'docx', label: 'Word 文档 (.docx)' },
  { value: 'pdf', label: 'PDF 文档 (.pdf)' },
]

export function PrdPage({ sessionId, onNavigateToPage }: Props) {
  const [form, setForm, resetForm] = usePersistedForm('prd', { name: '', background: '', users: '', features: '', goals: '', extra: '', outputFormat: 'md' as OutputFormat })
  const { output, streaming, generate, stop, setOutput, clearOutput, refine } = useToolStream(sessionId, 'prdOutput', 'prd')

  const handleNewTask = useCallback(() => {
    resetForm()
    clearOutput()
  }, [resetForm, clearOutput])

  const handleRestoreForm = useCallback((entry: ToolHistoryEntry) => {
    if (entry.formData) {
      setForm(prev => ({ ...prev, ...entry.formData, outputFormat: (entry.formData?.outputFormat as OutputFormat) || prev.outputFormat }))
    }
  }, [])

  const handleGenerate = () => {
    const systemPrompt = '你是一位有10年经验的资深AI产品经理。请生成可开发级PRD文档。使用Markdown格式，结构完整，不省略任何章节。'
    const userPrompt = `请根据以下项目信息，生成一份可直接指导开发团队的PRD文档。\n\n【输出结构 - 严格按此输出，不得省略】\n\n# 1. 产品概述\n- 产品定位与核心价值主张\n- 目标用户画像（含用户分层、典型使用场景）\n- 北极星指标 + 关键过程指标（OKR 形式）\n\n# 2. 功能需求\n## 2.1 功能清单（表格：P0/P1/P2 | 功能名 | 描述 | 验收标准）\n## 2.2 核心功能详细说明\n  - 用户故事（As a / I want / So that）\n  - 详细业务规则（覆盖所有边界情况）\n  - 交互流程（状态流转）\n  - 异常处理\n\n# 3. 非功能需求（性能、安全、兼容性）\n# 4. 数据埋点方案（表格）\n# 5. 灰度与上线策略\n# 6. 排期建议（里程碑表格）\n# 7. 风险评估\n\n---\n项目名称：${form.name || '未指定'}\n项目背景：${form.background || '未指定'}\n目标用户：${form.users || '未指定'}\n核心功能：${form.features || '未指定'}\n商业目标：${form.goals || '未指定'}\n补充说明：${form.extra || '无'}`
    generate(systemPrompt, userPrompt)
  }

  const handleRefine = (feedback: string) => {
    refine(output, feedback)
  }

  const formData: Record<string, string> = { name: form.name, background: form.background, users: form.users, features: form.features, goals: form.goals, extra: form.extra, outputFormat: form.outputFormat }

  return (
    <ToolPageLayout title="PRD 智能撰写" subtitle="输入项目信息，AI 生成可直接指导开发的完整 PRD 文档" onGenerate={handleGenerate} streaming={streaming} output={output} outputLabel="PRD 文档" outputFormat={form.outputFormat} outputFormats={['md', 'docx', 'pdf']} onStop={stop} sessionId={sessionId} onRefine={handleRefine} onLoadContent={setOutput} pageType="prd" onNavigateToPage={onNavigateToPage} historyTitle={form.name || undefined} formData={formData} onNewTask={handleNewTask} onRestoreForm={handleRestoreForm}>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">输出格式</label>
        <select value={form.outputFormat} onChange={e => setForm({ ...form, outputFormat: e.target.value as OutputFormat })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          {OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">项目名称 *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]" placeholder="例：AI 简历优化助手" /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">项目背景</label><textarea value={form.background} onChange={e => setForm({ ...form, background: e.target.value })} rows={3} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="为什么要做这个产品？解决什么问题？" /><PolishButton text={form.background} onAccept={(polished) => setForm({ ...form, background: polished })} disabled={streaming} /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">目标用户</label><input value={form.users} onChange={e => setForm({ ...form, users: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]" placeholder="例：应届毕业生、初级职场人" /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">核心功能（每行一个）</label><textarea value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} rows={3} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="简历智能评分&#10;一键优化建议&#10;多模板导出" /><PolishButton text={form.features} onAccept={(polished) => setForm({ ...form, features: polished })} disabled={streaming} /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">商业目标</label><textarea value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} rows={2} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="例：上线3个月获得10万注册用户" /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">补充说明</label><textarea value={form.extra} onChange={e => setForm({ ...form, extra: e.target.value })} rows={2} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="技术约束、设计偏好等" /></div>
    </ToolPageLayout>
  )
}
