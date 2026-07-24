import { EXERCISE_LIBRARY, equipmentAllowed } from './exerciseLibrary'
import { injuryRules, weightSuggestion } from './planEngine'
import type {
  LibraryExercise,
  MuscleGroup,
  PlanDay,
  PlannedExercise,
  Profile,
  WeekPlan,
} from './types'
import { MUSCLE_LABELS } from './types'
import type { SessionRecord } from '../utils/storage'

export const SETS_MIN = 1
export const SETS_MAX = 10

/** 与 planEngine.estMinutes 同口径：8 分钟热身 + 每组约 2 分钟 */
function estimateMinutes(exercises: PlannedExercise[]): number {
  return 8 + exercises.reduce((s, e) => s + e.sets * 2, 0)
}

function patchDayExercises(
  plan: WeekPlan,
  dayIndex: number,
  patch: (exercises: PlannedExercise[]) => PlannedExercise[],
): WeekPlan {
  const days = plan.days.map((d, i) => {
    if (i !== dayIndex || d.restDay) return d
    const exercises = patch(d.exercises)
    return { ...d, exercises, estMinutes: estimateMinutes(exercises) }
  })
  return { ...plan, days }
}

/** 修改组数（范围 1-10，自动钳制） */
export function setExerciseSets(
  plan: WeekPlan,
  dayIndex: number,
  exerciseIndex: number,
  sets: number,
): WeekPlan {
  const clamped = Math.max(SETS_MIN, Math.min(SETS_MAX, Math.round(sets)))
  return patchDayExercises(plan, dayIndex, (exs) =>
    exs.map((e, i) => (i === exerciseIndex ? { ...e, sets: clamped } : e)),
  )
}

/** 修改次数文案（自由文本，如 "8-12"、"10/腿"）；空文本忽略，保留原值 */
export function setExerciseReps(
  plan: WeekPlan,
  dayIndex: number,
  exerciseIndex: number,
  reps: string,
): WeekPlan {
  const text = reps.trim()
  if (!text) return plan
  return patchDayExercises(plan, dayIndex, (exs) =>
    exs.map((e, i) => (i === exerciseIndex ? { ...e, reps: text } : e)),
  )
}

/** 删除当日清单中的动作 */
export function removeExercise(
  plan: WeekPlan,
  dayIndex: number,
  exerciseIndex: number,
): WeekPlan {
  return patchDayExercises(plan, dayIndex, (exs) => exs.filter((_, i) => i !== exerciseIndex))
}

/** 从动作库追加动作到当日清单末尾（作为辅助动作）；已在清单中则不重复添加 */
export function addExercise(
  plan: WeekPlan,
  dayIndex: number,
  lib: LibraryExercise,
  profile: Profile,
  sessions: SessionRecord[],
): WeekPlan {
  const day = plan.days[dayIndex]
  if (!day || day.restDay) return plan
  if (day.exercises.some((e) => e.libraryId === lib.id)) return plan
  const { notes } = injuryRules(profile.injuries)
  const planned: PlannedExercise = {
    libraryId: lib.id,
    name: lib.name,
    muscle: lib.muscle,
    sets: lib.sets,
    reps: lib.reps,
    suggestion: weightSuggestion(profile, lib.id, sessions),
    liveId: lib.liveId,
    isMain: false,
    note: notes.get(lib.id),
  }
  return patchDayExercises(plan, dayIndex, (exs) => [...exs, planned])
}

export interface PickerGroup {
  muscle: MuscleGroup
  label: string
  exercises: LibraryExercise[]
}

/** 添加动作候选：按肌群分组；过滤器械不允许、伤病禁忌与已在当日清单中的动作 */
export function pickerGroups(profile: Profile, day: PlanDay): PickerGroup[] {
  const { excluded } = injuryRules(profile.injuries)
  const used = new Set(day.exercises.map((e) => e.libraryId))
  const groups: PickerGroup[] = []
  for (const muscle of Object.keys(MUSCLE_LABELS) as MuscleGroup[]) {
    const exercises = EXERCISE_LIBRARY.filter(
      (e) =>
        e.muscle === muscle &&
        !excluded.has(e.id) &&
        !used.has(e.id) &&
        equipmentAllowed(e, profile.equipment),
    )
    if (exercises.length > 0) groups.push({ muscle, label: MUSCLE_LABELS[muscle], exercises })
  }
  return groups
}
