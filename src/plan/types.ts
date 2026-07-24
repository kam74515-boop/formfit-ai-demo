/** 问卷与计划类型 */

export type Goal = 'muscle' | 'strength' | 'shape' | 'health'
export type Experience = 'beginner' | 'intermediate' | 'advanced'
export type Equipment = 'bodyweight' | 'dumbbell' | 'barbell' | 'gym'
export type Injury = 'waist' | 'knee' | 'shoulder'

export interface Profile {
  goal: Goal
  experience: Experience
  equipment: Equipment[]
  daysPerWeek: 2 | 3 | 4 | 5
  sessionMinutes: 30 | 45 | 60 | 90
  injuries: Injury[]
  createdAt: string
}

export type MuscleGroup =
  | 'lower_push'
  | 'lower_pull'
  | 'chest_push'
  | 'shoulder_push'
  | 'back_pull'
  | 'core'

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  lower_push: '下肢推',
  lower_pull: '下肢拉',
  chest_push: '胸推',
  shoulder_push: '肩推',
  back_pull: '背部拉',
  core: '核心',
}

export type MovementPattern = 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'core'

export interface LibraryExercise {
  id: string
  name: string
  muscle: MuscleGroup
  pattern: MovementPattern
  equipment: Equipment[]
  /** 基础组次 */
  sets: number
  reps: string
  /** 次数中点（负荷估算用） */
  repsMid: number
  difficulty: 1 | 2 | 3
  /** 关联 /live 动作 id（有 AI 纠错联动） */
  liveId?: string
  /** 自重估算体重系数（负荷估算用） */
  bwCoeff: number
}

export interface PlannedExercise {
  libraryId: string
  name: string
  muscle: MuscleGroup
  sets: number
  reps: string
  /** 重量或 RPE 建议文案 */
  suggestion: string
  liveId?: string
  isMain: boolean
  note?: string
}

export interface PlanDay {
  /** 0=周一 … 6=周日 */
  dayIndex: number
  dayLabel: string
  focus: string
  exercises: PlannedExercise[]
  estMinutes: number
  restDay: boolean
  reason?: string
}

export interface WeekPlan {
  id: string
  createdAt: string
  /** 周一 ISO 日期 */
  weekStart: string
  days: PlanDay[]
  warnings: string[]
}

export const GOAL_LABELS: Record<Goal, string> = {
  muscle: '增肌',
  strength: '增力',
  shape: '塑形',
  health: '健康',
}

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  beginner: '新手',
  intermediate: '1-3 年',
  advanced: '3 年以上',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: '自重',
  dumbbell: '哑铃',
  barbell: '杠铃',
  gym: '健身房',
}

export const INJURY_LABELS: Record<Injury, string> = {
  waist: '腰部',
  knee: '膝盖',
  shoulder: '肩部',
}
