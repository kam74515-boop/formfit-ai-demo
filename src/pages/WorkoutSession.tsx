import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Flag,
  Moon,
  Play,
  Share2,
  SkipForward,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react'
import LiveWorkout from './LiveWorkout'
import { getLibraryExercise } from '../plan/exerciseLibrary'
import { loadSessions } from '../utils/storage'
import { shareOrDownload } from '../utils/shareCard'

/**
 * 计划引导训练流（路由 /workout）：
 * 从 localStorage 'formfit.plan' 读取计划，逐个动作编排执行。
 * 带 AI 纠错的动作嵌入 LiveWorkout（planMode），其余动作为手动勾选指导卡。
 */

// ---------------------------------------------------------------------------
// 计划数据防御式解析
// 实际存储为 WeekPlan（dayIndex/dayLabel/PlannedExercise），
// 同时兼容 {days:[{date,label,focus,exercises:[{id,name,sets,reps,weight,rpe,aiExerciseId}]}]} 结构。
// ---------------------------------------------------------------------------

const PLAN_KEY = 'formfit.plan'
const AI_IDS = new Set(['squat', 'pushup', 'deadlift', 'lunge', 'press'])
const REST_SEC = 60

interface SessionExercise {
  id: string
  name: string
  sets: number
  targetReps: number
  repsLabel: string
  suggestion: string
  aiExerciseId?: string
}

interface SessionDay {
  key: string
  date?: string
  label: string
  focus: string
  restDay: boolean
  exercises: SessionExercise[]
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return dflt
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

/** reps 可能是 number 或 '8-12' / '10-12/腿' / '30-45秒'，取区间中点作为目标次数 */
function parseReps(reps: unknown): { target: number; label: string } {
  if (typeof reps === 'number' && Number.isFinite(reps) && reps > 0) {
    const t = Math.round(reps)
    return { target: t, label: `${t} 次` }
  }
  if (typeof reps === 'string' && reps.trim()) {
    const nums = (reps.match(/\d+/g) ?? []).map(Number)
    const target =
      nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums.length === 1 ? nums[0] : 10
    return { target, label: reps.trim() }
  }
  return { target: 10, label: '10 次' }
}

function normExercise(raw: unknown, idx: number): SessionExercise {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = asStr(o.id) || asStr(o.libraryId) || `ex_${idx}`
  const name = asStr(o.name) || getLibraryExercise(id)?.name || '未命名动作'
  const sets = clampInt(o.sets, 1, 10, 3)
  const { target, label } = parseReps(o.reps)
  const aiRaw = asStr(o.aiExerciseId) || asStr(o.liveId)
  const parts = [
    asStr(o.weight) && `重量 ${asStr(o.weight)}`,
    asStr(o.rpe) && `RPE ${asStr(o.rpe)}`,
    asStr(o.suggestion),
  ].filter(Boolean) as string[]
  return {
    id,
    name,
    sets,
    targetReps: target,
    repsLabel: label,
    suggestion: parts.join(' · ') || '按自身情况选择负荷',
    aiExerciseId: AI_IDS.has(aiRaw) ? aiRaw : undefined,
  }
}

function addDays(iso: string, n: number): string | undefined {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normDay(raw: unknown, idx: number, weekStart?: string): SessionDay {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const dayIndex = clampInt(o.dayIndex, 0, 6, idx)
  const rawDate = asStr(o.date)
  const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
    ? rawDate.slice(0, 10)
    : weekStart
      ? addDays(weekStart, dayIndex)
      : undefined
  const rawEx = Array.isArray(o.exercises) ? o.exercises : []
  const exercises = rawEx.map(normExercise)
  const label = asStr(o.label) || asStr(o.dayLabel) || `第 ${idx + 1} 天`
  const focus = asStr(o.focus) || '训练'
  const restDay = o.restDay === true || (o.restDay !== false && exercises.length === 0)
  return { key: date ?? `idx_${dayIndex}`, date, label, focus, restDay, exercises }
}

/** 读取并规范化计划；失败/为空返回 null */
function readPlanDays(): SessionDay[] | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || !Array.isArray(p.days) || p.days.length === 0) return null
    const ws = /^\d{4}-\d{2}-\d{2}/.test(asStr(p.weekStart)) ? asStr(p.weekStart).slice(0, 10) : undefined
    // dayIndex 约定 0=周一，weekStart 必须是周一才能换算各天日期；
    // 历史脏数据（曾以 toISOString 存 UTC，GMT+8 下偏一天成周日）直接弃用，回退到按星期几匹配
    const weekStart = ws && new Date(`${ws}T00:00:00`).getDay() === 1 ? ws : undefined
    return (p.days as unknown[]).map((d, i) => normDay(d, i, weekStart))
  } catch {
    return null
  }
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 选哪天：?day= 指定 > 今天 > 今天星期对应 > 最近一个训练日 */
function resolveDay(days: SessionDay[], want?: string | null): SessionDay {
  if (want) {
    const hit = days.find((d) => d.date === want)
    if (hit) return hit
  }
  const t = todayISO()
  const byDate = days.find((d) => d.date === t)
  if (byDate) return byDate
  const dowIdx = (new Date().getDay() + 6) % 7
  const byDow = days.find((d, i) => !d.date && (d.key === `idx_${dowIdx}` || i === dowIdx))
  if (byDow) return byDow
  return days.find((d) => !d.restDay && d.exercises.length > 0) ?? days[0]
}

