import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

interface UploadedFile { fileName: string; content: string; isImage: boolean; size: number; isDocument?: boolean; fileType?: string }

interface ChatInputProps {
  onSend: (message: string, files?: UploadedFile[]) => void
  streaming: boolean
  onCancel: () => void
  prepopulate?: string
  onConsumed?: () => void
  /** When set, fill input and auto-send (for automation tasks) */
  autoSendPrompt?: string
  onAutoSent?: () => void
}

export function ChatInput({ onSend, streaming, onCancel, prepopulate, onConsumed, autoSendPrompt, onAutoSent }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploadError, setUploadError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const consumedRef = useRef<string | null>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  useEffect(() => {
    if (prepopulate && prepopulate !== consumedRef.current) {
      consumedRef.current = prepopulate
      setInput(prepopulate)
      onConsumed?.()
      setTimeout(() => { textareaRef.current?.focus(); adjustHeight() }, 50)
    }
  }, [prepopulate])

  // ── Auto-send for automation tasks (fills input + sends if not streaming) ──
  const autoSendRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoSendPrompt || autoSendPrompt === autoSendRef.current) return
    autoSendRef.current = autoSendPrompt
    // If currently streaming, just fill the input (user can send manually later)
    setInput(autoSendPrompt)
    onAutoSent?.()
    if (!streaming) {
      // Auto-send after a short delay to let the UI update
      setTimeout(() => {
        onSend(autoSendPrompt, undefined)
        autoSendRef.current = null
      }, 300)
    } else {
      // Streaming active: keep in input, user will send when ready
      setTimeout(() => { textareaRef.current?.focus(); adjustHeight() }, 50)
    }
  }, [autoSendPrompt])

  const adjustHeight = () => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px' }
  }

  const handleSend = () => {
    const text = input
    if (!text.trim() && files.length === 0) return
    // Always allow sending — if streaming, it will be queued
    onSend(text, files.length > 0 ? files : undefined)
    setInput(''); setFiles([]); setUploadError('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if ((e.key === 'Escape' || (e.ctrlKey && e.key === 'c')) && streaming) { e.preventDefault(); onCancel() }
  }

  const handleFileUpload = async () => {
    setUploadError('')
    const result: any = await window.electron.invoke('dialog:open-file')
    if (!result) return
    if (result.error) {
      setUploadError(result.error)
      return
    }
    setFiles(prev => [...prev, { fileName: result.fileName, content: result.content, isImage: result.isImage || false, size: result.size || 0, isDocument: result.isDocument || false, fileType: result.fileType || '' }])
    // If image and no text yet, suggest
    if (result.isImage && !input.trim()) {
      setInput('请帮我分析这张图片的内容')
    }
    if (result.note) {
      setUploadError(result.note)
    }
  }

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  return (
    <div className="flex-shrink-0 bg-white border-t border-[#e5e6eb] px-4 py-3">
      {/* File error */}
      {uploadError && (
        <div className="mb-2 px-3 py-2 bg-[#e17055]/5 border border-[#e17055]/20 rounded-lg text-[10px] text-[#e17055] flex items-start justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError('')} className="ml-2 text-[#e17055] hover:opacity-70">x</button>
        </div>
      )}
      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f, i) => {
            const isDoc = f.isDocument
            const typeLabel = f.fileType ? f.fileType.toUpperCase() : (f.isImage ? '图片' : '文件')
            const colorClass = f.isImage ? 'bg-[#6c5ce7]/5 border-[#6c5ce7]/10 text-[#6c5ce7]'
              : isDoc ? 'bg-[#00b894]/5 border-[#00b894]/10 text-[#00b894]'
              : 'bg-[#6c5ce7]/5 border-[#6c5ce7]/10 text-[#6c5ce7]'
            return (
            <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 ${colorClass} border rounded-lg text-[10px]`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {f.fileName} ({(f.size / 1024).toFixed(1)}KB) {typeLabel && <span className="opacity-60">·{typeLabel}</span>}
              <button onClick={() => removeFile(i)} className="ml-0.5 hover:text-[#e17055]">x</button>
            </span>
          )})}
        </div>
      )}
      <div className="flex items-center gap-2 max-w-4xl">
        {/* Upload button */}
        <button
          onClick={handleFileUpload}
          className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl text-[#9a9ab0] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] transition-all border border-[#e5e6eb]"
          title="上传文件或图片"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>

        <div className="flex-1 relative">
          <textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); adjustHeight() }} onKeyDown={handleKeyDown}
            placeholder={streaming ? "AI 正在处理... 可以继续输入新任务 (Enter 发送 · 自动追加到队列)" : "输入开发需求... (可上传文件/图片 · Enter 发送 · /btw 启动后台子任务)"}
            rows={1}
            className="w-full bg-[#f5f6f8] border border-[#e5e6eb] rounded-xl px-4 py-2.5 text-sm text-[#1a1a2e] placeholder-[#9a9ab0] outline-none focus:border-[#6c5ce7] focus:shadow-[0_0_0_2px_rgba(108,92,231,0.1)] resize-none transition-all duration-150 custom-scrollbar break-words overflow-wrap-anywhere"
            style={{ maxHeight: '120px' }}
          />
        </div>

        {streaming ? (
          <button onClick={onCancel} className="flex-shrink-0 h-10 px-4 flex items-center justify-center rounded-xl bg-[#e17055]/5 text-[#e17055] text-sm font-medium hover:bg-[#e17055]/10 transition-colors border border-[#e17055]/20">停止</button>
        ) : (
          <button onClick={handleSend} disabled={!input.trim() && files.length === 0}
            className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}
