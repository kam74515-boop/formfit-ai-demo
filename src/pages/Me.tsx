import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  Check,
  ChevronDown,
  Dumbbell,
  Flame,
  HeartPulse,
  Info,
  Pencil,
  RefreshCcw,
  Share2,
  Sparkles,
  ChevronRight,
  Trash2,
  Volume2,
} from 'lucide-react'
import { EQUIPMENT_LABELS, EXPERIENCE_LABELS, GOAL_LABELS } from '../plan/types'
import type { Equipment, Experience, Goal } from '../plan/types'
import { loadSessions } from '../utils/storage'
import { scoreLevel, shareOrDownload } from '../utils/shareCard'
import { EXERCISES } from '../pose/exercises'
import { toLocalDateKey } from '../health/metrics'
import StatCard from '../components/StatCard'
import ScoreTrendChart from '../components/ScoreTrendChart'
import BodyDataCard from '../components/BodyDataCard'
import DeviceConnectCard from '../components/DeviceConnectCard'

const PROFILE_KEY = 'formfit.profile'
const VOICE_KEY = 'formfit.settings.voice'
const USER_KEY = 'formfit.user'
const HEALTH_MANUAL_KEY = 'formfit.healthManual'

interface ProfileSummary {
  goal: string | null
  experience: string | null
  equipment: string | null
  daysPerWeek: number | null
}

/** 防御式解析档案：JSON 损坏或非对象视为无档案，单字段缺失由 UI 显示「—」 */
function loadProfileSummary(): ProfileSummary | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    const o = p as Record<string, unknown>
    const equipment = Array.isArray(o.equipment)
      ? o.equipment
          .map((e) => EQUIPMENT_LABELS[e as Equipment] ?? null)
          .filter((l): l is string => !!l)
          .join(' / ')
      : ''
    return {
      goal: GOAL_LABELS[o.goal as Goal] ?? null,
      experience: EXPERIENCE_LABELS[o.experience as Experience] ?? null,
      equipment: equipment || null,
      daysPerWeek: typeof o.daysPerWeek === 'number' ? o.daysPerWeek : null,
    }
  } catch {
    return null
  }
}

function loadVoiceSetting(): boolean {
  try {
    const raw = localStorage.getItem(VOICE_KEY)
    if (raw === null) return true
    return JSON.parse(raw) !== false
  } catch {
    return true
  }
}

/** 读取昵称（formfit.user 的 {name}），缺省「训练者」 */
function loadUserName(): string {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return '训练者'
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return '训练者'
    const name = (p as Record<string, unknown>).name
    return typeof name === 'string' && name.trim() ? name.trim().slice(0, 12) : '训练者'
  } catch {
    return '训练者'
  }
}

interface ManualHealth {
  sleepHours?: number
  rhr?: number
  hrv?: number
}

