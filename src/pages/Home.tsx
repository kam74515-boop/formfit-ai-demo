import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarCheck, ChevronRight, Flame, Settings, Sparkles, Zap } from 'lucide-react'
import { dailyInsights } from '../agent/insights'
import type { Insight } from '../agent/insights'
import { EXERCISES } from '../pose/exercises'
import { computeRecovery } from '../plan/recovery'
import { loadPlan, loadProfile, loadSessions } from '../utils/storage'
import RingProgress from '../components/RingProgress'
import ScoreTrendChart from '../components/ScoreTrendChart'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** 洞察级别配色：good=volt、tip=琥珀、warn=红 */
const LEVEL_STYLE: Record<Insight['level'], { card: string; title: string }> = {
  good: { card: 'border-volt-400/30 bg-volt-400/5', title: 'text-volt-300' },
  tip: { card: 'border-amber-300/30 bg-amber-400/5', title: 'text-amber-200' },
  warn: { card: 'border-red-400/30 bg-red-400/5', title: 'text-red-300' },
}

/** 连续训练天数（当天未练则从昨天往前数，不断签） */
function computeStreak(sessions: { date: string }[]): number {
  const days = new Set(sessions.map((s) => new Date(s.date).toDateString()))
  const cur = new Date()
  if (!days.has(cur.toDateString())) cur.setDate(cur.getDate() - 1)
  let streak = 0
  while (days.has(cur.toDateString())) {
    streak += 1
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

export default function Home() {
  const navigate = useNavigate()
  const sessions = useMemo(() => loadSessions(), [])
  const profile = useMemo(() => loadProfile(), [])
  const plan = useMemo(() => loadPlan(), [])
  const recovery = useMemo(() => computeRecovery(sessions), [sessions])
  const streak = useMemo(() => computeStreak(sessions), [sessions])
  const insights = useMemo(() => dailyInsights(), [])

  const todayIdx = (new Date().getDay() + 6) % 7
  const todayPlan = plan?.days[todayIdx] ?? null

  const lowerAvg = Math.round((recovery.lower_push + recovery.lower_pull) / 2)
  const chestShoulderAvg = Math.round((recovery.chest_push + recovery.shoulder_push) / 2)

  const dateLabel = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="min-h-dvh bg-ink-950 pb-24 text-white">
      {/* App Bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center px-4">
          <div>
            <div className="font-display text-base font-bold leading-tight">{greeting()}</div>
            <div className="text-[11px] text-white/40">{dateLabel}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
              <Flame size={12} />
              {streak} 天
            </span>
            <Link
              to="/coach"
              aria-label="AI 私教"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-volt-400/30 bg-volt-400/10 text-volt-400 active:scale-95"
            >
              <Sparkles size={16} />
            </Link>
            <Link
              to="/me"
              aria-label="设置"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-95"
            >
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 pt-4">
        {/* AI 私教洞察（置顶） */}
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-volt-400" />
            <h2 className="text-sm font-semibold text-white/90">AI 私教洞察</h2>
          </div>
          <div className="space-y-2">
            {insights.slice(0, 2).map((it) => (
              <div
                key={it.id}
                className={`rounded-2xl border p-3.5 ${LEVEL_STYLE[it.level].card}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${LEVEL_STYLE[it.level].title}`}>
                    {it.title}
                  </span>
                  {it.actionTo && (
                    <Link
                      to={it.actionTo}
                      className="shrink-0 text-[11px] text-white/45 active:text-volt-400"
                    >
                      {it.actionLabel ?? '去看看'} ›
                    </Link>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{it.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 今日训练主卡 */}
        <section>
          {profile && plan && todayPlan ? (
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4 shadow-card">
              <div className="flex items-center gap-1.5 text-xs text-white/45">
                <CalendarCheck size={13} />
                今日训练 · {todayPlan.focus}
              </div>
              {todayPlan.restDay ? (
                <div className="mt-3">
                  <div className="font-display text-2xl font-bold">休息日</div>
                  <p className="mt-1 text-xs text-white/45">让肌肉充分恢复，明天继续</p>
                </div>
              ) : (
                <>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {todayPlan.exercises.slice(0, 3).map((e) => (
                      <span
                        key={e.libraryId}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70"
                      >
                        {e.name} {e.sets}×{e.reps}
                      </span>
                    ))}
                    {todayPlan.exercises.length > 3 && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/40">
                        +{todayPlan.exercises.length - 3}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-white/40">预计 {todayPlan.estMinutes} 分钟</span>
                    <button
                      onClick={() => navigate('/workout')}
                      className="flex h-11 items-center gap-1.5 rounded-2xl bg-volt-400 px-5 text-sm font-bold text-ink-950 shadow-glow transition-transform active:scale-95"
                    >
                      <Zap size={16} strokeWidth={2.5} />
                      开始训练
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-volt-400/20 bg-volt-400/5 p-4 shadow-card">
              <div className="flex items-center gap-1.5 text-xs text-volt-300/80">
                <Sparkles size={13} />
                定制你的训练计划
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                1 分钟评估，AI 按你的目标、器械与恢复状态生成本周计划
              </p>
              <button
                onClick={() => navigate('/onboarding')}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-volt-400 text-sm font-bold text-ink-950 shadow-glow transition-transform active:scale-95"
              >
                <Sparkles size={15} />
                去完成评估
              </button>
            </div>
          )}
        </section>

        {/* AI 动作纠错：横向滑动卡流 */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/90">AI 动作纠错</h2>
            <Link
              to="/train"
              className="flex items-center text-[11px] text-white/40 active:text-volt-400"
            >
              查看全部
              <ChevronRight size={13} />
            </Link>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex snap-x snap-mandatory gap-3">
              {EXERCISES.map((ex) => {
                const Icon = ex.icon
                return (
                  <button
                    key={ex.id}
                    onClick={() => navigate(`/exercise/${ex.id}`)}
                    className="w-36 shrink-0 snap-start rounded-2xl border border-white/10 bg-white/5 p-3.5 text-left transition-transform active:scale-[0.97]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt-400/10 text-volt-400">
                        <Icon size={20} />
                      </div>
                      <span className="flex items-center gap-0.5 rounded-full bg-volt-400/15 px-1.5 py-0.5 text-[9px] font-bold text-volt-400">
                        <Zap size={8} />
                        AI
                      </span>
                    </div>
                    <div className="mt-2.5 text-sm font-semibold">{ex.name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-white/40">{ex.muscles}</div>
                    <div className="mt-1.5 text-[10px] text-white/30">
                      {ex.rules.length + 1} 条纠错规则
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* 恢复状态 */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/90">恢复状态</h2>
            <Link
              to="/health"
              className="flex items-center text-[11px] text-white/40 active:text-volt-400"
            >
              健康详情
              <ChevronRight size={13} />
            </Link>
          </div>
          <div className="flex justify-around rounded-2xl border border-white/10 bg-white/5 py-4">
            <RingProgress value={lowerAvg} label="下肢" sub="股四头/臀" />
            <RingProgress value={chestShoulderAvg} label="胸肩" sub="胸/三头/肩" color="#60A5FA" />
            <RingProgress value={recovery.back_pull} label="背部" sub="背/腘绳肌" color="#FBBF24" />
          </div>
        </section>

        {/* 我的进步 */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/90">我的进步</h2>
            <Link
              to="/me"
              className="flex items-center text-[11px] text-white/40 active:text-volt-400"
            >
              查看全部
              <ChevronRight size={13} />
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <ScoreTrendChart sessions={sessions} />
          </div>
        </section>

        {/* 最近训练 */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/90">最近训练</h2>
            <Link
              to="/me"
              className="flex items-center text-[11px] text-white/40 active:text-volt-400"
            >
              查看全部
              <ChevronRight size={13} />
            </Link>
          </div>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-center text-xs text-white/35">
              还没有训练记录，从一组 AI 训练开始吧
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {sessions.slice(0, 5).map((s, i) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? 'border-t border-white/5' : ''}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-volt-400/10 font-display text-xs font-bold text-volt-400">
                    {s.avgScore}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {s.exerciseName} · {s.reps} 次
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/35">
                      {new Date(s.date).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {s.source === 'live' ? '实时训练' : '视频分析'}
                    </div>
                  </div>
                  {s.topIssues[0] && (
                    <span className="max-w-[38%] truncate rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200/80">
                      {s.topIssues[0].message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="pb-2 text-center text-[10px] leading-relaxed text-white/25">
          AI 生成内容仅供参考，不构成医疗建议
        </p>
      </main>
    </div>
  )
}
