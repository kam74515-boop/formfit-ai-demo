/** BlazePose 归一化关键点（x/y 为 0..1 图像归一化坐标，y 向下） */
export interface Landmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type Facing = 'front' | 'side' | 'unknown'

export interface JointAngles {
  kneeL: number | null
  kneeR: number | null
  hipL: number | null
  hipR: number | null
  elbowL: number | null
  elbowR: number | null
  shoulderL: number | null
  shoulderR: number | null
  neckL: number | null
  neckR: number | null
  /** 躯干倾角：髋中点→肩中点向量与竖直方向的夹角（度），直立≈0 */
  torsoLean: number | null
  /** 身体平直度：主侧 肩-髋-踝 夹角（度），完全平直=180 */
  bodyStraightness: number | null
  facing: Facing
  /** 可见性更高的主侧 */
  primarySide: 'left' | 'right'
}

export type Severity = 'info' | 'warning' | 'danger'

export interface Issue {
  ruleId: string
  severity: Severity
  message: string
  joints: number[]
  /** 发生时间（秒，相对于本次分析起点） */
  t: number
}

export interface RepResult {
  index: number
  /** 质量分 30..100 */
  score: number
  /** 动作极点角度（原始角度空间；flexedIsMin 动作=最小角，否则=最大角） */
  peakAngle: number
  /** DTW-lite 模板相似度 0..100 */
  templateScore: number
  issues: Issue[]
  startT: number
  endT: number
}

export type Phase = 'start' | 'moving'

export interface FrameSample {
  t: number
  angle: number | null
  phase: Phase
}

export interface FrameResult {
  phase: Phase
  /** 原始角度空间的主角度 */
  currentAngle: number | null
  /** 0..1，start→target 的完成度 */
  progress: number
  newReps: RepResult[]
  newIssues: Issue[]
  angles: JointAngles | null
  landmarks: Landmark[] | null
}
