import { app, BrowserWindow, shell, screen, Menu } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { TerminalService } from './services/terminal.service'
import { WechatBotService } from './services/wechat-bot.service'

const isServerMode = process.argv.includes('--server')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  // Cross-platform window config
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: Math.min(1400, Math.floor(screenWidth * 0.85)),
    height: Math.min(900, Math.floor(screenHeight * 0.85)),
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    title: 'Claude Code Desktop',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  // macOS-specific: frameless with traffic lights
  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset'
    windowOptions.frame = false
  }

  mainWindow = new BrowserWindow(windowOptions)

  // Show window when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open DevTools in development
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Log renderer console to main process
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    const prefix = ['', 'WARN', 'ERR', 'LOG'][level] || 'LOG'
    console.log(`[renderer:${prefix}]`, message)
  })

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'ZXCODE',
      submenu: [
        { role: 'about' as const, label: '关于 ZXCODE' },
        { type: 'separator' as const },
        { role: 'services' as const, label: '服务' },
        { type: 'separator' as const },
        { role: 'hide' as const, label: '隐藏 ZXCODE' },
        { role: 'hideOthers' as const, label: '隐藏其他' },
        { role: 'unhide' as const, label: '全部显示' },
        { type: 'separator' as const },
        { role: 'quit' as const, label: '退出 ZXCODE' },
      ],
    }] : []),
    {
      label: '文件',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close' as const, label: '关闭' }] : [{ role: 'quit' as const, label: '退出' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'delete', label: '删除' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => { shell.openExternal('https://github.com/zxlovefly/claude-code-desktop') } },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  registerIpcHandlers()

  if (isServerMode) {
    console.log('[Server] Starting in headless server mode')
    // Initialize WeChat bot service for headless operation
    const wechatBot = WechatBotService.getInstance()
    wechatBot.on('status-changed', ({ status, error }: { status: string; error: string | null }) => {
      console.log(`[WechatBot] Status: ${status}`, error || '')
      if (status === 'connected') {
        console.log('[Server] WeChat bot connected and listening for messages')
      }
    })
    wechatBot.on('qrcode', ({ url }: { url: string }) => {
      console.log('[Server] QR Code URL:', url)
      console.log('[Server] Please scan the QR code with WeChat to connect')
    })
    wechatBot.on('message-received', ({ userId, text }: { userId: string; text: string }) => {
      console.log(`[WechatBot] ← ${userId}: ${text.slice(0, 100)}`)
    })
    wechatBot.on('message-sent', ({ userId, text }: { userId: string; text: string }) => {
      console.log(`[WechatBot] → ${userId}: ${text.slice(0, 100)}`)
    })
    wechatBot.start()

    // Keep the app alive without a window
    app.on('window-all-closed', () => {}) // prevent quit
  } else {
    createWindow()

    // Initialize WeChat bot in GUI mode (if auto-connect is enabled)
    const wechatBot = WechatBotService.getInstance()
    wechatBot.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  }
})

app.on('window-all-closed', () => {
  TerminalService.getInstance().killAll()
  // Allow server mode to keep running
  if (!isServerMode && process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  TerminalService.getInstance().killAll()
})

export { mainWindow }
