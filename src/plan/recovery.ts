import type { SessionRecord } from '../utils/storage'
import { MUSCLE_BY_LIVE_ID } from './exerciseLibrary'
import type { MuscleGroup } from './types'

export const ALL_MUSCLES: MuscleGroup[] = [
  'lower_push',
  'lower_pull',
  'chest_push',
  'shoulder_push',
  'back_pull',
  'core',
]

/**
 * 单次训练的疲劳残留曲线（简化超量恢复模型）：
 * 练完即刻残留 100% → 24h 剩 50% → 48h 剩 25% → 72h 剩 10% → 96h 归零。
 * 返回 0..1，随时间单调递减。
 */
export function fatigueRemaining(ageHours: number): number {
  if (ageHours <= 0) return 1
  if (ageHours < 24) return 1 - 0.5 * (ageHours / 24)
  if (ageHours < 48) return 0.5 - 0.25 * ((ageHours - 24) / 24)
  if (ageHours < 72) return 0.25 - 0.15 * ((ageHours - 48) / 24)
  if (ageHours < 96) return 0.1 - 0.1 * ((ageHours - 72) / 24)
  return 0
}

/** 单条训练记录对肌群的疲劳量（按次数线性，封顶 60 次 × 0.8） */
function sessionFatigue(s: SessionRecord): number {
  const reps = Math.max(0, Math.min(60, s.reps || 0))
  return reps * 0.8
}

/**
 * 肌群恢复评分 0-100：
 * score = 100 - Σ(每条近 96h 记录的疲劳量 × 时间残留系数)，clamp 0..100。
 * 纯函数，now 可注入便于测试。
 */
export function computeRecovery(
  sessions: SessionRecord[],
  now: number = Date.now(),
): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>
  for (const m of ALL_MUSCLES) {
    let fatigue = 0
    for (const s of sessions) {
      const muscle = MUSCLE_BY_LIVE_ID[s.exerciseId]
      if (muscle !== m) continue
      const t = Date.parse(s.date)
      if (Number.isNaN(t)) continue
      const ageH = (now - t) / 3_600_000
      if (ageH < 0 || ageH >= 96) continue
      fatigue += sessionFatigue(s) * fatigueRemaining(ageH)
    }
    out[m] = Math.round(Math.min(100, Math.max(0, 100 - fatigue)))
  }
  return out
}

/** 某肌群距上次训练的天数；无记录返回 null */
export function daysSinceLastSession(
  sessions: SessionRecord[],
  muscle: MuscleGroup,
  now: number = Date.now(),
): number | null {
  let latest: number | null = null
  for (const s of sessions) {
    if (MUSCLE_BY_LIVE_ID[s.exerciseId] !== muscle) continue
    const t = Date.parse(s.date)
    if (Number.isNaN(t)) continue
    if (latest === null || t > latest) latest = t
  }
  if (latest === null || latest > now) return null
  return Math.floor((now - latest) / 86_400_000)
}
