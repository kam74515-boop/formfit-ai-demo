import { sessionTonnage } from '../health/metrics'
import type { SessionRecord } from '../utils/storage'
import {
  EXERCISE_LIBRARY,
  equipmentAllowed,
  getLibraryExercise,
  alternativesOf,
} from './exerciseLibrary'
import { ALL_MUSCLES, computeRecovery, daysSinceLastSession } from './recovery'
import type {
  Injury,
  LibraryExercise,
  MuscleGroup,
  PlanDay,
  PlannedExercise,
  Profile,
  WeekPlan,
} from './types'
import { MUSCLE_LABELS } from './types'

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 分化模板：训练日在周一至周日中的槽位 + 当日焦点 */
const SPLIT_TEMPLATES: Record<number, { slots: number[]; focus: string[] }> = {
  2: { slots: [0, 3], focus: ['全身A', '全身B'] },
  3: { slots: [0, 2, 4], focus: ['推', '拉', '腿'] },
  4: { slots: [0, 1, 3, 4], focus: ['上肢', '下肢', '上肢', '下肢'] },
  5: { slots: [0, 1, 2, 3, 4], focus: ['推', '拉', '腿', '上肢', '下肢'] },
}

/** 焦点 → 主动作肌群 / 辅助肌群（核心由槽位奇偶额外注入，避免连日轰炸同一肌群） */
const FOCUS_MUSCLES: Record<string, { main: MuscleGroup[]; accessory: MuscleGroup[] }> = {
  推: { main: ['chest_push', 'shoulder_push'], accessory: ['chest_push'] },
  拉: { main: ['back_pull'], accessory: ['back_pull'] },
  腿: { main: ['lower_push', 'lower_pull'], accessory: ['lower_push'] },
  上肢: { main: ['chest_push', 'back_pull'], accessory: ['shoulder_push'] },
  下肢: { main: ['lower_push', 'lower_pull'], accessory: ['lower_pull'] },
  全身A: { main: ['lower_push', 'chest_push'], accessory: ['back_pull', 'core'] },
  全身B: { main: ['lower_pull', 'shoulder_push'], accessory: ['back_pull', 'chest_push'] },
}

/** 伤病禁忌：腰→禁硬拉大重量；膝→禁弓步类+深蹲改半蹲；肩→禁推举类 */
export function injuryRules(injuries: Injury[]): {
  excluded: Set<string>
  notes: Map<string, string>
} {
  const excluded = new Set<string>()
  const notes = new Map<string, string>()
  if (injuries.includes('waist')) {
    excluded.add('barbell_deadlift')
    excluded.add('good_morning')
    notes.set('deadlift', '腰部保护：轻重量、控制幅度')
    notes.set('db_rdl', '腰部保护：轻重量、控制幅度')
  }
  if (injuries.includes('knee')) {
    excluded.add('lunge')
    excluded.add('db_lunge')
    excluded.add('bulgarian')
    notes.set('squat', '膝盖保护：改为半蹲')
    notes.set('goblet_squat', '膝盖保护：改为半蹲')
    notes.set('barbell_squat', '膝盖保护：改为半蹲')
  }
  if (injuries.includes('shoulder')) {
    excluded.add('press')
    excluded.add('db_press')
    excluded.add('barbell_press')
    excluded.add('pike_pushup')
  }
  return { excluded, notes }
}

const RPE_TEXT: Record<Profile['experience'], string> = {
  beginner: 'RPE 6-7 · 保留 3-4 次余力',
  intermediate: 'RPE 7-8 · 保留 2-3 次余力',
  advanced: 'RPE 8-9 · 保留 1-2 次余力',
}

/** Epley 估算 1RM：w×(1+r/30) */
export function estimate1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30)
}

