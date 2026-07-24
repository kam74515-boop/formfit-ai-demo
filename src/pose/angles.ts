import type { JointAngles, Landmark } from './types'

/** 角度计算置信度门控：任一组成点 visibility < 0.35 则该角为 null */
const ANGLE_GATE = 0.35

/** 顶点 b 处的二维夹角（度，0..180） */
export function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const bax = a.x - b.x
  const bay = a.y - b.y
  const bcx = c.x - b.x
  const bcy = c.y - b.y
  const dot = bax * bcx + bay * bcy
  const cross = bax * bcy - bay * bcx
  return (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI
}

export function visOK(lm: Landmark[], ids: number[], gate = ANGLE_GATE): boolean {
  return ids.every((i) => (lm[i]?.visibility ?? 0) >= gate)
}

function gated(lm: Landmark[], ids: number[], compute: () => number): number | null {
  if (!visOK(lm, ids)) return null
  return compute()
}

/** 左右角度按可见性加权平均；单侧不可见时用另一侧 */
export function weightedMain(
  l: number | null,
  r: number | null,
  lm: Landmark[],
  lIds: number[],
  rIds: number[],
): number | null {
  if (l === null) return r
  if (r === null) return l
  const wl = Math.min(...lIds.map((i) => lm[i].visibility ?? 0))
  const wr = Math.min(...rIds.map((i) => lm[i].visibility ?? 0))
  if (wl + wr < 1e-6) return (l + r) / 2
  return (l * wl + r * wr) / (wl + wr)
}

const KNEE_L = [23, 25, 27]
const KNEE_R = [24, 26, 28]
const HIP_L = [11, 23, 25]
const HIP_R = [12, 24, 26]
const ELBOW_L = [11, 13, 15]
const ELBOW_R = [12, 14, 16]
const SHOULDER_L = [13, 11, 23]
const SHOULDER_R = [14, 12, 24]
const NECK_L = [7, 11, 23]
const NECK_R = [8, 12, 24]

export function computeJointAngles(lm: Landmark[]): JointAngles {
  const kneeL = gated(lm, KNEE_L, () => angle(lm[23], lm[25], lm[27]))
  const kneeR = gated(lm, KNEE_R, () => angle(lm[24], lm[26], lm[28]))
  const hipL = gated(lm, HIP_L, () => angle(lm[11], lm[23], lm[25]))
  const hipR = gated(lm, HIP_R, () => angle(lm[12], lm[24], lm[26]))
  const elbowL = gated(lm, ELBOW_L, () => angle(lm[11], lm[13], lm[15]))
  const elbowR = gated(lm, ELBOW_R, () => angle(lm[12], lm[14], lm[16]))
  const shoulderL = gated(lm, SHOULDER_L, () => angle(lm[13], lm[11], lm[23]))
  const shoulderR = gated(lm, SHOULDER_R, () => angle(lm[14], lm[12], lm[24]))
  const neckL = gated(lm, NECK_L, () => angle(lm[7], lm[11], lm[23]))
  const neckR = gated(lm, NECK_R, () => angle(lm[8], lm[12], lm[24]))

  // 躯干倾角：髋中点→肩中点 与竖直方向（图像坐标向上）夹角
  let torsoLean: number | null = null
  if (visOK(lm, [11, 12, 23, 24])) {
    const smx = (lm[11].x + lm[12].x) / 2
    const smy = (lm[11].y + lm[12].y) / 2
    const hmx = (lm[23].x + lm[24].x) / 2
    const hmy = (lm[23].y + lm[24].y) / 2
    const vx = smx - hmx
    const vy = smy - hmy
    torsoLean = (Math.atan2(Math.abs(vx), -vy) * 180) / Math.PI
  }

  // 朝向：肩宽 / 躯干长 > 0.55 正面，< 0.35 侧面
  let facing: JointAngles['facing'] = 'unknown'
  if (visOK(lm, [11, 12, 23, 24])) {
    const sw = Math.abs(lm[11].x - lm[12].x)
    const smx = (lm[11].x + lm[12].x) / 2
    const smy = (lm[11].y + lm[12].y) / 2
    const hmx = (lm[23].x + lm[24].x) / 2
    const hmy = (lm[23].y + lm[24].y) / 2
    const torsoLen = Math.hypot(smx - hmx, smy - hmy)
    if (torsoLen > 1e-4) {
      const ratio = sw / torsoLen
      facing = ratio > 0.55 ? 'front' : ratio < 0.35 ? 'side' : 'unknown'
    }
  }

  // 主侧：上肢+下肢可见性之和更高的一侧
  const lScore = [11, 13, 23, 25].reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0)
  const rScore = [12, 14, 24, 26].reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0)
  const primarySide: 'left' | 'right' = lScore >= rScore ? 'left' : 'right'

  // 身体平直度：主侧 肩-髋-踝
  const straightIds = primarySide === 'left' ? [11, 23, 27] : [12, 24, 28]
  const bodyStraightness = gated(lm, straightIds, () =>
    angle(lm[straightIds[0]], lm[straightIds[1]], lm[straightIds[2]]),
  )

  return {
    kneeL,
    kneeR,
    hipL,
    hipR,
    elbowL,
    elbowR,
    shoulderL,
    shoulderR,
    neckL,
    neckR,
    torsoLean,
    bodyStraightness,
    facing,
    primarySide,
  }
}

export type PrimaryKind = 'knee' | 'hip' | 'elbow' | 'kneeMin'

/** 按动作类型取主角度（原始角度空间） */
export function primaryAngleOf(kind: PrimaryKind, a: JointAngles, lm: Landmark[]): number | null {
  switch (kind) {
    case 'knee':
      return weightedMain(a.kneeL, a.kneeR, lm, KNEE_L, KNEE_R)
    case 'hip':
      return weightedMain(a.hipL, a.hipR, lm, HIP_L, HIP_R)
    case 'elbow':
      return weightedMain(a.elbowL, a.elbowR, lm, ELBOW_L, ELBOW_R)
    case 'kneeMin': {
      // 弓步：取两腿膝角较小者
      if (a.kneeL === null) return a.kneeR
      if (a.kneeR === null) return a.kneeL
      return Math.min(a.kneeL, a.kneeR)
    }
  }
}

export function mainNeck(a: JointAngles, lm: Landmark[]): number | null {
  return weightedMain(a.neckL, a.neckR, lm, NECK_L, NECK_R)
}

export function mainKnee(a: JointAngles, lm: Landmark[]): number | null {
  return weightedMain(a.kneeL, a.kneeR, lm, KNEE_L, KNEE_R)
}
