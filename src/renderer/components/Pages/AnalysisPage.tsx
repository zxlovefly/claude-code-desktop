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

export function AnalysisPage({ sessionId, onNavigateToPage }: Props) {
  const [form, setForm, resetForm] = usePersistedForm('analysis', { market: '', competitors: '', focus: '', mine: '', outputFormat: 'md' as OutputFormat })
  const { output, streaming, generate, stop, setOutput, clearOutput, refine } = useToolStream(sessionId, 'analysisOutput', 'analysis')

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
    const systemPrompt = '你是一位资深行业分析师兼产品战略顾问。请生成深度竞品分析报告。使用Markdown格式。'
    const userPrompt = `请对以下市场和竞品进行深度分析。\n\n【分析框架】\n# 1. 市场概况（TAM/SAM/SOM、增长率、关键趋势）\n# 2. 竞品矩阵（6 维度表格对比：产品定位|目标用户|核心功能|技术栈|商业模式|融资情况）\n# 3. 各竞品 SWOT 分析\n# 4. 波特五力分析（每项评分1-5+说明）\n# 5. 用户体验路径对比（获客→推荐全链路）\n# 6. 市场空白与机会点\n# 7. 战略建议\n\n---\n市场领域：${form.market || '未指定'}\n竞品列表：${form.competitors || '未指定'}\n分析重点：${form.focus || '通用分析'}\n我的产品想法：${form.mine || '未指定'}`
    generate(systemPrompt, userPrompt)
  }

  const handleRefine = (feedback: string) => {
    refine(output, feedback)
  }

  const formData: Record<string, string> = { market: form.market, competitors: form.competitors, focus: form.focus, mine: form.mine, outputFormat: form.outputFormat }

  return (
    <ToolPageLayout title="竞品深度分析" subtitle="描述市场领域与竞品，AI 快速生成多维度对比分析报告" onGenerate={handleGenerate} streaming={streaming} output={output} outputLabel="分析报告" outputFormat={form.outputFormat} outputFormats={['md', 'docx', 'pdf']} onStop={stop} sessionId={sessionId} onRefine={handleRefine} onLoadContent={setOutput} pageType="analysis" onNavigateToPage={onNavigateToPage} historyTitle={form.market || undefined} formData={formData} onNewTask={handleNewTask} onRestoreForm={handleRestoreForm}>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">输出格式</label>
        <select value={form.outputFormat} onChange={e => setForm({ ...form, outputFormat: e.target.value as OutputFormat })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          {OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">市场领域 *</label><input value={form.market} onChange={e => setForm({ ...form, market: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]" placeholder="例：AI 教育智能出题" /><PolishButton text={form.market} onAccept={(polished) => setForm({ ...form, market: polished })} disabled={streaming} /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">竞品名称（每行一个）*</label><textarea value={form.competitors} onChange={e => setForm({ ...form, competitors: e.target.value })} rows={4} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="猿题库&#10;好未来题库&#10;学而思AI课" /><PolishButton text={form.competitors} onAccept={(polished) => setForm({ ...form, competitors: polished })} disabled={streaming} /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">分析重点</label><textarea value={form.focus} onChange={e => setForm({ ...form, focus: e.target.value })} rows={2} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="产品定位、核心功能、商业模式" /><PolishButton text={form.focus} onAccept={(polished) => setForm({ ...form, focus: polished })} disabled={streaming} /></div>
      <div><label className="text-[10px] font-medium text-[#4a4a6a]">我的产品定位</label><textarea value={form.mine} onChange={e => setForm({ ...form, mine: e.target.value })} rows={2} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="简要描述你的产品想法或差异化方向" /><PolishButton text={form.mine} onAccept={(polished) => setForm({ ...form, mine: polished })} disabled={streaming} /></div>
    </ToolPageLayout>
  )
}
