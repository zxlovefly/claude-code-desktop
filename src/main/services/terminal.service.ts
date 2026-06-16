import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { spawn as cpSpawn, ChildProcess } from 'child_process'
import type { SessionInfo, ClaudeSettings } from '../../shared/types'

// ── Terminal interface ──

interface ITerminal {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (code: number) => void) => void
}

// ── Try node-pty, fall back to child_process ──

let usePty = false
let ptySpawn: any = null
try {
  ptySpawn = require('@lydell/node-pty').spawn
  usePty = true
  console.log('[Terminal] Using node-pty (ConPTY)')
} catch (e) {
  console.warn('[Terminal] node-pty unavailable, using child_process fallback')
}

// ── Create terminal ──

function createTerminal(cmd: string, args: string[], opts: {
  cwd: string; env: Record<string, string>; cols: number; rows: number
}): ITerminal {
  if (usePty) {
    const p = ptySpawn(cmd, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env,
    })
    return {
      write: (d: string) => p.write(d),
      resize: (c: number, r: number) => p.resize(c, r),
      kill: () => p.kill(),
      onData: (cb: (data: string) => void) => { p.onData(cb) },
      onExit: (cb: (code: number) => void) => { p.onExit((e: { exitCode: number }) => cb(e.exitCode)) },
    }
  }

  // Fallback: child_process.spawn
  const child = cpSpawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let dataCb: ((data: string) => void) | null = null
  let exitCb: ((code: number) => void) | null = null

  child.stdout!.on('data', (chunk: Buffer) => dataCb?.(chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => dataCb?.(chunk.toString()))
  child.on('exit', (code: number) => exitCb?.(code))

  return {
    write: (data: string) => {
      if (!child.killed && child.stdin) child.stdin.write(data)
    },
    resize: (_c: number, _r: number) => {},
    kill: () => child.kill(),
    onData: (cb: (data: string) => void) => { dataCb = cb },
    onExit: (cb: (code: number) => void) => { exitCb = cb },
  }
}

// ── Session tracking ──

interface PtySession {
  id: string
  terminal: ITerminal
  info: SessionInfo
}

export class TerminalService extends EventEmitter {
  private static instance: TerminalService
  private sessions = new Map<string, PtySession>()

  static getInstance(): TerminalService {
    if (!TerminalService.instance) TerminalService.instance = new TerminalService()
    return TerminalService.instance
  }

  private getEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    const settingsPath = join(homedir(), '.claude', 'settings.json')

    // Inherit process env
    Object.assign(env, process.env as Record<string, string>)

    // Override with settings.json env
    if (existsSync(settingsPath)) {
      try {
        const settings: ClaudeSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        if (settings.env) Object.assign(env, settings.env)
      } catch { /* ignore */ }
    }

    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    return env
  }

  createSession(cwd?: string): SessionInfo {
    const id = randomUUID()
    // Default to Desktop if no directory specified
    const workDir = cwd || join(homedir(), 'Desktop')
    const env = this.getEnv()

    // Always use shell — `claude` needs proper PATH resolution
    const shellCmd = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash')
    const shellArgs = process.platform === 'win32' ? ['-NoLogo', '-NoExit'] : ['-l']

    const terminal = createTerminal(shellCmd, shellArgs, {
      cwd: workDir,
      env,
      cols: 120,
      rows: 40,
    })

    const info: SessionInfo = {
      id,
      name: workDir.split(/[/\\]/).pop() || 'claude',
      cwd: workDir,
      createdAt: Date.now(),
    }

    terminal.onData((data: string) => {
      this.emit('data', id, data)
    })

    terminal.onExit((exitCode: number) => {
      console.log(`[Terminal] Session ${id} exited with code ${exitCode}`)
      this.emit('exit', id, exitCode)
      this.sessions.delete(id)
    })

    this.sessions.set(id, { id, terminal, info })

    // Auto-launch Claude Code after shell is ready
    setTimeout(() => {
      this.write(id, 'claude\r')
    }, 800)

    return info
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.terminal.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.terminal.resize(cols, rows)
  }

  killSession(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (s) { s.terminal.kill(); this.sessions.delete(sessionId) }
  }

  killAll(): void {
    for (const [id] of this.sessions) this.killSession(id)
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info)
  }

  onData(callback: (sessionId: string, data: string) => void): void {
    this.on('data', callback)
  }

  onExit(callback: (sessionId: string, exitCode: number) => void): void {
    this.on('exit', callback)
  }
}
