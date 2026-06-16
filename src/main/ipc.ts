import { ipcMain, BrowserWindow, app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { TerminalService } from './services/terminal.service'
import { ModelService } from './services/model.service'
import { ProxyService } from './services/proxy.service'
import { ConfigService } from './services/config.service'
import { SchedulerService } from './services/scheduler.service'
import type { ProxyStats, SessionInfo } from '../shared/types'

export function registerIpcHandlers(): void {
  const terminal = TerminalService.getInstance()
  const model = ModelService.getInstance()
  const proxy = ProxyService.getInstance()
  const config = ConfigService.getInstance()
  const scheduler = SchedulerService.getInstance()
  scheduler.start()

  // ── Terminal IPC ──

  ipcMain.handle('terminal:create', (_event, cwd: string) => {
    const session = terminal.createSession(cwd)
    return session
  })

  ipcMain.on('terminal:input', (_event, sessionId: string, data: string) => {
    terminal.write(sessionId, data)
  })

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    terminal.resize(sessionId, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, sessionId: string) => {
    terminal.killSession(sessionId)
    return true
  })

  ipcMain.handle('terminal:list', () => {
    return terminal.listSessions()
  })

  // Forward PTY output to renderer
  terminal.onData((sessionId: string, data: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('terminal:data', sessionId, data)
  })

  terminal.onExit((sessionId: string, exitCode: number) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('terminal:exit', sessionId, exitCode)
  })

  // ── Model IPC ──

  ipcMain.handle('model:list', () => {
    const providers = model.getProviders()
    // Ensure it's a plain array for IPC serialization
    return JSON.parse(JSON.stringify(providers))
  })

  ipcMain.handle('model:current', () => {
    return model.getCurrentModel()
  })

  ipcMain.handle('model:switch', (_event, providerName: string, modelId: string) => {
    const result = model.switchModel(providerName, modelId)
    if (result.success && result.restartNeeded) {
      // Kill all sessions so user can restart
      terminal.killAll()
    }
    return result
  })

  // ── Config IPC ──

  ipcMain.handle('config:get', () => {
    return config.getSettings()
  })

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    config.setSetting(key, value)
    return true
  })

  // ── Proxy IPC ──

  ipcMain.handle('proxy:status', () => {
    return proxy.getStatus()
  })

  ipcMain.handle('proxy:toggle', (_event, enable: boolean) => {
    if (enable) {
      proxy.start()
    } else {
      proxy.stop()
    }
    return proxy.getStatus()
  })

  // ── App IPC ──

  ipcMain.handle('app:get-version', () => {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))
      return pkg.version
    } catch {
      return '1.0.0'
    }
  })

  ipcMain.handle('app:cwd', () => {
    return process.cwd()
  })

  // ── Scheduler IPC ──

  ipcMain.handle('scheduler:list', () => {
    return JSON.parse(JSON.stringify(scheduler.listTasks()))
  })

  ipcMain.handle('scheduler:add', (_event, task: any) => {
    const t = scheduler.addTask({
      name: task.name,
      prompt: task.prompt,
      frequency: task.frequency || 'daily',
      dailyTime: task.dailyTime || '09:00',
      intervalMinutes: task.intervalMinutes || 60,
      activeFrom: task.activeFrom || '',
      activeTo: task.activeTo || '',
      enabled: true,
      skill: task.skill || '',
    })
    return JSON.parse(JSON.stringify(t))
  })

  ipcMain.handle('scheduler:delete', (_event, id: string) => {
    return scheduler.deleteTask(id)
  })

  ipcMain.handle('scheduler:toggle', (_event, id: string, enabled: boolean) => {
    return scheduler.updateTask(id, { enabled })
  })

  ipcMain.handle('scheduler:update', (_event, id: string, updates: any) => {
    return scheduler.updateTask(id, updates)
  })

  ipcMain.handle('scheduler:runNow', (_event, id: string) => {
    return scheduler.runNow(id)
  })

  // Forward execution events to renderer
  scheduler.on('executed', (task) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('scheduler:executed', JSON.parse(JSON.stringify(task)))
  })

  // ── Proxy ──

  proxy.start()
  setInterval(() => {
    const stats = proxy.getLatestStats()
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('proxy:stats', stats)
  }, 2000)
}
