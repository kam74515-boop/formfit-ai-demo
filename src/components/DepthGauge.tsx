interface Props {
  currentAngle: number | null
  start: number
  target: number
  flexedIsMin: boolean
  label?: string
}

/** 右侧竖向深度计：当前主角度映射到 起始→目标 区间，显示目标区 */
export default function DepthGauge({ currentAngle, start, target, flexedIsMin, label = '深度' }: Props) {
  const eff = (a: number) => (flexedIsMin ? a : -a)
  const range = eff(start) - eff(target)
  const pctOf = (a: number) => Math.min(1, Math.max(0, (eff(start) - eff(a)) / range))

  const progress = currentAngle === null ? 0 : pctOf(currentAngle)
  // 目标区：目标角 ±8°
  const z1 = pctOf(target - 8)
  const z2 = pctOf(target + 8)
  const zoneLo = Math.min(z1, z2)
  const zoneHi = Math.max(z1, z2)
  const inZone = progress >= zoneLo

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div className="relative h-40 w-2.5 overflow-visible rounded-full bg-white/10 sm:h-56">
        {/* 目标区 */}
        <div
          className={`absolute inset-x-0 rounded-full transition-colors ${inZone ? 'bg-volt-400/50' : 'bg-volt-400/25'}`}
          style={{ top: `${(1 - zoneHi) * 100}%`, height: `${(zoneHi - zoneLo) * 100}%` }}
        />
        {/* 进度填充 */}
        <div
          className={`absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-100 ${inZone ? 'bg-volt-400' : 'bg-volt-400/70'}`}
          style={{ height: `${progress * 100}%` }}
        />
        {/* 当前位置标记 */}
        <div
          className={`absolute -inset-x-1 h-1.5 rounded-full bg-white shadow-glow transition-[top] duration-100 ${inZone ? 'shadow-[0_0_12px_rgba(212,255,63,0.8)]' : ''}`}
          style={{ top: `calc(${(1 - progress) * 100}% - 3px)` }}
        />
      </div>
      <div className="text-center">
        <div className="font-display text-sm font-semibold text-white/90">
          {currentAngle === null ? '--' : `${Math.round(currentAngle)}°`}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      </div>
    </div>
  )
}
