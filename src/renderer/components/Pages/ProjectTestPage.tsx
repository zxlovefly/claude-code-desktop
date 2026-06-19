import { useState, useRef, useEffect, useCallback, memo } from 'react'
import type { NavPage } from '../Sidebar/LeftNav'
import { PolishButton, usePersistedForm, loadAllSkills } from './ToolPage'
import { useHistoryStore, type ToolHistoryEntry } from '../../stores/historyStore'
import { ThinkingDots, BrainWave, GearSpin } from '../Icons'

// ── Types ──

interface Props {
  sessionId: string
  onNavigateToPage: (page: NavPage) => void
}

interface BackupInfo { name: string; path: string; createdAt: string }

type ToolFileType = 'code' | 'html' | 'md' | 'docx' | 'pdf' | 'image' | 'other'

interface ToolCallEntry {
  id: string; name: string; input: any; result: string
  filePath?: string; fileContent?: string; command?: string; fileType?: ToolFileType
}

interface IterationEntry {
  id: string; text: string; toolCalls: ToolCallEntry[]; timestamp: number
}

interface FileChange {
  filePath: string; fileName: string; action: 'read' | 'written'; content: string
  beforeContent?: string; iterationId: string; iterationLabel: string
  timestamp: number; toolId: string; fileType: ToolFileType
}

type OutputTab = 'source' | 'preview'

const PAGE_TYPE = 'project-test'
const ITERATIONS_KEY = 'zxcode-test-iterations'

// ── Module-level helpers ──

function formatTime(ts: number): string { return new Date(ts).toLocaleTimeString() }

function detectFileType(filePath: string): ToolFileType {
  const ext = (filePath || '').split('.').pop()?.toLowerCase() || ''
  if (['html', 'htm'].includes(ext)) return 'html'
  if (ext === 'md') return 'md'
  if (['docx', 'doc'].includes(ext)) return 'docx'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return 'image'
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp',
       'cs', 'rb', 'php', 'swift', 'kt', 'json', 'yaml', 'yml', 'xml', 'css',
       'scss', 'less', 'sql', 'sh', 'bat', 'ps1', 'toml', 'ini', 'cfg', 'env'].includes(ext)) return 'code'
  return 'other'
}

function parseToolInput(name: string, input: any): { filePath?: string; fileContent?: string; command?: string; fileType?: ToolFileType } {
  if (!input) return {}
  if (name === 'write_file' || name === 'read_file') {
    const fp = (input as any).file_path || (input as any).filePath || ''
    const content = name === 'write_file' ? ((input as any).content || '') : undefined
    return { filePath: fp, fileContent: content, fileType: detectFileType(fp) }
  }
  if (name === 'execute_command') return { command: (input as any).command || '' }
  if (name === 'list_directory') return { filePath: (input as any).path || '', fileType: 'other' }
  return {}
}

function extractHtmlContent(text: string): string | null {
  let m = text.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*?<\/html>/i)
  if (m) return m[0]
  m = text.match(/<html[\s>][\s\S]*?<\/html>/i)
  return m ? m[0] : null
}

