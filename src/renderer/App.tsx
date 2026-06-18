import { useEffect, useRef, useState, useCallback } from 'react'
import { LeftNav } from './components/Sidebar/LeftNav'
import type { NavPage } from './components/Sidebar/LeftNav'
import { ScenarioTabs } from './components/Main/ScenarioTabs'
import type { Scenario } from './components/Main/ScenarioTabs'
import { ChatTerminalView } from './components/Chat/ChatTerminalView'
import { SkillsPage } from './components/Pages/SkillsPage'
import { PromptLibraryPage } from './components/Pages/PromptLibraryPage'
import { PrdPage } from './components/Pages/PrdPage'
import { AnalysisPage } from './components/Pages/AnalysisPage'
import { PrototypePage } from './components/Pages/PrototypePage'
import { AutomationPanel } from './components/Sidebar/AutomationPanel'
import { Sidebar } from './components/Sidebar/Sidebar'
import { BottomToolbar } from './components/Main/BottomToolbar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { Mascot } from './components/Icons'
import { WechatBotPage } from './components/Pages/WechatBotPage'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { useMonitorStore } from './stores/monitorStore'
import { useWechatBotStore } from './stores/wechatBotStore'

interface CurrentModel {
  provider: string
  modelId: string
  display: string
  baseUrl: string
  configured: boolean
}

