import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ChatMessage } from './types'

interface AssistantMessageProps {
  message: ChatMessage
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const hasContent = message.content.length > 0
  const [showTools, setShowTools] = useState(false)

  // ── Parse message content: separate tool calls from actual response ──
  const { cleanContent, toolCalls } = useMemo(() => {
    const text = message.content
    // Pattern: **tool_name**\n\n```language\n...\n```
    const toolPattern = /\*\*([\w_]+)\*\*\s*\n\s*```(\w*)\n([\s\S]*?)```\s*/g
    const calls: { name: string; lang: string; body: string }[] = []
    let match
    while ((match = toolPattern.exec(text)) !== null) {
      calls.push({ name: match[1], lang: match[2] || '', body: match[3].trim() })
    }
    // Remove all tool call blocks from displayed content
    const clean = text.replace(toolPattern, '').replace(/\n{3,}/g, '\n\n').trim()
    return { cleanContent: clean, toolCalls: calls }
  }, [message.content])

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
    <div className="mb-4 px-4">
      <div className="max-w-[85%]">
        {/* Avatar */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 h-5 rounded-full bg-[#6c5ce7]/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px]">🤖</span>
          </div>
          <span className="text-[10px] text-[#9a9ab0] font-medium uppercase tracking-wide">Claude</span>
          {message.streaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] animate-pulse-dot" />
          )}
        </div>

        {/* Bubble */}
        <div className="bg-white border border-[#e5e6eb] rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
          {hasContent ? (
            <div className="text-sm text-[#1a1a2e] markdown-body">
              {/* Clean response text (tool calls removed) */}
              {cleanContent ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {cleanContent}
                </ReactMarkdown>
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
                              onClick={() => navigator.clipboard.writeText(tc.body).catch(() => {})}
                              className="text-[9px] text-[#9a9ab0] hover:text-[#6c5ce7]"
                            >复制</button>
                          </div>
                          <pre className="px-3 py-2 text-[10px] font-mono text-[#4a4a6a] bg-[#fafbfc] overflow-x-auto max-h-40 whitespace-pre-wrap">{tc.body}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : message.streaming ? (
            <div className="flex items-center gap-1 text-[#9a9ab0] text-sm">
              <span>思考中</span>
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          ) : null}

          {message.streaming && hasContent && (
            <span className="inline-block w-0.5 h-4 bg-[#6c5ce7] ml-0.5 align-text-bottom animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}