function stripNonHtml(text: string): string {
  let m = text.match(/<!DOCTYPE\s+html[^>]*>[\s\S]*?<\/html>/i)
  if (m) return m[0]
  m = text.match(/<html[\s>][\s\S]*?<\/html>/i)
  if (m) return m[0]
  const cb = text.match(/```(?:html|HTML)?\s*([\s\S]*?)```/)
  if (cb && cb[1]) {
    const im = cb[1].match(/<!DOCTYPE\s+html[^>]*>[\s\S]*?<\/html>/i) || cb[1].match(/<html[\s>][\s\S]*?<\/html>/i)
    if (im) return im[0]
  }
  return text
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(text: string): string {
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  h = h.replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-[#1a1a2e] mt-3 mb-1">$1</h3>')
  h = h.replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-[#1a1a2e] mt-4 mb-2">$1</h2>')
  h = h.replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-[#1a1a2e] mt-4 mb-2">$1</h1>')
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>')
  h = h.replace(/`([^`]+)`/g, '<code class="bg-[#f0f0f5] px-1 rounded text-[#6c5ce7] text-[10px]">$1</code>')
  h = h.replace(/^---$/gm, '<hr class="my-2 border-[#e5e6eb]" />')
  h = h.replace(/^- (.+)$/gm, '<li class="ml-4 text-[#4a4a6a]">$1</li>')
  h = h.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-[#4a4a6a]">$1. $2</li>')
  h = h.replace(/\n\n/g, '<br/><br/>')
  h = h.replace(/\n/g, '<br/>')
  return h
}

// ── Simple syntax highlighter ──

function highlightCode(code: string, fileType: ToolFileType): string {
  let escaped = escapeHtml(code)

  // Determine language from file type
  const isWebLang = fileType === 'html'
  const isCss = fileType === 'code' && false // we don't know exact lang from fileType alone, handle as generic code

  // Highlight HTML tags
  escaped = escaped.replace(/(&lt;\/?)([\w-]+)([\s\S]*?)(\/?&gt;)/g,
    (_, pre, tag, attrs, end) =>
      `${pre}<span class="text-[#e17055]">${tag}</span>${highlightHtmlAttrs(attrs)}${end}`
  )
  // Highlight HTML comments
  escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g,
    '<span class="text-[#b0b0c0] italic">$1</span>'
  )

  // Highlight code comments: // ... and /* ... */
  escaped = escaped.replace(/(\/\/[^\n]*)/g, '<span class="text-[#b0b0c0] italic">$1</span>')
  escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-[#b0b0c0] italic">$1</span>')
  // Highlight Python/Ruby/Shell comments
  escaped = escaped.replace(/(^|\n)(\s*#[^\n]*)/g, '$1<span class="text-[#b0b0c0] italic">$2</span>')

  // Highlight strings (double + single quotes, backticks)
  escaped = escaped.replace(/(["`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="text-[#00b894]">$&</span>')
  escaped = escaped.replace(/(')(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="text-[#00b894]">$&</span>')

  // Highlight common keywords
  const keywords = [
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'class', 'extends', 'new', 'this', 'super', 'async', 'await', 'try', 'catch',
    'throw', 'finally', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of',
    'default', 'static', 'public', 'private', 'protected', 'readonly',
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'def', 'pass', 'raise', 'with', 'as', 'elif', 'lambda', 'yield',
    'package', 'interface', 'implements', 'abstract', 'final',
    'fn', 'struct', 'impl', 'enum', 'match', 'mut', 'ref', 'where',
    'func', 'defer', 'go', 'chan', 'map', 'range', 'select',
  ]
  const kwPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g')
  escaped = escaped.replace(kwPattern, '<span class="text-[#6c5ce7] font-medium">$1</span>')

  // Highlight numbers
  escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-[#e17055]">$1</span>')

  // Highlight CSS properties/values
  escaped = escaped.replace(/([\w-]+)(\s*:)/g, '<span class="text-[#0984e3]">$1</span>$2')
  escaped = escaped.replace(/:\s*([^;{}]+)/g, ': <span class="text-[#00b894]">$1</span>')

  return escaped
}

function highlightHtmlAttrs(attrs: string): string {
  return attrs
    .replace(/([\w-]+)=(&quot;|&apos;|")/g, '<span class="text-[#0984e3]">$1</span>=<span class="text-[#b0b0c0]">$2</span>')
    .replace(/(&quot;|&apos;|")[\s\S]*?\1/g, (m: string) => `<span class="text-[#00b894]">${m}</span>`)
}

// ── Simple line diff ──

interface DiffLine { type: 'same' | 'added' | 'removed'; text: string; lineNum?: number }

function computeDiff(before: string, after: string): { beforeLines: DiffLine[]; afterLines: DiffLine[] } {
  const bl = before.split('\n'); const al = after.split('\n')
  let pl = 0
  while (pl < bl.length && pl < al.length && bl[pl] === al[pl]) pl++
  let sl = 0
  while (sl < bl.length - pl && sl < al.length - pl && bl[bl.length - 1 - sl] === al[al.length - 1 - sl]) sl++
  const br: DiffLine[] = []; const ar: DiffLine[] = []
  for (let i = 0; i < pl; i++) { br.push({ type: 'same', text: bl[i], lineNum: i + 1 }); ar.push({ type: 'same', text: bl[i], lineNum: i + 1 }) }
  const bm = bl.slice(pl, bl.length - sl); const am = al.slice(pl, al.length - sl)
  for (const l of bm) br.push({ type: 'removed', text: l })
  for (const l of am) ar.push({ type: 'added', text: l })
  for (let i = bl.length - sl; i < bl.length; i++) { br.push({ type: 'same', text: bl[i], lineNum: i + 1 }); ar.push({ type: 'same', text: bl[i], lineNum: i + 1 }) }
  return { beforeLines: br, afterLines: ar }
}

// ── Skill auto-detection ──

interface SkillInfo { name: string; description: string; content: string; path: string }

function getRelevantSkillNames(projectType: string, extensions: string[]): string[] {
  const skills: string[] = []
  switch (projectType) {
    case 'web':
      skills.push('design-an-interface', 'prototype', 'pmaster')
      break
    case 'python':
      skills.push('diagnose', 'improve-codebase-architecture')
      break
    case 'node':
      skills.push('improve-codebase-architecture', 'diagnose')
      break
    case 'java': case 'go': case 'rust': case 'dotnet': case 'swift': case 'kotlin':
      skills.push('improve-codebase-architecture', 'diagnose')
      break
    case 'generic':
    default:
      skills.push('diagnose')
      break
  }
  // Always include qa and review for testing
  skills.push('qa', 'review')
  return skills
}

// ── File type icon ──

function FileTypeIcon({ fileType, size = 14 }: { fileType: ToolFileType; size?: number }) {
  const cls = "flex-shrink-0"
  switch (fileType) {
    case 'html': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e17055" strokeWidth="2" className={cls}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
    case 'md': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0984e3" strokeWidth="2" className={cls}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    case 'docx': case 'pdf': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e17055" strokeWidth="2" className={cls}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    case 'image': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#00b894" strokeWidth="2" className={cls}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    case 'code': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2" className={cls}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    default: return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9a9ab0" strokeWidth="2" className={cls}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  }
}

// ── Diff view component ──

const DiffView = memo(function DiffView({ before, after, collapsed: initialCollapsed = true }: { before: string; after: string; collapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const diff = computeDiff(before, after)
  const hasChanges = diff.beforeLines.some(l => l.type === 'removed') || diff.afterLines.some(l => l.type === 'added')
  if (!hasChanges) return <div className="text-[9px] text-[#9a9ab0] px-2 py-1">内容无变化</div>

  return (
    <div className="border border-[#e5e6eb] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f5f6f8] border-b border-[#e5e6eb]">
        <div className="flex items-center gap-2 text-[9px] font-medium">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#e17055] inline-block" /><span className="text-[#e17055]">修改前</span></span>
          <span className="text-[#9a9ab0]">→</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00b894] inline-block" /><span className="text-[#00b894]">修改后</span></span>
        </div>
        <button onClick={() => setCollapsed(!collapsed)} className="text-[9px] text-[#9a9ab0] hover:text-[#4a4a6a]">{collapsed ? '展开对比' : '收起'}</button>
      </div>
      {!collapsed && (
        <div className="flex divide-x divide-[#e5e6eb] max-h-96 overflow-y-auto">
          <div className="flex-1 min-w-0 bg-[#fef2f2]/30">
            {diff.beforeLines.map((l, i) => (
              <div key={i} className={`flex text-[9px] font-mono leading-relaxed ${l.type === 'removed' ? 'bg-[#fecaca]/40 text-[#991b1b]' : 'text-[#4a4a6a]'}`}>
                <span className="flex-shrink-0 w-8 text-right pr-2 text-[#b0b0c0] select-none">{l.lineNum}</span>
                <span className="flex-1 whitespace-pre-wrap pr-2">{l.type === 'removed' ? `- ${l.text}` : `  ${l.text}`}</span>
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0 bg-[#f0fdf4]/30">
            {diff.afterLines.map((l, i) => (
              <div key={i} className={`flex text-[9px] font-mono leading-relaxed ${l.type === 'added' ? 'bg-[#bbf7d0]/40 text-[#166534]' : 'text-[#4a4a6a]'}`}>
                <span className="flex-shrink-0 w-8 text-right pr-2 text-[#b0b0c0] select-none">{l.lineNum}</span>
                <span className="flex-1 whitespace-pre-wrap pr-2">{l.type === 'added' ? `+ ${l.text}` : `  ${l.text}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// ── Before/After preview component ──

const BeforeAfterPreview = memo(function BeforeAfterPreview({ beforeHtml, afterHtml }: { beforeHtml: string | null; afterHtml: string }) {
  const [showAfter, setShowAfter] = useState(true)
  const cleanBefore = beforeHtml ? (extractHtmlContent(beforeHtml) || beforeHtml) : null
  const cleanAfter = extractHtmlContent(afterHtml) || afterHtml

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {cleanBefore && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 bg-[#fafbfc] border-b border-[#e5e6eb]">
          <span className="text-[9px] text-[#9a9ab0]">对比模式:</span>
          <div className="flex gap-0.5 bg-[#f0f0f5] rounded-lg p-0.5">
            <button onClick={() => setShowAfter(false)}
              className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${!showAfter ? 'bg-white text-[#e17055] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>
              修改前
            </button>
            <button onClick={() => setShowAfter(true)}
              className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${showAfter ? 'bg-white text-[#00b894] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>
              修改后
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 w-full bg-white">
        <iframe
          srcDoc={showAfter ? cleanAfter : (cleanBefore || cleanAfter)}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms"
          title={showAfter ? '修改后预览' : '修改前预览'}
        />
      </div>
    </div>
  )
})

// ── RefineBar ──

const RefineBar = memo(function RefineBar({ onSend, streaming }: { onSend: (text: string) => void; streaming: boolean }) {
  const [text, setText] = useState('')
  const handleSend = () => { const t = text.trim(); if (t && !streaming) { onSend(t); setText('') } }
  return (
    <div className="flex-shrink-0 border-t border-[#e5e6eb] bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl text-[#6c5ce7] bg-[#f0f0f5] border border-[#e5e6eb]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </div>
        <div className="flex-1 relative">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="输入优化建议继续迭代... (Enter 发送)"
            className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-xl px-4 py-2.5 text-sm text-[#1a1a2e] placeholder-[#9a9ab0] outline-none focus:border-[#6c5ce7] focus:shadow-[0_0_0_2px_rgba(108,92,231,0.1)] transition-all" />
        </div>
        <button onClick={handleSend} disabled={!text.trim() || streaming}
          className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
          title="发送 (Enter)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  )
})

// ── localStorage helpers ──

function saveIterationsToStore(sid: string, iterations: IterationEntry[], currentText: string, currentTools: ToolCallEntry[]) {
  try { localStorage.setItem(ITERATIONS_KEY, JSON.stringify({ sessionId: sid, iterations, currentText, currentTools })) } catch {}
}
function loadIterationsFromStore(sid: string) {
  try {
    const raw = localStorage.getItem(ITERATIONS_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (d.sessionId === sid) return { iterations: d.iterations || [], currentText: d.currentText || '', currentTools: d.currentTools || [] }
  } catch {}
  return null
}

// ── Main Component ──

export function ProjectTestPage({ sessionId, onNavigateToPage }: Props) {
  // ── Form ──
  const [form, setForm, resetForm] = usePersistedForm(PAGE_TYPE, { projectDir: '', requirements: '' })

  // ── History ──
  const toolHistory = useHistoryStore(s => s.toolHistory)
  const loadToolHistory = useHistoryStore(s => s.loadToolHistory)
  const addToolEntry = useHistoryStore(s => s.addToolEntry)
  const deleteToolEntries = useHistoryStore(s => s.deleteToolEntries)
  const filteredHistory = toolHistory.filter(h => h.pageType === PAGE_TYPE)

  // ── Streaming ──
  const [streaming, setStreaming] = useState(() => {
    try { return localStorage.getItem('zxcode-tool-streaming') === sessionId } catch { return false }
  })
  const restored = streaming ? loadIterationsFromStore(sessionId) : null
  const [iterations, setIterations] = useState<IterationEntry[]>(restored?.iterations || [])
  const [currentText, setCurrentText] = useState(restored?.currentText || '')
  const [currentTools, setCurrentTools] = useState<ToolCallEntry[]>(restored?.currentTools || [])

  const [status, setStatus] = useState('')
  const [backupPath, setBackupPath] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [loadedFromHistory, setLoadedFromHistory] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [activeTab, setActiveTab] = useState<OutputTab>('source')
  const [projectType, setProjectType] = useState('generic')
  const [projectExtensions, setProjectExtensions] = useState<string[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [loadedSkills, setLoadedSkills] = useState<SkillInfo[]>([])

  // Animation cycling — matches ToolPageLayout
  const animIndexRef = useRef(0)
  const [, setAnimTick] = useState(0)
  useEffect(() => {
    if (!streaming) return
    const timer = setInterval(() => {
      animIndexRef.current = (animIndexRef.current + 1) % 3
      setAnimTick(animIndexRef.current)
    }, 4000)
    return () => clearInterval(timer)
  }, [streaming])

  const anims = [<ThinkingDots />, <BrainWave />, <GearSpin />]
  const currentAnim = anims[animIndexRef.current % 3]

  // Export state
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showFileChanges, setShowFileChanges] = useState(false)

  // ── Project file preview state ──
  const [projectHtmlFiles, setProjectHtmlFiles] = useState<{ path: string; name: string; relativePath: string }[]>([])
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<string>('')
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewBeforeContent, setPreviewBeforeContent] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewShowAfter, setPreviewShowAfter] = useState(true)
  const [showAiOutput, setShowAiOutput] = useState(true)
  const [selectedSourceFile, setSelectedSourceFile] = useState<string>('')
  const [sourceShowBefore, setSourceShowBefore] = useState(false)
  const [sourceShowDiff, setSourceShowDiff] = useState(false)

  // Preview server state
  const [previewServerUrl, setPreviewServerUrl] = useState<string>('')
  const [previewServerPort, setPreviewServerPort] = useState(0)

  const outputRef = useRef<HTMLDivElement>(null)
  const unsubRef = useRef<(() => void)[]>([])
  const savedRef = useRef(false)
  const wasStreamingRef = useRef(false)
  const currentTextRef = useRef(currentText)
  const currentToolsRef = useRef(currentTools)
  const iterationsRef = useRef(iterations)

  useEffect(() => { currentTextRef.current = currentText }, [currentText])
  useEffect(() => { currentToolsRef.current = currentTools }, [currentTools])
  useEffect(() => { iterationsRef.current = iterations }, [iterations])

  // ── Auto-scroll ──
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [currentText, iterations])

  // ── Persist ──
  useEffect(() => {
    if (streaming) saveIterationsToStore(sessionId, iterations, currentText, currentTools)
  }, [iterations, currentText, currentTools, streaming, sessionId])

  // ── Scan project on dir change → detect type + load skills ──
  useEffect(() => {
    if (!form.projectDir) return
    ;(async () => {
      try {
        const result: any = await window.electron.invoke('project:scan', form.projectDir)
        if (result?.success) {
          setProjectType(result.projectType || 'generic')
          setProjectExtensions(result.extensions || [])
        }
      } catch {}
    })()
    loadBackups()
  }, [form.projectDir])

  // ── Load relevant skills when project type changes ──
  useEffect(() => {
    if (!form.projectDir || projectType === 'generic' && projectExtensions.length === 0) return
    ;(async () => {
      setSkillsLoading(true)
      try {
        const all = await loadAllSkills()
        const names = getRelevantSkillNames(projectType, projectExtensions)
        const matched = all.filter(s => names.includes(s.name))
        setLoadedSkills(matched)
      } catch {}
      setSkillsLoading(false)
    })()
  }, [projectType, form.projectDir])

  // ── Load project HTML files for preview ──
  useEffect(() => {
    if (!form.projectDir) return
    ;(async () => {
      try {
        const result: any = await window.electron.invoke('project:list-html-files', form.projectDir)
        if (result?.success) {
          setProjectHtmlFiles(result.files || [])
        }
      } catch {}
    })()
  }, [form.projectDir, iterations.length])

  // ── Auto-save ──
  useEffect(() => { if (streaming) wasStreamingRef.current = true }, [streaming])
  useEffect(() => {
    const raw = getRawOutput()
    if (raw && !streaming && !loadedFromHistory && !savedRef.current && wasStreamingRef.current) {
      savedRef.current = true; wasStreamingRef.current = false
      addToolEntry({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        pageType: PAGE_TYPE, title: form.requirements.slice(0, 40) || form.projectDir.split(/[/\\]/).pop() || '项目测试',
        label: '测试输出', content: raw, format: 'txt', timestamp: Date.now(),
        formData: { projectDir: form.projectDir, requirements: form.requirements },
      })
    }
  }, [streaming, loadedFromHistory])
  useEffect(() => { if (streaming) { savedRef.current = false; setLoadedFromHistory(false) } }, [streaming])
  useEffect(() => { return () => { unsubRef.current.forEach(fn => fn()) } }, [])
  useEffect(() => { if (streaming) setupEventListeners(sessionId) }, [])
  useEffect(() => { if (!streaming && refining) setRefining(false) }, [streaming, refining])

  // ── Derived: all output text ──
  const allOutputText = iterations.map(i => i.text).join('\n') + '\n' + currentText

  // ── Derived: file changes (for comparison) ──
  const allFileChanges = ((): FileChange[] => {
    const readMap = new Map<string, string>()
    const changes: FileChange[] = []
    for (const iter of iterations) {
      for (const tc of iter.toolCalls) {
        if (!tc.filePath) continue
        const iterLabel = iter.id.startsWith('hist-') ? '历史记录' : formatTime(iter.timestamp)
        if (tc.name === 'read_file' && tc.result) readMap.set(tc.filePath, tc.result)
        changes.push({
          filePath: tc.filePath, fileName: tc.filePath.split(/[/\\]/).pop() || tc.filePath,
          action: tc.name === 'write_file' ? 'written' : 'read',
          content: tc.fileContent || tc.result || '',
          beforeContent: tc.name === 'write_file' ? readMap.get(tc.filePath) : undefined,
          iterationId: iter.id, iterationLabel: iterLabel,
          timestamp: iter.timestamp, toolId: tc.id, fileType: tc.fileType || 'other',
        })
      }
    }
    return changes
  })()

  // Group by file
  const fileChangeGroups = (() => {
    const map = new Map<string, FileChange[]>()
    for (const fc of allFileChanges) {
      const e = map.get(fc.filePath) || []; e.push(fc); map.set(fc.filePath, e)
    }
    return Array.from(map.entries()).map(([fp, changes]) => {
      const sorted = changes.sort((a, b) => a.timestamp - b.timestamp)
      const last = sorted[sorted.length - 1]
      const lastWrite = sorted.filter(c => c.action === 'written').pop()
      return { filePath: fp, fileName: sorted[0].fileName, fileType: last.fileType, changes: sorted, lastAction: last.action, hasComparison: !!(lastWrite?.beforeContent && lastWrite.beforeContent !== lastWrite.content), lastWrite }
    })
  })()
  const writtenFiles = fileChangeGroups.filter(f => f.lastAction === 'written')

  // ── HTML detection ──
  const detectedHtml = extractHtmlContent(allOutputText)
  const writtenHtmlContent = writtenFiles.filter(f => f.fileType === 'html').pop()?.lastWrite?.content
  const hasPreview = !!detectedHtml || !!writtenHtmlContent || projectHtmlFiles.length > 0

  // Find the last written HTML file content for before/after preview
  const lastWrittenHtml = writtenFiles.filter(f => f.fileType === 'html').pop()
  const beforeHtml = lastWrittenHtml?.lastWrite?.beforeContent || null
  const afterHtml = lastWrittenHtml?.lastWrite?.content || detectedHtml || ''

  // ── Auto-select preview file when output completes ──
  useEffect(() => {
    if (streaming || !form.projectDir) return
    // Priority: last modified HTML file > index.html > first HTML file
    const lastModified = writtenFiles.filter(f => f.fileType === 'html').pop()
    if (lastModified) {
      setSelectedPreviewFile(lastModified.filePath)
      setPreviewContent(lastModified.lastWrite?.content || '')
      setPreviewBeforeContent(lastModified.lastWrite?.beforeContent || null)
      setPreviewShowAfter(true)
      return
    }
    // Fallback: find matching project HTML file for AI output HTML
    if (detectedHtml && projectHtmlFiles.length > 0) {
      const indexFile = projectHtmlFiles.find(f => f.name.toLowerCase() === 'index.html')
      if (indexFile) {
        setSelectedPreviewFile(indexFile.path)
        loadPreviewFileContent(indexFile.path)
      }
      return
    }
    // No HTML found but project has HTML files — select first one
    if (projectHtmlFiles.length > 0 && !selectedPreviewFile) {
      const indexFile = projectHtmlFiles.find(f => f.name.toLowerCase() === 'index.html') || projectHtmlFiles[0]
      setSelectedPreviewFile(indexFile.path)
      loadPreviewFileContent(indexFile.path)
    }
  }, [streaming, writtenFiles.length])

  // ── Load preview file content when selection changes ──
  async function loadPreviewFileContent(filePath: string) {
    setLoadingPreview(true)
    try {
      const result: any = await window.electron.invoke('project:read-file', filePath)
      if (result?.success) {
        setPreviewContent(result.content)
        // Check if this file was modified
        const change = fileChangeGroups.find(g => g.filePath === filePath)
        setPreviewBeforeContent(change?.lastWrite?.beforeContent || null)
        setPreviewShowAfter(true)
      }
    } catch {}
    setLoadingPreview(false)
  }

  const handlePreviewFileSelect = async (filePath: string) => {
    setSelectedPreviewFile(filePath)
    if (!filePath) return
    await loadPreviewFileContent(filePath)
  }

  // ── Auto-collapse AI output when files are present ──
  useEffect(() => {
    if (writtenFiles.length > 0 && !streaming) {
      setShowAiOutput(false)
      if (!selectedSourceFile) setSelectedSourceFile(writtenFiles[0].filePath)
    }
    if (writtenFiles.length === 0 && allOutputText.trim()) setShowAiOutput(true)
  }, [writtenFiles.length, streaming])

  // ── Helpers ──

  function getRawOutput(): string {
    const parts: string[] = []
    for (const iter of iterations) { parts.push(iter.text); for (const tc of iter.toolCalls) { if (tc.result) parts.push(`\n[工具: ${tc.name}]\n${tc.result}`) } }
    if (currentText) parts.push(currentText)
    return parts.join('\n\n')
  }

  const loadBackups = async () => {
    const r: any = await window.electron.invoke('project:list-backups', form.projectDir)
    if (r?.success) setBackups(r.backups)
  }
  const pickProjectDir = async () => { const d: any = await window.electron.invoke('dialog:open-directory'); if (d) setForm(prev => ({ ...prev, projectDir: d })) }
  const handleCreateBackup = async () => {
    if (!form.projectDir) return
    setMessage('正在创建备份...')
    const r: any = await window.electron.invoke('project:backup', form.projectDir)
    if (r?.success) { setBackupPath(r.backupPath); setMessage(`✅ 备份已创建: ${r.backupName}`); loadBackups() }
    else setMessage(`❌ 备份失败: ${r?.error}`)
  }
  const handleRollback = async (bu?: string) => {
    const bp = bu || backupPath; if (!form.projectDir || !bp) return
    setMessage('正在回滚...')
    const r: any = await window.electron.invoke('project:rollback', form.projectDir, bp)
    if (r?.success) { setMessage('✅ 回滚成功'); setShowRollbackConfirm(false) }
    else setMessage(`❌ 回滚失败: ${r?.error}`)
  }

  // ── Event listeners ──

  const setupEventListeners = (sid: string) => {
    unsubRef.current.forEach(fn => fn()); unsubRef.current = []

    unsubRef.current.push(window.electron.receive('chat:delta', (sId: unknown, text: unknown) => {
      if (sId !== sid) return; setCurrentText(prev => prev + (text as string))
    }))
    unsubRef.current.push(window.electron.receive('chat:tool-start', (sId: unknown, toolId: unknown, name: unknown, input: unknown) => {
      if (sId !== sid) return
      setStatus(name as string)
      setCurrentTools(prev => [...prev, { id: toolId as string, name: name as string, input, result: '', ...parseToolInput(name as string, input) }])
    }))
    unsubRef.current.push(window.electron.receive('chat:tool-result', (sId: unknown, info: unknown) => {
      if (sId !== sid) return
      const { id, name, input, result } = info as { id: string; name: string; input: any; result: string }
      setCurrentTools(prev => prev.map(t => t.id !== id ? t : { ...t, result: result || '', ...parseToolInput(name, input) }))
    }))
    unsubRef.current.push(window.electron.receive('chat:done', (sId: unknown) => {
      if (sId !== sid) return
      setIterations(prev => { const u = [...prev, { id: 'iter-' + Date.now(), text: currentTextRef.current, toolCalls: [...currentToolsRef.current], timestamp: Date.now() }]; iterationsRef.current = u; return u })
      setCurrentText(''); setCurrentTools([]); setStatus(''); setStreaming(false)
      try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    }))
    unsubRef.current.push(window.electron.receive('chat:cancelled', (sId: unknown) => {
      if (sId !== sid) return
      const ct = currentTextRef.current; const cts = currentToolsRef.current
      if (ct || cts.length > 0) setIterations(prev => [...prev, { id: 'iter-' + Date.now(), text: ct + '\n\n*[已取消]*', toolCalls: [...cts], timestamp: Date.now() }])
      setCurrentText(''); setCurrentTools([]); setStatus(''); setStreaming(false)
      try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    }))
    unsubRef.current.push(window.electron.receive('chat:error', (sId: unknown, errorMsg: unknown) => {
      if (sId !== sid) return
      setCurrentText(prev => prev + `\n\n*[错误: ${errorMsg}]*`); setStatus(''); setStreaming(false)
      try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    }))
  }

  // ── Start / Stop ──

  const handleStart = async () => {
    if (!form.projectDir || !form.requirements.trim() || streaming) return

    setMessage('正在创建备份...')
    const br: any = await window.electron.invoke('project:backup', form.projectDir)
    if (br?.success) { setBackupPath(br.backupPath); setMessage(`✅ 备份已创建: ${br.backupName}\n开始测试...`); loadBackups() }
    else setMessage(`⚠️ 备份创建失败 (${br?.error})，继续执行测试...`)

    const sid = sessionId; setupEventListeners(sid)

    // Build skill-enhanced system prompt
    const skillPrompt = loadedSkills.length > 0
      ? '\n\n---\n\n【以下为自动加载的项目技能指导】\n\n' + loadedSkills.map(s => `## Skill: ${s.name}\n${s.content}`).join('\n\n---\n\n')
      : ''

    const systemPrompt = `You are ZXCODE Project Testing Agent — an expert QA engineer and developer.

## Working Directory
\`${form.projectDir}\`

## Project Type
${projectType}${projectExtensions.length > 0 ? ` (文件类型: ${projectExtensions.join(', ')})` : ''}

## Your Task
Iteratively test and improve the project in \`${form.projectDir}\` based on the user's acceptance criteria.
Follow this cycle:
1. **Analyze**: Read relevant project files to understand the current state
2. **Test**: Run test commands, linters, build, or manual checks
3. **Fix**: Use write_file to MODIFY the actual source code files to fix issues
4. **Verify**: Run tests again to confirm the fix
5. **Repeat**: Continue until all acceptance criteria are met

## ⚠️ CRITICAL: You MUST Modify Files
- **The user expects you to directly modify source code files.** Reading and analyzing alone is NOT enough.
- **Use write_file for EVERY change**, no matter how small — even fixing a single typo counts.
- If you find an issue, FIX IT immediately with write_file. Don't just report it.
- If tests are failing, modify the code to make them pass.
- If the UI looks wrong, modify the HTML/CSS/JS to fix it.
- **Your job is NOT DONE until at least one file has been modified with write_file.**

## Critical Rules
- **Complete ALL tasks.** Keep iterating until every acceptance criterion is satisfied.
- **MUST use write_file to modify code.** Do not just read and report — actually edit files.
- **Use multiple tools per response.** Batch file reads, commands, and writes together.
- **On error, try alternatives.** If a command or approach fails, find another way.
- **Don't ask for confirmation.** Just execute — you are in control.
- **Report progress clearly.** After each iteration, summarize what you modified and what's next.
- **Read before writing.** Always read files before editing them.
- **Test after changes.** Run the appropriate test/build/lint command after each change.
- **Annotate ALL changes.** When you modify source code, add clear inline comments (in the appropriate syntax for the language, e.g. // FIXED:, # CHANGED:, /* UPDATED: */) above or beside every changed line, explaining what was changed and why. For HTML/CSS changes, use <!-- CHANGED: description --> comments. This is CRITICAL for the user to understand what was modified.

## Tools Available
- \`read_file\`: Read any file in the project (supports text, PDF, DOCX, XLSX, images)
- \`write_file\`: Create or overwrite files with new content — THIS IS YOUR PRIMARY TOOL
- \`list_directory\`: List directory contents
- \`execute_command\`: Run shell commands (tests, build, lint, npm, git, etc.)

Respond in Chinese. Be thorough and persistent.${skillPrompt}`

    await window.electron.invoke('chat:create-session', sid, systemPrompt)

    setIterations([]); setCurrentText(''); setCurrentTools([]); setStreaming(true); setStatus('thinking'); setActiveTab('source')
    try { localStorage.setItem('zxcode-tool-streaming', sessionId) } catch {}
    window.electron.invoke('chat:send-message', sid, `[工作目录: ${form.projectDir}]\n\n请按照以下验收要求对项目进行测试和迭代改进:\n\n${form.requirements}`)
  }

  const handleStop = () => { setStreaming(false); window.electron.invoke('chat:cancel', sessionId) }
  const handleRefine = (feedback: string) => {
    if (!feedback || streaming) return
    setRefining(true); savedRef.current = false; setRefineText('')
    setupEventListeners(sessionId); setStreaming(true); setStatus('refining')
    try { localStorage.setItem('zxcode-tool-streaming', sessionId) } catch {}
    window.electron.invoke('chat:send-message', sessionId, `请根据以下反馈继续迭代改进项目:\n\n${feedback}`)
  }
  const showRefineBar = (iterations.length > 0 || currentText) && !streaming && !refining

  // ── History actions ──
  const handleNewTask = () => {
    resetForm(); setIterations([]); setCurrentText(''); setCurrentTools([]); setStatus(''); setMessage(''); setLoadedFromHistory(false); setActiveTab('source')
    try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    try { localStorage.removeItem(ITERATIONS_KEY) } catch {}
  }
  const handleLoadHistory = (entry: ToolHistoryEntry) => {
    setShowHistory(false); setLoadedFromHistory(true); savedRef.current = true
    if (entry.formData) setForm(prev => ({ ...prev, ...entry.formData }))
    setIterations([{ id: 'hist-' + entry.id, text: entry.content, toolCalls: [], timestamp: entry.timestamp }])
    setCurrentText(''); setCurrentTools([]); setStreaming(false); setActiveTab('source')
    try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
  }
  const handleDeleteEntry = (entryId: string, e: React.MouseEvent) => { e.stopPropagation(); deleteToolEntries([entryId]) }

  // ── Export ──
  const cleanOutput = getRawOutput()
  const handleCopy = () => { navigator.clipboard.writeText(cleanOutput).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  const handleDownloadMd = () => { const b = new Blob([cleanOutput], { type: 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `项目测试-${Date.now()}.md`; a.click() }
  const handleExportDocx = async () => {
    setExporting('docx'); setExportMsg(null)
    try { const r: any = await window.electron.invoke('export:docx', cleanOutput, `项目测试-${Date.now()}.docx`); if (r?.success) { setExportMsg(`已保存: ${r.path}`); window.electron.invoke('file:open', r.path) } else setExportMsg(`导出失败: ${r?.error}`) } catch (e: any) { setExportMsg(`导出失败: ${e.message}`) }
    setExporting(null); setTimeout(() => setExportMsg(null), 4000)
  }
  const handleExportPdf = async () => {
    setExporting('pdf'); setExportMsg(null)
    try { const r: any = await window.electron.invoke('export:pdf', cleanOutput, `项目测试-${Date.now()}.pdf`); if (r?.success) { setExportMsg(`已保存: ${r.path}`); window.electron.invoke('file:open', r.path) } else setExportMsg(`导出失败: ${r?.error}`) } catch (e: any) { setExportMsg(`导出失败: ${e.message}`) }
    setExporting(null); setTimeout(() => setExportMsg(null), 4000)
  }
  const handleOpenInBrowser = async () => {
    if (!detectedHtml) return
    setExporting('browser'); setExportMsg(null)
    try { const r: any = await window.electron.invoke('export:open-html', stripNonHtml(cleanOutput)); if (r?.success) setExportMsg('已在浏览器中打开'); else setExportMsg(`打开失败: ${r?.error}`) } catch (e: any) { setExportMsg(`打开失败: ${e.message}`) }
    setExporting(null); setTimeout(() => setExportMsg(null), 4000)
  }

  const pageLabel = '项目测试'
  const hasOutput = iterations.length > 0 || loadedFromHistory

  // ── Start/stop project preview server ──
  const serverStartedRef = useRef(false)
  useEffect(() => {
    if (!form.projectDir) return
    // Only start/restart when project dir changes; not on streaming/hasOutput
    serverStartedRef.current = false
    ;(async () => {
      try {
        const result: any = await window.electron.invoke('project:start-preview-server', form.projectDir)
        if (result?.success && !serverStartedRef.current) {
          serverStartedRef.current = true
          setPreviewServerUrl(result.url)
          setPreviewServerPort(result.port)
        }
      } catch {}
    })()

    return () => {
      window.electron.invoke('project:stop-preview-server')
      setPreviewServerUrl('')
      setPreviewServerPort(0)
      serverStartedRef.current = false
    }
  }, [form.projectDir])

  // Start server when output first becomes available (if not already started)
  useEffect(() => {
    if (hasOutput && !streaming && form.projectDir && !previewServerUrl) {
      ;(async () => {
        try {
          const result: any = await window.electron.invoke('project:start-preview-server', form.projectDir)
          if (result?.success) {
            serverStartedRef.current = true
            setPreviewServerUrl(result.url)
            setPreviewServerPort(result.port)
          }
        } catch {}
      })()
    }
  }, [hasOutput, streaming])

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a2e]">项目测试</h2>
            <p className="text-[10px] text-[#9a9ab0] mt-0.5">AI 自动测试与迭代改进</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleNewTask} className="flex items-center justify-center w-7 h-7 rounded-lg text-[#9a9ab0] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] transition-all" title="新建任务">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <div className="relative">
              <button onClick={() => { setShowHistory(!showHistory); loadToolHistory() }} className="text-[9px] text-[#6c5ce7] hover:text-[#5a4bd1] flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                历史记录 ({filteredHistory.length})
              </button>
              {showHistory && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowHistory(false)} />
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-[#e5e6eb] rounded-lg shadow-lg z-20 max-h-80 overflow-hidden flex flex-col">
                    <div className="px-3 py-1.5 border-b border-[#e5e6eb] flex items-center justify-between sticky top-0 bg-white"><span className="text-[9px] text-[#9a9ab0] uppercase font-medium">{pageLabel} 历史 — 点击加载</span></div>
                    <div className="overflow-y-auto max-h-64 custom-scrollbar">
                      {filteredHistory.length === 0 ? <div className="px-3 py-6 text-center text-[9px] text-[#9a9ab0]">暂无 {pageLabel} 历史记录</div> : filteredHistory.map(h => (
                        <div key={h.id} onClick={() => handleLoadHistory(h)} className="px-3 py-2 text-xs border-b border-[#e5e6eb]/30 cursor-pointer hover:bg-[#f0f0f5] transition-colors flex items-center justify-between">
                          <div className="min-w-0 flex-1"><div className="font-medium text-[#1a1a2e] truncate">{h.title}</div><div className="flex items-center gap-1.5 mt-0.5"><span className="text-[7px] px-1 py-0.5 rounded font-medium flex-shrink-0 bg-[#6c5ce7]/10 text-[#6c5ce7]">{pageLabel}</span><span className="text-[9px] text-[#9a9ab0]">{new Date(h.timestamp).toLocaleString()} · TXT · {(h.content.length / 1000).toFixed(0)}KB</span></div></div>
                          <button onClick={(e) => handleDeleteEntry(h.id, e)} className="text-[9px] text-[#b0b0c0] hover:text-[#e17055] flex-shrink-0" title="删除"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left form */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-[#e5e6eb] p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-medium text-[#4a4a6a]">项目目录 *</label>
            <div className="flex items-center gap-1 mt-1">
              <input value={form.projectDir} onChange={e => setForm(prev => ({ ...prev, projectDir: e.target.value }))} className="flex-1 bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" placeholder="选择或输入项目路径" />
              <button onClick={pickProjectDir} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[#f5f6f8] border border-[#e5e6eb] hover:bg-[#f0f0f5] transition-colors" title="选择目录">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-1.5-2H5a2 2 0 00-2 2z"/></svg>
              </button>
            </div>
            {/* Project type badge + skills indicator */}
            {form.projectDir && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-[7px] px-1.5 py-0.5 rounded font-medium ${projectType === 'web' ? 'bg-[#e17055]/10 text-[#e17055]' : projectType === 'python' ? 'bg-[#0984e3]/10 text-[#0984e3]' : projectType === 'node' ? 'bg-[#00b894]/10 text-[#00b894]' : 'bg-[#9a9ab0]/10 text-[#9a9ab0]'}`}>
                  {projectType === 'web' ? '🌐 Web 项目' : projectType === 'python' ? '🐍 Python' : projectType === 'node' ? '⬢ Node.js' : projectType === 'java' ? '☕ Java' : projectType === 'go' ? '🔷 Go' : projectType === 'rust' ? '🦀 Rust' : projectType === 'dotnet' ? '.NET' : '📁 通用项目'}
                </span>
                {skillsLoading && <span className="text-[7px] text-[#9a9ab0] animate-pulse">加载技能中...</span>}
                {loadedSkills.length > 0 && !skillsLoading && (
                  <span className="text-[7px] text-[#6c5ce7]" title={loadedSkills.map(s => s.name).join(', ')}>
                    已加载 {loadedSkills.length} 个技能
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-medium text-[#4a4a6a]">验收要求 *</label>
            <textarea value={form.requirements} onChange={e => setForm(prev => ({ ...prev, requirements: e.target.value }))} rows={8} className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-lg px-3 py-2 text-xs mt-1 outline-none focus:border-[#6c5ce7] resize-none" placeholder="描述项目需要达到的验收标准，例如：&#10;1. 所有单元测试通过&#10;2. 页面在移动端正常显示&#10;3. API 响应时间 < 200ms&#10;4. 修复登录页面的样式问题" />
            <PolishButton text={form.requirements} onAccept={(polished) => setForm(prev => ({ ...prev, requirements: polished }))} disabled={streaming} context={{ pageType: 'project-test', projectType }} />
          </div>

          <div className="mt-auto space-y-3">
            {message && <div className="text-[10px] text-[#4a4a6a] whitespace-pre-wrap bg-[#f5f6f8] rounded-lg px-2 py-1.5">{message}</div>}
            <div className="space-y-2">
              <button onClick={handleCreateBackup} disabled={!form.projectDir || streaming} className="w-full py-1.5 rounded-lg border border-[#e5e6eb] text-[10px] text-[#4a4a6a] hover:bg-[#f5f6f8] disabled:opacity-30 transition-colors flex items-center justify-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                手动备份
              </button>
              {backups.length > 0 && (
                <div>
                  <button onClick={() => setShowRollbackConfirm(!showRollbackConfirm)} disabled={streaming} className="w-full py-1.5 rounded-lg border border-[#e17055]/20 text-[10px] text-[#e17055] hover:bg-[#e17055]/5 disabled:opacity-30 transition-colors flex items-center justify-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                    回滚到备份 ({backups.length})
                  </button>
                  {showRollbackConfirm && (
                    <div className="mt-2 p-2 bg-[#e17055]/5 border border-[#e17055]/10 rounded-lg space-y-1 max-h-36 overflow-y-auto">
                      {backups.map(b => <button key={b.path} onClick={() => handleRollback(b.path)} className="w-full text-left px-2 py-1 rounded text-[10px] hover:bg-[#e17055]/10 transition-colors"><span className="text-[#1a1a2e]">{b.name}</span><span className="text-[#9a9ab0] ml-2">{new Date(b.createdAt).toLocaleString()}</span></button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            {!streaming ? (
              <button onClick={handleStart} disabled={!form.projectDir || !form.requirements.trim()} className="w-full py-2.5 rounded-xl text-xs font-medium transition-all bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] disabled:opacity-30 disabled:cursor-not-allowed shadow-sm">开始测试</button>
            ) : (
              <button onClick={handleStop} className="w-full py-2.5 rounded-xl text-xs font-medium transition-all bg-[#e17055]/10 text-[#e17055] border border-[#e17055]/20 hover:bg-[#e17055]/20">停止测试</button>
            )}
          </div>
        </div>

        {/* Right output — matches ToolPageLayout exactly */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Output toolbar — matching ToolPageLayout: label left, tabs + export right */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-[#e5e6eb] gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-[#4a4a6a]">测试输出</span>
              {streaming && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#6c5ce7]/8 text-[9px] text-[#6c5ce7]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round"/></svg>
                  {status || '执行中'}
                </span>
              )}
              {loadedFromHistory && !streaming && <span className="text-[9px] text-[#9a9ab0]">(历史记录)</span>}
              {writtenFiles.length > 0 && !streaming && (
                <span className="text-[9px] text-[#9a9ab0]">· 修改了 {writtenFiles.length} 个文件: {writtenFiles.map(f => f.fileName).slice(0, 3).join(', ')}{writtenFiles.length > 3 ? ` +${writtenFiles.length - 3}` : ''}</span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Source/Preview tabs — exactly like ToolPageLayout */}
              {!streaming && hasOutput && (
                <div className="flex gap-0.5 bg-[#f0f0f5] rounded-lg p-0.5 mr-2">
                  <button onClick={() => setActiveTab('source')} className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${activeTab === 'source' ? 'bg-white text-[#6c5ce7] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>源码</button>
                  {hasPreview && (
                    <button onClick={() => setActiveTab('preview')} className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${activeTab === 'preview' ? 'bg-white text-[#6c5ce7] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>预览</button>
                  )}
                </div>
              )}

              {/* Export buttons — matching ToolPageLayout */}
              {!streaming && hasOutput && (
                <div className="flex gap-1 items-center">
                  <button onClick={handleCopy} className="px-1.5 py-0.5 text-[9px] text-[#4a4a6a] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] rounded transition-colors">{copied ? '✓ 已复制' : '复制'}</button>
                  {hasPreview && <button onClick={handleOpenInBrowser} disabled={exporting === 'browser'} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${exporting === 'browser' ? 'bg-[#f0f0f5] text-[#9a9ab0]' : 'bg-[#e8f4fd] text-[#0984e3] hover:bg-[#d6ecfb]'}`}>{exporting === 'browser' ? '...' : '浏览器'}</button>}
                  <button onClick={handleDownloadMd} className="px-1.5 py-0.5 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">.md</button>
                  <button onClick={handleExportDocx} disabled={exporting === 'docx'} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${exporting === 'docx' ? 'bg-[#f0f0f5] text-[#9a9ab0]' : 'bg-[#e8f4fd] text-[#0984e3] hover:bg-[#d6ecfb]'}`}>{exporting === 'docx' ? '...' : '.docx'}</button>
                  <button onClick={handleExportPdf} disabled={exporting === 'pdf'} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${exporting === 'pdf' ? 'bg-[#f0f0f5] text-[#9a9ab0]' : 'bg-[#fef3e4] text-[#e17055] hover:bg-[#fde8d4]'}`}>{exporting === 'pdf' ? '...' : '.pdf'}</button>
                </div>
              )}
            </div>
          </div>

          {exportMsg && (
            <div className="px-4 py-1.5 bg-[#f0fdf4] border-b border-[#bbf7d0] text-[10px] text-[#166534] flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {exportMsg}
            </div>
          )}

          {/* ── Source tab ── */}
          {activeTab === 'source' && (
            <div ref={outputRef} className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {!hasOutput && !streaming ? (
                <div className="flex items-center justify-center h-full text-[#9a9ab0] text-xs">
                  <div className="text-center space-y-2">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto opacity-30"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <p>填写左侧参数后，点击"开始测试"</p>
                    {toolHistory.length > 0 && <p className="text-[9px] text-[#b0b0c0]">或从右上角历史记录中查看之前的生成结果</p>}
                  </div>
                </div>
              ) : streaming && !allOutputText ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/60 border border-[#e5e6eb]/50">
                    {currentAnim}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-medium text-[#6c5ce7]">AI 正在思考中</span>
                      <span className="text-[9px] text-[#9a9ab0]">
                        {animIndexRef.current === 0 ? '分析需求中...' : animIndexRef.current === 1 ? '整理思路中...' : '生成内容中...'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* AI output text — collapsible when files present */}
                  {allOutputText.trim() && (
                    <div className="bg-white border border-[#e5e6eb] rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowAiOutput(!showAiOutput)}
                        className="w-full flex items-center justify-between px-4 py-2 bg-[#fafbfc] border-b border-[#e5e6eb] hover:bg-[#f0f0f5] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2" className={`transition-transform ${showAiOutput ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6"/></svg>
                          <span className="text-[10px] font-medium text-[#4a4a6a]">AI 输出</span>
                          <span className="text-[8px] text-[#9a9ab0]">({allOutputText.length.toLocaleString()} 字符)</span>
                        </div>
                        {streaming && <ThinkingDots width={24} height={10} />}
                      </button>
                      {showAiOutput && (
                        <div className="p-4">
                          <div className="text-xs text-[#1a1a2e] whitespace-pre-wrap font-mono leading-relaxed markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(allOutputText) }} />
                          {streaming && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#e5e6eb]/50">
                              <ThinkingDots width={32} height={12} />
                              <span className="text-[9px] text-[#9a9ab0]">AI 正在生成内容...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* File browser — all modified files */}
                  {writtenFiles.length > 0 && !streaming && (
                    <div className="bg-white border border-[#e5e6eb] rounded-xl overflow-hidden">
                      {/* File tabs */}
                      <div className="border-b border-[#e5e6eb] bg-[#fafbfc] px-2 py-1.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[8px] text-[#9a9ab0] mr-1 flex-shrink-0">修改的文件:</span>
                          {writtenFiles.map((g, idx) => {
                            const isSelected = selectedSourceFile === g.filePath || (!selectedSourceFile && idx === 0)
                            return (
                              <button
                                key={g.filePath}
                                onClick={() => {
                                  setSelectedSourceFile(g.filePath)
                                  setSourceShowBefore(false)
                                }}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-all ${
                                  isSelected
                                    ? 'bg-[#6c5ce7] text-white shadow-sm'
                                    : 'bg-white border border-[#e5e6eb] text-[#4a4a6a] hover:border-[#6c5ce7]/30 hover:text-[#6c5ce7]'
                                }`}
                              >
                                <FileTypeIcon fileType={g.fileType} size={9} />
                                <span className="max-w-[120px] truncate">{g.fileName}</span>
                                {g.hasComparison && (
                                  <span className="w-1 h-1 rounded-full bg-[#e17055] flex-shrink-0" title="有修改前版本可对比" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Selected file content */}
                      {(() => {
                        const selectedGroup = writtenFiles.find(g => g.filePath === selectedSourceFile) || writtenFiles[0]
                        if (!selectedGroup || !selectedGroup.lastWrite?.content) return null
                        const { lastWrite } = selectedGroup
                        const displayBefore = sourceShowBefore && lastWrite.beforeContent
                        const displayContent = displayBefore ? lastWrite.beforeContent! : lastWrite.content

                        return (
                          <div>
                            {/* File toolbar */}
                            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#e5e6eb]/50 bg-white">
                              <div className="flex items-center gap-2">
                                <FileTypeIcon fileType={selectedGroup.fileType} size={12} />
                                <span className="text-[10px] font-medium text-[#1a1a2e]">{selectedGroup.fileName}</span>
                                <span className="text-[8px] text-[#9a9ab0]">{displayContent.length.toLocaleString()} 字符</span>
                                {displayBefore && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-[#e17055]/10 text-[#e17055]">查看修改前</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {/* Before/After toggle */}
                                {selectedGroup.hasComparison && (
                                  <div className="flex gap-0.5 bg-[#f0f0f5] rounded-lg p-0.5 mr-1">
                                    <button onClick={() => setSourceShowBefore(true)}
                                      className={`px-2 py-0.5 text-[8px] rounded font-medium transition-all ${sourceShowBefore ? 'bg-white text-[#e17055] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>
                                      修改前
                                    </button>
                                    <button onClick={() => setSourceShowBefore(false)}
                                      className={`px-2 py-0.5 text-[8px] rounded font-medium transition-all ${!sourceShowBefore ? 'bg-white text-[#00b894] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>
                                      修改后
                                    </button>
                                  </div>
                                )}
                                {/* Diff view toggle */}
                                {selectedGroup.hasComparison && (
                                  <button
                                    onClick={() => { setSourceShowDiff(!sourceShowDiff) }}
                                    className={`px-1.5 py-0.5 text-[8px] rounded transition-colors ${sourceShowDiff ? 'bg-[#6c5ce7]/10 text-[#6c5ce7]' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}
                                  >
                                    {sourceShowDiff ? '单文件' : '对比视图'}
                                  </button>
                                )}
                                {/* Copy button */}
                                <button
                                  onClick={() => { navigator.clipboard.writeText(displayContent) }}
                                  className="px-1.5 py-0.5 text-[8px] text-[#9a9ab0] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] rounded transition-colors"
                                  title="复制文件内容"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                                </button>
                              </div>
                            </div>

                            {/* Code display */}
                            {sourceShowDiff && selectedGroup.hasComparison ? (
                              <div className="p-2">
                                <DiffView
                                  before={lastWrite.beforeContent!}
                                  after={lastWrite.content}
                                  collapsed={false}
                                />
                              </div>
                            ) : (
                              <div className="overflow-auto max-h-[calc(100vh-420px)]">
                                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre p-3 overflow-x-auto"
                                  dangerouslySetInnerHTML={{
                                    __html: highlightCode(displayContent, selectedGroup.fileType)
                                  }}
                                />
                              </div>
                            )}

                            {/* File info footer */}
                            <div className="flex items-center gap-2 px-3 py-1 border-t border-[#e5e6eb] bg-[#fafbfc] text-[8px] text-[#9a9ab0]">
                              <span>{selectedGroup.filePath}</span>
                              <span>·</span>
                              <span>{selectedGroup.fileType}</span>
                              <span>·</span>
                              <span>{selectedGroup.lastAction === 'written' ? '已修改' : '已读取'}</span>
                              {lastWrite.beforeContent && (
                                <>
                                  <span>·</span>
                                  <span className="text-[#e17055]">有原始版本可对比</span>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* No files modified — show AI output + tool activity */}
                  {writtenFiles.length === 0 && !streaming && allOutputText.trim() && (
                    <div className="bg-white border border-[#e5e6eb] rounded-xl overflow-hidden">
                      {/* AI output header */}
                      <div className="px-4 py-2 bg-[#fff8e1] border-b border-[#ffe082] flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span className="text-[10px] font-medium text-[#92400e]">AI 分析完成，但未修改文件</span>
                        <span className="text-[8px] text-[#b45309] ml-auto">可通过下方输入框要求 AI 修改具体文件</span>
                      </div>

                      {/* AI output full text — always visible */}
                      <div className="p-4">
                        <div className="text-xs text-[#1a1a2e] whitespace-pre-wrap font-mono leading-relaxed markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(allOutputText) }} />
                      </div>

                      {/* Tool activity log */}
                      {(() => {
                        const allToolCalls = iterations.flatMap(i => i.toolCalls)
                        const readCalls = allToolCalls.filter(t => t.name === 'read_file')
                        const listCalls = allToolCalls.filter(t => t.name === 'list_directory')
                        const execCalls = allToolCalls.filter(t => t.name === 'execute_command')
                        if (allToolCalls.length === 0) return null
                        return (
                          <div className="border-t border-[#e5e6eb] px-4 py-2 bg-[#fafbfc]">
                            <div className="flex items-center gap-3 flex-wrap text-[9px]">
                              <span className="text-[#9a9ab0]">工具调用记录:</span>
                              {readCalls.length > 0 && (
                                <span className="flex items-center gap-1 text-[#0984e3]">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  读取 {readCalls.length} 个文件
                                </span>
                              )}
                              {listCalls.length > 0 && (
                                <span className="flex items-center gap-1 text-[#6c5ce7]">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-1.5-2H5a2 2 0 00-2 2z"/></svg>
                                  列出 {listCalls.length} 个目录
                                </span>
                              )}
                              {execCalls.length > 0 && (
                                <span className="flex items-center gap-1 text-[#e17055]">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                                  执行 {execCalls.length} 条命令
                                </span>
                              )}
                              <span className="text-[#9a9ab0]">· 共 {allToolCalls.length} 次工具调用</span>
                            </div>
                            {/* Show read files list */}
                            {readCalls.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {readCalls.filter(t => t.filePath).slice(0, 10).map(t =>
                                  <span key={t.id} className="px-1.5 py-0.5 rounded bg-[#f0f0f5] text-[8px] text-[#4a4a6a] font-mono">{t.filePath!.split(/[/\\]/).pop()}</span>
                                )}
                                {readCalls.length > 10 && <span className="text-[8px] text-[#9a9ab0]">+{readCalls.length - 10} 更多</span>}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Preview tab ── */}
          {activeTab === 'preview' && hasPreview && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Preview toolbar */}
              <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 bg-[#fafbfc] border-b border-[#e5e6eb]">
                {/* Project HTML file selector */}
                {projectHtmlFiles.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-[#9a9ab0] flex-shrink-0">预览文件:</span>
                    <select
                      value={selectedPreviewFile}
                      onChange={e => handlePreviewFileSelect(e.target.value)}
                      className="bg-white border border-[#e5e6eb] rounded-md px-2 py-1 text-[9px] text-[#1a1a2e] outline-none focus:border-[#6c5ce7] max-w-[260px]"
                    >
                      {projectHtmlFiles.map(f => (
                        <option key={f.path} value={f.path}>
                          {f.relativePath}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Server status */}
                {previewServerUrl ? (
                  <span className="flex items-center gap-1 text-[8px] text-[#00b894]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00b894] inline-block animate-pulse" />
                    项目已关联
                  </span>
                ) : (
                  <span className="text-[8px] text-[#9a9ab0]">启动预览服务中...</span>
                )}

                {/* Before/After toggle */}
                {(previewBeforeContent || beforeHtml) && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[9px] text-[#9a9ab0]">对比:</span>
                    <div className="flex gap-0.5 bg-[#f0f0f5] rounded-lg p-0.5">
                      <button onClick={() => setPreviewShowAfter(false)}
                        className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${!previewShowAfter ? 'bg-white text-[#e17055] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>
                        修改前
                      </button>
                      <button onClick={() => setPreviewShowAfter(true)}
                        className={`px-2.5 py-1 text-[9px] rounded-md font-medium transition-all ${previewShowAfter ? 'bg-white text-[#00b894] shadow-sm' : 'text-[#9a9ab0] hover:text-[#4a4a6a]'}`}>
                        修改后
                      </button>
                    </div>
                  </div>
                )}

                {/* Browser open button */}
                {previewServerUrl && (
                  <button
                    onClick={async () => {
                      const selectedRelPath = selectedPreviewFile
                        ? projectHtmlFiles.find(f => f.path === selectedPreviewFile)?.relativePath || ''
                        : projectHtmlFiles[0]?.relativePath || 'index.html'
                      const previewUrl = `${previewServerUrl}/${selectedRelPath}`
                      // Copy URL to clipboard and notify
                      await navigator.clipboard.writeText(previewUrl)
                      setCopied(true); setTimeout(() => setCopied(false), 2000)
                      // Also try to open via electron shell
                      try { await window.electron.invoke('export:open-html', `<html><head><meta http-equiv="refresh" content="0;url=${previewUrl}"></head><body></body></html>`) } catch {}
                    }}
                    className="ml-auto px-2 py-1 text-[9px] bg-[#e8f4fd] text-[#0984e3] hover:bg-[#d6ecfb] rounded transition-colors flex items-center gap-1"
                    title="复制预览地址并在浏览器中打开"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    浏览器
                  </button>
                )}
              </div>

              {/* Preview content — uses local server to load entire project (CSS/JS/images all work) */}
              <div className="flex-1 w-full bg-white relative">
                {!previewServerUrl ? (
                  <div className="flex items-center justify-center h-full">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="1.5" className="animate-spin"><circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round"/></svg>
                    <span className="ml-2 text-xs text-[#9a9ab0]">正在启动项目预览服务...</span>
                  </div>
                ) : previewShowAfter ? (
                  /* After (current): load from local server — ALL project files work together */
                  <iframe
                    key={`${previewServerUrl}-${selectedPreviewFile}`}
                    src={(() => {
                      const selectedRelPath = selectedPreviewFile
                        ? projectHtmlFiles.find(f => f.path === selectedPreviewFile)?.relativePath || ''
                        : projectHtmlFiles[0]?.relativePath || 'index.html'
                      return `${previewServerUrl}/${selectedRelPath}`
                    })()}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-forms allow-modals"
                    title="项目预览（修改后）"
                  />
                ) : (
                  /* Before (original): use srcDoc with saved before-content */
                  <iframe
                    key={`before-${selectedPreviewFile}`}
                    srcDoc={(() => {
                      const raw = previewBeforeContent || beforeHtml || previewContent || afterHtml
                      return extractHtmlContent(raw) || raw
                    })()}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-forms"
                    title="项目预览（修改前）"
                  />
                )}
              </div>

              {/* File info footer */}
              <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1 bg-[#fafbfc] border-t border-[#e5e6eb] text-[8px] text-[#9a9ab0]">
                {previewServerUrl ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00b894] inline-block" />
                    <span>预览服务: {previewServerUrl}</span>
                    <span>·</span>
                    <span>整个项目联动预览（CSS/JS/图片均正常加载）</span>
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round"/></svg>
                    <span>等待预览服务...</span>
                  </>
                )}
                {selectedPreviewFile && (
                  <>
                    <span>·</span>
                    <FileTypeIcon fileType="html" size={10} />
                    <span>{selectedPreviewFile.split(/[/\\]/).pop()}</span>
                  </>
                )}
                {previewBeforeContent && (
                  <>
                    <span>·</span>
                    <span className="text-[#e17055]">有修改前版本可对比</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* No preview available state */}
          {activeTab === 'preview' && !hasPreview && (
            <div className="flex-1 flex items-center justify-center text-[#9a9ab0] text-xs">
              <div className="text-center space-y-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto opacity-30"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                <p>项目中没有 HTML 文件</p>
                <p className="text-[9px] text-[#b0b0c0]">非 Web 项目请查看源码 Tab 中的文件变更</p>
              </div>
            </div>
          )}

          {/* Refine bar — exactly like ToolPageLayout's RefineBar */}
          {showRefineBar && <RefineBar onSend={handleRefine} streaming={streaming} />}
        </div>
      </div>
    </div>
  )
}
