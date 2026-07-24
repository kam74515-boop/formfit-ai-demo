import { useCallback, useEffect, useRef } from 'react'
import { drawSkeleton, type DrawStatus } from '../pose/drawing'
import type { Landmark } from '../pose/types'

interface Props {
  landmarks: Landmark[] | null
  highlightJoints?: Iterable<number>
  status?: DrawStatus
  /** 前置摄像头时与 video 一起 CSS 镜像 */
  mirror?: boolean
  /** 视频帧原始尺寸，用于 object-cover/contain 裁剪对齐 */
  videoWidth?: number
  videoHeight?: number
  fit?: 'cover' | 'contain'
  className?: string
}

/** canvas 骨骼覆盖层：尺寸跟随父容器，按视频 object-fit 方式对齐归一化关键点 */
export default function SkeletonOverlay({
  landmarks,
  highlightJoints,
  status,
  mirror,
  videoWidth,
  videoHeight,
  fit = 'cover',
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const argsRef = useRef({ landmarks, highlightJoints, status, videoWidth, videoHeight, fit })
  argsRef.current = { landmarks, highlightJoints, status, videoWidth, videoHeight, fit }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { landmarks: lm, highlightJoints: hj, status: st, videoWidth: vw, videoHeight: vh, fit: ft } =
      argsRef.current
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!lm) return
    if (vw && vh) {
      const cw = rect.width
      const ch = rect.height
      const scale = ft === 'cover' ? Math.max(cw / vw, ch / vh) : Math.min(cw / vw, ch / vh)
      const offX = (cw - vw * scale) / 2
      const offY = (ch - vh * scale) / 2
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY)
      drawSkeleton(ctx, lm, vw, vh, { highlight: hj, status: st })
    } else {
      drawSkeleton(ctx, lm, w, h, { highlight: hj, status: st })
    }
  }, [])

  useEffect(() => {
    draw()
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(parent)
    return () => ro.disconnect()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${mirror ? '-scale-x-100' : ''} ${className ?? ''}`}
    />
  )
}
