import { useState, useEffect } from 'react'
import { useSessionStore } from '../../stores/sessionStore'

// ── Templates (from 1.png) ──

const TEMPLATES = [
  { id: 'ai-news', title: '每日 AI 新闻推送', desc: '关注当天 AI 领域的重要动态', icon: '📰',
    prompt: '帮我整理今天 AI 领域的重要新闻和动态，按重要性排序，每条附简要说明和来源链接',
    freq: 'daily' as const, time: '08:00' },
  { id: 'eng-words', title: '每日 5 个英语单词', desc: '每天推荐 5 个高频实用英语单词', icon: '📝',
    prompt: '推荐 5 个高频实用英语单词，每个给出中英文释义、词性、以及一个实用例句',
    freq: 'daily' as const, time: '09:00' },
  { id: 'bedtime-story', title: '每日儿童睡前故事', desc: '生成 3-5 分钟温和睡前故事', icon: '🌙',
    prompt: '生成一个适合 4-8 岁儿童的温和睡前故事，3-5 分钟可读完，主题温馨有趣',
    freq: 'daily' as const, time: '20:30' },
  { id: 'weekly-report', title: '每周工作周报', desc: '每周五汇总 PR 与 Issue 进展', icon: '📊',
    prompt: '帮我汇总本周所有的 Git 提交、PR 和 Issue 进展，生成一份结构化的周报',
    freq: 'daily' as const, time: '17:00' },
  { id: 'movie-rec', title: '经典电影推荐', desc: '每日推荐一部高分经典电影', icon: '🎬',
    prompt: '推荐一部高分经典电影（8.0+），简要介绍剧情、导演、主演和推荐理由',
    freq: 'daily' as const, time: '12:00' },
  { id: 'today-history', title: '历史上的今天', desc: '挑选一件历史上的重大事件', icon: '📅',
    prompt: '告诉我历史上的今天发生了什么重要事件（科技、文化、政治等领域均可），简要介绍背景和影响',
    freq: 'daily' as const, time: '07:00' },
  { id: 'daily-why', title: '每日一个为什么', desc: '每天抛出一个有趣问题，先提问再解答', icon: '❓',
    prompt: '提出一个有趣的科学或生活问题，先抛出问题让读者思考，再给出详细解答。问题要有趣、有启发性',
    freq: 'daily' as const, time: '10:00' },
  { id: 'family-reminder', title: '父母联系提醒', desc: '每周日提醒给家人打电话', icon: '📞',
    prompt: '今天周日，请温馨提醒我：该给家人打个电话或发消息问候了。附上一句温暖的问候语',
    freq: 'daily' as const, time: '10:00' },
  { id: 'checkup-reminder', title: '体检预约提醒', desc: '指定日期提醒体检', icon: '🏥',
    prompt: '体检提醒：请确认体检预约日期和时间，列出体检前需要注意的事项（空腹、携带证件等）',
    freq: 'once' as const, time: '07:00' },
  { id: 'interview-prep', title: '面试准备提醒', desc: '每 2 小时抽查大模型面试题', icon: '💼',
    prompt: '大模型面试抽查：随机出 3 道 LLM/深度学习相关面试题，涵盖 Transformer 架构、注意力机制、RLHF、训练优化等方向，并给出参考答案',
    freq: 'interval' as const, mins: 120 },
  { id: 'meeting-prep', title: '会议前准备', desc: '提醒整理议题与目标', icon: '📋',
    prompt: '会议准备清单：请帮我梳理今天即将参加的会议，列出需要准备的议题、目标和待决策事项',
    freq: 'daily' as const, time: '08:30' },
  { id: 'pet-wallpaper', title: '可爱萌宠手机壁纸', desc: '随机风格描述萌宠画面', icon: '🐱',
    prompt: '用文字描述一张可爱的萌宠手机壁纸画面，包含宠物种类、场景、色调和风格（随机选择7种风格之一），可以直接用作 AI 绘图 prompt',
    freq: 'daily' as const, time: '06:00' },
]

// ── Types ──

interface Task {
  id: string; name: string; prompt: string; frequency: string
  dailyTime: string; intervalMinutes: number; activeFrom: string; activeTo: string
  enabled: boolean; skill: string; lastRunAt: number | null
}

const emptyForm = {
  name: '', prompt: '', frequency: 'daily' as const, dailyTime: '09:00',
  intervalMinutes: 60, activeFrom: '', activeTo: '', skill: '',
}

// ── Panel ──

