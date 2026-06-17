import { useState } from 'react'
import { ToolPageLayout, useToolStream } from './ToolPage'

interface Props { sessionId: string }

const PAGE_TYPES = [
  { value: 'landing', label: '落地页 / Landing Page' },
  { value: 'dashboard', label: '数据看板 / Dashboard' },
  { value: 'mobile', label: '移动端页面 / App' },
  { value: 'form', label: '表单页 / Form' },
  { value: 'list', label: '列表页 / List' },
  { value: 'detail', label: '详情页 / Detail' },
  { value: 'settings', label: '设置页 / Settings' },
  { value: 'custom', label: '自定义类型...' },
]

const STYLES = [
  { value: 'dark-tech', label: '暗色科技感' },
  { value: 'clean-minimal', label: '清新极简' },
  { value: 'glassmorphism', label: '玻璃拟态' },
  { value: 'warm-organic', label: '温暖有机' },
  { value: 'bold-brutalist', label: '粗野主义' },
  { value: 'luxury', label: '奢华精致' },
  { value: 'custom', label: '自定义风格...' },
]

export function PrototypePage({ sessionId }: Props) {
  const [form, setForm] = useState({ pageType: 'landing', pageTypeCustom: '', desc: '', style: 'dark-tech', styleCustom: '', outputFormat: 'html' })
  const { output, streaming, generate, stop } = useToolStream(sessionId, 'protoOutput')
  const [previewTab, setPreviewTab] = useState<'code' | 'preview'>('code')

  const handleGenerate = () => {
    const pageTypeLabel = form.pageType === 'custom' ? (form.pageTypeCustom || '自定义页面') : PAGE_TYPES.find(t => t.value === form.pageType)?.label
    const styleLabel = form.style === 'custom' ? (form.styleCustom || '自定义风格') : STYLES.find(s => s.value === form.style)?.label

    let systemPrompt: string
    let userPrompt: string

    if (form.outputFormat === 'html') {
      systemPrompt = '你是一位资深UI/UX设计师和前端开发者。请生成完整的、可独立运行的HTML页面代码。使用内联CSS（放在<style>标签中），不依赖任何外部框架或CDN（除非是Google Fonts）。代码必须美观、现代、功能完整，可以直接在浏览器中打开。输出纯净的HTML代码，不要放在markdown代码块中。'
      userPrompt = `请设计一个${pageTypeLabel}，设计风格：${styleLabel}。\n\n页面需求描述：${form.desc || '未提供详细信息，请根据页面类型自行设计一个典型的示例页面。'}\n\n要求：\n1. 使用Google Fonts中的合适字体\n2. 包含完整的HTML结构（<!DOCTYPE html>到</html>）\n3. 响应式设计，适配桌面和移动端\n4. 添加适当的微交互和动画效果\n5. 代码中需要包含实际内容，不要使用Lorem ipsum占位\n6. 确保所有交互元素在视觉上有明确的反馈`
    } else {
      systemPrompt = '你是一位资深交互设计师。请生成详细的交互描述文档。使用Markdown格式。'
      userPrompt = `请为以下页面生成详细的交互描述文档：\n\n页面类型：${pageTypeLabel}\n设计风格：${styleLabel}\n页面需求：${form.desc || '未提供'}\n\n请包含：\n1. 页面布局结构（ASCII线框或文字描述）\n2. 所有交互元素的行为定义（hover/click/focus状态）\n3. 动画和过渡效果描述\n4. 响应式适配方案（手机/平板/桌面）\n5. 可访问性考虑`
    }
    generate(systemPrompt, userPrompt)
  }

  // Extract HTML from output
  const extractHtml = (text: string): string => {
    const match = text.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i)
    return match ? match[0] : text
  }

  return (
    <ToolPageLayout title="原型设计助手" subtitle="描述页面需求，AI 输出可运行的 HTML 原型代码，支持实时预览" onGenerate={handleGenerate} streaming={streaming} output={output} outputLabel="原型" onStop={stop} sessionId={sessionId}>
      <div>
        <label className="text-[10px] font-medium text-[#4a4a6a]">页面类型</label>
        <select value={form.pageType} onChange={e => setForm({ ...form, pageType: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          {PAGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {form.pageType === 'custom' && <input value={form.pageTypeCustom} onChange={e => setForm({ ...form, pageTypeCustom: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]" placeholder="输入自定义页面类型..." />}
      </div>
      <div>
        <label className="text-[10px] font-medium text-[#4a4a6a]">页面功能描述 *</label>
        <textarea value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} rows={4} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="详细描述这个页面需要展示什么内容、完成什么任务..." />
      </div>
      <div>
        <label className="text-[10px] font-medium text-[#4a4a6a]">设计风格</label>
        <select value={form.style} onChange={e => setForm({ ...form, style: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {form.style === 'custom' && <input value={form.styleCustom} onChange={e => setForm({ ...form, styleCustom: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]" placeholder="输入自定义设计风格..." />}
      </div>
      <div>
        <label className="text-[10px] font-medium text-[#4a4a6a]">输出格式</label>
        <select value={form.outputFormat} onChange={e => setForm({ ...form, outputFormat: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          <option value="html">可运行 HTML/CSS 代码（可预览）</option>
          <option value="desc">详细交互描述文档</option>
        </select>
      </div>
      {/* Preview tabs (only for HTML output) */}
      {output && form.outputFormat === 'html' && !streaming && (
        <div className="flex gap-1">
          <button onClick={() => setPreviewTab('code')} className={`px-2 py-1 text-[9px] rounded ${previewTab === 'code' ? 'bg-[#6c5ce7] text-white' : 'bg-[#f0f0f5] text-[#4a4a6a]'}`}>代码</button>
          <button onClick={() => setPreviewTab('preview')} className={`px-2 py-1 text-[9px] rounded ${previewTab === 'preview' ? 'bg-[#6c5ce7] text-white' : 'bg-[#f0f0f5] text-[#4a4a6a]'}`}>预览</button>
        </div>
      )}
      {/* HTML Preview */}
      {output && form.outputFormat === 'html' && previewTab === 'preview' && !streaming && (
        <div className="flex-1 min-h-0 border border-[#e5e6eb] rounded-lg overflow-hidden bg-white">
          <iframe srcDoc={extractHtml(output)} className="w-full h-full min-h-[300px]" sandbox="allow-scripts allow-same-origin" />
        </div>
      )}
    </ToolPageLayout>
  )
}
