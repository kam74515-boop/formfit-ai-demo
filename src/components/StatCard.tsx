import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon?: LucideIcon
  label: string
  value: ReactNode
  sub?: string
  accent?: string
}

export default function StatCard({ icon: Icon, label, value, sub, accent = 'text-volt-400' }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-card">
      <div className="flex items-center gap-1.5 text-xs text-white/50">
        {Icon && <Icon size={14} className="text-white/40" />}
        {label}
      </div>
      <div className={`mt-1.5 font-display text-2xl font-bold leading-none ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  )
}
