import type { LucideIcon } from 'lucide-react'
import {
  ArrowBigUp,
  Dumbbell,
  Flame,
  Footprints,
  PersonStanding,
} from 'lucide-react'
import { mainKnee, mainNeck, visOK } from './angles'
import type { PrimaryKind } from './angles'
import type { JointAngles, Landmark, Severity } from './types'

export interface RuleContext {
  angles: JointAngles
  lm: Landmark[]
  /** 屈曲相：progress > 0.3 */
  flexed: boolean
  /** 接近目标位（底部/顶点） */
  nearTarget: boolean
  /** rep 进行中 */
  repActive: boolean
  /** 原始角度空间的当前主角度 */
  currentAngle: number | null
}

export interface ExerciseRule {
  id: string
  severity: Severity
  message: string
  joints: number[]
  when: (ctx: RuleContext) => boolean
}

export interface ExerciseConfig {
  id: string
  name: string
  nameEn: string
  icon: LucideIcon
  muscles: string
  difficulty: 1 | 2 | 3
  cameraHint: string
  guide: string
  primary: PrimaryKind
  startAngle: number
  targetAngle: number
  flexedIsMin: boolean
  /** 深度判定偏移：rep 极角未达 target+depthOffset（有效空间）记幅度不足 */
  depthOffset: number
  depthRule: { message: string; joints: number[] }
  rules: ExerciseRule[]
}

/** 髋点在肩-踝连线竖向（图像 y）上的偏移：>0 在连线下方（塌腰），<0 在上方（弓臀） */
function hipOffsetFromLine(lm: Landmark[], side: 'left' | 'right'): number | null {
  const s = side === 'left' ? 11 : 12
  const h = side === 'left' ? 23 : 24
  const a = side === 'left' ? 27 : 28
  if (!visOK(lm, [s, h, a])) return null
  const S = lm[s]
  const H = lm[h]
  const A = lm[a]
  if (Math.abs(A.x - S.x) < 0.08) return null
  const lineY = S.y + ((A.y - S.y) * (H.x - S.x)) / (A.x - S.x)
  return H.y - lineY
}

