import { computeJointAngles, primaryAngleOf } from './angles'
import type { ExerciseConfig, RuleContext } from './exercises'
import { PoseSmoother } from './filters'
import type { FrameResult, Issue, JointAngles, Landmark, Phase, RepResult } from './types'

const RULE_COOLDOWN_MS = 3000
const REP_TIMEOUT_MS = 15000
const DTW_N = 32
const DTW_WINDOW = 8

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function resample(series: number[], n: number): number[] {
  if (series.length === 0) return new Array(n).fill(0)
  if (series.length === 1) return new Array(n).fill(series[0])
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (series.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(series.length - 1, lo + 1)
    const f = pos - lo
    out.push(series[lo] * (1 - f) + series[hi] * f)
  }
  return out
}

/** 完整 rep 的余弦轮廓模板：start → target → start，n 点 */
function templateCurve(ex: ExerciseConfig, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const phase = (i / n) * Math.PI * 2
    out.push(ex.targetAngle + ((ex.startAngle - ex.targetAngle) * (1 + Math.cos(phase))) / 2)
  }
  return out
}

/** DTW（Sakoe-Chiba 窗）累计距离 */
function dtw(a: number[], b: number[], win: number): number {
  const n = a.length
  const m = b.length
  let prev = new Array<number>(m + 1).fill(Infinity)
  prev[0] = 0
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1).fill(Infinity)
    const j0 = Math.max(1, i - win)
    const j1 = Math.min(m, i + win)
    for (let j = j0; j <= j1; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1])
      cur[j] = cost + Math.min(prev[j], cur[j - 1], prev[j - 1])
    }
    prev = cur
  }
  return prev[m]
}

/** rep 主角度序列与模板曲线的相似度 0..100 */
export function templateSimilarity(series: number[], ex: ExerciseConfig): number {
  if (series.length < 4) return 0
  const s = resample(series, DTW_N)
  const t = templateCurve(ex, DTW_N)
  const avg = dtw(s, t, DTW_WINDOW) / DTW_N
  const range = Math.abs(ex.startAngle - ex.targetAngle) || 1
  return clamp(100 * (1 - avg / range), 0, 100)
}

export class WorkoutAnalyzer {
  private smoother = new PoseSmoother(0.4)
  private phase: Phase = 'start'
  private effPeak = Infinity
  private series: number[] = []
  private repStartT = 0
  private ruleLastFired = new Map<string, number>()
  private repIssues: Issue[] = []
  private repIssueKeys = new Set<string>()
  private repCount = 0

  readonly reps: RepResult[] = []
  readonly issues: Issue[] = []

  constructor(readonly exercise: ExerciseConfig) {}

  private eff(a: number): number {
    return this.exercise.flexedIsMin ? a : -a
  }

  private get effStart(): number {
    return this.eff(this.exercise.startAngle)
  }

  private get effTarget(): number {
    return this.eff(this.exercise.targetAngle)
  }

  primaryAngle(angles: JointAngles, lm: Landmark[]): number | null {
    return primaryAngleOf(this.exercise.primary, angles, lm)
  }

