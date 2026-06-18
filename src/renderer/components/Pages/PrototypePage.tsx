import { useState, useCallback } from 'react'
import { ToolPageLayout, useToolStream, usePersistedForm, extractHtml, PolishButton, type OutputFormat } from './ToolPage'
import type { ToolHistoryEntry } from '../../stores/historyStore'
import type { NavPage } from '../Sidebar/LeftNav'

interface Props { sessionId: string; onNavigateToPage: (page: NavPage) => void }

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

const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'html', label: '可运行 HTML/CSS 代码（可预览）' },
  { value: 'md', label: '交互描述文档 (.md)' },
  { value: 'docx', label: 'Word 文档 (.docx)' },
  { value: 'pdf', label: 'PDF 文档 (.pdf)' },
]

// ── UI-UX-Pro-Max 设计系统 (based on nextlevelbuilder/ui-ux-pro-max-skill) ──
const UI_UX_PRO_MAX_PROMPT = `
【UI-UX-Pro-Max 设计系统 — 强制遵循每个规则】

## 1. 无障碍 & 可用性（最高优先级）
- 文本对比度 ≥ 4.5:1（正文）/ 3:1（大标题≥18px）
- 所有交互元素有可见的 focus 样式（2px 蓝色边框 outline）
- 所有 img 有 alt 属性；所有 icon-button 有 aria-label
- 支持 prefers-reduced-motion 媒体查询
- 所有可点击元素使用 cursor-pointer

## 2. 触摸 & 交互
- 最小触摸目标 44×44px
- 可点击元素间距 ≥ 8px
- 任何加载 >300ms 必须有 skeleton/spinner
- 空状态必须设计（不能空白），包含插图和引导文案

## 3. 性能
- 图片使用 WebP 格式 + lazy loading
- 使用 CSS containment 隔离渲染区域
- 为图片/视频预留空间防止 CLS (Cumulative Layout Shift)

## 4. 风格选择
- 严格匹配用户指定的设计风格
- 使用 SVG 图标（Heroicons/Lucide 风格），禁止 emoji 作为图标
- 禁止紫色-粉色渐变（AI 味典型特征）
- 避免无意义的装饰性不对称

## 5. 布局 & 响应式
- 移动优先设计，断点：375 / 768 / 1024 / 1440
- 禁止水平滚动
- 最大内容宽度不超过 1200px（居中）
- 使用 CSS Grid / Flexbox，避免固定 px 宽度容器

## 6. 字体 & 颜色
- 基础字号 16px，行高 1.5
- 小字不低于 12px
- 通过 <link> 加载 Google Fonts：标题字体有特色（Cormorant Garamond / Instrument Serif / Playfair Display），正文字体易读（DM Sans / Inter / Lora / Source Sans 3）
- 使用 CSS 自定义属性 (:root) 定义完整色板
- 使用语义化颜色令牌（--color-text / --color-bg / --color-primary 等）
- 禁止灰色文字在灰色背景上

## 7. 动画 & 微交互
- 过渡时长 150-300ms，使用 ease-out
- hover 状态始终有平滑过渡
- 禁止单纯装饰性的无限动画
- 入场动画使用 @keyframes 错落渐显
- 点击反馈：scale(0.97) + 颜色变化

## 8. 表单 & 反馈
- label 必须在输入框上方（不用 placeholder-only）
- 错误信息在对应字段旁边
- 禁用态使用 opacity-0.5 + cursor-not-allowed
- 提供即时输入验证反馈

## 9. 导航
- 返回行为可预测
- 底部导航 ≤ 5 项
- 当前页面在导航中明确高亮

## 10. 数据展示
- 表格有斑马条纹 + 悬停高亮
- 图表图例可交互
- 数字使用等宽字体 tabular-nums

## 绝对禁止：
❌ 紫色+粉色渐变（#6c5ce7 → #e17055 等）
❌ Emoji 图标（使用 SVG）
❌ 无意义的玻璃拟态/装饰动画
❌ 颜色作为唯一信息传达方式
❌ placeholder 替代 label
❌ 0ms 过渡的状态切换
❌ 灰色文字在灰色背景（#999 on #f5f5f5）
❌ 卡片无阴影或全是统一阴影
`