/** 重量/RPE 建议：有带重量的历史最佳组按 1RM 百分比，否则按经验给 RPE 区间 */
export function weightSuggestion(
  profile: Profile,
  libId: string,
  sessions: SessionRecord[],
): string {
  if (profile.experience !== 'beginner') {
    const lib = getLibraryExercise(libId)
    let best1RM = 0
    if (lib?.liveId) {
      for (const s of sessions) {
        if (s.exerciseId !== lib.liveId || !s.weightKg || !s.reps) continue
        best1RM = Math.max(best1RM, estimate1RM(s.weightKg, s.reps))
      }
    }
    if (best1RM > 0) {
      const pct = profile.goal === 'strength' ? 0.8 : 0.7
      const w = Math.round((best1RM * pct) / 2.5) * 2.5
      return `约 ${w} kg（≈${Math.round(pct * 100)}% 估算 1RM）`
    }
  }
  return RPE_TEXT[profile.experience]
}

function estMinutes(exercises: PlannedExercise[]): number {
  return 8 + exercises.reduce((s, e) => s + e.sets * 2, 0)
}

/** 从候选肌群挑动作：器械允许、非禁忌、优先 AI 联动、难度匹配经验 */
function pickExercise(
  muscle: MuscleGroup,
  profile: Profile,
  excluded: Set<string>,
  usedIds: Set<string>,
): LibraryExercise | null {
  const maxDiff = profile.experience === 'beginner' ? 2 : 3
  const candidates = EXERCISE_LIBRARY.filter(
    (e) =>
      e.muscle === muscle &&
      !excluded.has(e.id) &&
      !usedIds.has(e.id) &&
      equipmentAllowed(e, profile.equipment) &&
      e.difficulty <= maxDiff,
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const ai = (b.liveId ? 1 : 0) - (a.liveId ? 1 : 0)
    if (ai !== 0) return ai
    return a.difficulty - b.difficulty
  })
  return candidates[0]
}

function toPlanned(
  lib: LibraryExercise,
  isMain: boolean,
  profile: Profile,
  sessions: SessionRecord[],
  notes: Map<string, string>,
): PlannedExercise {
  return {
    libraryId: lib.id,
    name: lib.name,
    muscle: lib.muscle,
    sets: lib.sets,
    reps: lib.reps,
    suggestion: weightSuggestion(profile, lib.id, sessions),
    liveId: lib.liveId,
    isMain,
    note: notes.get(lib.id),
  }
}

export interface ValidationResult {
  ok: boolean
  violations: string[]
  trimmed: boolean
}

/**
 * ACSM 校验器（一票否决）：
 * 1. 同肌群两次训练间隔 < 1 天（训练日索引差 < 2）→ 拒绝；
 * 2. 周总负荷较上周增幅 > 10% → 削减辅助组直至达标；
 * 纯函数：输入训练日数组 + 上周实际负荷，输出校验结果与（可能被削减的）新数组。
 */
