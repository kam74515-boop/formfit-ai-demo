import type { SessionRecord } from '../utils/storage'

/** 估算体重常量（问卷未采集体重，演示统一按 65kg 估算自重负荷） */
export const BODYWEIGHT_KG = 65

/** 各 /live 动作的自重负荷体重系数 */
const BW_COEFF_BY_LIVE_ID: Record<string, number> = {
  squat: 0.8,
  lunge: 0.75,
  deadlift: 0.6,
  pushup: 0.65,
  press: 0.3,
}

/** 单条训练记录的外部负荷（吨位，kg）：重量×次数×组数；无重量按自重系数估算 */
export function sessionTonnage(s: SessionRecord): number {
  const reps = Math.max(0, s.reps || 0)
  if (reps === 0) return 0
  const weight = s.weightKg ?? BODYWEIGHT_KG * (BW_COEFF_BY_LIVE_ID[s.exerciseId] ?? 0.5)
  return weight * reps
}

export interface DayLoad {
  /** yyyy-mm-dd（本地时区） */
  date: string
  load: number
}

export function toLocalDateKey(t: number | Date): string {
  const d = typeof t === 'number' ? new Date(t) : t
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 近 days 天每日负荷（含 0 负荷日），升序 */
export function dailyLoads(
  sessions: SessionRecord[],
  days: number,
  now: number = Date.now(),
): DayLoad[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const map = new Map<string, number>()
  for (const s of sessions) {
    const t = Date.parse(s.date)
    if (Number.isNaN(t)) continue
    const key = toLocalDateKey(t)
    map.set(key, (map.get(key) ?? 0) + sessionTonnage(s))
  }
  const out: DayLoad[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    const key = toLocalDateKey(d)
    out.push({ date: key, load: Math.round(map.get(key) ?? 0) })
  }
  return out
}

/** 指数移动平均序列（k=2/(n+1)，首值种子） */
export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

export interface LoadPoint {
  date: string
  load: number
  ctl: number
  atl: number
  tsb: number
}

/** CTL=42天EMA，ATL=7天EMA，TSB=CTL-ATL */
export function computeLoadSeries(
  sessions: SessionRecord[],
  days = 30,
  now: number = Date.now(),
): LoadPoint[] {
  const daily = dailyLoads(sessions, days, now)
  const loads = daily.map((d) => d.load)
  const ctl = emaSeries(loads, 42)
  const atl = emaSeries(loads, 7)
  return daily.map((d, i) => ({
    date: d.date,
    load: d.load,
    ctl: Math.round(ctl[i] * 10) / 10,
    atl: Math.round(atl[i] * 10) / 10,
    tsb: Math.round((ctl[i] - atl[i]) * 10) / 10,
  }))
}

/** ACWR 安全区与 CTL 地板值（CTL 过低时比值失真，按地板值处理） */
export const ACWR_SAFE_LO = 0.8
export const ACWR_SAFE_HI = 1.3
export const CTL_FLOOR = 50

export function acwr(ctl: number, atl: number): number {
  const denom = Math.max(ctl, CTL_FLOOR)
  return Math.round((atl / denom) * 100) / 100
}

export type AcwrZone = 'low' | 'safe' | 'high'

export function acwrZone(value: number): AcwrZone {
  if (value < ACWR_SAFE_LO) return 'low'
  if (value > ACWR_SAFE_HI) return 'high'
  return 'safe'
}

/** 周负荷环比：最近 7 天 / 之前 7 天 - 1（之前 7 天为 0 时返回 null） */
export function weekOverWeek(sessions: SessionRecord[], now: number = Date.now()): number | null {
  const daily = dailyLoads(sessions, 14, now)
  const last7 = daily.slice(7).reduce((s, d) => s + d.load, 0)
  const prev7 = daily.slice(0, 7).reduce((s, d) => s + d.load, 0)
  if (prev7 <= 0) return null
  return Math.round(((last7 - prev7) / prev7) * 100) / 100
}

export interface RiskFlag {
  id: string
  level: 'warn' | 'alert'
  message: string
}

/** 风险预警：ACWR 超区、周增幅>10%、连续3天高疲劳（TSB 显著为负） */
export function detectRisks(series: LoadPoint[], wow: number | null): RiskFlag[] {
  const flags: RiskFlag[] = []
  if (series.length === 0) return flags
  const latest = series[series.length - 1]
  const acwrNow = acwr(latest.ctl, latest.atl)
  if (acwrNow > ACWR_SAFE_HI) {
    flags.push({
      id: 'acwr_high',
      level: 'alert',
      message: `近期负荷比（ACWR ${acwrNow.toFixed(2)}）高于安全区，建议降低训练量或安排休息`,
    })
  } else if (acwrNow < ACWR_SAFE_LO && latest.ctl >= CTL_FLOOR) {
    flags.push({
      id: 'acwr_low',
      level: 'warn',
      message: `近期负荷比（ACWR ${acwrNow.toFixed(2)}）偏低，训练刺激不足，可循序渐进加量`,
    })
  }
  if (wow !== null && wow > 0.1) {
    flags.push({
      id: 'wow',
      level: 'alert',
      message: `本周负荷较上周增加 ${Math.round(wow * 100)}%，超过 10% 建议幅度，注意减量`,
    })
  }
  // 连续 3 天高疲劳：TSB 连续 < -0.25×CTL
  let streak = 0
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i]
    if (p.ctl >= CTL_FLOOR && p.tsb < -0.25 * p.ctl) streak += 1
    else break
  }
  if (streak >= 3) {
    flags.push({
      id: 'fatigue_streak',
      level: 'warn',
      message: `已连续 ${streak} 天处于高疲劳状态，建议安排低强度日或休息`,
    })
  }
  return flags
}
