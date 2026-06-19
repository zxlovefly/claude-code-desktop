import React, { useState, useRef, useEffect, useCallback, memo } from 'react'
import { ThinkingDots, BrainWave, GearSpin } from '../Icons'
import type { NavPage } from '../Sidebar/LeftNav'
import { useHistoryStore, type ToolHistoryEntry } from '../../stores/historyStore'
import { ConfirmDialog } from '../ConfirmDialog'

export type OutputFormat = 'md' | 'docx' | 'pdf' | 'html'

// ── Skill auto-loading ──

interface SkillInfo { name: string; description: string; content: string; path: string }

let cachedSkills: SkillInfo[] | null = null

/** Load all skills from ~/.claude/skills/ (cached) */
export async function loadAllSkills(): Promise<SkillInfo[]> {
  if (cachedSkills) return cachedSkills
  try {
    const result: any = await window.electron.invoke('skill:load-all')
    if (result?.success && Array.isArray(result.skills)) {
      cachedSkills = result.skills
      return cachedSkills
    }
  } catch {}
  return []
}

/** Get relevant skill names for a given page type */
function getRelevantSkills(pageType: string): string[] {
  switch (pageType) {
    case 'prd':
      return ['pmaster', 'competitive-product-research', 'hot', 'kdocs-skill']
    case 'analysis':
      return ['competitive-product-research', 'pmaster', 'hot']
    case 'prototype':
      return ['pmaster', 'hot']
    default:
      return []
  }
}

/** Build skill-enhanced system prompt for a given page type */
export async function buildSkillPrompt(pageType: string, baseSystemPrompt: string): Promise<string> {
  const skills = await loadAllSkills()
  const relevantNames = getRelevantSkills(pageType)
  const matched = skills.filter(s => relevantNames.includes(s.name))

  if (matched.length === 0) return baseSystemPrompt

  const skillPrompts = matched.map(s => `## Skill: ${s.name}\n${s.content}`).join('\n\n---\n\n')
  return `${baseSystemPrompt}\n\n---\n\n【以下为自动加载的产品技能指导】\n\n${skillPrompts}`
}

interface ToolPageProps {
  title: string
  subtitle: string
  children: React.ReactNode
  onGenerate: () => void
  streaming: boolean
  output: string
  outputLabel?: string
  outputFormat?: OutputFormat
  outputFormats?: OutputFormat[]
  onStop: () => void
  sessionId: string
  previewContent?: React.ReactNode
  activeTab?: 'source' | 'preview'
  onTabChange?: (tab: 'source' | 'preview') => void
  showTabs?: boolean
  onRefine?: (feedback: string) => void
  onLoadContent?: (content: string) => void
  pageType: NavPage
  onNavigateToPage?: (page: NavPage) => void
  /** User's project description — used as the history display title instead of the generic page title */
  historyTitle?: string
  /** Called when user clicks "新建" in history panel — reset form to blank */
  onNewTask?: () => void
  /** Called when user clicks a history entry — restore form fields with original data */
  onRestoreForm?: (entry: ToolHistoryEntry) => void
  /** Current form data to save alongside history for later restoration */
  formData?: Record<string, string>
}

const PAGE_LABELS: Record<string, string> = {
  prd: 'PRD 撰写',
  analysis: '竞品分析',
  prototype: '原型设计',
}

