import type { Landmark } from './types'

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
  [7, 8],
]

export type DrawStatus = 'ok' | 'warning' | 'danger'

export const STATUS_COLORS: Record<DrawStatus, string> = {
  ok: '#D4FF3F',
  warning: '#FBBF24',
  danger: '#F87171',
}

const VIS_GATE = 0.3

/** 在 width×height 画布上绘制归一化坐标的骨骼；highlight 中的关键点以告警色高亮 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  width: number,
  height: number,
  opts: { highlight?: Iterable<number>; status?: DrawStatus } = {},
): void {
  ctx.clearRect(0, 0, width, height)
  const highlight = new Set(opts.highlight ?? [])
  const status: DrawStatus = opts.status ?? (highlight.size > 0 ? 'warning' : 'ok')
  const baseColor = STATUS_COLORS[status]
  const hotColor = STATUS_COLORS.danger
  const lineW = Math.max(2, Math.round(Math.min(width, height) / 240))

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 基础骨骼
  ctx.strokeStyle = baseColor
  ctx.lineWidth = lineW
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = lm[a]
    const pb = lm[b]
    if (!pa || !pb) continue
    if ((pa.visibility ?? 1) < VIS_GATE || (pb.visibility ?? 1) < VIS_GATE) continue
    ctx.moveTo(pa.x * width, pa.y * height)
    ctx.lineTo(pb.x * width, pb.y * height)
  }
  ctx.stroke()

  // 高亮关节的连线
  if (highlight.size > 0) {
    ctx.strokeStyle = hotColor
    ctx.lineWidth = lineW + 1
    ctx.shadowColor = hotColor
    ctx.shadowBlur = 12
    ctx.beginPath()
    for (const [a, b] of POSE_CONNECTIONS) {
      if (!highlight.has(a) && !highlight.has(b)) continue
      const pa = lm[a]
      const pb = lm[b]
      if (!pa || !pb) continue
      if ((pa.visibility ?? 1) < VIS_GATE || (pb.visibility ?? 1) < VIS_GATE) continue
      ctx.moveTo(pa.x * width, pa.y * height)
      ctx.lineTo(pb.x * width, pb.y * height)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // 关节点
  const r = Math.max(2.5, lineW * 1.4)
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i]
    if (!p || (p.visibility ?? 1) < VIS_GATE) continue
    const hot = highlight.has(i)
    ctx.beginPath()
    ctx.fillStyle = hot ? hotColor : baseColor
    if (hot) {
      ctx.shadowColor = hotColor
      ctx.shadowBlur = 14
    }
    ctx.arc(p.x * width, p.y * height, hot ? r * 1.8 : r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.globalAlpha = 1
}
