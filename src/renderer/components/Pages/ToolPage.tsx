import { useState, useRef, useEffect, useCallback } from 'react'

interface ToolPageProps {
  title: string
  subtitle: string
  children: React.ReactNode
  onGenerate: () => void
  streaming: boolean
  output: string
  outputLabel?: string
  onStop: () => void
  sessionId: string
}

export function ToolPageLayout({ title, subtitle, children, onGenerate, streaming, output, outputLabel, onStop, sessionId }: ToolPageProps) {
  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a2e]">{title}</h2>
            <p className="text-[10px] text-[#9a9ab0] mt-0.5">{subtitle}</p>
          </div>
          {output && !streaming && (
            <span className="text-[9px] text-[#fdcb6e] bg-[#fdcb6e]/8 px-2 py-0.5 rounded-full">⚠ 关闭程序前请保存或复制内容</span>
          )}
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
          <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-[#e5e6eb]">
            <span className="text-[10px] font-medium text-[#4a4a6a]">{outputLabel || '输出'}</span>
            {output && !streaming && (
              <div className="flex gap-1">
                <button onClick={() => {
                  const el = document.createElement('textarea'); el.value = output; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
                }} className="px-2 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">复制</button>
                <button onClick={() => {
                  const blob = new Blob([output], { type: 'text/markdown' })
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `output-${Date.now()}.md`; a.click()
                }} className="px-2 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">下载 .md</button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            {output ? (
              <div className="bg-white border border-[#e5e6eb] rounded-xl p-4">
                <div className="text-xs text-[#1a1a2e] whitespace-pre-wrap font-mono leading-relaxed markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }} />
                {streaming && <span className="inline-block w-2 h-4 bg-[#6c5ce7] animate-pulse ml-0.5" />}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#9a9ab0] gap-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p className="text-xs">填写左侧参数后，点击生成按钮</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Simple markdown-to-HTML renderer for common patterns
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-[#1a1a2e] mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-[#1a1a2e] mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-[#1a1a2e] mt-4 mb-2">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-[#f0f0f5] px-1 rounded text-[#6c5ce7] text-[10px]">$1</code>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-2 border-[#e5e6eb]" />')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-[#4a4a6a]">• $1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-[#4a4a6a]">$1. $2</li>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
  return html
}

// Hook for tool page streaming
export function useToolStream(sessionId: string, persistKey?: string) {
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const unsubRef = useRef<(() => void)[]>([])
  const outputRef = useRef('')

  // Optionally sync with persisted store
  useEffect(() => {
    if (persistKey) {
      try {
        const saved = localStorage.getItem('zxcode-tool-outputs')
        if (saved) {
          const data = JSON.parse(saved)
          if (data.state && data.state[persistKey]) {
            setOutput(data.state[persistKey])
            outputRef.current = data.state[persistKey]
          }
        }
      } catch {}
    }
  }, [persistKey])

  const saveToStore = (value: string) => {
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
    unsubRef.current.push(window.electron.receive('chat:delta', (sId: unknown, text: unknown) => {
      if (sId !== sessionId) return
      setOutput(prev => {
        const next = prev + (text as string)
        outputRef.current = next
        saveToStore(next)
        return next
      })
    }))
    unsubRef.current.push(window.electron.receive('chat:done', (sId: unknown) => {
      if (sId !== sessionId) return
      setStreaming(false)
      saveToStore(outputRef.current)
    }))
    unsubRef.current.push(window.electron.receive('chat:cancelled', (sId: unknown) => {
      if (sId !== sessionId) return
      setOutput(prev => { const next = prev + '\n\n*[已取消]*'; saveToStore(next); return next })
      setStreaming(false)
    }))
    unsubRef.current.push(window.electron.receive('chat:error', (sId: unknown, message: unknown) => {
      if (sId !== sessionId) return
      setOutput(prev => { const next = prev + `\n\n**Error:** ${message}`; saveToStore(next); return next })
      setStreaming(false)
    }))
    return () => { unsubRef.current.forEach(fn => fn()); unsubRef.current = [] }
  }, [sessionId, persistKey])

  const generate = useCallback((systemPrompt: string, userMessage: string) => {
    setOutput(''); outputRef.current = ''; setStreaming(true)
    saveToStore('')
    window.electron.invoke('ai:generate', sessionId, systemPrompt, userMessage)
  }, [sessionId, persistKey])

  const stop = useCallback(() => {
    window.electron.invoke('chat:cancel', sessionId)
  }, [sessionId])

  return { output, streaming, generate, stop }
}