export function PrototypePage({ sessionId, onNavigateToPage }: Props) {
  const [form, setForm, resetForm] = usePersistedForm('prototype', { pageType: 'landing', pageTypeCustom: '', desc: '', style: 'dark-tech', styleCustom: '', outputFormat: 'html' as OutputFormat })
  const { output, streaming, generate, stop, setOutput, clearOutput, refine } = useToolStream(sessionId, 'protoOutput', 'prototype')
  const [activeTab, setActiveTab] = useState<'source' | 'preview'>('source')

  const handleNewTask = useCallback(() => {
    resetForm()
    clearOutput()
  }, [resetForm, clearOutput])

  const handleRestoreForm = useCallback((entry: ToolHistoryEntry) => {
    if (entry.formData) {
      setForm(prev => ({ ...prev, ...entry.formData, outputFormat: (entry.formData?.outputFormat as OutputFormat) || prev.outputFormat, pageType: entry.formData?.pageType || prev.pageType, style: entry.formData?.style || prev.style }))
    }
  }, [])

  const handleGenerate = () => {
    const pageTypeLabel = form.pageType === 'custom' ? (form.pageTypeCustom || '自定义页面') : PAGE_TYPES.find(t => t.value === form.pageType)?.label
    const styleLabel = form.style === 'custom' ? (form.styleCustom || '自定义风格') : STYLES.find(s => s.value === form.style)?.label

    let systemPrompt: string
    let userPrompt: string

    if (form.outputFormat === 'html') {
      systemPrompt = `你是一位世界级UI/UX设计师和前端开发专家，在 Apple、Stripe、Linear 等公司有丰富经验。请生成完整的、可独立运行的HTML页面代码。

${UI_UX_PRO_MAX_PROMPT}

使用内联CSS（放在<style>标签中），不依赖任何外部框架或CDN（Google Fonts除外）。代码必须美观、现代、功能完整，可以直接在浏览器中打开。

【极其重要】你的整个回复必须且只能是 HTML 代码本身。以 <!DOCTYPE html> 开头，以 </html> 结尾。不允许输出任何其他内容 — 不要打招呼、不要解释、不要总结、不要分析设计特点、不要 markdown 代码块标记。只输出纯 HTML。`
      userPrompt = `请设计一个${pageTypeLabel}，设计风格：${styleLabel}。

页面需求描述：${form.desc || '未提供详细信息，请根据页面类型自行设计一个典型的示例页面。'}

要求：
1. 通过 <link> 加载 Google Fonts 中的合适字体（标题用特色字体，正文用易读字体）
2. 包含完整的HTML结构（<!DOCTYPE html>到</html>）
3. 在 :root 中定义完整色板（语义化颜色令牌）
4. 响应式设计，断点 375/768/1024/1440，移动优先
5. 添加适当的微交互和动画（150-300ms ease-out过渡）
6. 代码中需要包含实际内容，不要使用Lorem ipsum占位
7. 所有交互元素在视觉上有明确的 hover/focus/active 反馈
8. 使用 SVG 图标，不要 emoji 图标
9. 禁止紫色-粉色渐变`
    } else {
      systemPrompt = '你是一位资深交互设计师。请生成详细的交互描述文档。使用Markdown格式。'
      userPrompt = `请为以下页面生成详细的交互描述文档：\n\n页面类型：${pageTypeLabel}\n设计风格：${styleLabel}\n页面需求：${form.desc || '未提供'}\n\n请包含：\n1. 页面布局结构（ASCII线框或文字描述）\n2. 所有交互元素的行为定义（hover/click/focus状态）\n3. 动画和过渡效果描述\n4. 响应式适配方案（手机/平板/桌面）\n5. 可访问性考虑`
    }
    generate(systemPrompt, userPrompt)
  }

  const handleRefine = (feedback: string) => {
    refine(output, feedback)
  }

  const showPreview = form.outputFormat === 'html' && output && !streaming
  const showSourceTab = form.outputFormat === 'html'

  // Clean HTML: extract only the valid HTML block for preview
  const cleanHtml = showPreview ? extractHtml(output) : ''

  const previewContent = showPreview ? (
    <iframe
      srcDoc={cleanHtml}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms"
      title="原型预览"
    />
  ) : null

  return (
    <ToolPageLayout
      title="原型设计助手"
      subtitle="描述页面需求，AI 输出专业级 HTML 原型代码（UI-UX-Pro-Max 设计系统驱动）"
      onGenerate={handleGenerate}
      streaming={streaming}
      output={output}
      outputLabel="原型"
      outputFormat={form.outputFormat}
      outputFormats={form.outputFormat === 'html' ? ['html', 'docx', 'pdf'] : ['md', 'docx', 'pdf']}
      onStop={stop}
      sessionId={sessionId}
      showTabs={showSourceTab}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      previewContent={previewContent}
      onRefine={handleRefine}
      onLoadContent={setOutput}
      pageType="prototype"
      onNavigateToPage={onNavigateToPage}
      historyTitle={form.desc || undefined}
      formData={{ pageType: form.pageType, pageTypeCustom: form.pageTypeCustom, desc: form.desc, style: form.style, styleCustom: form.styleCustom, outputFormat: form.outputFormat }}
      onNewTask={handleNewTask}
      onRestoreForm={handleRestoreForm}
    >
      <div>
        <label className="text-[10px] font-medium text-[#4a4a6a]">输出格式</label>
        <select value={form.outputFormat} onChange={e => setForm({ ...form, outputFormat: e.target.value as OutputFormat })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          {OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
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
        <PolishButton text={form.desc} onAccept={(polished) => setForm({ ...form, desc: polished })} disabled={streaming} />
      </div>
      <div>
        <label className="text-[10px] font-medium text-[#4a4a6a]">设计风格</label>
        <select value={form.style} onChange={e => setForm({ ...form, style: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]">
          {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {form.style === 'custom' && <input value={form.styleCustom} onChange={e => setForm({ ...form, styleCustom: e.target.value })} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs mt-1 outline-none focus:border-[#6c5ce7]" placeholder="输入自定义设计风格..." />}
      </div>
    </ToolPageLayout>
  )
}