export function validateAcsm(
  days: PlanDay[],
  lastWeekLoad: number | null,
): { result: ValidationResult; days: PlanDay[] } {
  const violations: string[] = []
  // 1. 肌群间隔
  const muscleDays = new Map<MuscleGroup, number[]>()
  for (const d of days) {
    if (d.restDay) continue
    for (const e of d.exercises) {
      const arr = muscleDays.get(e.muscle) ?? []
      if (!arr.includes(d.dayIndex)) arr.push(d.dayIndex)
      muscleDays.set(e.muscle, arr)
    }
  }
  for (const [muscle, idx] of muscleDays) {
    const sorted = [...idx].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] < 2) {
        violations.push(
          `${MUSCLE_LABELS[muscle]}在${DAY_LABELS[sorted[i - 1]]}与${DAY_LABELS[sorted[i]]}间隔不足 1 天`,
        )
      }
    }
  }

  // 2. 周负荷增幅 > 10% → 削减辅助组
  let trimmed = false
  let out = days
  const planLoad = (ds: PlanDay[]) =>
    ds.reduce(
      (sum, d) =>
        sum +
        d.exercises.reduce((s, e) => {
          const lib = getLibraryExercise(e.libraryId)
          return s + e.sets * (lib?.repsMid ?? 10) * (65 * (lib?.bwCoeff ?? 0.5))
        }, 0),
      0,
    )
  if (lastWeekLoad !== null && lastWeekLoad > 0 && planLoad(out) > lastWeekLoad * 1.1) {
    out = out.map((d) => ({ ...d, exercises: [...d.exercises] }))
    // 第一轮：辅助组减到 2 组
    for (const d of out) {
      for (const e of d.exercises) {
        if (!e.isMain && e.sets > 2) {
          e.sets = 2
          trimmed = true
        }
      }
    }
    // 第二轮：仍超标则逐个砍掉辅助动作（从最后一个开始）
    while (planLoad(out) > lastWeekLoad * 1.1) {
      let removed = false
      for (let di = out.length - 1; di >= 0 && !removed; di--) {
        const d = out[di]
        const ai = d.exercises.map((e, i) => ({ e, i })).filter(({ e }) => !e.isMain).pop()
        if (ai) {
          d.exercises.splice(ai.i, 1)
          d.estMinutes = estMinutes(d.exercises)
          removed = true
          trimmed = true
        }
      }
      if (!removed) break
    }
  }
  return { result: { ok: violations.length === 0, violations, trimmed }, days: out }
}

function mondayOf(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // 周一=0
  d.setDate(d.getDate() - dow)
  return d
}

