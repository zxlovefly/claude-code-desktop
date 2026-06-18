import { contextBridge, ipcRenderer } from 'electron'

const { clipboard } = require('electron')

const allowedSendChannels = ['terminal:input', 'terminal:resize']
const allowedInvokeChannels = [
  'terminal:create', 'terminal:kill', 'terminal:list',
  'model:current', 'model:list', 'model:switch',
  'config:get', 'config:set',
  'proxy:status', 'proxy:toggle',
  'scheduler:list', 'scheduler:add', 'scheduler:update', 'scheduler:delete', 'scheduler:toggle', 'scheduler:runNow',
  'app:get-version', 'app:cwd', 'app:check-claude',
  'chat:create-session', 'chat:reset-session', 'chat:delete-session', 'chat:send-message', 'chat:cancel',
  'ai:generate', 'ai:polish-description',
  'export:docx', 'export:pdf', 'export:open-html', 'file:open',
  'keys:save',
  'skill:load-all',
  'dialog:open-file', 'dialog:open-directory',
  'wechat-bot:status', 'wechat-bot:connect', 'wechat-bot:disconnect',
  'wechat-bot:settings', 'wechat-bot:update-settings',
  'wechat-bot:personas', 'wechat-bot:get-user-persona',
  'wechat-bot:set-user-persona', 'wechat-bot:all-personas',
  'wechat-bot:default-persona', 'wechat-bot:set-default-persona',
]
const allowedReceiveChannels = [
  'terminal:data', 'terminal:exit',
  'proxy:stats', 'scheduler:executed',
  'chat:delta', 'chat:tool-result', 'chat:done', 'chat:cancelled', 'chat:error',
  'wechat-bot:status-changed', 'wechat-bot:qrcode',
  'wechat-bot:message-received', 'wechat-bot:message-sent',
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
