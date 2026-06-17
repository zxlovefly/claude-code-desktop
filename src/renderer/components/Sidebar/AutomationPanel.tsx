import { useState, useEffect } from 'react'

interface Task {
  id: string; name: string; prompt: string; frequency: string; dailyTime: string; enabled: boolean; intervalMinutes?: number; weekDay?: number
}

const PRESETS = [
  { name: '每日代码审查', prompt: '帮我审查今天提交的代码，检查潜在bug、安全隐患、代码风格问题，并给出改进建议。', freq: 'daily', time: '09:00' },
  { name: '生成工作周报', prompt: '帮我根据本周的代码提交记录和项目进展生成一份结构化周报，包含：关键成果、进行中工作、风险项、下周计划。', freq: 'weekly', time: '17:00' },
  { name: '项目健康巡检', prompt: '帮我检查当前项目的依赖版本、安全漏洞(CVE)、测试覆盖率、代码质量指标(圈复杂度/重复率)、文档完整度，并给出综合健康评分。', freq: 'weekly', time: '08:00' },
  { name: '技术资讯摘要', prompt: '帮我整理今天人工智能和前端开发领域的最新技术资讯、重要发布、社区热点，用中文简要总结。', freq: 'daily', time: '10:00' },
  { name: '代码库更新日报', prompt: '帮我总结过去24小时内代码库的所有变更：新增功能、Bug修复、重构、依赖更新，按影响程度排序。', freq: 'daily', time: '08:30' },
  { name: 'API 文档同步检查', prompt: '检查当前项目的API文档是否与代码实现一致，列出不一致的地方并建议修复方案。', freq: 'weekly', time: '14:00' },
  { name: '数据库备份提醒', prompt: '检查数据库备份策略是否正常运行，确认最近一次备份的时间和完整性，如有问题请告警。', freq: 'daily', time: '06:00' },
  { name: '安全漏洞扫描', prompt: '扫描项目依赖中是否存在已知安全漏洞(CVE)，特别是Critical和High级别的漏洞，并提供修复建议。', freq: 'weekly', time: '03:00' },
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

interface Props { onExecute: (prompt: string) => void }

export function AutomationPanel({ onExecute }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', prompt: '', frequency: 'daily', dailyTime: '09:00', intervalMinutes: 60, weekDay: 1 })
  const [activeTab, setActiveTab] = useState<'presets' | 'tasks'>('presets')

  useEffect(() => { refresh() }, [])

  const refresh = async () => {
    const data: any = await window.electron.invoke('scheduler:list')
    if (Array.isArray(data)) setTasks(data)
  }

  const addTask = async () => {
    if (!form.name || !form.prompt) return
    await window.electron.invoke('scheduler:add', { name: form.name, prompt: form.prompt, frequency: form.frequency, dailyTime: form.dailyTime, intervalMinutes: form.intervalMinutes, weekDay: form.weekDay })
    setForm({ name: '', prompt: '', frequency: 'daily', dailyTime: '09:00', intervalMinutes: 60, weekDay: 1 }); setShowAdd(false); refresh()
  }

  const addPreset = async (p: typeof PRESETS[0]) => {
    await window.electron.invoke('scheduler:add', { name: p.name, prompt: p.prompt, frequency: p.freq, dailyTime: p.time, intervalMinutes: 60, weekDay: 1 })
    refresh()
  }

  const freqLabel = (t: Task) => {
    switch (t.frequency) {
      case 'daily': return `每天 ${t.dailyTime || '09:00'}`
      case 'weekly': return `每${WEEKDAYS[t.weekDay || 1]} ${t.dailyTime || '09:00'}`
      case 'interval': return `每 ${t.intervalMinutes || 60} 分钟`
      case 'once': return t.dailyTime ? `单次 ${t.dailyTime}` : '单次执行'
      default: return t.frequency
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f6f8]">
      <div className="px-4 py-3 bg-white border-b border-[#e5e6eb]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a2e]">自动化</h2>
            <p className="text-[10px] text-[#9a9ab0] mt-0.5">定时 AI 任务 · {tasks.length} 个活跃任务 · 点击执行可发送到 Chat</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 bg-[#6c5ce7] text-white rounded-lg text-xs font-medium hover:bg-[#5a4bd1]">+ 新建</button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-3">
          <button onClick={() => setActiveTab('presets')} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${activeTab === 'presets' ? 'bg-[#6c5ce7] text-white' : 'text-[#4a4a6a] bg-[#f0f0f5] hover:bg-[#e5e5f0]'}`}>推荐模板 ({PRESETS.length})</button>
          <button onClick={() => setActiveTab('tasks')} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${activeTab === 'tasks' ? 'bg-[#6c5ce7] text-white' : 'text-[#4a4a6a] bg-[#f0f0f5] hover:bg-[#e5e5f0]'}`}>我的任务 ({tasks.length})</button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mt-3 p-3 bg-[#f5f6f8] rounded-xl border border-[#e5e6eb] space-y-2">
            <input placeholder="任务名称 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7]" />
            <textarea placeholder="AI 指令内容 *" value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} rows={3} className="w-full bg-white border border-[#e5e6eb] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#6c5ce7] resize-none" />
            <div className="flex gap-2 flex-wrap items-center">
              <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="bg-white border border-[#e5e6eb] rounded-lg px-2 py-1 text-xs outline-none">
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="interval">间隔(分钟)</option>
                <option value="once">一次性</option>
              </select>
              {(form.frequency === 'daily' || form.frequency === 'weekly' || (form.frequency === 'once' && form.dailyTime)) && (
                <input type="time" value={form.dailyTime} onChange={e => setForm({ ...form, dailyTime: e.target.value })} className="bg-white border border-[#e5e6eb] rounded-lg px-2 py-1 text-xs outline-none" />
              )}
              {form.frequency === 'weekly' && (
                <select value={form.weekDay} onChange={e => setForm({ ...form, weekDay: +e.target.value })} className="bg-white border border-[#e5e6eb] rounded-lg px-2 py-1 text-xs outline-none">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              {form.frequency === 'interval' && (
                <div className="flex items-center gap-1">
                  <input type="number" placeholder="60" value={form.intervalMinutes} onChange={e => setForm({ ...form, intervalMinutes: +e.target.value })} className="w-20 bg-white border border-[#e5e6eb] rounded-lg px-2 py-1 text-xs outline-none" />
                  <span className="text-[10px] text-[#9a9ab0]">分钟</span>
                </div>
              )}
            </div>
            <div className="flex gap-2"><button onClick={addTask} className="px-3 py-1 bg-[#6c5ce7] text-white rounded-lg text-[10px] font-medium">创建</button><button onClick={() => setShowAdd(false)} className="px-3 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded-lg text-[10px]">取消</button></div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {activeTab === 'presets' && (
          <div>
            <h3 className="text-[11px] font-semibold text-[#4a4a6a] mb-2">推荐模板 · 点击使用或添加到我的任务</h3>
            <div className="space-y-2">
              {PRESETS.map((p, i) => (
                <div key={i} className="bg-white border border-[#e5e6eb] rounded-xl p-3 flex items-start justify-between hover:border-[#6c5ce7]/20 hover:shadow-sm transition-all">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1a1a2e]">{p.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] bg-[#6c5ce7]/8 text-[#6c5ce7] font-medium">{p.freq === 'daily' ? '每天' : '每周'} {p.time}</span>
                    </div>
                    <div className="text-[10px] text-[#9a9ab0] mt-0.5 line-clamp-2">{p.prompt}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => { onExecute(p.prompt); addPreset(p) }} className="px-2.5 py-1.5 bg-[#6c5ce7] text-white rounded text-[9px] font-medium hover:bg-[#5a4bd1]">执行</button>
                    <button onClick={() => addPreset(p)} className="px-2.5 py-1.5 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">添加</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-[#9a9ab0] text-xs">暂无任务，从推荐模板中添加或创建新任务</div>
            ) : (
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className={`bg-white border rounded-xl p-3 ${t.enabled ? 'border-[#e5e6eb]' : 'border-[#e5e6eb] opacity-50'}`}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.enabled ? 'bg-[#00b894]' : 'bg-[#9a9ab0]'}`} />
                            <span className="text-sm font-medium text-[#1a1a2e] truncate">{t.name}</span>
                          </div>
                          <div className="text-[10px] text-[#9a9ab0] mt-1 truncate">{t.prompt}</div>
                          <div className="text-[9px] text-[#c0c0d0] mt-1">{freqLabel(t)}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2 flex-wrap justify-end">
                          <button onClick={() => onExecute(t.prompt)} className="px-2 py-1 bg-[#6c5ce7]/5 text-[#6c5ce7] rounded text-[9px] hover:bg-[#6c5ce7]/10">执行</button>
                          <button onClick={() => { setEditingId(t.id); const weeklyDay = (t as any).weekDay ?? 1; setForm({ name: t.name, prompt: t.prompt, frequency: t.frequency, dailyTime: t.dailyTime || '09:00', intervalMinutes: (t as any).intervalMinutes || 60, weekDay: weeklyDay }) }} className="px-2 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px] hover:bg-[#e5e5f0]">编辑</button>
                          <button onClick={async () => { await window.electron.invoke('scheduler:toggle', t.id, !t.enabled); refresh() }} className={`px-2 py-1 rounded text-[9px] ${t.enabled ? 'bg-[#f0f0f5] text-[#4a4a6a]' : 'bg-[#00b894]/5 text-[#00b894]'}`}>{t.enabled ? '停用' : '启用'}</button>
                          <button onClick={async () => { await window.electron.invoke('scheduler:delete', t.id); refresh() }} className="px-2 py-1 bg-[#e17055]/5 text-[#e17055] rounded text-[9px]">删除</button>
                        </div>
                      </div>
                      {/* Inline edit form */}
                      {editingId === t.id && (
                        <div className="p-2 bg-[#f5f6f8] rounded-lg border border-[#e5e6eb] space-y-1.5">
                          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-white border border-[#e5e6eb] rounded px-2 py-1 text-[10px] outline-none focus:border-[#6c5ce7]" placeholder="名称" />
                          <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} rows={2} className="w-full bg-white border border-[#e5e6eb] rounded px-2 py-1 text-[10px] outline-none focus:border-[#6c5ce7] resize-none" placeholder="指令" />
                          <div className="flex gap-2 flex-wrap items-center">
                            <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="bg-white border border-[#e5e6eb] rounded px-2 py-1 text-[10px] outline-none">
                              <option value="daily">每天</option><option value="weekly">每周</option><option value="interval">间隔</option><option value="once">一次性</option>
                            </select>
                            {(form.frequency === 'daily' || form.frequency === 'weekly' || (form.frequency === 'once' && form.dailyTime)) && (
                              <input type="time" value={form.dailyTime} onChange={e => setForm({ ...form, dailyTime: e.target.value })} className="bg-white border border-[#e5e6eb] rounded px-2 py-1 text-[10px] outline-none" />
                            )}
                            {form.frequency === 'weekly' && (
                              <select value={form.weekDay} onChange={e => setForm({ ...form, weekDay: +e.target.value })} className="bg-white border border-[#e5e6eb] rounded px-2 py-1 text-[10px] outline-none">
                                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                              </select>
                            )}
                            {form.frequency === 'interval' && (
                              <div className="flex items-center gap-1">
                                <input type="number" value={form.intervalMinutes} onChange={e => setForm({ ...form, intervalMinutes: +e.target.value })} className="w-16 bg-white border border-[#e5e6eb] rounded px-2 py-1 text-[10px] outline-none" />
                                <span className="text-[9px] text-[#9a9ab0]">分钟</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              const updates: any = { name: form.name, prompt: form.prompt, frequency: form.frequency, dailyTime: form.dailyTime }
                              if (form.frequency === 'interval') updates.intervalMinutes = form.intervalMinutes
                              if (form.frequency === 'weekly') updates.weekDay = form.weekDay
                              await window.electron.invoke('scheduler:update', t.id, updates); setEditingId(null); refresh()
                            }} className="px-2 py-1 bg-[#6c5ce7] text-white rounded text-[9px]">保存</button>
                            <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-[#f0f0f5] text-[#4a4a6a] rounded text-[9px]">取消</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