// ---------------------------------------------------------------------------
// 训练流
// ---------------------------------------------------------------------------

interface ExResult {
  done: boolean
  skipped: boolean
  sets: number
  avgScore?: number
}

type Phase = 'run' | 'report'

export default function WorkoutSession() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const days = useMemo(() => readPlanDays(), [])
  const day = useMemo(
    () => (days ? resolveDay(days, searchParams.get('day')) : null),
    [days, searchParams],
  )
  const queue = useMemo(() => day?.exercises ?? [], [day])

  const [phase, setPhase] = useState<Phase>('run')
  const [idx, setIdx] = useState(0)
  const [started, setStarted] = useState(false)
  const resultsRef = useRef<ExResult[]>([])
  const startedAtRef = useRef(new Date().toISOString())

  // 手动动作状态
  const [manualSet, setManualSet] = useState(1)
  const [restLeft, setRestLeft] = useState<number | null>(null)

  // 分享卡状态
  const [sharing, setSharing] = useState(false)
  const [shareHint, setShareHint] = useState<string | null>(null)

  const current: SessionExercise | undefined = queue[idx]

  // 休息倒计时
  useEffect(() => {
    if (restLeft === null) return
    if (restLeft <= 0) {
      setRestLeft(null)
      setManualSet((s) => s + 1)
      return
    }
    const t = setTimeout(() => setRestLeft((s) => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [restLeft])

  const record = useCallback((i: number, r: ExResult) => {
    resultsRef.current[i] = r
  }, [])

  const advance = useCallback(
    (from: number) => {
      setRestLeft(null)
      setManualSet(1)
      if (from + 1 >= queue.length) {
        setPhase('report')
      } else {
        setIdx(from + 1)
      }
    },
    [queue.length],
  )

  const onPlanComplete = useCallback(
    (i: number, res: { sets: number; avgScore: number }) => {
      record(i, { done: true, skipped: false, sets: res.sets, avgScore: res.avgScore })
      advance(i)
    },
    [record, advance],
  )

  const finishManualSet = () => {
    if (!current) return
    if (manualSet >= current.sets) {
      record(idx, { done: true, skipped: false, sets: current.sets })
      advance(idx)
    } else {
      setRestLeft(REST_SEC)
    }
  }

  const skipExercise = () => {
    record(idx, { done: false, skipped: true, sets: 0 })
    advance(idx)
  }

  const finishEarly = () => setPhase('report')

  // ---------- 无计划 / 解析失败 → 引导卡 ----------
  if (!days || !day) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <ClipboardList size={44} className="text-white/25" />
          <p className="font-display text-xl font-bold">还没有可执行的训练计划</p>
          <p className="max-w-xs text-sm leading-relaxed text-white/50">
            先去计划页生成本周计划，再回来按计划开始训练
          </p>
          <button
            onClick={() => navigate('/plan')}
            className="mt-2 flex h-12 items-center gap-2 rounded-2xl bg-volt-400 px-6 font-semibold text-ink-950 shadow-glow active:scale-95"
          >
            <Sparkles size={17} />
            去计划页生成计划
          </button>
        </div>
      </Shell>
    )
  }

  // ---------- 休息日 / 当日无动作 ----------
  if (day.restDay || queue.length === 0) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Moon size={44} className="text-white/25" />
          <p className="font-display text-xl font-bold">
            {day.label} · 休息日
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-white/50">
            这一天没有安排训练动作，好好休息或回计划页看看其他安排
          </p>
          <button
            onClick={() => navigate('/plan')}
            className="mt-2 flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 font-semibold active:scale-95"
          >
            返回计划页
          </button>
        </div>
      </Shell>
    )
  }

  // ---------- 总报告 ----------
  if (phase === 'report') {
    const results = resultsRef.current
    const doneList = queue.filter((_, i) => results[i]?.done)
    const skipped = queue.filter((_, i) => results[i]?.skipped).length
    const totalSets = results.reduce((s, r) => s + (r?.sets ?? 0), 0)
    const aiScores = results.filter((r) => r?.done && r.avgScore !== undefined).map((r) => r!.avgScore!)
    const avgAi =
      aiScores.length > 0 ? Math.round(aiScores.reduce((s, v) => s + v, 0) / aiScores.length) : null

    // 主要问题 Top3：汇总本次训练期间写入 formfit.sessions 的记录
    const agg = new Map<string, number>()
    for (const s of loadSessions()) {
      if (s.date < startedAtRef.current) continue
      for (const it of s.topIssues ?? []) agg.set(it.message, (agg.get(it.message) ?? 0) + it.count)
    }
    const topIssues = [...agg.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    // 分享卡数据：AI 动作实际 reps 来自本次写入的 session，手动动作按 组数×目标次数 估算
    const sinceStart = loadSessions().filter((s) => s.date >= startedAtRef.current)
    const totalReps =
      sinceStart.reduce((s, r) => s + (r.reps ?? 0), 0) +
      queue.reduce(
        (s, e, i) => (results[i]?.done && !e.aiExerciseId ? s + e.sets * e.targetReps : s),
        0,
      )
    const now = new Date()
    const dateText = `${now.getMonth() + 1}月${now.getDate()}日`
    const exerciseName = day.focus && day.focus !== '训练' ? day.focus : '计划训练日'

    const handleShare = async () => {
      if (sharing) return
      setSharing(true)
      try {
        const res = await shareOrDownload({
          exerciseName,
          reps: totalReps,
          score: avgAi ?? 0,
          dateText,
          streak: computeStreak(loadSessions()),
          source: '实时训练',
        })
        setShareHint(res === 'shared' ? '分享卡已送出' : '分享卡已下载，去相册看看')
      } catch {
        setShareHint('生成失败，请重试')
      } finally {
        setSharing(false)
        setTimeout(() => setShareHint(null), 3000)
      }
    }

    return (
      <Shell>
        <Header
          title="本次训练报告"
          progress={1}
          right={
            <button
              onClick={() => navigate('/plan')}
              aria-label="关闭"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-95"
            >
              <X size={17} />
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
          <div className="mx-auto w-full max-w-md">
            <p className="text-center text-sm text-white/50">
              {day.label} · {day.focus}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <Stat label="完成动作" value={`${doneList.length}/${queue.length}`} />
              <Stat label="总组数" value={`${totalSets}`} />
              <Stat label="AI 平均质量分" value={avgAi === null ? '—' : `${avgAi}`} accent={avgAi !== null} />
            </div>
            {skipped > 0 && (
              <p className="mt-3 text-center text-xs text-white/40">跳过 {skipped} 个动作</p>
            )}

            <div className="mt-6">
              <p className="mb-2 text-xs text-white/40">主要问题 Top3</p>
              {topIssues.length === 0 ? (
                <p className="rounded-2xl bg-volt-400/10 p-4 text-center text-sm text-volt-300">
                  动作很标准，没有发现问题
                </p>
              ) : (
                <div className="space-y-2">
                  {topIssues.map((it) => (
                    <div
                      key={it.message}
                      className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3"
                    >
                      <span className="text-sm text-white/80">{it.message}</span>
                      <span className="ml-3 shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 font-display text-xs text-amber-200">
                        ×{it.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleShare}
              disabled={sharing}
              className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 shadow-glow active:scale-95 disabled:opacity-60"
            >
              <Share2 size={17} />
              {sharing ? '正在生成…' : '生成分享卡'}
            </button>
            {shareHint && (
              <p className="mt-2 text-center text-xs text-volt-300/80">{shareHint}</p>
            )}
            <button
              onClick={() => navigate('/plan')}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 font-semibold active:scale-95"
            >
              <Flag size={17} />
              完成，返回计划
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  // ---------- 训练进行中 ----------
  const progress = (idx + (started ? 0 : 0)) / queue.length

  return (
    <Shell>
      <Header
        title={`第 ${idx + 1}/${queue.length} 个动作`}
        progress={progress}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={skipExercise}
              className="flex h-10 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-white/60 active:scale-95"
            >
              <SkipForward size={14} />
              跳过该动作
            </button>
            <button
              onClick={finishEarly}
              className="flex h-10 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-white/60 active:scale-95"
            >
              <Flag size={14} />
              提前结束
            </button>
          </div>
        }
      />

      {!started ? (
        /* 动作队列总览 */
        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
          <div className="mx-auto w-full max-w-md">
            <div className="text-xs text-white/45">
              {day.date ?? ''} {day.label} · {day.focus}
            </div>
            <h2 className="mt-1 font-display text-xl font-bold">今日训练队列</h2>
            <div className="mt-4 space-y-2.5">
              {queue.map((e, i) => (
                <div
                  key={`${e.id}-${i}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
                >
                  <span className="font-display text-sm text-white/30">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{e.name}</span>
                      {e.aiExerciseId && (
                        <span className="flex items-center gap-0.5 rounded-full bg-volt-400/15 px-1.5 py-0.5 text-[10px] text-volt-300">
                          <Zap size={9} />
                          AI 纠错
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {e.sets} 组 × {e.repsLabel} · {e.suggestion}
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-white/20" />
                </div>
              ))}
            </div>
            <button
              onClick={() => setStarted(true)}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 shadow-glow active:scale-95"
            >
              <Play size={17} />
              开始训练
            </button>
          </div>
        </div>
      ) : current?.aiExerciseId ? (
        /* AI 动作：嵌入 LiveWorkout */
        <div className="relative min-h-0 flex-1">
          <LiveWorkout
            key={`${current.aiExerciseId}-${idx}`}
            exerciseId={current.aiExerciseId}
            planMode={{
              targetSets: current.sets,
              targetReps: current.targetReps,
              onPlanComplete: (res) => onPlanComplete(idx, res),
            }}
          />
        </div>
      ) : current ? (
        /* 非 AI 动作：指导卡 + 手动勾选 */
        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-card">
              <div className="text-xs text-white/45">
                {current.sets} 组 × {current.repsLabel}
              </div>
              <h2 className="mt-1 font-display text-2xl font-bold">{current.name}</h2>
              <p className="mt-2 rounded-xl bg-white/5 p-3 text-sm text-white/60">
                负荷建议：{current.suggestion}
              </p>
              <div className="mt-4">
                <p className="mb-2 text-xs text-white/40">动作要点</p>
                <ul className="space-y-2 text-sm leading-relaxed text-white/70">
                  {tipsFor(current.id).map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CircleCheck size={15} className="mt-0.5 shrink-0 text-volt-400/80" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-ink-900/60 px-4 py-3">
                <span className="text-sm text-white/60">当前进度</span>
                <span className="font-display text-lg font-bold text-volt-400">
                  第 {manualSet}/{current.sets} 组
                </span>
              </div>

              {restLeft !== null ? (
                <div className="mt-4 rounded-2xl border border-volt-400/30 bg-volt-400/10 p-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-volt-300">
                    <Timer size={15} />
                    组间休息
                  </div>
                  <div className="mt-1 font-display text-5xl font-bold text-volt-400">{restLeft}</div>
                  <button
                    onClick={() => {
                      setRestLeft(null)
                      setManualSet((s) => s + 1)
                    }}
                    className="mt-3 text-xs text-white/50 underline underline-offset-4"
                  >
                    跳过休息
                  </button>
                </div>
              ) : (
                <button
                  onClick={finishManualSet}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 active:scale-95"
                >
                  <CircleCheck size={17} />
                  完成本组（{manualSet}/{current.sets}）
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  )
}

// ---------------------------------------------------------------------------
// 子组件与文案
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink-950 text-white">{children}</div>
  )
}

function Header({
  title,
  progress,
  right,
}: {
  title: string
  progress: number
  right?: React.ReactNode
}) {
  return (
    <header className="shrink-0 border-b border-white/5 bg-ink-950/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
        <span className="font-display text-base font-bold">{title}</span>
        {right}
      </div>
      <div className="h-0.5 w-full bg-white/10">
        <div
          className="h-full bg-volt-400 transition-all duration-500"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
        />
      </div>
    </header>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
      <div className={`font-display text-2xl font-bold ${accent ? 'text-volt-400' : 'text-white/90'}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-white/40">{label}</div>
    </div>
  )
}

/** 连续训练天数：今天还没练不算断签，从昨天往前数（与「我的」页口径一致） */
function computeStreak(sessions: { date: string }[]): number {
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const days = new Set<string>()
  for (const s of sessions) {
    const t = Date.parse(s.date)
    if (!Number.isNaN(t)) days.add(key(new Date(t)))
  }
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(key(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** 非 AI 动作指导卡要点：按动作模式给通用要点 */function tipsFor(id: string): string[] {
  const lib = getLibraryExercise(id)
  const patternTips: Record<string, string[]> = {
    squat: ['双脚与肩同宽，脚尖略外八', '下蹲时膝盖与脚尖同向', '核心收紧，背部保持平直', '起身时用臀腿发力，不要弓腰'],
    hinge: ['以髋部为轴折叠，膝盖微屈', '全程背部平直，不要弓背', '负重贴近身体移动', '伸髋发力站直，顶端收紧臀部'],
    push: ['核心收紧，身体保持一条直线', '下放时控制速度，不要塌腰', '推起时呼气，顶峰稍作停顿'],
    pull: ['先沉肩再发力，避免耸肩', '以肘带动拉起，感受背部收缩', '顶端停顿 1 秒，缓慢下放'],
    core: ['保持自然呼吸，不要憋气', '动作缓慢可控，避免借力', '骨盆保持稳定，腰部不要塌陷'],
  }
  const tips = lib ? patternTips[lib.pattern] : undefined
  return tips ?? ['动作缓慢可控，全程保持张力', '注意呼吸节奏，发力时呼气', '出现疼痛立即停止', '按自身能力完成目标组次']
}