export const EXERCISES: ExerciseConfig[] = [
  {
    id: 'squat',
    name: '深蹲',
    nameEn: 'Squat',
    icon: PersonStanding,
    muscles: '股四头肌 / 臀',
    difficulty: 1,
    cameraHint: '侧面或正面',
    guide: '全身入框站立，下蹲至大腿低于水平面后站起，膝盖与脚尖同向。',
    primary: 'knee',
    startAngle: 165,
    targetAngle: 95,
    flexedIsMin: true,
    depthOffset: 15,
    depthRule: { message: '再蹲低一点，大腿低于水平面', joints: [25, 26] },
    rules: [
      {
        id: 'knee_valgus',
        severity: 'warning',
        message: '膝盖内扣，双膝向外打开',
        joints: [25, 26],
        when: ({ angles, lm, flexed }) => {
          if (angles.facing !== 'front' || !flexed) return false
          if (!visOK(lm, [25, 26, 27, 28])) return false
          const kneeGap = Math.abs(lm[25].x - lm[26].x)
          const ankleGap = Math.abs(lm[27].x - lm[28].x)
          if (ankleGap < 1e-4) return false
          return kneeGap / ankleGap < 0.72
        },
      },
      {
        id: 'torso_lean',
        severity: 'warning',
        message: '背部挺直，胸口向前',
        joints: [11, 12, 23, 24],
        when: ({ angles, flexed }) =>
          angles.facing === 'side' && flexed && (angles.torsoLean ?? 0) > 50,
      },
      {
        id: 'heel_lift',
        severity: 'warning',
        message: '脚跟不要离地',
        joints: [29, 30],
        when: ({ angles, lm, flexed }) => {
          if (angles.facing !== 'side' || !flexed) return false
          const left = visOK(lm, [29, 31]) && lm[29].y < lm[31].y - 0.03
          const right = visOK(lm, [30, 32]) && lm[30].y < lm[32].y - 0.03
          return left || right
        },
      },
    ],
  },
  {
    id: 'pushup',
    name: '俯卧撑',
    nameEn: 'Push-up',
    icon: Flame,
    muscles: '胸 / 三头',
    difficulty: 2,
    cameraHint: '侧面',
    guide: '侧对镜头撑于地面，身体成一条直线，屈肘下放至胸部接近地面。',
    primary: 'elbow',
    startAngle: 155,
    targetAngle: 95,
    flexedIsMin: true,
    depthOffset: 20,
    depthRule: { message: '胸部再贴近地面一些', joints: [13, 14] },
    rules: [
      {
        id: 'hip_sag',
        severity: 'danger',
        message: '核心收紧，臀部不要下塌',
        joints: [23, 24],
        when: ({ angles, lm }) => {
          const off = hipOffsetFromLine(lm, angles.primarySide)
          if (off === null) return false
          return off > 0.04 && (angles.bodyStraightness ?? 180) < 170
        },
      },
      {
        id: 'pike',
        severity: 'warning',
        message: '臀部不要抬得太高',
        joints: [23, 24],
        when: ({ angles, lm }) => {
          const off = hipOffsetFromLine(lm, angles.primarySide)
          return off !== null && off < -0.06
        },
      },
    ],
  },
  {
    id: 'deadlift',
    name: '硬拉',
    nameEn: 'Deadlift',
    icon: Dumbbell,
    muscles: '臀 / 腘绳肌',
    difficulty: 3,
    cameraHint: '侧面',
    guide: '侧对镜头，屈髋俯身，背部平直，伸髋发力站直。',
    primary: 'hip',
    startAngle: 165,
    targetAngle: 105,
    flexedIsMin: true,
    depthOffset: 15,
    depthRule: { message: '髋部再向后推，躯干再放低', joints: [23, 24] },
    rules: [
      {
        id: 'rounded_back',
        severity: 'warning',
        message: '背部保持平直，不要弓背',
        joints: [7, 8, 11, 12],
        when: ({ angles, lm, flexed }) => {
          if (!flexed) return false
          const neck = mainNeck(angles, lm)
          return neck !== null && neck < 145
        },
      },
      {
        id: 'squatty',
        severity: 'info',
        message: '臀部向后推，膝盖少弯曲',
        joints: [25, 26],
        when: ({ angles, lm, flexed }) => {
          if (!flexed) return false
          const knee = mainKnee(angles, lm)
          return knee !== null && knee < 120
        },
      },
    ],
  },
  {
    id: 'lunge',
    name: '弓步蹲',
    nameEn: 'Lunge',
    icon: Footprints,
    muscles: '股四头 / 臀',
    difficulty: 2,
    cameraHint: '侧面',
    guide: '侧对镜头，一腿前跨下蹲，前膝不超过脚尖，躯干保持直立。',
    primary: 'kneeMin',
    startAngle: 160,
    targetAngle: 105,
    flexedIsMin: true,
    depthOffset: 15,
    depthRule: { message: '后膝再向下靠近地面', joints: [25, 26] },
    rules: [
      {
        id: 'knee_over_toe',
        severity: 'warning',
        message: '前膝不要超过脚尖',
        joints: [25, 26],
        when: ({ angles, lm, flexed }) => {
          if (angles.facing !== 'side' || !flexed) return false
          if (angles.kneeL === null && angles.kneeR === null) return false
          // 前腿 = 膝角较小的一侧
          const leftIsFront =
            angles.kneeL !== null && (angles.kneeR === null || angles.kneeL <= angles.kneeR)
          const k = leftIsFront ? 25 : 26
          const heel = leftIsFront ? 29 : 30
          const toe = leftIsFront ? 31 : 32
          if (!visOK(lm, [k, heel, toe])) return false
          const dir = Math.sign(lm[toe].x - lm[heel].x)
          if (dir === 0) return false
          return (lm[k].x - lm[toe].x) * dir > 0.06
        },
      },
      {
        id: 'torso_lean',
        severity: 'warning',
        message: '躯干保持直立',
        joints: [11, 12],
        when: ({ angles, flexed }) => flexed && (angles.torsoLean ?? 0) > 20,
      },
    ],
  },
  {
    id: 'press',
    name: '站姿推举',
    nameEn: 'Overhead Press',
    icon: ArrowBigUp,
    muscles: '肩 / 三头',
    difficulty: 2,
    cameraHint: '正面或侧面',
    guide: '屈肘持物于肩前，收紧核心，向上推至手臂完全伸直。',
    primary: 'elbow',
    startAngle: 80,
    targetAngle: 165,
    flexedIsMin: false,
    depthOffset: 15,
    depthRule: { message: '手臂向上完全伸直', joints: [13, 14] },
    rules: [
      {
        id: 'asym',
        severity: 'warning',
        message: '双臂发力不均衡',
        joints: [13, 14],
        when: ({ angles, nearTarget }) => {
          if (!nearTarget) return false
          if (angles.elbowL === null || angles.elbowR === null) return false
          return Math.abs(angles.elbowL - angles.elbowR) > 25
        },
      },
      {
        id: 'lean_back',
        severity: 'warning',
        message: '收紧核心，不要挺腰',
        joints: [11, 12, 23, 24],
        when: ({ angles, nearTarget }) =>
          nearTarget && (angles.torsoLean ?? 0) > 15,
      },
    ],
  },
]

export function getExercise(id: string | undefined): ExerciseConfig {
  return EXERCISES.find((e) => e.id === id) ?? EXERCISES[0]
}