/** 生成周计划（确定性，输出前过 ACSM 校验） */
export function generateWeekPlan(
  profile: Profile,
  sessions: SessionRecord[],
  now: Date = new Date(),
): WeekPlan {
  const nowMs = now.getTime()
  const recovery = computeRecovery(sessions, nowMs)
  const { excluded, notes } = injuryRules(profile.injuries)
  const template = SPLIT_TEMPLATES[profile.daysPerWeek] ?? SPLIT_TEMPLATES[3]
  const warnings: string[] = []

  // 上周实际负荷（近 7 天吨位）
  const weekAgo = nowMs - 7 * 86_400_000
  const lastWeekLoad = sessions.reduce((s, r) => {
    const t = Date.parse(r.date)
    return !Number.isNaN(t) && t >= weekAgo ? s + sessionTonnage(r) : s
  }, 0)

  const days: PlanDay[] = []
  for (let di = 0; di < 7; di++) {
    const slotIdx = template.slots.indexOf(di)
    if (slotIdx === -1) {
      days.push({ dayIndex: di, dayLabel: DAY_LABELS[di], focus: '休息', exercises: [], estMinutes: 0, restDay: true })
      continue
    }
    const focus = template.focus[slotIdx]
    const cfg = FOCUS_MUSCLES[focus]
    const used = new Set<string>()
    const exercises: PlannedExercise[] = []
    const reasonParts: string[] = []

    // 主动作 1-2 个（恢复 <60% 的肌群不排主动作）
    for (const muscle of cfg.main) {
      if (exercises.filter((e) => e.isMain).length >= 2) break
      const rec = recovery[muscle]
      const lib = pickExercise(muscle, profile, excluded, used)
      if (!lib) continue
      if (rec < 60) {
        reasonParts.push(`${MUSCLE_LABELS[muscle]}恢复仅 ${rec}%，主动作改为辅助量`)
        exercises.push({ ...toPlanned(lib, false, profile, sessions, notes), sets: 2 })
      } else {
        exercises.push(toPlanned(lib, true, profile, sessions, notes))
        const gap = daysSinceLastSession(sessions, muscle, nowMs)
        reasonParts.push(
          `${MUSCLE_LABELS[muscle]}恢复 ${rec}%${gap === null ? '，近期未训练' : `，距上次 ${gap} 天`}`,
        )
      }
      used.add(lib.id)
    }
    // 辅助 2-3 个
    for (const muscle of cfg.accessory) {
      if (exercises.filter((e) => !e.isMain).length >= 3) break
      const lib = pickExercise(muscle, profile, excluded, used)
      if (!lib) continue
      exercises.push(toPlanned(lib, false, profile, sessions, notes))
      used.add(lib.id)
    }
    // 核心按槽位奇偶注入（隔天一练，满足 ACSM 间隔）
    if (slotIdx % 2 === 0 && !cfg.accessory.includes('core') && exercises.filter((e) => !e.isMain).length < 3) {
      const lib = pickExercise('core', profile, excluded, used)
      if (lib) {
        exercises.push(toPlanned(lib, false, profile, sessions, notes))
        used.add(lib.id)
      }
    }
    // 时长预算：超出则砍末尾辅助
    while (estMinutes(exercises) > profile.sessionMinutes && exercises.some((e) => !e.isMain)) {
      const ai = exercises.map((e, i) => ({ e, i })).filter(({ e }) => !e.isMain).pop()!
      exercises.splice(ai.i, 1)
    }
    days.push({
      dayIndex: di,
      dayLabel: DAY_LABELS[di],
      focus,
      exercises,
      estMinutes: estMinutes(exercises),
      restDay: false,
      reason: reasonParts.join('；'),
    })
  }

  const { result, days: validated } = validateAcsm(days, lastWeekLoad > 0 ? lastWeekLoad : null)
  if (!result.ok) warnings.push(...result.violations)
  if (result.trimmed) warnings.push('周负荷增幅超过 10%，已自动削减辅助组')

  // weekStart 是"周一"这个日历日（本地时区），不能用 toISOString()——
  // 本地零点转成 UTC 会前一天（GMT+8 下 2026-07-20 00:00 → 2026-07-19T16:00Z）。
  const monday = mondayOf(now)
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

  return {
    id: `${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date(nowMs).toISOString(),
    weekStart,
    days: validated,
    warnings,
  }
}

/** 快捷调整：今天只有 X 分钟 —— 砍辅助组保主动作（辅助最多留 1 个） */
export function compressDay(day: PlanDay, minutes: number): PlanDay {
  if (day.restDay) return day
  const mains = day.exercises.filter((e) => e.isMain)
  const accessories = day.exercises.filter((e) => !e.isMain).slice(0, 1)
  let exercises = [...mains, ...accessories]
  while (estMinutes(exercises) > minutes && accessories.length > 0) {
    accessories.pop()
    exercises = [...mains, ...accessories]
  }
  return { ...day, exercises, estMinutes: estMinutes(exercises) }
}

/** 换一下：同肌群同模式替换（确定性：按 id 排序取当前之后第一个候选） */
export function swapExercise(
  plan: WeekPlan,
  dayIndex: number,
  exerciseIndex: number,
  profile: Profile,
): WeekPlan {
  const day = plan.days[dayIndex]
  const target = day?.exercises[exerciseIndex]
  const lib = target && getLibraryExercise(target.libraryId)
  if (!day || !target || !lib) return plan
  const { excluded, notes } = injuryRules(profile.injuries)
  const used = new Set(day.exercises.map((e) => e.libraryId))
  const candidates = alternativesOf(lib, profile.equipment, new Set([...excluded, ...used]))
  if (candidates.length === 0) return plan
  candidates.sort((a, b) => a.id.localeCompare(b.id))
  const next = candidates.find((c) => c.id > lib.id) ?? candidates[0]
  const sessions: SessionRecord[] = [] // 换动作不读历史，直接给 RPE 文案
  const replaced: PlannedExercise = {
    ...toPlanned(next, target.isMain, profile, sessions, notes),
    suggestion: target.suggestion.startsWith('约') ? RPE_TEXT[profile.experience] : target.suggestion,
  }
  const days = plan.days.map((d, i) =>
    i === dayIndex
      ? { ...d, exercises: d.exercises.map((e, j) => (j === exerciseIndex ? replaced : e)) }
      : d,
  )
  return { ...plan, days }
}

export { DAY_LABELS, ALL_MUSCLES }
