import { Link, useLocation } from 'react-router-dom'
import { CalendarCheck, HeartPulse, House, UserRound, Zap } from 'lucide-react'

const LEFT_TABS = [
  { to: '/', label: '首页', icon: House },
  { to: '/plan', label: '计划', icon: CalendarCheck },
]

const RIGHT_TABS = [
  { to: '/health', label: '健康', icon: HeartPulse },
  { to: '/me', label: '我的', icon: UserRound },
]

/** 移动端底部 5 Tab（中心凸起训练按钮；训练中页面不渲染，由 App 控制） */
export default function TabBar() {
  const { pathname } = useLocation()

  const renderTab = ({ to, label, icon: Icon }: (typeof LEFT_TABS)[number]) => {
    const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
    return (
      <Link
        key={to}
        to={to}
        className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
          active ? 'text-volt-400' : 'text-white/40'
        }`}
      >
        <Icon size={21} />
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    )
  }

  const trainActive = pathname.startsWith('/train')

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="relative mx-auto flex max-w-md">
        {LEFT_TABS.map(renderTab)}
        <div className="flex-1" />
        {RIGHT_TABS.map(renderTab)}
        <Link
          to="/train"
          aria-label="训练"
          className={`absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full border-4 border-ink-950 shadow-glow transition-transform active:scale-90 ${
            trainActive ? 'bg-volt-300 text-ink-950' : 'bg-volt-400 text-ink-950'
          }`}
        >
          <Zap size={24} strokeWidth={2.5} />
        </Link>
      </div>
    </nav>
  )
}
