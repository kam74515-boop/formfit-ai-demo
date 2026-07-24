import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Info,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Sparkles,
  Timer,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { planDayAdvice, exerciseHistoryTip } from '../agent/insights'
import { compressDay, DAY_LABELS, generateWeekPlan, swapExercise } from '../plan/planEngine'
import {
  addExercise,
  pickerGroups,
  removeExercise,
  setExerciseReps,
  setExerciseSets,
  SETS_MAX,
  SETS_MIN,
} from '../plan/planEditor'
import { GOAL_LABELS, EXPERIENCE_LABELS, EQUIPMENT_LABELS } from '../plan/types'
import type { PlanDay, WeekPlan } from '../plan/types'
import { loadPlan, loadProfile, loadSessions, savePlan } from '../utils/storage'

function todayIndex(): number {
  return (new Date().getDay() + 6) % 7
}

export default function Plan() {
  const navigate = useNavigate()
  const profile = useMemo(() => loadProfile(), [])
  const sessions = useMemo(() => loadSessions(), [])
  const [plan, setPlan] = useState<WeekPlan | null>(() => loadPlan())
  const [compressed, setCompressed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [repsEdit, setRepsEdit] = useState<{ index: number; value: string } | null>(null)

  const regenerate = () => {
    if (!profile) return
    const p = generateWeekPlan(profile, sessions)
    savePlan(p)
    setPlan(p)
    setCompressed(false)
    setEditing(false)
    setPickerOpen(false)
    setRepsEdit(null)
  }

  const swap = (dayIndex: number, exerciseIndex: number) => {
    if (!plan || !profile) return
    const next = swapExercise(plan, dayIndex, exerciseIndex, profile)
    savePlan(next)
    setPlan(next)
  }

  if (!profile || !plan) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-950 px-8 text-center text-white">
        <ClipboardList size={44} className="text-white/25" />
        <p className="font-display text-xl font-bold">还没有训练计划</p>
        <p className="max-w-xs text-sm leading-relaxed text-white/50">
          花 1 分钟完成评估问卷，AI 将按你的目标、器械与恢复状态生成本周计划
        </p>
        <button
          onClick={() => navigate('/onboarding')}
          className="mt-2 flex h-12 items-center gap-2 rounded-2xl bg-volt-400 px-6 font-semibold text-ink-950 shadow-glow active:scale-95"
        >
          <Sparkles size={17} />
          去完成评估
        </button>
      </div>
    )
  }

  const ti = todayIndex()
  const rawToday = plan.days[ti]
  const today: PlanDay = compressed ? compressDay(rawToday, 20) : rawToday
  const firstLive = today.exercises.find((e) => e.liveId)
  const picker = editing && pickerOpen ? pickerGroups(profile, today) : null

  /** 每次编辑立即写回 formfit.plan（首页今日卡与 /workout 读同一 key，自动生效） */
  const mutate = (next: WeekPlan) => {
    savePlan(next)
    setPlan(next)
  }

  const toggleEdit = () => {
    if (editing) {
      setEditing(false)
      setPickerOpen(false)
      setRepsEdit(null)
    } else {
      // 编辑始终作用于完整清单，退出精简视图
      setCompressed(false)
      setEditing(true)
    }
  }

  const commitReps = () => {
    if (!repsEdit) return
    mutate(setExerciseReps(plan, ti, repsEdit.index, repsEdit.value))
    setRepsEdit(null)
  }

  return (
    <div className="min-h-dvh bg-ink-950 pb-24 text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <span className="font-display text-lg font-bold">训练计划</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/45">
            {GOAL_LABELS[profile.goal]} · {EXPERIENCE_LABELS[profile.experience]} · 每周 {profile.daysPerWeek} 天
          </span>
          <button
            onClick={regenerate}
            aria-label="重新生成"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-95"
          >
            <RefreshCcw size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        {plan.warnings.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-200">
            <Info size={15} className="mt-0.5 shrink-0" />
            {plan.warnings.join('；')}
          </div>
        )}

        {/* 今日卡片 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-white/45">
                今天 · {today.dayLabel} · {today.focus}
              </div>
              <h2 className="mt-1 font-display text-xl font-bold">
                {today.restDay ? '休息日' : '今日训练'}
              </h2>
            </div>
            {!today.restDay && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/55">
                  <Clock size={13} />
                  约 {today.estMinutes} 分钟
                </div>
                <button
                  onClick={toggleEdit}
                  className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium active:scale-95 ${
                    editing
                      ? 'bg-volt-400 text-ink-950'
                      : 'border border-white/10 bg-white/5 text-white/60'
                  }`}
                >
                  {editing ? <Check size={13} /> : <Pencil size={12} />}
                  {editing ? '完成' : '编辑'}
                </button>
              </div>
            )}
          </div>

          {/* AI 每日建议 */}
          <div className="mt-3 flex items-start gap-2 border-l-2 border-volt-400/70 pl-3 text-xs leading-relaxed text-white/60">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-volt-400" />
            <span>{planDayAdvice(today)}</span>
          </div>

          {today.restDay ? (
            <p className="mt-4 rounded-2xl bg-white/5 p-4 text-sm leading-relaxed text-white/50">
              今天安排休息，让肌肉充分恢复。可以散步、拉伸，或到「健康」页查看恢复状态。
            </p>
          ) : (
            <>
              <div className="mt-4 space-y-2.5">
                {today.exercises.map((e, i) => {
                  if (editing) {
                    return (
                      <div
                        key={`${e.libraryId}-${i}`}
                        className="flex items-center gap-2 rounded-2xl border border-volt-400/20 bg-white/[0.04] p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{e.name}</span>
                            {e.isMain && (
                              <span className="rounded-full bg-volt-400/15 px-1.5 py-0.5 text-[10px] text-volt-300">主</span>
                            )}
                            {e.liveId && (
                              <span className="flex items-center gap-0.5 rounded-full bg-volt-400/15 px-1.5 py-0.5 text-[10px] text-volt-300">
                                <Zap size={9} />
                                AI 纠错
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <button
                              onClick={() => mutate(setExerciseSets(plan, ti, i, e.sets - 1))}
                              aria-label="减少组数"
                              disabled={e.sets <= SETS_MIN}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-95 disabled:opacity-30"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">{e.sets}</span>
                            <button
                              onClick={() => mutate(setExerciseSets(plan, ti, i, e.sets + 1))}
                              aria-label="增加组数"
                              disabled={e.sets >= SETS_MAX}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-95 disabled:opacity-30"
                            >
                              <Plus size={13} />
                            </button>
                            <span className="ml-0.5 text-xs text-white/40">组 ×</span>
                            {repsEdit?.index === i ? (
                              <input
                                autoFocus
                                value={repsEdit.value}
                                onChange={(ev) => setRepsEdit({ index: i, value: ev.target.value })}
                                onBlur={commitReps}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter') commitReps()
                                  if (ev.key === 'Escape') setRepsEdit(null)
                                }}
                                className="h-8 w-24 rounded-lg border border-volt-400/60 bg-ink-900 px-2 text-xs text-white outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => setRepsEdit({ index: i, value: e.reps })}
                                title="点击编辑次数"
                                className="flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white/75 active:scale-95"
                              >
                                {e.reps}
                              </button>
                            )}
                          </div>
                          {e.note && <div className="mt-1 text-[11px] text-amber-200/80">{e.note}</div>}
                        </div>
                        <button
                          onClick={() => mutate(removeExercise(plan, ti, i))}
                          aria-label="删除动作"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 active:scale-95 active:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  }
                  const historyTip = e.liveId ? exerciseHistoryTip(e.liveId) : null
                  return (
                  <div
                    key={`${e.libraryId}-${i}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{e.name}</span>
                        {e.isMain && (
                          <span className="rounded-full bg-volt-400/15 px-1.5 py-0.5 text-[10px] text-volt-300">主</span>
                        )}
                        {e.liveId && (
                          <span className="flex items-center gap-0.5 rounded-full bg-volt-400/15 px-1.5 py-0.5 text-[10px] text-volt-300">
                            <Zap size={9} />
                            AI 纠错
                          </span>
                        )}
                      </div>
                      {historyTip && (
                        <div className="mt-0.5 text-[11px] text-amber-200/70">{historyTip}</div>
                      )}
                      <div className="mt-1 text-xs text-white/45">
                        {e.sets} 组 × {e.reps} · {e.suggestion}
                      </div>
                      {e.note && <div className="mt-0.5 text-[11px] text-amber-200/80">{e.note}</div>}
                    </div>
                    <button
                      onClick={() => swap(ti, i)}
                      aria-label="换一下"
                      title="换一下"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 active:scale-95"
                    >
                      <ArrowLeftRight size={15} />
                    </button>
                    {e.liveId && (
                      <button
                        onClick={() => navigate(`/live/${e.liveId}`)}
                        aria-label="开始 AI 训练"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-volt-400 text-ink-950 active:scale-95"
                      >
                        <ChevronRight size={17} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                  )
                })}
              </div>

              {/* 添加动作（编辑态） */}
              {editing &&
                (picker ? (
                  <div className="mt-2.5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/50">动作库 · 已按器械与伤病过滤</span>
                      <button
                        onClick={() => setPickerOpen(false)}
                        aria-label="收起"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/50 active:scale-95"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto px-1.5 pb-2">
                      {picker.map((g) => (
                        <div key={g.muscle}>
                          <div className="px-2 pb-1 pt-2 text-[10px] font-medium text-white/35">{g.label}</div>
                          {g.exercises.map((lib) => (
                            <button
                              key={lib.id}
                              onClick={() => mutate(addExercise(plan, ti, lib, profile, sessions))}
                              className="flex h-11 w-full items-center gap-2 rounded-xl px-2 text-left active:bg-white/10"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm">{lib.name}</span>
                              {lib.liveId && <Zap size={11} className="shrink-0 text-volt-400/80" />}
                              {lib.equipment.map((eq) => (
                                <span
                                  key={eq}
                                  className="rounded bg-white/10 px-1 py-0.5 text-[9px] text-white/45"
                                >
                                  {EQUIPMENT_LABELS[eq]}
                                </span>
                              ))}
                              <span className="flex shrink-0 gap-0.5">
                                {[1, 2, 3].map((n) => (
                                  <span
                                    key={n}
                                    className={`h-1 w-1 rounded-full ${
                                      n <= lib.difficulty ? 'bg-volt-400/80' : 'bg-white/15'
                                    }`}
                                  />
                                ))}
                              </span>
                            </button>
                          ))}
                        </div>
                      ))}
                      {picker.length === 0 && (
                        <p className="px-2 py-3 text-xs text-white/35">
                          没有可添加的动作（今日清单已包含全部可用动作）
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 text-sm text-white/50 active:scale-95"
                  >
                    <Plus size={15} />
                    添加动作
                  </button>
                ))}

              {/* 为什么今天练这个 */}
              {today.reason && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white/5 p-3.5 text-xs leading-relaxed text-white/50">
                  <Info size={14} className="mt-0.5 shrink-0 text-volt-400/70" />
                  <span>
                    <span className="text-white/70">为什么今天练这个：</span>
                    {today.reason}
                  </span>
                </div>
              )}

              {!editing && (
                <div className="mt-4 flex gap-2.5">
                  <button
                    onClick={() => navigate(firstLive ? `/live/${firstLive.liveId}` : '/live')}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 shadow-glow active:scale-95"
                  >
                    <Play size={17} />
                    开始训练
                  </button>
                  <button
                    onClick={() => setCompressed((v) => !v)}
                    className={`flex h-12 items-center gap-1.5 rounded-2xl border px-4 text-sm font-medium active:scale-95 ${
                      compressed
                        ? 'border-volt-400 bg-volt-400/15 text-volt-300'
                        : 'border-white/15 bg-white/5 text-white/60'
                    }`}
                  >
                    <Timer size={15} />
                    {compressed ? '已精简' : '只有20分钟'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* 本周视图 */}
        <section className="mt-6">
          <h3 className="mb-3 font-display text-base font-semibold text-white/90">本周视图</h3>
          <div className="grid grid-cols-7 gap-1.5">
            {plan.days.map((d) => {
              const isToday = d.dayIndex === ti
              return (
                <div
                  key={d.dayIndex}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 ${
                    isToday ? 'border-volt-400/60 bg-volt-400/10' : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <span className={`text-[10px] ${isToday ? 'text-volt-300' : 'text-white/40'}`}>
                    {DAY_LABELS[d.dayIndex].slice(1)}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${d.restDay ? 'bg-white/15' : 'bg-volt-400'}`}
                  />
                  <span className={`text-[10px] leading-none ${d.restDay ? 'text-white/25' : 'text-white/70'}`}>
                    {d.restDay ? '休' : d.focus}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] text-white/25">
          计划生成于 {new Date(plan.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          ，完成评估可随时重新生成
        </p>
        <div className="mt-3 text-center">
          <Link to="/onboarding" className="text-xs text-volt-400/80 underline underline-offset-4">
            重新评估
          </Link>
        </div>
      </main>
    </div>
  )
}
