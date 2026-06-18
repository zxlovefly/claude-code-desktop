import { useEffect, useRef, useState } from 'react'
import { useWechatBotStore } from '../../stores/wechatBotStore'
import type { BotPersona } from '../../../shared/bot-personas'
import type { BotStatus } from '../../../shared/wechat-types'

// Status config for display
const STATUS_CONFIG: Record<BotStatus, { label: string; color: string; dot: string }> = {
  disconnected: { label: '未连接', color: '#9a9ab0', dot: 'bg-gray-400' },
  qr_pending: { label: '等待扫码', color: '#f59e0b', dot: 'bg-amber-400 animate-pulse' },
  connecting: { label: '连接中...', color: '#3b82f6', dot: 'bg-blue-400 animate-pulse' },
  connected: { label: '已连接', color: '#22c55e', dot: 'bg-green-500' },
  error: { label: '错误', color: '#ef4444', dot: 'bg-red-500' },
}

export function WechatBotPage() {
  const {
    status, error, qrcodeData, qrcodeUrl, qrcodeSvg,
    connectedAt, recentMessages, isAutoConnect,
    personas, activePersonaId,
    setStatus, setQrCode, addMessage, setAutoConnect,
    setPersonas, setActivePersona,
  } = useWechatBotStore()

  const [connecting, setConnecting] = useState(false)

  // Initialize - fetch current status on mount
  useEffect(() => {
    // Load initial state
    Promise.all([
      window.electron.invoke('wechat-bot:status'),
      window.electron.invoke('wechat-bot:settings'),
      window.electron.invoke('wechat-bot:personas'),
      window.electron.invoke('wechat-bot:default-persona'),
    ]).then(([s, settings, p, dp]) => {
      const st = s as { status: BotStatus; connectedAt: number | null; error: string | null; qrcodeUrl?: string | null; qrcodeData?: string | null; qrcodeSvg?: string | null }
      if (st) {
        setStatus(st.status, st.error)
        // Restore QR data from status (in case qrcode event was missed before page mounted)
        if (st.qrcodeData && st.qrcodeUrl) {
          setQrCode(st.qrcodeData, st.qrcodeUrl, st.qrcodeSvg)
        }
      }

      const sets = settings as { autoConnect: boolean }
      if (sets) setAutoConnect(sets.autoConnect)

      const list = p as BotPersona[]
      if (Array.isArray(list)) setPersonas(list)

      const d = dp as { personaId: string }
      if (d) setActivePersona(d.personaId)

      // Auto-trigger connect if not connected (QR will show automatically)
      if (st && st.status !== 'connected' && sets?.autoConnect) {
        setConnecting(true)
        window.electron.invoke('wechat-bot:connect')
      }
    })

    // Listen for events
    const unsubs: (() => void)[] = []

    unsubs.push(window.electron.receive('wechat-bot:status-changed', (data: unknown) => {
      const d = data as { status: BotStatus; error?: string | null }
      if (d) {
        setStatus(d.status, d.error)
        if (d.status === 'connected' || d.status === 'error' || d.status === 'disconnected') {
          setConnecting(false)
        }
      }
    }))

    unsubs.push(window.electron.receive('wechat-bot:qrcode', (data: unknown) => {
      const d = data as { qrcode: string; url: string; svg?: string | null }
      if (d) setQrCode(d.qrcode, d.url, d.svg)
    }))

    unsubs.push(window.electron.receive('wechat-bot:message-received', (data: unknown) => {
      const d = data as { userId: string; text: string }
      if (d) addMessage(d.userId, d.text, 'in')
    }))

    unsubs.push(window.electron.receive('wechat-bot:message-sent', (data: unknown) => {
      const d = data as { userId: string; text: string }
      if (d) addMessage(d.userId, d.text, 'out')
    }))

    return () => { unsubs.forEach(fn => fn()) }
  }, [])

  const handleDisconnect = async () => {
    await window.electron.invoke('wechat-bot:disconnect')
  }

  const handleAutoConnectToggle = async () => {
    const newVal = !isAutoConnect
    setAutoConnect(newVal)
    await window.electron.invoke('wechat-bot:update-settings', { autoConnect: newVal })
  }

  const handlePersonaSelect = async (personaId: string) => {
    setActivePersona(personaId)
    await window.electron.invoke('wechat-bot:set-default-persona', personaId)
  }

  const cfg = STATUS_CONFIG[status]

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a2e]">微信机器人</h2>
            <p className="text-xs text-[#9a9ab0] mt-0.5">
              通过 iLink 协议接入微信 ClawBot，将 AI 助手连接到你的微信账号
            </p>
          </div>
          {/* Only show disconnect button when connected */}
          {status === 'connected' && (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              断开连接
            </button>
          )}
          {/* Show retry button when in error state */}
          {status === 'error' && (
            <button
              onClick={async () => {
                setConnecting(true)
                await window.electron.invoke('wechat-bot:connect')
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-[#6c5ce7] text-white hover:bg-[#5a4bd1] shadow-sm"
            >
              重新连接
            </button>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3 mt-3">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} flex-shrink-0`} />
          <span className="text-sm text-[#4a4a6a]" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          {connectedAt && status === 'connected' && (
            <span className="text-xs text-[#9a9ab0]">
              连接时间: {new Date(connectedAt).toLocaleString('zh-CN')}
            </span>
          )}
          {connecting && (
            <span className="text-xs text-[#9a9ab0] animate-pulse">自动连接中...</span>
          )}
        </div>

        {error && (
          <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* QR Code area — shown when not connected and QR is available */}
      {(status === 'qr_pending' || status === 'disconnected') && qrcodeData && (
        <div className="px-6 py-6 border-b border-[#e5e6eb]">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white border-2 border-[#e5e6eb] rounded-xl shadow-sm">
              {qrcodeSvg ? (
                <div
                  className="w-[220px] h-[220px] flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: qrcodeSvg }}
                />
              ) : (
                <img
                  src={qrcodeUrl
                    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrcodeUrl)}`
                    : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrcodeData)}`}
                  alt="WeChat QR Code"
                  className="w-[220px] h-[220px]"
                />
              )}
            </div>
            <p className="text-sm text-[#4a4a6a] font-medium">请使用微信扫描二维码</p>
            <p className="text-xs text-[#9a9ab0]">
              打开微信 → 发现 → 扫一扫，扫描上方二维码即可自动连接
            </p>
            {qrcodeUrl && (
              <a
                href={qrcodeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#6c5ce7] hover:underline"
              >
                二维码无法显示？在微信中打开此链接
              </a>
            )}
          </div>
        </div>
      )}

      {/* Waiting for QR — disconnected but no QR yet */}
      {(status === 'disconnected' || status === 'connecting') && !qrcodeData && (
        <div className="px-6 py-6 border-b border-[#e5e6eb]">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 border-3 border-[#6c5ce7] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#4a4a6a]">正在获取登录二维码...</p>
            <p className="text-xs text-[#9a9ab0]">请稍候，正在连接微信服务</p>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="px-6 py-4 border-b border-[#e5e6eb]">
        <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">设置</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isAutoConnect}
            onChange={handleAutoConnectToggle}
            className="w-4 h-4 rounded border-[#d0d0da] text-[#6c5ce7] focus:ring-[#6c5ce7]"
          />
          <span className="text-sm text-[#4a4a6a]">启动时自动连接</span>
        </label>
        <p className="text-xs text-[#9a9ab0] mt-1 ml-7">
          开启后，每次打开应用会自动尝试连接微信机器人
        </p>
      </div>

      {/* Persona / Role Selector */}
      <div className="px-6 py-4 border-b border-[#e5e6eb]">
        <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">
          角色人设
          <span className="text-xs text-[#9a9ab0] ml-2 font-normal">选择 AI 的对话风格</span>
        </h3>
        {personas.length === 0 ? (
          <p className="text-xs text-[#9a9ab0]">加载中...</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {personas.map((p) => {
              const isActive = p.id === activePersonaId
              return (
                <button
                  key={p.id}
                  onClick={() => handlePersonaSelect(p.id)}
                  className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'border-[#6c5ce7] bg-[#6c5ce7]/5 shadow-sm ring-1 ring-[#6c5ce7]/20'
                      : 'border-[#e5e6eb] bg-white hover:border-[#d0d0da] hover:bg-[#f5f6f8]'
                  }`}
                >
                  {/* Colored avatar circle with SVG icon */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: p.avatarBg }}
                    dangerouslySetInnerHTML={{ __html: p.avatar }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-semibold ${isActive ? 'text-[#6c5ce7]' : 'text-[#1a1a2e]'}`}>
                      {p.name}
                      {isActive && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#6c5ce7] text-white text-[8px] ml-1.5 align-middle">✓</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#9a9ab0] leading-tight mt-0.5 line-clamp-2">
                      {p.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <p className="text-xs text-[#9a9ab0] mt-2">
          选择角色后，所有通过微信发来的消息都会以该角色的风格回复
        </p>
      </div>

      {/* Recent messages */}
      <div className="px-6 py-4">
        <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">
          最近消息
          {recentMessages.length > 0 && (
            <span className="text-xs text-[#9a9ab0] ml-2 font-normal">({recentMessages.length})</span>
          )}
        </h3>
        {recentMessages.length === 0 ? (
          <p className="text-xs text-[#9a9ab0] py-4 text-center">
            {status === 'connected' ? '等待消息...' : '连接后即可收发消息'}
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {recentMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 px-3 py-2 rounded-lg text-xs ${
                  msg.direction === 'in'
                    ? 'bg-blue-50 border border-blue-100'
                    : 'bg-green-50 border border-green-100'
                }`}
              >
                <span className={`font-semibold flex-shrink-0 ${
                  msg.direction === 'in' ? 'text-blue-500' : 'text-green-500'
                }`}>
                  [{msg.direction === 'in' ? '收' : '发'}]
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[#1a1a2e] break-words whitespace-pre-wrap">
                    {msg.text.length > 100 ? msg.text.slice(0, 100) + '...' : msg.text}
                  </div>
                  <div className="text-[#9a9ab0] mt-0.5">
                    {msg.userId.split('@')[0]} · {formatTime(msg.ts)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
