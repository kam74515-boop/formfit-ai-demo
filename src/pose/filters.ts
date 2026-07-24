import type { Landmark } from './types'

/**
 * 一维 OneEuro 滤波器：低速运动时强平滑、高速运动时低延迟。
 * freq=30, minCutoff=0.8, beta=0.4
 */
export class OneEuroFilter {
  private xPrev: number | null = null
  private dxPrev = 0

  constructor(
    private freq = 30,
    private minCutoff = 0.8,
    private beta = 0.4,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    const te = 1 / this.freq
    return 1 / (1 + tau / te)
  }

  filter(x: number): number {
    const dx = this.xPrev === null ? 0 : x - this.xPrev
    const aD = this.alpha(this.dCutoff)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = this.alpha(cutoff)
    const xHat = this.xPrev === null ? x : a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    return xHat
  }

  reset() {
    this.xPrev = null
    this.dxPrev = 0
  }
}

/**
 * 33 关键点位姿平滑器：对每点的 x/y 各挂一个 OneEuroFilter；
 * 置信度门控：visibility < gate 时不更新滤波器，沿用上一次平滑值（冻结抖动）。
 */
export class PoseSmoother {
  private fx: OneEuroFilter[] = []
  private fy: OneEuroFilter[] = []
  private last: (Landmark | null)[] = []

  constructor(private gate = 0.4) {
    for (let i = 0; i < 33; i++) {
      this.fx.push(new OneEuroFilter())
      this.fy.push(new OneEuroFilter())
      this.last.push(null)
    }
  }

  apply(landmarks: Landmark[]): Landmark[] {
    return landmarks.map((p, i) => {
      const vis = p.visibility ?? 1
      const prev = this.last[i]
      if (vis < this.gate && prev) {
        return { x: prev.x, y: prev.y, z: p.z ?? prev.z, visibility: vis }
      }
      const out: Landmark = {
        x: this.fx[i].filter(p.x),
        y: this.fy[i].filter(p.y),
        z: p.z,
        visibility: vis,
      }
      this.last[i] = out
      return out
    })
  }

  reset() {
    this.fx.forEach((f) => f.reset())
    this.fy.forEach((f) => f.reset())
    this.last.fill(null)
  }
}
