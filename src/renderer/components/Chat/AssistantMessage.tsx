import { useMemo, useState, useEffect, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ChatMessage } from './types'
import { IconDeepSeek, IconAnthropic } from '../Icons'

interface CurrentModelInfo {
  provider: string
  modelId: string
  display: string
  baseUrl: string
  configured: boolean
}

interface AssistantMessageProps {
  message: ChatMessage
  onCopy?: () => void
  onToggleSelect?: () => void
  isSelected?: boolean
  showSelect?: boolean
  onDelete?: () => void
}

function ProviderAvatar({ provider }: { provider: string }) {
  const lower = provider.toLowerCase()
  if (lower.includes('deepseek')) return <IconDeepSeek />
  if (lower.includes('anthropic') || lower.includes('claude')) return <IconAnthropic />
  // Generic fallback
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#6c5ce7" />
      <path d="M7 8l5 4-5 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 16h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export const AssistantMessage = memo(function AssistantMessage({ message, onCopy, onToggleSelect, isSelected = false, showSelect = false, onDelete }: AssistantMessageProps) {
  const hasContent = message.content.length > 0
  const [showTools, setShowTools] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [copied, setCopied] = useState(false)
  const [modelInfo, setModelInfo] = useState<CurrentModelInfo | null>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    onCopy?.()
  }

  useEffect(() => {
    window.electron.invoke('model:current').then((d: unknown) => {
      if (d) setModelInfo(d as CurrentModelInfo)
    })
  }, [])

  // Tool calls come from message.toolResults (stored separately from content).
  // Content stays clean — only the AI's text response. No regex parsing needed.
  const toolCalls = message.toolResults || []

  const markdownComponents = useMemo(
    () => ({
      code({ className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '')
        const codeString = String(children).replace(/\n$/, '')

        if (!match && !String(children).includes('\n')) {
          return (
            <code className="bg-[#f0f0f5] text-[#e17055] px-1.5 py-0.5 rounded text-[0.8125rem] font-mono" {...props}>
              {children}
            </code>
          )
        }

        return (
          <div className="relative group my-3 border border-[#e5e6eb] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#f0f0f5] border-b border-[#e5e6eb]">
              <span className="text-[10px] text-[#9a9ab0] uppercase tracking-wide font-medium">
                {match?.[1] || 'code'}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(codeString).catch(() => {})}
                className="text-[10px] text-[#9a9ab0] hover:text-[#6c5ce7] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                📋 复制
              </button>
            </div>
            <SyntaxHighlighter
              language={match?.[1] || 'text'}
              style={oneLight}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: '0.8125rem',
                padding: '0.75rem 1rem',
                background: '#fafbfc',
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        )
      },
      a({ href, children, ...props }: any) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#6c5ce7] hover:underline" {...props}>
            {children}
          </a>
        )
      },
      table({ children, ...props }: any) {
        return (
          <div className="overflow-x-auto my-3">
            <table className="min-w-full text-sm border-collapse border border-[#e5e6eb] rounded-lg overflow-hidden" {...props}>
              {children}
            </table>
          </div>
        )
      },
      th({ children, ...props }: any) {
        return (
          <th className="border border-[#e5e6eb] px-3 py-1.5 bg-[#f5f6f8] text-left text-xs font-semibold text-[#1a1a2e]" {...props}>
            {children}
          </th>
        )
      },
      td({ children, ...props }: any) {
        return (
          <td className="border border-[#e5e6eb] px-3 py-1.5 text-xs text-[#4a4a6a]" {...props}>
            {children}
          </td>
        )
      },
      p({ children, ...props }: any) {
        return <p className="mb-2 last:mb-0 leading-relaxed" {...props}>{children}</p>
      },
      ul({ children, ...props }: any) {
        return <ul className="list-disc list-inside mb-2 space-y-1" {...props}>{children}</ul>
      },
      ol({ children, ...props }: any) {
        return <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>{children}</ol>
      },
      blockquote({ children, ...props }: any) {
        return (
          <blockquote className="border-l-3 border-[#6c5ce7] pl-3 my-2 text-[#9a9ab0] italic" {...props}>
            {children}
          </blockquote>
        )
      },
      h1({ children, ...props }: any) {
        return <h1 className="text-lg font-bold mt-4 mb-2 text-[#1a1a2e]" {...props}>{children}</h1>
      },
      h2({ children, ...props }: any) {
        return <h2 className="text-base font-bold mt-3 mb-1.5 text-[#1a1a2e]" {...props}>{children}</h2>
      },
      h3({ children, ...props }: any) {
        return <h3 className="text-sm font-semibold mt-3 mb-1 text-[#1a1a2e]" {...props}>{children}</h3>
      },
      hr(props: any) {
        return <hr className="my-4 border-[#e5e6eb]" {...props} />
      },
    }),
    []
  )

  return (
    <div className="mb-4 px-4 group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start gap-1">
        {/* Action buttons — left side of AI message */}
        <div className={`flex flex-col items-center gap-0.5 pt-6 transition-all duration-150 ${showActions || showSelect ? 'opacity-100' : 'opacity-0'}`}>
          {showSelect && (
            <button onClick={onToggleSelect}
              className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${isSelected ? 'bg-[#6c5ce7] text-white' : 'bg-white border border-[#e5e6eb] text-transparent hover:border-[#6c5ce7]'}`}
              title={isSelected ? '取消选择' : '选择'}
            >
              {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
          )}
          <button onClick={handleCopy}
            className="w-5 h-5 rounded-md bg-white border border-[#e5e6eb] flex items-center justify-center hover:border-[#6c5ce7] hover:text-[#6c5ce7] transition-colors"
            title={copied ? '已复制' : '复制消息'}
          >
            {copied ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            )}
          </button>
          {onDelete && (
            <button onClick={onDelete}
              className="w-5 h-5 rounded-md bg-white border border-[#e5e6eb] flex items-center justify-center hover:border-[#e17055] hover:text-[#e17055] transition-colors"
              title="删除消息"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          )}
        </div>

        {/* Message body */}
        <div className="max-w-[85%]">
          {/* Avatar — shows actual model provider + subtle streaming indicator */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-[#f0f0f5] flex items-center justify-center flex-shrink-0">
              {modelInfo ? <ProviderAvatar provider={modelInfo.provider} /> : <IconDeepSeek />}
            </div>
            <span className="text-[10px] text-[#9a9ab0] font-medium">
              {modelInfo?.display || 'AI 助手'}
            </span>
            {/* Tool-specific status: shown only when executing a concrete tool (e.g. "📦 安装中").
                Thinking/responding states are hidden — just the subtle dot below suffices. */}
            {message.streaming && message.streamingStatus &&
              message.streamingStatus !== 'thinking' &&
              message.streamingStatus !== 'responding' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#9a9ab0]/8 text-[9px] text-[#9a9ab0] font-normal">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin opacity-50">
                  <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round"/>
                </svg>
                {message.streamingStatus}
              </span>
            )}
            {/* Subtle pulsing dot — shown during thinking/responding (not during tool exec) */}
            {message.streaming && (!message.streamingStatus || message.streamingStatus === 'thinking' || message.streamingStatus === 'responding') && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#9a9ab0] animate-pulse-dot opacity-50" />
            )}
          </div>

          {/* Bubble */}
          <div className={`bg-white border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm ${isSelected ? 'ring-2 ring-[#6c5ce7] ring-offset-1 border-[#6c5ce7]' : 'border-[#e5e6eb]'}`}>
          {hasContent ? (
            <div className="text-sm text-[#1a1a2e] markdown-body [overflow-wrap:anywhere]">
              {/* AI text response — content is clean (tool results stored separately) */}
              {message.content ? (
                // During streaming: render as plain text (massive perf boost — skips ReactMarkdown re-parsing)
                // After streaming: full markdown rendering with syntax highlighting
                message.streaming ? (
                  <div className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">{message.content}</div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {message.content}
                  </ReactMarkdown>
                )
              ) : null}

              {/* Collapsible tool calls section */}
              {toolCalls.length > 0 && (
                <div className="mt-3 border-t border-[#e5e6eb] pt-2">
                  <button
                    onClick={() => setShowTools(!showTools)}
                    className="flex items-center gap-1.5 text-[10px] text-[#9a9ab0] hover:text-[#6c5ce7] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showTools ? 'rotate(90deg)' : '', transition: 'transform 0.15s' }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <span>工具调用 ({toolCalls.length})</span>
                    {!showTools && (
                      <span className="ml-1 opacity-60">
                        {toolCalls.map(t => t.name).join(', ')}
                      </span>
                    )}
                  </button>
                  {showTools && (
                    <div className="mt-2 space-y-2">
                      {toolCalls.map((tc, i) => (
                        <div key={i} className="rounded-lg border border-[#e5e6eb] overflow-hidden">
                          <div className="px-3 py-1.5 bg-[#f5f6f8] border-b border-[#e5e6eb] flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-[#6c5ce7]">{tc.name}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(tc.result).catch(() => {})}
                              className="text-[9px] text-[#9a9ab0] hover:text-[#6c5ce7]"
                            >复制</button>
                          </div>
                          <pre className="px-3 py-2 text-[10px] font-mono text-[#4a4a6a] bg-[#fafbfc] overflow-x-auto max-h-40 whitespace-pre-wrap">{tc.result}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : message.streaming ? (
            <div className="flex items-center gap-1.5 text-[#9a9ab0]/60 text-xs">
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[#9a9ab0] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-[#9a9ab0] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-[#9a9ab0] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          ) : null}

          {message.streaming && hasContent && (
            <span className="inline-block w-0.5 h-4 bg-[#6c5ce7] ml-0.5 align-text-bottom animate-pulse" />
          )}
        </div>
      </div>
    </div>
    </div>
  )
})
