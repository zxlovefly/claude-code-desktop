import { app, BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { TerminalService } from './services/terminal.service'

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

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  TerminalService.getInstance().killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  TerminalService.getInstance().killAll()
})

export { mainWindow }
