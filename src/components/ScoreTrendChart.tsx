import { useMemo } from 'react'
import type { SessionRecord } from '../utils/storage'

interface Props {
  sessions: SessionRecord[]
  /** 限定某个动作；不传则全部训练 */
  exerciseId?: string
  height?: number
}

/**
 * 动作质量分趋势图（SVG 面积图）：进步可视化的核心组件
 * x = 时间（旧的→新的），y = 0-100 质量分
 */
export default function ScoreTrendChart({ sessions, exerciseId, height = 96 }: Props) {
  const points = useMemo(() => {
    const filtered = sessions
      .filter((s) => !exerciseId || s.exerciseId === exerciseId)
      .filter((s) => Number.isFinite(s.avgScore))
      .slice(-14)
      .reverse()
    return filtered.map((s) => ({ score: s.avgScore, date: new Date(s.date) }))
  }, [sessions, exerciseId])

  if (points.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl text-xs text-white/30">
        完成 2 次以上训练后，这里会显示你的进步曲线
      </div>
    )
  }

  const W = 320
  const H = height
  const padX = 6
  const padY = 10
  const xs = (i: number) => padX + ((W - padX * 2) * i) / (points.length - 1)
  const ys = (score: number) => padY + ((H - padY * 2) * (100 - score)) / 100
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(p.score).toFixed(1)}`).join(' ')
  const area = `${line} L${xs(points.length - 1).toFixed(1)},${H} L${xs(0).toFixed(1)},${H} Z`
  const last = points[points.length - 1]
  const first = points[0]
  const delta = last.score - first.score

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4FF3F" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#D4FF3F" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trend-fill)" />
        <path d={line} fill="none" stroke="#D4FF3F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={xs(i)} cy={ys(p.score)} r={i === points.length - 1 ? 4 : 2.5} fill={i === points.length - 1 ? '#D4FF3F' : 'rgba(212,255,63,0.5)'} />
        ))}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="text-white/35">
          {first.date.getMonth() + 1}/{first.date.getDate()} 起 {points.length} 次
        </span>
        <span className={delta >= 0 ? 'text-volt-400' : 'text-red-300'}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} 分
        </span>
      </div>
    </div>
  )
}
