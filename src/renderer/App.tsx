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
import { Mascot } from './components/Icons'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { useMonitorStore } from './stores/monitorStore'

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
  const [chatSessionId] = useState(() => 'chat-' + Date.now())
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null)
  // Tool page session IDs (separate from chat)
  const [prdSessionId] = useState(() => 'prd-' + Date.now())
  const [analysisSessionId] = useState(() => 'ana-' + Date.now())
  const [protoSessionId] = useState(() => 'proto-' + Date.now())

  useEffect(() => {
    if (initialized.current) return; initialized.current = true
    window.electron.invoke('terminal:create', '').then((s: unknown) => { if (s) createSession(s as any) })
    window.electron.invoke('app:cwd').then((cwd: unknown) => { if (cwd) setWorkspace(cwd as string) })
    window.electron.invoke('model:current').then((d: unknown) => { if (d) setCurrentModel(d as CurrentModel) })
    window.electron.receive('proxy:stats', (s: unknown) => setStats(s as any))

    // Create main chat session (permanent — not tied to ChatTerminalView mount)
    window.electron.invoke('chat:create-session', chatSessionId)
    initConversation(chatSessionId)

    // ── Permanent chat event listeners ──
    const unsubs: (() => void)[] = []

    unsubs.push(window.electron.receive('chat:delta', (sId: unknown, text: unknown) => {
      if (sId !== chatSessionId) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(chatSessionId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(chatSessionId, last.content + (text as string), true)
      }
    }))

    unsubs.push(window.electron.receive('chat:tool-result', (sId: unknown, info: unknown) => {
      if (sId !== chatSessionId) return
      const { name, result } = info as any
      const store = useChatStore.getState()
      const msgs = store.getMessages(chatSessionId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(chatSessionId, last.content + `\n\n**${name}**\n\`\`\`\n${result}\n\`\`\``, true)
      }
    }))

    unsubs.push(window.electron.receive('chat:done', (sId: unknown) => {
      if (sId !== chatSessionId) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(chatSessionId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(chatSessionId, last.content, false)
      }
      store.setStreaming(false)
    }))

    unsubs.push(window.electron.receive('chat:cancelled', (sId: unknown) => {
      if (sId !== chatSessionId) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(chatSessionId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(chatSessionId, last.content + '\n\n*[已取消]*', false)
      }
      store.setStreaming(false)
    }))

    unsubs.push(window.electron.receive('chat:error', (sId: unknown, message: unknown) => {
      if (sId !== chatSessionId) return
      const store = useChatStore.getState()
      const msgs = store.getMessages(chatSessionId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        store.updateLastMessage(chatSessionId, last.content || `Error: ${message}`, false)
      } else {
        store.addMessage(chatSessionId, {
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

    return () => { unsubs.forEach(fn => fn()) }
  }, [])

  const handleResume = useCallback((convId: string) => {
    useChatStore.getState().setPendingResume(convId)
    setNavPage('new-task')
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
          {navPage === 'prd' && <PrdPage sessionId={prdSessionId} />}
          {navPage === 'analysis' && <AnalysisPage sessionId={analysisSessionId} />}
          {navPage === 'prototype' && <PrototypePage sessionId={protoSessionId} />}
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
              <h1 className="text-lg font-extrabold text-[#1a1a2e] tracking-tight leading-none">ZXCODE</h1>
              <p className="text-[10px] text-[#9a9ab0] mt-0.5">AI 智能开发助手</p>
            </div>
          </div>

          {/* Static model display — read-only */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e5e6eb] text-xs select-none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            <span className="text-[#1a1a2e] font-medium max-w-[160px] truncate">
              {currentModel?.display || '选择模型'}
            </span>
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
                />
              </div>
            </div>
          </div>
          <Sidebar />
        </div>
      </div>
    </div>
  )
}