  /** tMs 单调递增（performance.now() 或视频采样时间） */
  pushFrame(tMs: number, rawLm: Landmark[] | null): FrameResult {
    const out: FrameResult = {
      phase: this.phase,
      currentAngle: null,
      progress: 0,
      newReps: [],
      newIssues: [],
      angles: null,
      landmarks: null,
    }
    if (!rawLm || rawLm.length < 33) return out

    const lm = this.smoother.apply(rawLm)
    const angles = computeJointAngles(lm)
    const cur = this.primaryAngle(angles, lm)
    out.angles = angles
    out.landmarks = lm
    out.currentAngle = cur
    if (cur === null) return out

    const effCur = this.eff(cur)
    const range = this.effStart - this.effTarget
    const progress = clamp((this.effStart - effCur) / range, 0, 1)
    out.progress = progress

    // ---- 计数状态机 ----
    const enter = this.effStart - 12
    const exit = this.effStart - 6
    if (this.phase === 'start') {
      if (effCur < enter) {
        this.phase = 'moving'
        this.repStartT = tMs
        this.effPeak = effCur
        this.series = [cur]
        this.repIssues = []
        this.repIssueKeys = new Set()
      }
    } else {
      if (effCur < this.effPeak) this.effPeak = effCur
      this.series.push(cur)
      if (effCur >= exit) {
        this.completeRep(tMs, out)
      } else if (tMs - this.repStartT > REP_TIMEOUT_MS) {
        // 动作中超过 15s 未归位 → 重置
        this.phase = 'start'
        this.series = []
        this.repIssues = []
      }
    }

    // ---- 规则引擎（每条规则 3s 冷却）----
    const ctx: RuleContext = {
      angles,
      lm,
      flexed: progress > 0.3,
      nearTarget: effCur <= this.effTarget + 25,
      repActive: this.phase === 'moving',
      currentAngle: cur,
    }
    for (const rule of this.exercise.rules) {
      const last = this.ruleLastFired.get(rule.id) ?? -Infinity
      if (tMs - last < RULE_COOLDOWN_MS) continue
      let fired = false
      try {
        fired = rule.when(ctx)
      } catch {
        fired = false
      }
      if (!fired) continue
      this.ruleLastFired.set(rule.id, tMs)
      const issue: Issue = {
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        joints: rule.joints,
        t: tMs / 1000,
      }
      out.newIssues.push(issue)
      this.issues.push(issue)
      if (this.phase === 'moving' && !this.repIssueKeys.has(rule.id)) {
        this.repIssueKeys.add(rule.id)
        this.repIssues.push(issue)
      }
    }

    out.phase = this.phase
    return out
  }

  private completeRep(tMs: number, out: FrameResult): void {
    const ex = this.exercise
    const rawPeak = ex.flexedIsMin ? this.effPeak : -this.effPeak

    // 深度判定（rep 结束）
    if (this.effPeak > this.effTarget + ex.depthOffset) {
      const issue: Issue = {
        ruleId: 'depth',
        severity: 'info',
        message: ex.depthRule.message,
        joints: ex.depthRule.joints,
        t: tMs / 1000,
      }
      out.newIssues.push(issue)
      this.issues.push(issue)
      if (!this.repIssueKeys.has('depth')) {
        this.repIssueKeys.add('depth')
        this.repIssues.push(issue)
      }
    }

    // 评分：100 起，幅度不足每超 1° -0.8（上限 -20）；danger -15 / warning -8 / info -3
    let score = 100
    const overshoot = this.effPeak - (this.effTarget + 15)
    if (overshoot > 0) score -= Math.min(20, overshoot * 0.8)
    for (const iss of this.repIssues) {
      score -= iss.severity === 'danger' ? 15 : iss.severity === 'warning' ? 8 : 3
    }
    score = Math.round(clamp(score, 30, 100))

    const templateScore = Math.round(templateSimilarity(this.series, ex))

    this.repCount += 1
    const rep: RepResult = {
      index: this.repCount,
      score,
      peakAngle: Math.round(rawPeak * 10) / 10,
      templateScore,
      issues: [...this.repIssues],
      startT: this.repStartT / 1000,
      endT: tMs / 1000,
    }
    this.reps.push(rep)
    out.newReps.push(rep)

    this.phase = 'start'
    this.series = []
    this.repIssues = []
    this.repIssueKeys = new Set()
  }

  reset(): void {
    this.smoother.reset()
    this.phase = 'start'
    this.effPeak = Infinity
    this.series = []
    this.repIssues = []
    this.repIssueKeys = new Set()
    this.ruleLastFired.clear()
    this.repCount = 0
    this.reps.length = 0
    this.issues.length = 0
  }
}
