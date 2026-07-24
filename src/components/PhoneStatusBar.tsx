import { useEffect, useState } from 'react'
import { BatteryFull, Signal, Wifi } from 'lucide-react'

/** 模拟 iOS 状态栏（仅桌面机身模式显示；真机有系统状态栏，<540px 隐藏） */
export default function PhoneStatusBar() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000)
    return () => clearInterval(t)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 hidden items-center justify-between px-7 pt-3.5 text-white min-[540px]:flex">
      <span className="font-display text-[13px] font-semibold tracking-wide">
        {hh}:{mm}
      </span>
      <div className="flex items-center gap-1.5 text-white/90">
        <Signal size={14} />
        <span className="text-[11px] font-semibold">5G</span>
        <Wifi size={15} />
        <BatteryFull size={18} />
      </div>
    </div>
  )
}
