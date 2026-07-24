interface Props {
  /** 0..100 */
  value: number
  size?: number
  stroke?: number
  color?: string
  label: string
  sub?: string
}

export default function RingProgress({ value, size = 76, stroke = 7, color = '#D4FF3F', label, sub }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-sm font-bold text-white">{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium text-white/80">{label}</div>
        {sub && <div className="text-[10px] text-white/40">{sub}</div>}
      </div>
    </div>
  )
}
