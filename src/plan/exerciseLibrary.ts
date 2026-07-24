import type { Equipment, LibraryExercise, MuscleGroup } from './types'

/** 动作库：27 个动作，5 个与 /live AI 纠错联动 */
export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // ---- 下肢推（squat 模式）----
  { id: 'squat', name: '自重深蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['bodyweight'], sets: 3, reps: '10-15', repsMid: 12, difficulty: 1, liveId: 'squat', bwCoeff: 0.8 },
  { id: 'goblet_squat', name: '高脚杯深蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['dumbbell'], sets: 3, reps: '8-12', repsMid: 10, difficulty: 2, bwCoeff: 0.8 },
  { id: 'barbell_squat', name: '杠铃深蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['barbell', 'gym'], sets: 4, reps: '5-8', repsMid: 6, difficulty: 3, bwCoeff: 0.9 },
  { id: 'lunge', name: '弓步蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['bodyweight'], sets: 3, reps: '8-10/腿', repsMid: 9, difficulty: 2, liveId: 'lunge', bwCoeff: 0.75 },
  { id: 'db_lunge', name: '哑铃弓步蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['dumbbell'], sets: 3, reps: '8-10/腿', repsMid: 9, difficulty: 2, bwCoeff: 0.75 },
  { id: 'bulgarian', name: '保加利亚分腿蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['bodyweight', 'dumbbell'], sets: 3, reps: '8-10/腿', repsMid: 9, difficulty: 3, bwCoeff: 0.75 },
  { id: 'step_up', name: '台阶登步', muscle: 'lower_push', pattern: 'squat', equipment: ['bodyweight', 'dumbbell'], sets: 3, reps: '10-12/腿', repsMid: 11, difficulty: 1, bwCoeff: 0.7 },
  { id: 'wall_sit', name: '靠墙静蹲', muscle: 'lower_push', pattern: 'squat', equipment: ['bodyweight'], sets: 3, reps: '30-45秒', repsMid: 8, difficulty: 1, bwCoeff: 0.6 },
  // ---- 下肢拉（hinge 模式）----
  { id: 'deadlift', name: '徒手硬拉', muscle: 'lower_pull', pattern: 'hinge', equipment: ['bodyweight'], sets: 3, reps: '10-12', repsMid: 11, difficulty: 2, liveId: 'deadlift', bwCoeff: 0.6 },
  { id: 'db_rdl', name: '哑铃罗马尼亚硬拉', muscle: 'lower_pull', pattern: 'hinge', equipment: ['dumbbell'], sets: 3, reps: '8-12', repsMid: 10, difficulty: 2, bwCoeff: 0.6 },
  { id: 'barbell_deadlift', name: '杠铃硬拉', muscle: 'lower_pull', pattern: 'hinge', equipment: ['barbell', 'gym'], sets: 4, reps: '5-6', repsMid: 5, difficulty: 3, bwCoeff: 0.9 },
  { id: 'glute_bridge', name: '臀桥', muscle: 'lower_pull', pattern: 'hinge', equipment: ['bodyweight'], sets: 3, reps: '12-15', repsMid: 13, difficulty: 1, bwCoeff: 0.55 },
  { id: 'hip_thrust', name: '杠铃臀推', muscle: 'lower_pull', pattern: 'hinge', equipment: ['barbell', 'gym'], sets: 3, reps: '8-12', repsMid: 10, difficulty: 2, bwCoeff: 0.8 },
  { id: 'good_morning', name: '早安式体前屈', muscle: 'lower_pull', pattern: 'hinge', equipment: ['bodyweight', 'barbell'], sets: 3, reps: '10-12', repsMid: 11, difficulty: 2, bwCoeff: 0.5 },
  // ---- 胸推（push 模式）----
  { id: 'pushup', name: '俯卧撑', muscle: 'chest_push', pattern: 'push', equipment: ['bodyweight'], sets: 3, reps: '8-15', repsMid: 11, difficulty: 1, liveId: 'pushup', bwCoeff: 0.65 },
  { id: 'incline_pushup', name: '上斜俯卧撑', muscle: 'chest_push', pattern: 'push', equipment: ['bodyweight'], sets: 3, reps: '10-15', repsMid: 12, difficulty: 1, bwCoeff: 0.55 },
  { id: 'db_bench', name: '哑铃卧推', muscle: 'chest_push', pattern: 'push', equipment: ['dumbbell'], sets: 3, reps: '8-12', repsMid: 10, difficulty: 2, bwCoeff: 0.7 },
  { id: 'barbell_bench', name: '杠铃卧推', muscle: 'chest_push', pattern: 'push', equipment: ['barbell', 'gym'], sets: 4, reps: '5-8', repsMid: 6, difficulty: 3, bwCoeff: 0.85 },
  { id: 'dips', name: '双杠臂屈伸', muscle: 'chest_push', pattern: 'push', equipment: ['bodyweight', 'gym'], sets: 3, reps: '6-10', repsMid: 8, difficulty: 3, bwCoeff: 0.9 },
  // ---- 肩推 ----
  { id: 'press', name: '站姿推举', muscle: 'shoulder_push', pattern: 'push', equipment: ['bodyweight'], sets: 3, reps: '10-12', repsMid: 11, difficulty: 2, liveId: 'press', bwCoeff: 0.3 },
  { id: 'db_press', name: '哑铃推举', muscle: 'shoulder_push', pattern: 'push', equipment: ['dumbbell'], sets: 3, reps: '8-12', repsMid: 10, difficulty: 2, bwCoeff: 0.5 },
  { id: 'barbell_press', name: '杠铃推举', muscle: 'shoulder_push', pattern: 'push', equipment: ['barbell', 'gym'], sets: 4, reps: '5-8', repsMid: 6, difficulty: 3, bwCoeff: 0.6 },
  { id: 'pike_pushup', name: '派克俯卧撑', muscle: 'shoulder_push', pattern: 'push', equipment: ['bodyweight'], sets: 3, reps: '6-10', repsMid: 8, difficulty: 2, bwCoeff: 0.6 },
  { id: 'lateral_raise', name: '哑铃侧平举', muscle: 'shoulder_push', pattern: 'push', equipment: ['dumbbell'], sets: 3, reps: '12-15', repsMid: 13, difficulty: 1, bwCoeff: 0.15 },
  // ---- 背部拉（pull 模式）----
  { id: 'towel_row', name: '毛巾划船', muscle: 'back_pull', pattern: 'pull', equipment: ['bodyweight'], sets: 3, reps: '10-12', repsMid: 11, difficulty: 1, bwCoeff: 0.55 },
  { id: 'db_row', name: '单臂哑铃划船', muscle: 'back_pull', pattern: 'pull', equipment: ['dumbbell'], sets: 3, reps: '10-12/侧', repsMid: 11, difficulty: 2, bwCoeff: 0.5 },
  { id: 'barbell_row', name: '杠铃划船', muscle: 'back_pull', pattern: 'pull', equipment: ['barbell', 'gym'], sets: 4, reps: '8-10', repsMid: 9, difficulty: 3, bwCoeff: 0.7 },
  { id: 'pullup', name: '引体向上', muscle: 'back_pull', pattern: 'pull', equipment: ['bodyweight', 'gym'], sets: 3, reps: '4-8', repsMid: 6, difficulty: 3, bwCoeff: 0.95 },
  // ---- 核心 ----
  { id: 'plank', name: '平板支撑', muscle: 'core', pattern: 'core', equipment: ['bodyweight'], sets: 3, reps: '30-60秒', repsMid: 8, difficulty: 1, bwCoeff: 0.5 },
  { id: 'dead_bug', name: '死虫式', muscle: 'core', pattern: 'core', equipment: ['bodyweight'], sets: 3, reps: '8-10/侧', repsMid: 9, difficulty: 1, bwCoeff: 0.3 },
  { id: 'mountain_climber', name: '登山者', muscle: 'core', pattern: 'core', equipment: ['bodyweight'], sets: 3, reps: '20-30秒', repsMid: 10, difficulty: 2, bwCoeff: 0.5 },
  { id: 'russian_twist', name: '俄罗斯转体', muscle: 'core', pattern: 'core', equipment: ['bodyweight', 'dumbbell'], sets: 3, reps: '12-16', repsMid: 14, difficulty: 1, bwCoeff: 0.3 },
]

export function getLibraryExercise(id: string): LibraryExercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id)
}

/** /live 动作 id → 肌群 */
export const MUSCLE_BY_LIVE_ID: Record<string, MuscleGroup> = {
  squat: 'lower_push',
  lunge: 'lower_push',
  deadlift: 'lower_pull',
  pushup: 'chest_push',
  press: 'shoulder_push',
}

/** 检查动作是否被器械条件允许（满足任一器械即可，自重永远可用） */
export function equipmentAllowed(ex: LibraryExercise, owned: Equipment[]): boolean {
  return ex.equipment.some((e) => e === 'bodyweight' || owned.includes(e))
}

/** 同肌群同模式的替换候选（排除自身与禁忌 id） */
export function alternativesOf(
  ex: LibraryExercise,
  owned: Equipment[],
  excludeIds: Set<string>,
): LibraryExercise[] {
  return EXERCISE_LIBRARY.filter(
    (c) =>
      c.id !== ex.id &&
      !excludeIds.has(c.id) &&
      c.muscle === ex.muscle &&
      c.pattern === ex.pattern &&
      equipmentAllowed(c, owned),
  )
}
