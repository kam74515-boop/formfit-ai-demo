import { toLocalDateKey } from './metrics'

/** 固定种子伪随机（mulberry32），保证演示数据稳定 */
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DayWellness {
  date: string
  sleepHours: number
  /** 0-100 */
  sleepQuality: number
  /** HRV SDNN ms */
  hrv: number
  /** 静息心率 bpm */
  rhr: number
}

const SEED = 20260720

/** 「我的」页健康数据导入卡写入的手动录入数据：{ [YYYY-MM-DD]: { sleepHours?, hrv?, rhr? } } */
const MANUAL_KEY = 'formfit.healthManual'

interface ManualWellness {
  sleepHours?: number
  hrv?: number
  rhr?: number
}

/** 防御式读取手动录入数据，损坏或不可用时视为空 */
function loadManualWellness(): Record<string, ManualWellness> {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    if (!raw) return {}
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return {}
    return p as Record<string, ManualWellness>
  } catch {
    return {}
  }
}

/** 近 N 天睡眠/HRV/静息心率演示数据（伪随机带合理波动与轻周趋势）；当日有手动录入值时优先覆盖 */
export function generateWellness(days = 14, now: number = Date.now()): DayWellness[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const out: DayWellness[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    const rng = mulberry32(SEED + i)
    const wave = Math.sin((i / days) * Math.PI * 2)
    const sleepHours = Math.round((7.2 + wave * 0.5 + (rng() - 0.5) * 1.2) * 10) / 10
    const sleepQuality = Math.round(
      Math.min(98, Math.max(55, 78 + wave * 8 + (rng() - 0.5) * 16)),
    )
    const hrv = Math.round(Math.min(85, Math.max(28, 52 + wave * 6 + (rng() - 0.5) * 14)))
    const rhr = Math.round(Math.min(72, Math.max(50, 59 - wave * 2 + (rng() - 0.5) * 5)))
    out.push({ date: toLocalDateKey(d), sleepHours, sleepQuality, hrv, rhr })
  }
  // 手动录入的当日数据优先（覆盖当日睡眠/静息心率/HRV，睡眠质量分数仍取演示值）
  const manual = loadManualWellness()
  for (const w of out) {
    const m = manual[w.date]
    if (!m || typeof m !== 'object') continue
    if (typeof m.sleepHours === 'number' && Number.isFinite(m.sleepHours)) w.sleepHours = m.sleepHours
    if (typeof m.hrv === 'number' && Number.isFinite(m.hrv)) w.hrv = Math.round(m.hrv)
    if (typeof m.rhr === 'number' && Number.isFinite(m.rhr)) w.rhr = Math.round(m.rhr)
  }
  return out
}
