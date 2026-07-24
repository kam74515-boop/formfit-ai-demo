import { useMemo } from 'react'
import { dailyInsights } from '../agent/insights'
import {
  Activity,
  BatteryCharging,
  BedDouble,
  Flame,
  HeartPulse,
  Info,
  Moon,
  Sparkles,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react'
import {
  ACWR_SAFE_HI,
  ACWR_SAFE_LO,
  acwr,
  acwrZone,
  computeLoadSeries,
  detectRisks,
  sessionTonnage,
  weekOverWeek,
} from '../health/metrics'
import type { LoadPoint } from '../health/metrics'
import { generateWellness } from '../health/mockData'
import { ALL_MUSCLES, computeRecovery } from '../plan/recovery'
import { loadSessions } from '../utils/storage'
import StatCard from '../components/StatCard'

const ZONE_STYLE = {
  low: { color: 'text-blue-300', bg: 'bg-blue-400/15', label: '偏低' },
  safe: { color: 'text-volt-400', bg: 'bg-volt-400/15', label: '安全区' },
  high: { color: 'text-red-300', bg: 'bg-red-400/15', label: '超区' },
} as const

export default function Health() {
  const sessions = useMemo(() => loadSessions(), [])
  const series = useMemo(() => computeLoadSeries(sessions, 30), [sessions])
  const wellness = useMemo(() => generateWellness(14), [])
  const muscleRec = useMemo(() => computeRecovery(sessions), [sessions])
  const wow = useMemo(() => weekOverWeek(sessions), [sessions])
  const risks = useMemo(() => detectRisks(series, wow), [series, wow])
  // AI 每日解读：优先取非 good 的第一条（有状况先说状况），否则取第一条
  const insights = useMemo(() => dailyInsights(), [])
  const dailyAi = insights.find((i) => i.level !== 'good') ?? insights[0]

  const latest = series[series.length - 1]
  const acwrNow = latest ? acwr(latest.ctl, latest.atl) : 0
  const zone = acwrZone(acwrNow)

  // 今日恢复评分：训练恢复(50%) + 睡眠质量(30%) + HRV(20%，演示数据)
  const todayW = wellness[wellness.length - 1]
  const muscleAvg = Math.round(ALL_MUSCLES.reduce((s, m) => s + muscleRec[m], 0) / ALL_MUSCLES.length)
  const hrvNorm = Math.min(100, Math.round((todayW.hrv / 85) * 100))
  const recoveryScore = Math.round(0.5 * muscleAvg + 0.3 * todayW.sleepQuality + 0.2 * hrvNorm)
  const advice =
    recoveryScore >= 75 ? '建议正常训练' : recoveryScore >= 55 ? '建议减量训练' : '建议休息或主动恢复'

  // 周报数据
  const weekSessions = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000
    return sessions.filter((s) => Date.parse(s.date) >= cutoff)
  }, [sessions])
  const weekReps = weekSessions.reduce((s, r) => s + r.reps, 0)
  const weekTonnage = Math.round(weekSessions.reduce((s, r) => s + sessionTonnage(r), 0))
  const acwrWeekAgo = series.length > 7 ? acwr(series[series.length - 8].ctl, series[series.length - 8].atl) : acwrNow
  const acwrTrend = acwrNow > acwrWeekAgo + 0.05 ? '上升' : acwrNow < acwrWeekAgo - 0.05 ? '下降' : '平稳'
  const avgSleep = Math.round(wellness.reduce((s, w) => s + w.sleepQuality, 0) / wellness.length)
  const nextWeekAdvice =
    zone === 'high'
      ? '下周建议削减 20-30% 训练量，优先恢复'
      : zone === 'low'
        ? '下周可循序渐进增加约 10% 训练量'
        : '下周维持当前负荷，按计划推进即可'
  const sleepNote =
    avgSleep < 70
      ? '本周睡眠质量（演示数据）偏低，恢复评分同步走弱，建议优先保证睡眠时长'
      : '本周睡眠与恢复指标（演示数据）总体匹配良好'

  return (
    <div className="min-h-dvh bg-ink-950 pb-24 text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <span className="font-display text-lg font-bold">健康解读</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/45">睡眠/HRV 为演示数据</span>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-5">
        {/* AI 每日解读 */}
        {dailyAi && (
          <div className="flex items-start gap-2 rounded-r-2xl border-l-2 border-volt-400/70 bg-white/[0.04] p-3.5 text-xs leading-relaxed text-white/65">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-volt-400" />
            <span>
              <b className="text-white/85">{dailyAi.title}：</b>
              {dailyAi.body}
            </span>
          </div>
        )}

        {/* 负荷曲线 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-white/40" />
            <h2 className="font-display text-base font-semibold">近 30 天负荷曲线</h2>
          </div>
          <div className="mt-4">
            <LoadChart series={series} />
          </div>
          <div className="mt-2 flex justify-center gap-4 text-[11px] text-white/50">
            <span className="flex items-center gap-1"><i className="h-0.5 w-3 rounded bg-[#60A5FA]" />CTL 体能</span>
            <span className="flex items-center gap-1"><i className="h-0.5 w-3 rounded bg-[#D4FF3F]" />ATL 疲劳</span>
            <span className="flex items-center gap-1"><i className="h-0.5 w-3 rounded bg-[#FBBF24]" />TSB 状态</span>
          </div>
        </section>

        {/* ACWR + 恢复 */}
        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-card">
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <Activity size={14} className="text-white/40" />
              近期负荷比 ACWR
            </div>
            <div className={`mt-2 font-display text-4xl font-bold ${ZONE_STYLE[zone].color}`}>
              {acwrNow.toFixed(2)}
            </div>
            {/* 安全区色带 */}
            <div className="relative mt-3 h-2 overflow-hidden rounded-full">
              <div className="absolute inset-y-0 left-0 bg-blue-400/50" style={{ width: '40%' }} />
              <div className="absolute inset-y-0 bg-volt-400/70" style={{ left: '40%', width: '25%' }} />
              <div className="absolute inset-y-0 right-0 bg-red-400/60" style={{ width: '35%' }} />
              <div
                className="absolute top-0 h-full w-1 rounded bg-white shadow"
                style={{ left: `calc(${Math.min(97, Math.max(2, (acwrNow / 2) * 100))}% - 2px)` }}
              />
            </div>
            <div className="mt-1.5 text-[10px] text-white/35">
              安全区 {ACWR_SAFE_LO}-{ACWR_SAFE_HI} · 当前{ZONE_STYLE[zone].label}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-card">
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              <BatteryCharging size={14} className="text-white/40" />
              今日恢复评分
            </div>
            <div
              className={`mt-2 font-display text-4xl font-bold ${
                recoveryScore >= 75 ? 'text-volt-400' : recoveryScore >= 55 ? 'text-amber-300' : 'text-red-300'
              }`}
            >
              {recoveryScore}
            </div>
            <div className="mt-2 text-xs text-white/55">{advice}</div>
            <div className="mt-1.5 space-y-0.5 text-[10px] text-white/35">
              <div>训练恢复 {muscleAvg}% · 睡眠 {todayW.sleepQuality} 分</div>
              <div>HRV {todayW.hrv}ms · 静息 {todayW.rhr}bpm（演示）</div>
            </div>
          </section>
        </div>

        {/* 概要统计 */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Flame} label="本周训练" value={`${weekSessions.length} 次`} sub={`${weekReps} 次动作`} />
          <StatCard icon={TrendingUp} label="本周吨位" value={`${(weekTonnage / 1000).toFixed(1)}t`} sub="自重系数估算" />
          <StatCard
            icon={Moon}
            label="平均睡眠"
            value={`${(wellness.reduce((s, w) => s + w.sleepHours, 0) / wellness.length).toFixed(1)}h`}
            sub="演示数据"
            accent="text-blue-300"
          />
        </div>

        {/* 风险预警 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <TriangleAlert size={16} className="text-amber-300/80" />
            <h2 className="font-display text-base font-semibold">风险预警</h2>
          </div>
          {risks.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-volt-400/10 p-4 text-center text-sm text-volt-300">
              负荷与恢复处于安全区间，继续保持
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {risks.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-sm leading-relaxed ${
                    r.level === 'alert'
                      ? 'border-red-400/30 bg-red-400/10 text-red-200'
                      : 'border-amber-300/30 bg-amber-400/10 text-amber-100'
                  }`}
                >
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  {r.message}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-white/30">以上提示仅基于训练负荷数据，不构成医疗建议</p>
        </section>

        {/* AI 周报 */}
        <section className="rounded-3xl border border-volt-400/20 bg-gradient-to-b from-volt-400/10 to-transparent p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-volt-400" />
            <h2 className="font-display text-base font-semibold">AI 训练周报</h2>
          </div>
          <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-white/70">
            <p>
              本周完成 <b className="text-white">{weekSessions.length} 次训练</b>，共 {weekReps} 次动作，
              估算总吨位 <b className="text-white">{(weekTonnage / 1000).toFixed(2)} 吨</b>；
              近期负荷比 {acwrNow.toFixed(2)}，较上周{acwrTrend}，处于{ZONE_STYLE[zone].label}。
            </p>
            <p>
              肌群平均恢复 {muscleAvg}%，{sleepNote}。
            </p>
            <p>{nextWeekAdvice}。</p>
          </div>
          <div className="mt-4 flex items-start gap-1.5 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/35">
            <Info size={12} className="mt-0.5 shrink-0" />
            由 AI 生成，仅供参考，不构成医疗建议
          </div>
        </section>

        {/* 演示数据明细 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <BedDouble size={16} className="text-white/40" />
            <h2 className="font-display text-base font-semibold">近 14 天睡眠与恢复</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/45">演示数据</span>
          </div>
          <div className="mt-4 space-y-1.5">
            {wellness.slice(-7).map((w) => (
              <div key={w.date} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 font-display text-white/40">{w.date.slice(5)}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-blue-400/70" style={{ width: `${(w.sleepHours / 10) * 100}%` }} />
                </div>
                <span className="w-10 text-right font-display text-white/70">{w.sleepHours}h</span>
                <span className="flex w-20 items-center justify-end gap-1 text-white/40">
                  <HeartPulse size={11} className="text-red-300/60" />
                  {w.hrv}ms
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

/** CTL/ATL/TSB 三线 SVG 图 */
function LoadChart({ series }: { series: LoadPoint[] }) {
  const W = 600
  const H = 170
  const pad = 8
  if (series.length === 0) return null
  const all = series.flatMap((p) => [p.ctl, p.atl, p.tsb])
  let lo = Math.min(...all, 0)
  let hi = Math.max(...all, 1)
  if (hi - lo < 1) hi = lo + 1
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2)
  const line = (key: 'ctl' | 'atl' | 'tsb') =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {lo < 0 && (
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
      )}
      <path d={line('ctl')} fill="none" stroke="#60A5FA" strokeWidth={2} />
      <path d={line('atl')} fill="none" stroke="#D4FF3F" strokeWidth={2} />
      <path d={line('tsb')} fill="none" stroke="#FBBF24" strokeWidth={1.6} strokeOpacity={0.9} />
    </svg>
  )
}