export default function App() {
  const { sessions, activeSessionId, createSession } = useSessionStore()
  const { setStats } = useMonitorStore()
  const initConversation = useChatStore(s => s.initConversation)
  const initialized = useRef(false)

  const [navPage, setNavPage] = useState<NavPage>('new-task')
  const [scenario, setScenario] = useState<Scenario>('code')
  const [filledPrompt, setFilledPrompt] = useState('')
  const [autoSendPrompt, setAutoSendPrompt] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [chatSessionId, setChatSessionId] = useState(() => 'chat-' + Date.now())
  const chatSessionIdRef = useRef(chatSessionId)
  chatSessionIdRef.current = chatSessionId
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; description: string; provider: string; providerName: string }>>([])
  const [showModelSwitcher, setShowModelSwitcher] = useState(false)
  const [monitorVisible, setMonitorVisible] = useState(false)
  // Tool page session IDs (separate from chat)
  const [prdSessionId] = useState(() => 'prd-' + Date.now())
  const [analysisSessionId] = useState(() => 'ana-' + Date.now())
  const [protoSessionId] = useState(() => 'proto-' + Date.now())

  useEffect(() => {
    if (initialized.current) return; initialized.current = true

    // ── Clear tool-related temporary data on app startup ──
    // Users expect a fresh state when restarting the app. History records
    // (persisted by historyStore) are preserved — only the in-progress
    // output and form drafts are cleared.
    try { localStorage.removeItem('zxcode-tool-outputs') } catch {}
    try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('zxcode-form-')) localStorage.removeItem(k)
      })
    } catch {}

    window.electron.invoke('terminal:create', '').then((s: unknown) => { if (s) createSession(s as any) })
    window.electron.invoke('app:cwd').then((cwd: unknown) => { if (cwd) setWorkspace(cwd as string) })
    window.electron.invoke('model:current').then((d: unknown) => { if (d) setCurrentModel(d as CurrentModel) })
    window.electron.invoke('model:list').then((list: unknown) => { if (Array.isArray(list)) setAvailableModels(list as any) })
    window.electron.receive('proxy:stats', (s: unknown) => setStats(s as any))

    // Create main chat session (permanent — not tied to ChatTerminalView mount)
    window.electron.invoke('chat:create-session', chatSessionId)
    initConversation(chatSessionId)

    // ── Permanent chat event listeners ──
    const unsubs: (() => void)[] = []

    unsubs.push(window.electron.receive('chat:delta', (sId: unknown, text: unknown) => {
      const sid = chatSessionIdRef.current
      if (sId !== sid) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(sid)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(sid, last.content + (text as string), true)
      }
    }))

    unsubs.push(window.electron.receive('chat:tool-result', (sId: unknown, info: unknown) => {
      const sid = chatSessionIdRef.current
      if (sId !== sid) return
      const { name, result } = info as any
      const store = useChatStore.getState()
      const msgs = store.getMessages(sid)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(sid, last.content + `\n\n**${name}**\n\`\`\`\n${result}\n\`\`\``, true)
      }
    }))

    unsubs.push(window.electron.receive('chat:done', (sId: unknown) => {
      const sid = chatSessionIdRef.current
      if (sId !== sid) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(sid)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(sid, last.content, false)
      }
      store.setStreaming(false)
    }))

    unsubs.push(window.electron.receive('chat:cancelled', (sId: unknown) => {
      const sid = chatSessionIdRef.current
      if (sId !== sid) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(sid)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(sid, last.content + '\n\n*[已取消]*', false)
      }
      store.setStreaming(false)
    }))

    unsubs.push(window.electron.receive('chat:error', (sId: unknown, message: unknown) => {
      const sid = chatSessionIdRef.current
      if (sId !== sid) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(sid)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(sid, last.content || `Error: ${message}`, false)
      } else {
        store.addMessage(sid, {
          id: 'err-' + Date.now(),
          role: 'assistant' as const,
          content: `Error: ${message}`,
          timestamp: Date.now(),
        })
      }
      store.setStreaming(false)
    }))

    // Listen for scheduler task executions — auto-send to chat
    window.electron.receive('scheduler:executed', (task: unknown) => {
      const t = task as any
      if (t?.prompt) {
        setAutoSendPrompt(t.prompt)
        setNavPage('new-task')
      }
    })

    // WeChat bot status listener
    unsubs.push(window.electron.receive('wechat-bot:status-changed', (data: unknown) => {
      const store = useWechatBotStore.getState()
      const d = data as { status: string; error?: string | null }
      if (d) store.setStatus(d.status as any, d.error)
    }))

    // WeChat bot QR code listener
    unsubs.push(window.electron.receive('wechat-bot:qrcode', (data: unknown) => {
      const store = useWechatBotStore.getState()
      const d = data as { qrcode: string; url: string; svg?: string | null }
      if (d) store.setQrCode(d.qrcode, d.url, d.svg)
    }))

    // ── Permanent tool session output persistence ──
    // These listeners survive page navigation so streaming output is never lost
    // when the user switches pages while a tool is generating.
    // Only persist raw deltas and manage the streaming marker — do NOT append
    // status messages ([已取消]/Error:) here; the per-page listeners handle that.
    unsubs.push(window.electron.receive('chat:delta', (sId: unknown, text: unknown) => {
      const sid = sId as string
      const persistKey = sid.startsWith('prd-') ? 'prdOutput' : sid.startsWith('ana-') ? 'analysisOutput' : sid.startsWith('proto-') ? 'protoOutput' : null
      if (!persistKey) return
      try {
        const saved = localStorage.getItem('zxcode-tool-outputs')
        const data = saved ? JSON.parse(saved) : { state: {} }
        if (!data.state) data.state = {}
        // Use append pattern — never replace the entire value
        data.state[persistKey] = (data.state[persistKey] || '') + (text as string)
        localStorage.setItem('zxcode-tool-outputs', JSON.stringify(data))
      } catch {}
    }))

    unsubs.push(window.electron.receive('chat:done', (sId: unknown) => {
      const sid = sId as string
      const persistKey = sid.startsWith('prd-') ? 'prdOutput' : sid.startsWith('ana-') ? 'analysisOutput' : sid.startsWith('proto-') ? 'protoOutput' : null
      if (!persistKey) return
      try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    }))

    unsubs.push(window.electron.receive('chat:cancelled', (sId: unknown) => {
      const sid = sId as string
      const persistKey = sid.startsWith('prd-') ? 'prdOutput' : sid.startsWith('ana-') ? 'analysisOutput' : sid.startsWith('proto-') ? 'protoOutput' : null
      if (!persistKey) return
      // Only clear the streaming marker — the per-page listener appends the status message
      try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    }))

    unsubs.push(window.electron.receive('chat:error', (sId: unknown, message: unknown) => {
      const sid = sId as string
      const persistKey = sid.startsWith('prd-') ? 'prdOutput' : sid.startsWith('ana-') ? 'analysisOutput' : sid.startsWith('proto-') ? 'protoOutput' : null
      if (!persistKey) return
      // Only clear the streaming marker — the per-page listener appends the status message
      try { localStorage.removeItem('zxcode-tool-streaming') } catch {}
    }))

    // WeChat bot message received
    unsubs.push(window.electron.receive('wechat-bot:message-received', (data: unknown) => {
      const store = useWechatBotStore.getState()
      const d = data as { userId: string; text: string }
      if (d) store.addMessage(d.userId, d.text, 'in')
    }))

    // WeChat bot message sent
    unsubs.push(window.electron.receive('wechat-bot:message-sent', (data: unknown) => {
      const store = useWechatBotStore.getState()
      const d = data as { userId: string; text: string }
      if (d) store.addMessage(d.userId, d.text, 'out')
    }))

    // Fetch initial bot status
    window.electron.invoke('wechat-bot:status').then((s: unknown) => {
      const store = useWechatBotStore.getState()
      const st = s as { status: string; connectedAt: number | null; error: string | null }
      if (st) store.setStatus(st.status as any, st.error)
    })

    return () => { unsubs.forEach(fn => fn()) }
  }, [])

  const handleResume = useCallback((convId: string) => {
    useChatStore.getState().setPendingResume(convId)
    setNavPage('new-task')
  }, [])

  const handleNavigateToSession = useCallback((sessionId: string) => {
    const oldId = chatSessionIdRef.current
    // Cancel any in-flight request on old session
    window.electron.invoke('chat:cancel', oldId)
    // Create backend session for the target if not exists
    window.electron.invoke('chat:create-session', sessionId)
    // Init frontend conversation for target
    const store = useChatStore.getState()
    if (!store.getConversation(sessionId)) {
      store.initConversation(sessionId)
    }
    store.setStreaming(false)
    // Switch to target session
    setChatSessionId(sessionId)
  }, [])

  const handleAutomationExecute = useCallback((prompt: string) => {
    setAutoSendPrompt(prompt)
    setNavPage('new-task')
  }, [])

  // Pages that are NOT the chat view
  const isChatPage = navPage === 'new-task'

  // Tool pages (no header/ZXCODE branding)
  if (navPage === 'prd' || navPage === 'analysis' || navPage === 'prototype') {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-[#f5f6f8]">
        <LeftNav activePage={navPage} onNavigate={setNavPage} />
        <div className="flex-1 flex flex-col min-w-0">
          {navPage === 'prd' && <PrdPage sessionId={prdSessionId} onNavigateToPage={setNavPage} />}
          {navPage === 'analysis' && <AnalysisPage sessionId={analysisSessionId} onNavigateToPage={setNavPage} />}
          {navPage === 'prototype' && <PrototypePage sessionId={protoSessionId} onNavigateToPage={setNavPage} />}
        </div>
      </div>
    )
  }

  // Non-chat pages
  if (!isChatPage) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-[#f5f6f8]">
        <LeftNav activePage={navPage} onNavigate={setNavPage} />
        <div className="flex-1 flex flex-col min-w-0">
          {navPage === 'experts' && <SkillsPage />}
          {navPage === 'automation' && <AutomationPanel onExecute={handleAutomationExecute} />}
          {navPage === 'prompts' && <PromptLibraryPage />}
          {navPage === 'wechat-bot' && <WechatBotPage />}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f5f6f8]">
      <LeftNav activePage={navPage} onNavigate={setNavPage} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-[#e5e6eb] select-none">
          <div className="flex items-center gap-3">
            <Mascot />
            <div>
              <h1 className="text-lg font-extrabold text-[#1a1a2e] tracking-tight leading-none">
                {currentModel?.display || 'ZXCODE'}
              </h1>
              <p className="text-[10px] text-[#9a9ab0] mt-0.5">AI 智能开发助手</p>
            </div>
            {/* New session + button — creates a new independent conversation */}
            <button
              onClick={() => {
                const oldId = chatSessionIdRef.current
                const newId = 'chat-' + Date.now()
                // Cancel any in-flight request on old session
                window.electron.invoke('chat:cancel', oldId)
                // Reset old backend session
                window.electron.invoke('chat:reset-session', oldId)
                // Create new backend session
                window.electron.invoke('chat:create-session', newId)
                // Init new frontend conversation
                const store = useChatStore.getState()
                store.initConversation(newId)
                store.setStreaming(false)
                // Switch to new session
                setChatSessionId(newId)
              }}
              title="新建对话"
              className="flex items-center justify-center w-7 h-7 rounded-lg text-[#9a9ab0] hover:text-[#6c5ce7] hover:bg-[#f0f0f5] transition-all ml-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {/* Model switcher — clickable dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowModelSwitcher(!showModelSwitcher); if (availableModels.length === 0) window.electron.invoke('model:list').then((list: unknown) => { if (Array.isArray(list)) setAvailableModels(list as any) }) }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e5e6eb] text-xs hover:border-[#6c5ce7]/30 hover:bg-[#f0f0f5] transition-all select-none"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <span className="text-[#1a1a2e] font-medium max-w-[160px] truncate">
                {currentModel?.display || '选择模型'}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#9a9ab0]">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showModelSwitcher && availableModels.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowModelSwitcher(false)} />
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-[#e5e6eb] rounded-lg shadow-lg z-20 overflow-hidden max-h-[500px] overflow-y-auto">
                  <div className="px-3 py-2 text-[10px] text-[#9a9ab0] uppercase tracking-wider border-b border-[#e5e6eb] sticky top-0 bg-white">
                    切换模型/厂商
                  </div>
                  {/* Group by provider */}
                  {(() => {
                    const grouped: Record<string, typeof availableModels> = {}
                    for (const m of availableModels) {
                      if (!grouped[m.provider]) grouped[m.provider] = []
                      grouped[m.provider].push(m)
                    }
                    return Object.entries(grouped).map(([pid, models]) => (
                      <div key={pid}>
                        <div className="px-3 py-1.5 text-[9px] text-[#9a9ab0] uppercase tracking-wider bg-[#f5f6f8] font-semibold">
                          {models[0]?.providerName || pid}
                        </div>
                        {models.map((m) => {
                          const isCurrent = (currentModel?.modelId || '').replace('[1m]', '') === m.id.split('/')[1]?.replace('[1m]', '')
                          return (
                            <button
                              key={m.id}
                              onClick={async () => {
                                await window.electron.invoke('model:switch', m.id)
                                const updated = await window.electron.invoke('model:current') as any
                                if (updated) setCurrentModel(updated)
                                setShowModelSwitcher(false)
                              }}
                              className={`w-full text-left px-3 py-2 hover:bg-[#f0f0f5] transition-colors border-b border-[#e5e6eb]/30 last:border-0 ${
                                isCurrent ? 'bg-[#6c5ce7]/5' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-[#1a1a2e]">{m.name}</span>
                                {isCurrent && <span className="text-[9px] text-[#6c5ce7] font-medium">✓</span>}
                              </div>
                              {m.description && (
                                <div className="text-[9px] text-[#9a9ab0] mt-0.5 leading-tight">{m.description}</div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ))
                  })()}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col min-h-0 flex-1">
            <ScenarioTabs activeScenario={scenario} onScenarioChange={setScenario} />
            <div className="flex-1 flex flex-col min-h-0 bg-[#f5f6f8]">
              <div className="flex-1 min-h-0">
                <ChatTerminalView
                  sessionId={chatSessionId} visible={true}
                  scenario={scenario} onPromptFill={setFilledPrompt}
                  filledPrompt={filledPrompt} workspace={workspace}
                  onWorkspaceChange={setWorkspace}
                  autoSendPrompt={autoSendPrompt} onAutoSent={() => setAutoSendPrompt('')}
                  onNavigateToSession={handleNavigateToSession}
                />
              </div>
              <BottomToolbar
                monitorVisible={monitorVisible}
                onToggleMonitor={() => setMonitorVisible(v => !v)}
              />
              <StatusBar />
            </div>
          </div>
          {monitorVisible && <Sidebar />}
        </div>
      </div>
    </div>
  )
}
