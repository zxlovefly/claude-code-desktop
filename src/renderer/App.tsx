import { useEffect, useRef } from 'react'
import { Allotment } from 'allotment'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TerminalView } from './components/Terminal/TerminalView'
import { TerminalTabs } from './components/Terminal/TerminalTabs'
import { StatusBar } from './components/StatusBar/StatusBar'
import { useSessionStore } from './stores/sessionStore'
import { useModelStore } from './stores/modelStore'
import { useMonitorStore } from './stores/monitorStore'

export default function App() {
  const { sessions, activeSessionId, createSession } = useSessionStore()
  const { setCurrentModel, setProviders } = useModelStore()
  const { setStats } = useMonitorStore()
  const initialized = useRef(false)

  // 初始化：创建会话、加载模型、监听流量
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // 创建第一个终端会话
    window.electron.invoke('terminal:create', '').then((session: unknown) => {
      if (session) createSession(session as Parameters<typeof createSession>[0])
    })

    // 加载模型列表
    window.electron.invoke('model:list').then((data: unknown) => {
      setProviders(data)
    })

    // 加载当前模型
    window.electron.invoke('model:current').then((data: unknown) => {
      if (data) setCurrentModel(data)
    })

    // 监听流量数据
    window.electron.receive('proxy:stats', (stats: unknown) => {
      setStats(stats as Parameters<typeof setStats>[0])
    })

    // 全局监听调度器执行事件（不受 tab 切换影响）
    window.electron.receive('scheduler:executed', async (task: any) => {
      console.log('[App] Scheduler fired:', task?.name)
      const session: any = await window.electron.invoke('terminal:create', '')
      if (session) {
        createSession(session as Parameters<typeof createSession>[0])
        useSessionStore.getState().setActiveSession(session.id)
        setTimeout(() => {
          window.electron.send('terminal:input', session.id, (task?.prompt || '') + '\r')
        }, 4000)
      }
    })
  }, [])

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const hasSessions = sessions.length > 0

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0d1117]">
      {/* 主区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 侧栏 */}
        <Sidebar />

        {/* 终端区域 */}
        <div className="flex-1 flex flex-col min-w-0">
          <TerminalTabs />

          {/* 终端面板 */}
          <div className="flex-1 relative">
            {hasSessions ? (
              <Allotment>
                {sessions.map((session) => (
                  <Allotment.Pane key={session.id} visible={session.id === activeSessionId}>
                    <TerminalView
                      sessionId={session.id}
                      visible={session.id === activeSessionId}
                    />
                  </Allotment.Pane>
                ))}
              </Allotment>
            ) : (
              <div className="flex items-center justify-center h-full select-none">
                <div className="text-center">
                  <svg className="mx-auto mb-4 opacity-20" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
                    <path d="M8 12l3 3 5-5" />
                  </svg>
                  <div className="text-sm text-[#8b949e]">点击 + 创建新会话</div>
                  <div className="text-xs text-[#484f58] mt-1">快捷键 Ctrl+N</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <StatusBar />
    </div>
  )
}
