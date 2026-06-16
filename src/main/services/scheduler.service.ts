import { EventEmitter } from 'events'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'

export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  frequency: 'once' | 'daily' | 'interval'
  dailyTime: string
  intervalMinutes: number
  activeFrom: string
  activeTo: string
  createdAt: number
  lastRunAt: number | null
  enabled: boolean
  skill?: string
}

export class SchedulerService extends EventEmitter {
  private static instance: SchedulerService
  private tasks: ScheduledTask[] = []
  private storePath: string
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) SchedulerService.instance = new SchedulerService()
    return SchedulerService.instance
  }

  private constructor() {
    super()
    const dir = join(homedir(), '.claude')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.storePath = join(dir, 'automation-tasks.json')
    this.load()
  }


  private load(): void {
    try { if (existsSync(this.storePath)) this.tasks = JSON.parse(readFileSync(this.storePath, 'utf-8')) }
    catch { this.tasks = [] }
  }

  private save(): void {
    try { writeFileSync(this.storePath, JSON.stringify(this.tasks, null, 2)) }
    catch (e) { console.error('[Scheduler] Save error:', e) }
  }

  // ── CRUD ──

  addTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'lastRunAt'>): ScheduledTask {
    const newTask: ScheduledTask = {
      ...task,
      id: randomUUID(),
      createdAt: Date.now(),
      lastRunAt: null,
      activeFrom: task.activeFrom || (task.frequency === 'once' ? this.today() : ''),
    }
    this.tasks.push(newTask)
    this.save()
    this.scheduleTask(newTask)

    // "once" with no time → execute immediately (deferred for IPC response)
    if (task.frequency === 'once' && !task.dailyTime) {
      setTimeout(() => this.runNow(newTask.id), 500)
    }

    console.log(`[Scheduler] Added: "${newTask.name}" freq=${newTask.frequency} time=${newTask.dailyTime} date=${newTask.activeFrom}`)
    return newTask
  }

  updateTask(id: string, updates: Partial<ScheduledTask>): boolean {
    const idx = this.tasks.findIndex(t => t.id === id)
    if (idx === -1) return false
    this.tasks[idx] = { ...this.tasks[idx], ...updates }
    this.save()
    // Clear old timer, schedule new
    this.clearTimer(id)
    this.scheduleTask(this.tasks[idx])
    return true
  }

  deleteTask(id: string): boolean {
    this.clearTimer(id)
    this.tasks = this.tasks.filter(t => t.id !== id)
    this.save()
    return true
  }

  listTasks(): ScheduledTask[] { return [...this.tasks] }

  // ── Scheduling engine ──

  start(): void {
    console.log(`[Scheduler] Starting with ${this.tasks.length} tasks`)
    // Schedule all existing enabled tasks
    for (const task of this.tasks) {
      if (task.enabled) this.scheduleTask(task)
    }
    // Also run a tick every 30s for interval tasks
    setInterval(() => this.tick(), 30_000)
  }

  stop(): void {
    for (const [id] of this.timers) this.clearTimer(id)
  }

  private today(): string { return new Date().toISOString().split('T')[0] }

  /** Schedule the NEXT execution for a task using setTimeout */
  private scheduleTask(task: ScheduledTask): void {
    if (!task.enabled) return
    this.clearTimer(task.id)

    const delay = this.computeDelay(task)
    console.log(`[Scheduler] "${task.name}" next run in ${Math.round(delay/1000)}s (${task.frequency} ${task.dailyTime || 'now'})`)

    if (delay !== null && delay >= 0) {
      const timer = setTimeout(() => {
        this.executeTask(task)
        // Re-schedule for next run
        if (task.frequency === 'interval') {
          setTimeout(() => this.scheduleTask(task), 1000)
        } else if (task.frequency === 'daily') {
          // Schedule next day
          task.lastRunAt = Date.now()
          this.save()
          setTimeout(() => this.scheduleTask(task), 2000)
        }
      }, delay)
      this.timers.set(task.id, timer)
    }
  }

  private computeDelay(task: ScheduledTask): number | null {
    const now = new Date()
    const todayStr = this.today()

    // Date range check
    if (task.activeFrom && todayStr < task.activeFrom) return null // not yet
    if (task.activeTo && todayStr > task.activeTo) return null // expired

    switch (task.frequency) {
      case 'once': {
        const targetDate = task.activeFrom || todayStr
        // Past date → execute now
        if (todayStr > targetDate) {
          return task.lastRunAt ? null : 1000
        }
        // Today with time set
        if (todayStr === targetDate && task.dailyTime) {
          const delay = this.msUntil(task.dailyTime)
          // If time already passed today, execute NOW
          if (delay < 0) {
            console.log(`[Scheduler] Time ${task.dailyTime} already passed — executing now`)
            return task.lastRunAt ? null : 500
          }
          return delay
        }
        // No time → execute now
        return task.lastRunAt ? null : 1000
      }

      case 'daily': {
        if (!task.dailyTime) return null
        let delay = this.msUntil(task.dailyTime)
        if (delay < 0) delay += 24 * 3600_000 // tomorrow
        return delay
      }

      case 'interval': {
        return (task.intervalMinutes || 60) * 60_000
      }
    }
    return null
  }

  /** Milliseconds until HH:MM today */
  private msUntil(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return -1
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
    return target.getTime() - Date.now()
  }

  /** Periodic tick for interval tasks + catch-up */
  private tick(): void {
    const now = Date.now()
    for (const task of this.tasks) {
      if (!task.enabled) continue
      if (task.frequency !== 'interval') continue
      if (task.lastRunAt && (now - task.lastRunAt < task.intervalMinutes * 60_000)) continue
      // Interval task due
      console.log(`[Scheduler] Interval tick: ${task.name}`)
      this.executeTask(task)
      this.scheduleTask(task)
    }
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id)
    if (t) { clearTimeout(t); this.timers.delete(id) }
  }

  // ── Execution ──

  private executeTask(task: ScheduledTask): void {
    console.log(`[Scheduler] EXECUTING: "${task.name}" at ${new Date().toLocaleTimeString()}`)
    task.lastRunAt = Date.now()
    this.save()
    // Emit event — renderer handles terminal creation + prompt sending
    this.emit('executed', task)
  }

  runNow(taskId: string): boolean {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task) return false
    console.log(`[Scheduler] RUN NOW: "${task.name}"`)
    this.executeTask(task)
    return true
  }
}