export function AutomationPanel() {
  const activeId = useSessionStore(s => s.activeSessionId)
  const [view, setView] = useState<'templates' | 'add' | 'list'>('templates')
  const [tasks, setTasks] = useState<Task[]>([])
  const [form, setForm] = useState({ ...emptyForm })
  const [msg, setMsg] = useState('')

  // Load tasks from scheduler
  useEffect(() => {
    window.electron.invoke('scheduler:list').then((data: any) => {
      if (Array.isArray(data)) setTasks(data)
    })
  }, [view])

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  // ── Actions ──

  const useTemplate = (tpl: typeof TEMPLATES[0]) => {
    setForm({
      name: tpl.title,
      prompt: tpl.prompt,
      frequency: tpl.freq,
      dailyTime: (tpl as any).time || '09:00',
      intervalMinutes: (tpl as any).mins || 60,
      activeFrom: '', activeTo: '', skill: '',
    })
    setView('add')
  }

  const [editingId, setEditingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    const taskData = {
      name: form.name, prompt: form.prompt,
      frequency: form.frequency, dailyTime: form.dailyTime,
      intervalMinutes: form.intervalMinutes,
      activeFrom: form.activeFrom, activeTo: form.activeTo,
      skill: form.skill,
    }
    if (editingId) {
      await window.electron.invoke('scheduler:update', editingId, taskData)
    } else {
      await window.electron.invoke('scheduler:add', taskData)
    }
    setForm({ ...emptyForm })
    setEditingId(null)
    setView('list')
    showMsg(editingId ? '✅ 任务已更新' : '✅ 任务已添加')
  }

  const handleEdit = (task: Task) => {
    setForm({
      name: task.name, prompt: task.prompt,
      frequency: task.frequency as any, dailyTime: task.dailyTime,
      intervalMinutes: task.intervalMinutes,
      activeFrom: task.activeFrom, activeTo: task.activeTo,
      skill: task.skill || '',
    })
    setEditingId(task.id)
    setView('add')
  }

  const handleDelete = async (id: string) => {
    await window.electron.invoke('scheduler:delete', id)
    setTasks(prev => prev.filter(t => t.id !== id))
    showMsg('已删除')
  }

  const handleRunNow = async (task: Task) => {
    // Create terminal session directly, then send prompt
    const desktop = ''
    const session: any = await window.electron.invoke('terminal:create', desktop)
    if (!session) { showMsg('创建终端失败'); return }
    useSessionStore.getState().createSession(session)
    useSessionStore.getState().setActiveSession(session.id)
    setTimeout(() => {
      window.electron.send('terminal:input', session.id, task.prompt + '\r')
      showMsg('▶ 已执行: ' + task.name)
    }, 4000)
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.electron.invoke('scheduler:toggle', id, enabled)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, enabled } : t))
  }

  const freqLabel = (t: Task) => {
    if (t.frequency === 'once') return '单次'
    if (t.frequency === 'daily') return `每天 ${t.dailyTime}`
    if (t.frequency === 'interval') return `每 ${t.intervalMinutes} 分钟`
    return t.frequency
  }

  // ── Render ──

  const tabClass = (v: string) =>
    `flex-1 py-1 text-[10px] rounded transition-colors ${view === v ? 'bg-[#21262d] text-[#e6edf3]' : 'text-[#8b949e] hover:text-[#e6edf3]'}`

  return (
    <div className="flex flex-col animate-slide-in">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#30363d]">
        <button onClick={() => setView('templates')} className={tabClass('templates')}>模板</button>
        <button onClick={() => setView('add')} className={tabClass('add')}>+ 添加</button>
        <button onClick={() => setView('list')} className={tabClass('list')}>我的任务{tasks.length > 0 ? ` (${tasks.length})` : ''}</button>
      </div>

      {/* Message toast */}
      {msg && <div className="px-3 py-1.5 text-[10px] text-[#3fb950] bg-[#1c2e1c]">{msg}</div>}

      {/* ── Templates ── */}
      {view === 'templates' && (
        <div className="py-1">
          <div className="px-3 py-1.5 text-[10px] text-[#484f58] uppercase tracking-wider">
            点击模板 → 自动填充表单
          </div>
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => useTemplate(t)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-[#21262d] border-l-2 border-transparent hover:border-[#30363d] transition-colors cursor-pointer"
            >
              <span className="text-base flex-shrink-0 mt-0.5">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[#e6edf3] font-medium">{t.title}</div>
                <div className="text-[10px] text-[#8b949e] leading-snug mt-0.5">{t.desc}</div>
                <div className="text-[10px] text-[#58a6ff] mt-1">
                  {t.freq === 'daily' ? `每天 ${(t as any).time}` : t.freq === 'interval' ? `每 ${(t as any).mins} 分钟` : '单次'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Add form ── */}
      {view === 'add' && (
        <div className="p-3 space-y-3">
          <div className="text-xs text-[#e6edf3] font-semibold">{editingId ? '编辑自动化任务' : '添加自动化任务'}</div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[#8b949e]">名称 *</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例如：每日 AI 新闻" className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff]" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[#8b949e]">提示词 *</span>
            <textarea value={form.prompt} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
              placeholder="输入 Claude Code 要执行的提示词..." rows={4}
              className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] resize-none" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[#8b949e]">技能（可选）</span>
            <select value={form.skill} onChange={e => setForm(f => ({ ...f, skill: e.target.value }))}
              className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none">
              <option value="">不使用技能</option>
              <option value="/code-review">/code-review</option>
              <option value="/security-review">/security-review</option>
              <option value="/simplify">/simplify</option>
              <option value="/diagnose">/diagnose</option>
              <option value="/verify">/verify</option>
            </select>
          </label>

          {/* 频率 */}
          <div className="space-y-2">
            <span className="text-[10px] text-[#8b949e]">执行频率</span>
            <div className="flex gap-1">
              {(['once', 'daily', 'interval'] as const).map(f => (
                <button key={f}
                  onClick={() => setForm(x => ({ ...x, frequency: f }))}
                  className={`flex-1 py-1 text-[10px] rounded ${form.frequency === f ? 'bg-[#1c2a3e] text-[#58a6ff]' : 'bg-[#0d1117] text-[#8b949e]'}`}>
                  {{ once: '单次', daily: '每天', interval: '按间隔' }[f]}
                </button>
              ))}
            </div>
            {(form.frequency === 'daily' || form.frequency === 'once') && (
              <input type="time" value={form.dailyTime}
                onChange={e => setForm(f => ({ ...f, dailyTime: e.target.value }))}
                className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] outline-none" />
            )}
            {form.frequency === 'interval' && (
              <input type="number" value={form.intervalMinutes} min={1} max={1440}
                onChange={e => setForm(f => ({ ...f, intervalMinutes: Number(e.target.value) }))}
                className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] outline-none w-20"
                placeholder="分钟" />
            )}
          </div>

          {/* 日期 */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[#8b949e]">开始日期</span>
              <input type="date" value={form.activeFrom}
                onChange={e => setForm(f => ({ ...f, activeFrom: e.target.value }))}
                className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[#8b949e]">结束日期</span>
              <input type="date" value={form.activeTo}
                onChange={e => setForm(f => ({ ...f, activeTo: e.target.value }))}
                className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e6edf3] outline-none" />
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setView('templates'); setEditingId(null); setForm({...emptyForm}) }}
              className="flex-1 py-1.5 text-xs text-[#8b949e] bg-[#21262d] hover:bg-[#30363d] rounded">取消</button>
            <button onClick={handleAdd} disabled={!form.name.trim() || !form.prompt.trim()}
              className="flex-1 py-1.5 text-xs text-white bg-[#1c2a3e] hover:bg-[#243656] rounded disabled:opacity-40">{editingId ? '保存' : '添加'}</button>
          </div>
        </div>
      )}

      {/* ── My tasks ── */}
      {view === 'list' && (
        <div className="py-1">
          {tasks.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[#484f58]">
              暂无自动化任务<br />
              <span className="text-[10px]">从模板创建或手动添加</span>
            </div>
          ) : (
            tasks.map(task => (
              <div key={task.id} className="px-3 py-2.5 border-b border-[#21262d] hover:bg-[#1c2128] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${task.enabled ? 'bg-[#3fb950]' : 'bg-[#484f58]'}`} />
                      <span className="text-xs text-[#e6edf3] font-medium truncate">{task.name}</span>
                    </div>
                    <div className="text-[10px] text-[#8b949e] mt-1 truncate">{task.prompt.slice(0, 60)}...</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-[#58a6ff] bg-[#1c2a3e]/50 px-1.5 py-0.5 rounded">
                        {freqLabel(task)}
                      </span>
                      {task.skill && <span className="text-[10px] text-[#a371f7] bg-[#2a1c3e]/50 px-1.5 py-0.5 rounded">{task.skill}</span>}
                      {task.lastRunAt && (
                        <span className="text-[10px] text-[#484f58]">
                          上次: {new Date(task.lastRunAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => handleRunNow(task)}
                      className="text-[10px] px-2 py-0.5 bg-[#1c2a3e] text-[#58a6ff] rounded hover:bg-[#243656]">▶ 执行</button>
                    <button onClick={() => handleEdit(task)}
                      className="text-[10px] px-2 py-0.5 bg-[#21262d] text-[#e6edf3] rounded hover:bg-[#30363d]">✎ 编辑</button>
                    <button onClick={() => handleToggle(task.id, !task.enabled)}
                      className={`text-[10px] px-2 py-0.5 rounded ${task.enabled ? 'bg-[#21262d] text-[#8b949e]' : 'bg-[#1c2e1c] text-[#3fb950]'}`}>
                      {task.enabled ? '停用' : '启用'}
                    </button>
                    <button onClick={() => handleDelete(task.id)}
                      className="text-[10px] px-2 py-0.5 bg-[#3e1c1c] text-[#f85149] rounded hover:bg-[#562424]">删除</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