/** 读取手动健康数据（按 YYYY-MM-DD 日期 key 存当日），损坏时视为空 */
function loadManualHealth(): Record<string, ManualHealth> {
  try {
    const raw = localStorage.getItem(HEALTH_MANUAL_KEY)
    if (!raw) return {}
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return {}
    return p as Record<string, ManualHealth>
  } catch {
    return {}
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** 本周一 00:00 的时间戳（与计划页周视图一致，周一为一周起点） */
function weekStartMonday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** 连续训练天数：今天还没练不算断签，从昨天往前数 */
function computeStreak(dates: number[]): number {
  const days = new Set(dates.map((t) => dayKey(new Date(t))))
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function Me() {
  const navigate = useNavigate()
  const profile = useMemo(() => loadProfileSummary(), [])
  const [voice, setVoice] = useState<boolean>(() => loadVoiceSetting())

  // 用户卡：昵称（可编辑）+ 训练等级 + 连续天数
  const [name, setName] = useState<string>(() => loadUserName())
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  // 健康数据导入卡：展开状态 + 三项录入草稿
  const [healthOpen, setHealthOpen] = useState(false)
  const [healthDraft, setHealthDraft] = useState({ sleep: '', rhr: '', hrv: '' })
  const [healthSaved, setHealthSaved] = useState(false)

  // 训练记录：saveSession 前插，最新在前
  const sessions = useMemo(() => loadSessions(), [])
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const stats = useMemo(() => {
    let reps = 0
    const dates: number[] = []
    for (const s of sessions) {
      if (!s || typeof s !== 'object') continue
      if (typeof s.reps === 'number' && Number.isFinite(s.reps)) reps += s.reps
      const t = Date.parse(s.date)
      if (!Number.isNaN(t)) dates.push(t)
    }
    const weekStart = weekStartMonday()
    return {
      total: sessions.length,
      reps,
      week: dates.filter((t) => t >= weekStart).length,
      streak: computeStreak(dates),
    }
  }, [sessions])

  /** 最近一次有效训练（数组首位即最新） */
  const lastSession = sessions.find((s) => s && typeof s === 'object') ?? null

  /** 每个 AI 动作的最近质量等级（无记录为 null） */
  const exerciseLevels = useMemo(
    () =>
      EXERCISES.map((ex) => {
        const s = sessions.find((r) => r && r.exerciseId === ex.id && Number.isFinite(r.avgScore))
        return { ex, level: s ? scoreLevel(s.avgScore) : null }
      }),
    [sessions],
  )

  const handleShare = async () => {
    const s = lastSession
    if (!s || sharing) return
    setSharing(true)
    try {
      const t = Date.parse(s.date)
      const d = Number.isNaN(t) ? new Date() : new Date(t)
      const result = await shareOrDownload({
        exerciseName: s.exerciseName,
        reps: s.reps,
        score: s.avgScore,
        dateText: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`,
        streak: stats.streak,
        source: s.source === 'live' ? '实时训练' : '视频分析',
      })
      setShareToast(result === 'shared' ? '已分享' : '已下载')
    } catch {
      setShareToast('分享失败，请重试')
    } finally {
      setSharing(false)
      window.setTimeout(() => setShareToast(null), 3000)
    }
  }

  const toggleVoice = () => {
    const next = !voice
    setVoice(next)
    try {
      localStorage.setItem(VOICE_KEY, JSON.stringify(next))
    } catch {
      // 存储不可用时静默失败
    }
  }

  const startEditName = () => {
    setNameDraft(name)
    setEditingName(true)
  }

  const saveName = () => {
    const next = nameDraft.trim().slice(0, 12) || '训练者'
    setName(next)
    try {
      localStorage.setItem(USER_KEY, JSON.stringify({ name: next }))
    } catch {
      // 存储不可用时静默失败
    }
    setEditingName(false)
  }

  /** 展开导入卡时回填当日已存的手动值 */
  const toggleHealthForm = () => {
    if (!healthOpen) {
      const today = loadManualHealth()[toLocalDateKey(new Date())]
      setHealthDraft({
        sleep: today?.sleepHours != null ? String(today.sleepHours) : '',
        rhr: today?.rhr != null ? String(today.rhr) : '',
        hrv: today?.hrv != null ? String(today.hrv) : '',
      })
      setHealthSaved(false)
    }
    setHealthOpen(!healthOpen)
  }

  /** 保存到 formfit.healthManual（按日期 key 存当日），非法/空值忽略 */
  const saveHealth = () => {
    const key = toLocalDateKey(new Date())
    const entry: ManualHealth = {}
    const sleep = Number(healthDraft.sleep)
    if (healthDraft.sleep.trim() !== '' && Number.isFinite(sleep) && sleep >= 0 && sleep <= 24) {
      entry.sleepHours = Math.round(sleep * 10) / 10
    }
    const rhr = Number(healthDraft.rhr)
    if (healthDraft.rhr.trim() !== '' && Number.isFinite(rhr) && rhr >= 30 && rhr <= 200) {
      entry.rhr = Math.round(rhr)
    }
    const hrv = Number(healthDraft.hrv)
    if (healthDraft.hrv.trim() !== '' && Number.isFinite(hrv) && hrv >= 5 && hrv <= 300) {
      entry.hrv = Math.round(hrv)
    }
    const map = loadManualHealth()
    if (Object.keys(entry).length === 0) delete map[key]
    else map[key] = entry
    try {
      localStorage.setItem(HEALTH_MANUAL_KEY, JSON.stringify(map))
    } catch {
      // 存储不可用时静默失败
    }
    setHealthSaved(true)
    window.setTimeout(() => setHealthSaved(false), 3000)
  }

  const clearDemoData = () => {
    if (!window.confirm('确定清除所有演示数据吗？将删除本地保存的档案、计划、训练记录与设置，且不可恢复。')) return
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('formfit.'))
        .forEach((k) => localStorage.removeItem(k))
    } catch {
      // 忽略
    }
    window.location.reload()
  }

  const profileFields = [
    { label: '训练目标', value: profile?.goal ?? null },
    { label: '经验水平', value: profile?.experience ?? null },
    { label: '可用器械', value: profile?.equipment ?? null },
    {
      label: '每周训练',
      value: profile?.daysPerWeek != null ? `${profile.daysPerWeek} 天` : null,
    },
  ]

  return (
    <div className="min-h-dvh bg-ink-950 pb-24 text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <span className="font-display text-lg font-bold">我的</span>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 pt-4">
        {/* 用户头部（无卡片包裹）+ 身体数据 strip */}
        <section>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-volt-400 font-display text-base font-bold text-ink-950">
              {name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    maxLength={12}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                    className="h-8 w-full min-w-0 rounded-lg border border-volt-400/50 bg-white/5 px-2.5 text-sm font-semibold outline-none"
                  />
                  <button
                    onClick={saveName}
                    aria-label="保存昵称"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-volt-400 text-ink-950 active:scale-95"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold">{name}</span>
                    <span className="shrink-0 rounded-full border border-volt-400/60 px-1.5 py-px font-display text-[10px] font-semibold text-volt-400">
                      Lv{1 + Math.floor(stats.total / 5)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/35">
                    <Flame size={11} className="text-amber-300" />
                    连续训练 {stats.streak} 天
                  </div>
                </>
              )}
            </div>
            {!editingName && (
              <button
                onClick={startEditName}
                aria-label="编辑昵称"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 active:bg-white/5"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          <div className="mt-3">
            <BodyDataCard />
          </div>
        </section>

        {/* 设备连接 */}
        <DeviceConnectCard />

        {/* 健康数据 */}
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-white/35">健康数据</h3>
          <div className="rounded-2xl border border-white/10 bg-white/5">
            <button onClick={toggleHealthForm} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
              <HeartPulse size={18} className="shrink-0 text-volt-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight">导入今日数据</div>
                <div className="mt-0.5 text-[10px] text-white/35">睡眠 · 静息心率 · HRV</div>
              </div>
              <ChevronDown
                size={16}
                className={`shrink-0 text-white/25 transition-transform ${healthOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {healthOpen && (
              <div className="border-t border-white/5 px-3.5 py-3">
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5">
                    <span className="w-20 shrink-0 text-[11px] text-white/50">昨晚睡眠时长</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={24}
                      step={0.1}
                      value={healthDraft.sleep}
                      onChange={(e) => setHealthDraft({ ...healthDraft, sleep: e.target.value })}
                      placeholder="如 7.5"
                      className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm outline-none focus:border-volt-400/60"
                    />
                    <span className="w-8 shrink-0 text-[11px] text-white/40">h</span>
                  </label>
                  <label className="flex items-center gap-2.5">
                    <span className="w-20 shrink-0 text-[11px] text-white/50">静息心率</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={30}
                      max={200}
                      step={1}
                      value={healthDraft.rhr}
                      onChange={(e) => setHealthDraft({ ...healthDraft, rhr: e.target.value })}
                      placeholder="如 58"
                      className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm outline-none focus:border-volt-400/60"
                    />
                    <span className="w-8 shrink-0 text-[11px] text-white/40">bpm</span>
                  </label>
                  <label className="flex items-center gap-2.5">
                    <span className="w-20 shrink-0 text-[11px] text-white/50">今日 HRV</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={300}
                      step={1}
                      value={healthDraft.hrv}
                      onChange={(e) => setHealthDraft({ ...healthDraft, hrv: e.target.value })}
                      placeholder="如 52"
                      className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm outline-none focus:border-volt-400/60"
                    />
                    <span className="w-8 shrink-0 text-[11px] text-white/40">ms</span>
                  </label>
                </div>
                <button
                  onClick={saveHealth}
                  className="mt-2.5 flex h-9 w-full items-center justify-center rounded-xl bg-volt-400 text-xs font-semibold text-ink-950 active:scale-95"
                >
                  保存今日数据
                </button>
                {healthSaved && (
                  <p className="mt-1.5 text-center text-[11px] text-volt-400">已保存，健康页今日数据已更新</p>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-white/25">
                  演示版手动录入；iOS 正式版将支持 HealthKit 自动同步
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 个人档案 */}
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-white/35">个人档案</h3>
          <div className="rounded-2xl border border-white/10 bg-white/5">
            {profile ? (
              <>
                <div className="grid grid-cols-2 px-3.5 py-2.5">
                  {profileFields.map((f) => (
                    <div key={f.label} className="py-1.5">
                      <div className="text-[10px] text-white/35">{f.label}</div>
                      <div className="mt-0.5 truncate text-sm font-medium">
                        {f.value ?? <span className="text-white/30">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate('/onboarding')}
                  className="flex w-full items-center gap-3 border-t border-white/5 px-3.5 py-2.5 text-left active:bg-white/5"
                >
                  <RefreshCcw size={16} className="shrink-0 text-white/40" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-white/70">重新评估</span>
                  <ChevronRight size={16} className="shrink-0 text-white/25" />
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate('/onboarding')}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/5"
              >
                <Sparkles size={18} className="shrink-0 text-volt-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight">去完成评估</div>
                  <div className="mt-0.5 text-[10px] text-white/35">1 分钟问卷，AI 生成专属训练计划</div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-white/25" />
              </button>
            )}
          </div>
        </section>

        {/* 训练统计 */}
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-white/35">训练统计</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard icon={Activity} label="累计训练" value={stats.total} sub="次" />
            <StatCard icon={Dumbbell} label="累计动作" value={stats.reps} sub="次" />
            <StatCard icon={CalendarDays} label="本周训练" value={stats.week} sub="次" />
            <StatCard icon={Flame} label="连续训练" value={stats.streak} sub="天" accent="text-amber-300" />
          </div>
        </section>

        {/* 我的进步 */}
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-white/35">我的进步</h3>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <ScoreTrendChart sessions={sessions} />
            <div className="mt-2.5 grid grid-cols-5 gap-1.5">
              {exerciseLevels.map(({ ex, level }) => (
                <div key={ex.id} className="rounded-lg bg-white/[0.04] px-1 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: level ? level.color : 'rgba(255,255,255,0.2)' }}
                    />
                    <span className="truncate text-[11px] text-white/70">{ex.name}</span>
                  </div>
                  <div
                    className="mt-0.5 text-[10px] font-medium"
                    style={{ color: level ? level.color : 'rgba(255,255,255,0.3)' }}
                  >
                    {level ? level.name : '—'}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleShare}
              disabled={!lastSession || sharing}
              className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-volt-400/60 text-sm font-medium text-volt-400 transition-colors hover:bg-volt-400/10 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              <Share2 size={15} />
              {sharing ? '生成中…' : '分享我的成绩'}
            </button>
            {shareToast && <p className="mt-1.5 text-center text-[11px] text-volt-400">{shareToast}</p>}
          </div>
        </section>

        {/* 设置 */}
        <section>
          <h3 className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-white/35">设置</h3>
          <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
            <button onClick={() => navigate('/coach')} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/5">
              <Sparkles size={18} className="shrink-0 text-volt-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight">AI 私教</div>
                <div className="mt-0.5 text-[10px] text-white/35">基于你的训练数据，聊聊计划、恢复与动作</div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-white/25" />
            </button>
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <Volume2 size={18} className="shrink-0 text-volt-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight">语音播报</div>
                <div className="mt-0.5 text-[10px] text-white/35">训练时语音反馈计数与纠错提示</div>
              </div>
              <button
                role="switch"
                aria-checked={voice}
                aria-label="语音播报"
                onClick={toggleVoice}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${voice ? 'bg-volt-400' : 'bg-white/15'}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${voice ? 'translate-x-[20px]' : 'translate-x-0'}`}
                />
              </button>
            </div>
            <button onClick={clearDemoData} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/5">
              <Trash2 size={18} className="shrink-0 text-red-300/80" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight text-red-300">清除演示数据</div>
                <div className="mt-0.5 text-[10px] text-white/35">删除本地所有档案、计划与训练记录</div>
              </div>
            </button>
          </div>
        </section>

        {/* 免责声明 */}
        <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[10px] leading-relaxed text-white/35">
          <Info size={12} className="mt-0.5 shrink-0 text-white/25" />
          本应用为产品演示。AI 生成内容仅供参考，不构成医疗建议。训练前请咨询专业人士。
        </div>
      </main>
    </div>
  )
}