export function ToolPageLayout({ title, subtitle, children, onGenerate, streaming, output, outputLabel, outputFormat = 'md', outputFormats = ['md', 'docx', 'pdf'], onStop, sessionId, previewContent, activeTab = 'source', onTabChange, showTabs = false, onRefine, onLoadContent, pageType, onNavigateToPage, historyTitle, onNewTask, onRestoreForm, formData }: ToolPageProps) {
  // ── History store (unified) ──
  const toolHistory = useHistoryStore(s => s.toolHistory)
  const loadToolHistory = useHistoryStore(s => s.loadToolHistory)
  const addToolEntry = useHistoryStore(s => s.addToolEntry)
  const upsertToolEntry = useHistoryStore(s => s.upsertToolEntry)
  const deleteToolEntries = useHistoryStore(s => s.deleteToolEntries)
  const pendingLoad = useHistoryStore(s => s.pendingLoad)
  const setPendingLoad = useHistoryStore(s => s.setPendingLoad)

  const [showHistory, setShowHistory] = useState(false)
  const [historySelectMode, setHistorySelectMode] = useState(false)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set())
  const [confirmHistoryDelete, setConfirmHistoryDelete] = useState<{ ids: string[]; single: boolean } | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [refining, setRefining] = useState(false)
  const [loadedFromHistory, setLoadedFromHistory] = useState(false)
  const animIndexRef = useRef(0)
  const [, setAnimTick] = useState(0)
  const savedRef = useRef(false)
  const activeHistoryIdRef = useRef<string | null>(null) // track active entry so refine updates it

  // ── Check for pending cross-page history load (zustand store — survives React strict mode) ──
  useEffect(() => {
    if (pendingLoad && pendingLoad.pageType === pageType) {
      const content = pendingLoad.content
      setPendingLoad(null)
      setLoadedFromHistory(true)
      savedRef.current = true
      onLoadContent?.(content)
    }
  }, [pendingLoad, pageType])

  // Cycle animations while streaming
  useEffect(() => {
    if (!streaming && !refining) return
    const timer = setInterval(() => {
      animIndexRef.current = (animIndexRef.current + 1) % 3
      setAnimTick(animIndexRef.current)
    }, 4000)
    return () => clearInterval(timer)
  }, [streaming, refining])

  const anims = [<ThinkingDots />, <BrainWave />, <GearSpin />]
  const currentAnim = anims[animIndexRef.current % 3]
  const wasStreamingRef = useRef(false) // guards auto-save: only save when generation actually completed

  // Track streaming transitions — auto-save should only fire after a real generation
  useEffect(() => {
    if (streaming || refining) wasStreamingRef.current = true
  }, [streaming, refining])

  // Save to history when output completes (only if freshly generated, not loaded from history)
  useEffect(() => {
    if (output && !streaming && !refining && !loadedFromHistory && !savedRef.current && wasStreamingRef.current) {
      savedRef.current = true
      wasStreamingRef.current = false
      // Reuse the active entry ID if this is a refinement (same session, same page)
      // so the original history entry gets updated instead of creating a duplicate.
      const entryId = activeHistoryIdRef.current || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
      activeHistoryIdRef.current = entryId
      // For HTML outputs, strip non-HTML prefix/suffix before saving
      const cleanContent = outputFormat === 'html' ? stripNonHtml(output) : output
      const entry: ToolHistoryEntry = {
        id: entryId,
        pageType,
        title: historyTitle || title,
        label: outputLabel || 'output',
        content: cleanContent,
        format: outputFormat,
        timestamp: Date.now(),
        formData: formData || undefined,
      }
      upsertToolEntry(entry)
    }
  }, [output, streaming, refining, loadedFromHistory])

  // Reset flags when new generation starts
  useEffect(() => {
    if (streaming) { savedRef.current = false; setLoadedFromHistory(false) }
  }, [streaming])

  // ── History actions ──

  const toggleHistorySelect = (id: string) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const deleteSelectedHistory = () => {
    if (selectedHistoryIds.size === 0) return
    setConfirmHistoryDelete({ ids: Array.from(selectedHistoryIds), single: false })
  }

  const deleteHistoryEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmHistoryDelete({ ids: [id], single: true })
  }

  const executeHistoryDelete = () => {
    if (!confirmHistoryDelete) return
    deleteToolEntries(confirmHistoryDelete.ids)
    const deletedIds = confirmHistoryDelete.ids
    setSelectedHistoryIds(new Set())
    setConfirmHistoryDelete(null)
    // If current page's entries were all deleted and there's output,
    // automatically save a fresh history entry so work isn't lost
    if (output && !streaming && !refining) {
      const remainingForPage = useHistoryStore.getState().toolHistory.filter(
        h => h.pageType === pageType && !deletedIds.includes(h.id)
      )
      if (remainingForPage.length === 0) {
        const cleanContent = outputFormat === 'html' ? stripNonHtml(output) : output
        const entry: ToolHistoryEntry = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          pageType,
          title: historyTitle || title,
          label: outputLabel || 'output',
          content: cleanContent,
          format: outputFormat,
          timestamp: Date.now(),
          formData: formData || undefined,
        }
        upsertToolEntry(entry)
        activeHistoryIdRef.current = entry.id
        savedRef.current = true
      }
    }
  }

  // ── Export actions ──

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanOutput).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleDownloadMd = () => {
    const blob = new Blob([cleanOutput], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title}-${Date.now()}.md`
    a.click()
  }

  const handleExportDocx = async () => {
    setExporting('docx'); setExportMsg(null)
    try {
      const result: any = await window.electron.invoke('export:docx', cleanOutput, `${title}-${Date.now()}.docx`)
      if (result?.success) { setExportMsg(`已保存: ${result.path}`); window.electron.invoke('file:open', result.path) }
      else setExportMsg(`导出失败: ${result?.error || '未知错误'}`)
    } catch (e: any) { setExportMsg(`导出失败: ${e.message}`) }
    setExporting(null); setTimeout(() => setExportMsg(null), 4000)
  }

  const handleExportPdf = async () => {
    setExporting('pdf'); setExportMsg(null)
    try {
      const result: any = await window.electron.invoke('export:pdf', cleanOutput, `${title}-${Date.now()}.pdf`)
      if (result?.success) { setExportMsg(`已保存: ${result.path}`); window.electron.invoke('file:open', result.path) }
      else setExportMsg(`导出失败: ${result?.error || '未知错误'}`)
    } catch (e: any) { setExportMsg(`导出失败: ${e.message}`) }
    setExporting(null); setTimeout(() => setExportMsg(null), 4000)
  }

  const handleOpenInBrowser = async () => {
    setExporting('browser'); setExportMsg(null)
    try {
      const result: any = await window.electron.invoke('export:open-html', cleanOutput)
      if (result?.success) setExportMsg('已在浏览器中打开')
      else setExportMsg(`打开失败: ${result?.error || '未知错误'}`)
    } catch (e: any) { setExportMsg(`打开失败: ${e.message}`) }
    setExporting(null); setTimeout(() => setExportMsg(null), 4000)
  }

  const handleLoadHistory = (entry: ToolHistoryEntry) => {
    setShowHistory(false)
    setLoadedFromHistory(true)
    savedRef.current = true
    onLoadContent?.(entry.content)
    onRestoreForm?.(entry)
  }

  const handleSendFeedback = (text: string) => {
    if (!text || !onRefine) return
    setRefining(true)
    savedRef.current = false
    onRefine(text)
  }

  useEffect(() => {
    if (!streaming && refining) setRefining(false)
  }, [streaming, refining])

  const isHtmlOutput = outputFormat === 'html'
  const cleanOutput = isHtmlOutput ? stripNonHtml(output) : output
  const showFeedback = output && !streaming && !refining && onRefine

  // ── Filter history by current page type ──
  const filteredHistory = toolHistory.filter(h => h.pageType === pageType)
  const pageLabel = PAGE_LABELS[pageType] || pageType

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a2e]">{title}</h2>
            <p className="text-[10px] text-[#9a9ab0] mt-0.5">{subtitle}</p>
          </div>
          {/* Header actions — "+ 新建" standalone (like chat), plus history button */}
          <div className="flex items-center gap-2">
            {onNewTask && (
              <button
                onClick={() => { activeHistoryIdRef.current = null; onNewTask() }}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-[#9a9ab0] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] transition-all"
                title="新建任务"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}
            {/* History button */}
            <div className="relative">
              <button
                onClick={() => { setShowHistory(!showHistory); loadToolHistory(); setHistorySelectMode(false); setSelectedHistoryIds(new Set()) }}
                className="text-[9px] text-[#6c5ce7] hover:text-[#5a4bd1] flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                历史记录 ({filteredHistory.length})
              </button>
              {showHistory && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => { setShowHistory(false); setHistorySelectMode(false) }} />
                  <div className="absolute right-0 top-full mt-1 w-84 bg-white border border-[#e5e6eb] rounded-lg shadow-lg z-20 max-h-80 overflow-hidden flex flex-col">
                    {/* History toolbar */}
                    <div className="px-3 py-1.5 border-b border-[#e5e6eb] flex items-center justify-between sticky top-0 bg-white">
                      <span className="text-[9px] text-[#9a9ab0] uppercase font-medium">{pageLabel} 历史 — 点击加载</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setHistorySelectMode(!historySelectMode); setSelectedHistoryIds(new Set()) }}
                          className={`text-[8px] px-1.5 py-0.5 rounded transition-colors ${historySelectMode ? 'bg-[#6c5ce7]/10 text-[#6c5ce7]' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}
                        >
                          {historySelectMode ? '取消' : '选择'}
                        </button>
                        {historySelectMode && selectedHistoryIds.size > 0 && (
                          <button onClick={deleteSelectedHistory}
                            className="text-[8px] px-1.5 py-0.5 rounded bg-[#e17055]/10 text-[#e17055] hover:bg-[#e17055]/20"
                          >
                            删除({selectedHistoryIds.size})
                          </button>
                        )}
                      </div>
                    </div>
                  {/* History list — filtered by current page type only */}
                  <div className="overflow-y-auto max-h-64 custom-scrollbar">
                    {filteredHistory.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[9px] text-[#9a9ab0]">暂无 {pageLabel} 历史记录</div>
                    ) : (
                      filteredHistory.map(h => (
                          <div key={h.id}
                            onClick={() => {
                              if (historySelectMode) { toggleHistorySelect(h.id); return }
                              handleLoadHistory(h)
                            }}
                            className={`px-3 py-2 text-xs border-b border-[#e5e6eb]/30 cursor-pointer transition-colors flex items-center gap-2 ${selectedHistoryIds.has(h.id) ? 'bg-[#6c5ce7]/5' : 'hover:bg-[#f0f0f5]'}`}
                          >
                            {historySelectMode && (
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedHistoryIds.has(h.id) ? 'bg-[#6c5ce7] border-[#6c5ce7]' : 'border-[#d0d0d8]'}`}>
                                {selectedHistoryIds.has(h.id) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[#1a1a2e] truncate">{h.title}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[7px] px-1 py-0.5 rounded font-medium flex-shrink-0 bg-[#6c5ce7]/10 text-[#6c5ce7]">{pageLabel}</span>
                                <span className="text-[9px] text-[#9a9ab0]">
                                  {new Date(h.timestamp).toLocaleString()} · {h.format.toUpperCase()} · {(h.content.length / 1000).toFixed(0)}KB
                                </span>
                              </div>
                            </div>
                            {!historySelectMode && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(h.content) }}
                                  className="text-[9px] text-[#6c5ce7] hover:underline flex-shrink-0" title="复制">复制</button>
                                <button onClick={(e) => deleteHistoryEntry(h.id, e)}
                                  className="text-[9px] text-[#b0b0c0] hover:text-[#e17055] flex-shrink-0" title="删除">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left form panel */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-[#e5e6eb] p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
          {children}
          <button
            onClick={streaming ? onStop : onGenerate}
            className={`w-full py-2.5 rounded-xl text-xs font-medium transition-all mt-auto ${streaming
              ? 'bg-[#e17055]/10 text-[#e17055] border border-[#e17055]/20 hover:bg-[#e17055]/20'
              : 'bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] shadow-sm'}`}
          >
            {streaming ? '停止生成' : `生成${outputLabel || ''}`}
          </button>
        </div>

        {/* Right output panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-[#e5e6eb] gap-2">
            <span className="text-[10px] font-medium text-[#4a4a6a]">{outputLabel || '输出'}</span>
            {showTabs && output && !streaming && !refining && (
              <div className="flex gap-0.5 bg-[#f0f0f5] rounded-lg p-0.5">
                <button onClick={() => onTabChange?.('source')} className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${activeTab === 'source' ? 'bg-white text-[#6c5ce7] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>源码</button>
                <button onClick={() => onTabChange?.('preview')} className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${activeTab === 'preview' ? 'bg-white text-[#6c5ce7] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>预览</button>
              </div>
            )}
            {output && !streaming && !refining && (
              <div className="flex gap-1 items-center">
                <button onClick={handleCopy} className="px-1.5 py-0.5 text-[9px] text-[#4a4a6a] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] rounded transition-colors">{copied ? '✓ 已复制' : '复制'}</button>
                {isHtmlOutput && (
                  <button onClick={handleOpenInBrowser} disabled={exporting === 'browser'} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${exporting === 'browser' ? 'bg-[#f0f0f5] text-[#9a9ab0]' : 'bg-[#e8f4fd] text-[#0984e3] hover:bg-[#d6ecfb]'}`}>{exporting === 'browser' ? '...' : '浏览器'}</button>
                )}
                {outputFormats.includes('md') && (
                  <button onClick={handleDownloadMd} className="px-1.5 py-0.5 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">.md</button>
                )}
                {outputFormats.includes('docx') && (
                  <button onClick={handleExportDocx} disabled={exporting === 'docx'} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${exporting === 'docx' ? 'bg-[#f0f0f5] text-[#9a9ab0]' : 'bg-[#e8f4fd] text-[#0984e3] hover:bg-[#d6ecfb]'}`}>{exporting === 'docx' ? '...' : '.docx'}</button>
                )}
                {outputFormats.includes('pdf') && (
                  <button onClick={handleExportPdf} disabled={exporting === 'pdf'} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${exporting === 'pdf' ? 'bg-[#f0f0f5] text-[#9a9ab0]' : 'bg-[#fef3e4] text-[#e17055] hover:bg-[#fde8d4]'}`}>{exporting === 'pdf' ? '...' : '.pdf'}</button>
                )}
              </div>
            )}
          </div>
          {exportMsg && (
            <div className="px-4 py-1.5 bg-[#f0fdf4] border-b border-[#bbf7d0] text-[10px] text-[#166534] flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {exportMsg}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {showTabs && activeTab === 'preview' && previewContent ? (
              <div className="flex-1 w-full">{previewContent}</div>
            ) : output ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="bg-white border border-[#e5e6eb] rounded-xl p-4">
                  {/* For HTML output: show clean escaped source; markdown rendering for non-HTML */}
                  {isHtmlOutput ? (
                    <pre className="text-[10px] text-[#1a1a2e] font-mono leading-relaxed whitespace-pre-wrap break-all overflow-x-auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }} dangerouslySetInnerHTML={{ __html: escapeHtml(stripNonHtml(output)) }} />
                  ) : (
                    <div className="text-xs text-[#1a1a2e] whitespace-pre-wrap font-mono leading-relaxed markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }} />
                  )}
                  {(streaming || refining) && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#e5e6eb]/50">
                      <ThinkingDots width={32} height={12} />
                      <span className="text-[9px] text-[#9a9ab0]">{refining ? 'AI 正在优化内容...' : 'AI 正在生成内容...'}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : streaming || refining ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/60 border border-[#e5e6eb]/50">
                  {currentAnim}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-[#6c5ce7]">{refining ? 'AI 正在优化中' : 'AI 正在思考中'}</span>
                    <span className="text-[9px] text-[#9a9ab0]">
                      {animIndexRef.current === 0 ? (refining ? '理解反馈需求...' : '分析需求中...') : animIndexRef.current === 1 ? (refining ? '调整方案中...' : '整理思路中...') : (refining ? '美化优化中...' : '生成内容中...')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[#9a9ab0] gap-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <p className="text-xs">填写左侧参数后，点击生成按钮</p>
                {toolHistory.length > 0 && <p className="text-[9px] text-[#b0b0c0]">或从右上角历史记录中点击查看之前的生成结果</p>}
              </div>
            )}
            {showFeedback && <RefineBar onSend={handleSendFeedback} />}
          </div>
        </div>
      </div>

      {/* Delete history confirmation */}
      <ConfirmDialog
        open={confirmHistoryDelete !== null}
        title="确认删除"
        message={confirmHistoryDelete?.single
          ? '确定要删除这条历史记录吗？此操作不可撤销。'
          : `确定要删除选中的 ${confirmHistoryDelete?.ids.length} 条历史记录吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={executeHistoryDelete}
        onCancel={() => setConfirmHistoryDelete(null)}
      />
    </div>
  )
}

function stripNonHtml(text: string): string {
  // Extract the full HTML document — robust against surrounding noise
  // 1. Try standard <!DOCTYPE html> ... </html>
  let match = text.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*?<\/html>/i)
  if (match) return match[0]
  // 2. Fallback: <html> ... </html> (without doctype)
  match = text.match(/<html[\s>][\s\S]*?<\/html>/i)
  if (match) return match[0]
  // 3. Fallback: content inside markdown code fences, then extract HTML from it
  const codeBlockMatch = text.match(/```(?:html|HTML)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    const inner = codeBlockMatch[1]
    const innerMatch = inner.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*?<\/html>/i) || inner.match(/<html[\s>][\s\S]*?<\/html>/i)
    if (innerMatch) return innerMatch[0]
  }
  // 4. Final fallback: return as-is
  return text
}

/** Return any "extra" text surrounding the HTML document (before doctype / after </html>) */
function getHtmlSurrounding(text: string): { prefix: string; suffix: string } | null {
  const match = text.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*?<\/html>/i) || text.match(/<html[\s>][\s\S]*?<\/html>/i)
  if (!match || match.index === undefined) return null
  const prefix = text.slice(0, match.index).trim()
  const suffix = text.slice(match.index! + match[0].length).trim()
  if (!prefix && !suffix) return null
  return { prefix, suffix }
}

export function extractHtml(text: string): string {
  return stripNonHtml(text)
}

/** Simple HTML escape for displaying source code (preserves whitespace) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-[#1a1a2e] mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-[#1a1a2e] mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-[#1a1a2e] mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-[#f0f0f5] px-1 rounded text-[#6c5ce7] text-[10px]">$1</code>')
    .replace(/^---$/gm, '<hr class="my-2 border-[#e5e6eb]" />')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-[#4a4a6a]">• $1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-[#4a4a6a]">$1. $2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
  return html
}

// Hook for persisting form state across page navigation (so form fields survive unmount)
export function usePersistedForm<T>(storageKey: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const initialRef = useRef(initialValue)

  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`zxcode-form-${storageKey}`)
      return saved ? JSON.parse(saved) : initialRef.current
    } catch { return initialRef.current }
  })

  // Debounced persistence — write on change
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(`zxcode-form-${storageKey}`, JSON.stringify(value)) } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [value, storageKey])

  // Immediate reset — clears form AND localStorage synchronously so that
  // switching pages doesn't restore the old form from localStorage later.
  const resetForm = useCallback(() => {
    setValue(initialRef.current)
    try { localStorage.setItem(`zxcode-form-${storageKey}`, JSON.stringify(initialRef.current)) } catch {}
  }, [storageKey])

  return [value, setValue, resetForm]
}

// Hook for tool page streaming
export function useToolStream(sessionId: string, persistKey?: string, pageType?: string) {
  const [output, setOutput] = useState(() => {
    // Restore persisted output on mount (survives page navigation)
    if (!persistKey) return ''
    try {
      const saved = localStorage.getItem('zxcode-tool-outputs')
      if (saved) {
        const data = JSON.parse(saved)
        const restored = data.state?.[persistKey] || ''
        outputRef.current = restored
        return restored
      }
    } catch {}
    return ''
  })
  const [streaming, setStreaming] = useState(() => {
    // Check if this session is still streaming
    if (!persistKey) return false
    try {
      const active = localStorage.getItem('zxcode-tool-streaming')
      return active === sessionId
    } catch { return false }
  })
  const unsubRef = useRef<(() => void)[]>([])
  const outputRef = useRef(output)
  const mountedRef = useRef(true)

  // ── Append a delta to localStorage (shared pattern — matches global listener) ──
  const appendToStore = (text: string) => {
    if (!persistKey) return
    try {
      const saved = localStorage.getItem('zxcode-tool-outputs')
      const data = saved ? JSON.parse(saved) : { state: {} }
      if (!data.state) data.state = {}
      data.state[persistKey] = (data.state[persistKey] || '') + text
      localStorage.setItem('zxcode-tool-outputs', JSON.stringify(data))
    } catch {}
  }

  // ── Set output for a key in localStorage (replaces value — for clearing) ──
  const setInStore = (value: string) => {
    if (!persistKey) return
    try {
      const saved = localStorage.getItem('zxcode-tool-outputs')
      const data = saved ? JSON.parse(saved) : { state: {} }
      if (!data.state) data.state = {}
      data.state[persistKey] = value
      localStorage.setItem('zxcode-tool-outputs', JSON.stringify(data))
    } catch {}
  }

  useEffect(() => {
    unsubRef.current.forEach(fn => fn()); unsubRef.current = []
    mountedRef.current = true
    // Local listeners for live UI updates. Persistence to localStorage is handled
    // by global listeners in App.tsx (so output survives page navigation).
    unsubRef.current.push(window.electron.receive('chat:delta', (sId: unknown, text: unknown) => {
      if (sId !== sessionId) return
      const t = text as string
      setOutput(prev => {
        const next = prev + t
        outputRef.current = next
        return next
      })
      // NOTE: Do NOT append to localStorage here. The global listener in
      // App.tsx already persists every delta. Writing here too causes each
      // delta to be appended twice → doubled/corrupted content in localStorage
      // → garbled Chinese characters when content is restored after page switch.
    }))
    unsubRef.current.push(window.electron.receive('chat:done', (sId: unknown) => {
      if (sId !== sessionId) return
      setStreaming(false)
    }))
    unsubRef.current.push(window.electron.receive('chat:cancelled', (sId: unknown) => {
      if (sId !== sessionId) return
      setOutput(prev => { const next = prev + '\n\n*[已取消]*'; outputRef.current = next; return next })
      setStreaming(false)
    }))
    unsubRef.current.push(window.electron.receive('chat:error', (sId: unknown, message: unknown) => {
      if (sId !== sessionId) return
      setOutput(prev => { const next = prev + `\n\n**Error:** ${message}`; outputRef.current = next; return next })
      setStreaming(false)
    }))
    return () => { mountedRef.current = false; unsubRef.current.forEach(fn => fn()); unsubRef.current = [] }
  }, [sessionId, persistKey])

  // ── Sync output from localStorage on mount (catch deltas fired during remount) ──
  useEffect(() => {
    if (!persistKey) return
    const timer = setTimeout(() => {
      if (!mountedRef.current) return
      try {
        const saved = localStorage.getItem('zxcode-tool-outputs')
        if (saved) {
          const data = JSON.parse(saved)
          const stored = data.state?.[persistKey] || ''
          if (stored && stored !== outputRef.current && stored.length > (outputRef.current?.length || 0)) {
            outputRef.current = stored
            setOutput(stored)
          }
        }
      } catch {}
    }, 50)
    return () => clearTimeout(timer)
  }, [sessionId, persistKey])

  const generate = useCallback(async (systemPrompt: string, userMessage: string) => {
    setOutput(''); outputRef.current = ''; setStreaming(true)
    setInStore('')
    // Mark streaming active for this session (survives navigation)
    try { localStorage.setItem('zxcode-tool-streaming', sessionId) } catch {}
    const finalPrompt = pageType ? await buildSkillPrompt(pageType, systemPrompt) : systemPrompt
    window.electron.invoke('ai:generate', sessionId, finalPrompt, userMessage)
  }, [sessionId, persistKey, pageType])

  const refine = useCallback(async (currentOutput: string, feedback: string) => {
    setOutput(''); outputRef.current = ''; setStreaming(true)
    setInStore('')
    try { localStorage.setItem('zxcode-tool-streaming', sessionId) } catch {}
    const systemPrompt = '你是一位专业的AI助手。用户已经生成了一份内容，现在希望对它进行优化和修改。请根据用户的反馈要求，基于原始内容进行改进。保持完整的结构和格式。如果是HTML代码，请直接从 <!DOCTYPE html> 开始输出完整可运行的纯HTML，不要输出任何解释、总结或 markdown 代码块标记。如果不是HTML，请直接输出优化后的内容，同样不要加任何前言后记。'
    const finalPrompt = pageType ? await buildSkillPrompt(pageType, systemPrompt) : systemPrompt
    const userMessage = `【原始内容】\n${currentOutput}\n\n【用户优化要求】\n${feedback}\n\n请基于以上原始内容，按照优化要求进行修改和完善。直接输出优化后的完整内容，不要省略。`
    window.electron.invoke('ai:generate', sessionId, finalPrompt, userMessage)
  }, [sessionId, persistKey, pageType])

  const stop = useCallback(() => {
    window.electron.invoke('chat:cancel', sessionId)
  }, [sessionId])

  // Clear output (React state + localStorage) immediately — used by "新建任务"
  const clearOutput = useCallback(() => {
    setOutput('')
    outputRef.current = ''
    setInStore('')
    try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
  }, [persistKey])

  return { output, streaming, generate, stop, setOutput, clearOutput, refine }
}

// ── Memoized refine bar (isolated from parent re-renders for smooth typing) ──

const RefineBar = memo(function RefineBar({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  return (
    <div className="flex-shrink-0 border-t border-[#e5e6eb] bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl text-[#6c5ce7] bg-[#f0f0f5] border border-[#e5e6eb]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </div>
        <div className="flex-1 relative">
          <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="输入优化建议，如：把配色改为蓝色系、增加用户登录流程... (Enter 发送)"
            className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-xl px-4 py-2.5 text-sm text-[#1a1a2e] placeholder-[#9a9ab0] outline-none focus:border-[#6c5ce7] focus:shadow-[0_0_0_2px_rgba(108,92,231,0.1)] transition-all" />
        </div>
        <button onClick={handleSend} disabled={!text.trim()}
          className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
          title="发送优化建议 (Enter)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  )
})

// ── AI Polish Button (for description textareas) ──

interface PolishButtonProps {
  text: string
  onAccept: (polished: string) => void
  disabled?: boolean
  context?: { pageType?: string; projectType?: string }
}

export function PolishButton({ text, onAccept, disabled, context }: PolishButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const handlePolish = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setCollapsed(false)
    try {
      const polished = await window.electron.invoke('ai:polish-description', text, context) as string
      const trimmed = (polished || '').trim()
      if (trimmed && trimmed !== text.trim()) {
        setResult(trimmed)
      } else if (trimmed === text.trim()) {
        // Model decided the text is already good — not an error
        setError('')
        setResult(null)
        setCollapsed(true)
      } else {
        setError('润色未返回有效结果')
      }
    } catch (e: any) {
      setError(e.message || '润色失败，请稍后重试')
    }
    setLoading(false)
  }

  const handleAccept = () => {
    if (result) {
      onAccept(result)
      setResult(null)
    }
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={handlePolish}
        disabled={disabled || loading || !text.trim()}
        className={`text-[9px] flex items-center gap-1 px-2 py-0.5 rounded-md transition-all ${
          loading
            ? 'bg-[#f0f0f5] text-[#9a9ab0] cursor-wait'
            : 'bg-gradient-to-r from-[#e8f4fd] to-[#f0e6ff] text-[#6c5ce7] hover:from-[#d6ecfb] hover:to-[#e8d6ff] border border-[#d0c4f0]/30'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
            </svg>
            AI 润色中...
          </>
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            AI 润色
          </>
        )}
      </button>

      {error && (
        <div className="mt-1.5 px-2.5 py-1.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-[10px] text-[#dc2626] flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {error}
        </div>
      )}

      {result && (
        <div className={`mt-1.5 border border-[#c4b5e8]/40 rounded-lg overflow-hidden transition-all ${collapsed ? 'max-h-8' : 'max-h-96'}`}>
          <div className="flex items-center justify-between px-2.5 py-1 bg-gradient-to-r from-[#f5f0ff] to-[#f0f5ff] border-b border-[#e5dbf5]/50">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2" strokeLinecap="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span className="text-[9px] font-medium text-[#6c5ce7]">AI 润色建议</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCollapsed(!collapsed)}
                className="text-[9px] text-[#9a9ab0] hover:text-[#4a4a6a] px-1"
              >
                {collapsed ? '展开' : '收起'}
              </button>
              <button onClick={handleAccept}
                className="text-[9px] px-2 py-0.5 rounded bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] font-medium transition-colors"
              >
                采纳
              </button>
              <button onClick={() => setResult(null)}
                className="text-[9px] px-2 py-0.5 rounded text-[#9a9ab0] hover:text-[#e17055] hover:bg-[#fef2f2] transition-colors"
              >
                放弃
              </button>
            </div>
          </div>
          {!collapsed && (
            <div className="px-2.5 py-2 text-[10px] text-[#1a1a2e] leading-relaxed whitespace-pre-wrap bg-white max-h-48 overflow-y-auto">
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
