import { useEffect, useState } from 'react'
import { Info, TriangleAlert, OctagonAlert } from 'lucide-react'
import type { Issue, Severity } from '../pose/types'

const STYLES: Record<Severity, { box: string; icon: typeof Info; iconClass: string }> = {
  danger: {
    // 高对比红 + 图标 pulse，danger 需要立刻引起注意
    box: 'bg-red-500/30 border-red-400/70 text-red-50 shadow-[0_0_30px_rgba(239,68,68,0.35)]',
    icon: OctagonAlert,
    iconClass: 'animate-pulse text-red-300',
  },
  warning: {
    box: 'bg-amber-400/15 border-amber-300/40 text-amber-200',
    icon: TriangleAlert,
    iconClass: '',
  },
  info: {
    box: 'bg-blue-400/15 border-blue-300/40 text-blue-200',
    icon: Info,
    iconClass: '',
  },
}

/** 底部纠错横幅：分级配色，2.5s 自动隐藏，只显示最新一条 */
export default function CorrectionBanner({ issue }: { issue: Issue | null }) {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<Issue | null>(null)

  useEffect(() => {
    if (!issue) return
    setCurrent(issue)
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 2500)
    return () => clearTimeout(timer)
  }, [issue])

  if (!current) return null
  const style = STYLES[current.severity]
  const Icon = style.icon

  return (
    <div
      className={`pointer-events-none absolute inset-x-4 bottom-24 z-20 flex justify-center transition-all duration-300 sm:bottom-8 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <div
        className={`flex max-w-md items-center gap-2.5 rounded-2xl border px-4 py-3 backdrop-blur-md ${style.box}`}
        role="alert"
      >
        <Icon size={20} className={`shrink-0 ${style.iconClass}`} />
        <span className="text-sm font-medium leading-snug">{current.message}</span>
      </div>
    </div>
  )
}
