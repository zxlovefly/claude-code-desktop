import { contextBridge, ipcRenderer } from 'electron'

const { clipboard } = require('electron')

const allowedSendChannels = ['terminal:input', 'terminal:resize']
const allowedInvokeChannels = [
  'terminal:create', 'terminal:kill', 'terminal:list',
  'model:current',
  'config:get', 'config:set',
  'proxy:status', 'proxy:toggle',
  'scheduler:list', 'scheduler:add', 'scheduler:update', 'scheduler:delete', 'scheduler:toggle', 'scheduler:runNow',
  'app:get-version', 'app:cwd', 'app:check-claude',
  'chat:create-session', 'chat:delete-session', 'chat:send-message', 'chat:cancel',
  'ai:generate',
  'keys:save',
  'dialog:open-file', 'dialog:open-directory',
]
const allowedReceiveChannels = [
  'terminal:data', 'terminal:exit',
  'proxy:stats', 'scheduler:executed',
  'chat:delta', 'chat:tool-result', 'chat:done', 'chat:cancelled', 'chat:error',
]

export interface ElectronAPI {
  send: (channel: string, ...args: unknown[]) => void
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  receive: (channel: string, callback: (...args: unknown[]) => void) => () => void
  clipboard: { writeText: (text: string) => void; readText: () => string }
}

const api: ElectronAPI = {
  send(channel: string, ...args: unknown[]) {
    if (allowedSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },
  async invoke(channel: string, ...args: unknown[]) {
    if (allowedInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`Channel "${channel}" is not allowed`)
  },
  receive(channel: string, callback: (...args: unknown[]) => void) {
    if (allowedReceiveChannels.includes(channel)) {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
    return () => {}
  },
  clipboard: {
    writeText: (text: string) => clipboard.writeText(text),
    readText: () => clipboard.readText(),
  },
}

contextBridge.exposeInMainWorld('electron', api)
