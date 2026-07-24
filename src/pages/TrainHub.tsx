import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  ChevronRight,
  ClipboardList,
  Film,
  Info,
  PersonStanding,
  Upload,
  Zap,
} from 'lucide-react'
import { EXERCISES } from '../pose/exercises'
import { loadPlan } from '../utils/storage'

function todayIndex(): number {
  return (new Date().getDay() + 6) % 7
}

export default function TrainHub() {
  const navigate = useNavigate()
  // 防御式解析：loadPlan 内部已 try/catch 并校验 days 为数组，失败返回 null
  const plan = useMemo(() => loadPlan(), [])
  const todayPlan = plan?.days?.[todayIndex()] ?? null
  const hasTrainingToday = !!todayPlan && typeof todayPlan === 'object' && !todayPlan.restDay
  const todayFocus = typeof todayPlan?.focus === 'string' && todayPlan.focus ? todayPlan.focus : '今日训练'
  const todayMinutes = typeof todayPlan?.estMinutes === 'number' ? todayPlan.estMinutes : null

  return (
    <div className="min-h-dvh bg-ink-950 pb-24 text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <span className="font-display text-lg font-bold">开始训练</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/45">
            实时纠错 · 视频复盘
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-5">
        {/* 继续今日计划 */}
        {hasTrainingToday && (
          <button
            onClick={() => navigate('/workout')}
            className="flex w-full items-center gap-4 rounded-3xl bg-volt-400 p-5 text-left text-ink-950 shadow-glow transition-transform active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink-950/10">
              <Zap size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-bold">继续今日计划训练</div>
              <div className="mt-0.5 truncate text-xs text-ink-950/70">
                {todayFocus}
                {todayMinutes !== null && ` · 约 ${todayMinutes} 分钟`}
              </div>
            </div>
            <ChevronRight size={20} className="shrink-0" />
          </button>
        )}

        {/* 实时 AI 训练 */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Camera size={16} className="text-white/40" />
            <h2 className="font-display text-base font-semibold text-white/90">实时 AI 训练</h2>
            <span className="ml-auto text-xs text-white/40">{EXERCISES.length} 个动作</span>
          </div>
          <div className="space-y-2.5">
            {EXERCISES.map((ex) => {
              const Icon = ex.icon
              return (
                <button
                  key={ex.id}
                  onClick={() => navigate(`/live/${ex.id}`)}
                  className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left shadow-card transition-all hover:border-volt-400/40 hover:bg-white/[0.07] active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-volt-400/10 text-volt-400 transition-colors group-hover:bg-volt-400/20">
                    <Icon size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{ex.name}</span>
                      <span className="flex gap-0.5">
                        {[1, 2, 3].map((d) => (
                          <span
                            key={d}
                            className={`h-1.5 w-1.5 rounded-full ${d <= ex.difficulty ? 'bg-volt-400' : 'bg-white/15'}`}
                          />
                        ))}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-white/45">
                      目标肌群：{ex.muscles}
                    </div>
                    <div className="mt-1 text-[11px] text-white/35">
                      {ex.rules.length + 1} 条纠错规则
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-volt-400"
                  />
                </button>
              )
            })}
          </div>
        </section>

        {/* 视频动作分析 */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Film size={16} className="text-white/40" />
            <h2 className="font-display text-base font-semibold text-white/90">视频动作分析</h2>
          </div>
          <button
            onClick={() => navigate('/video')}
            className="group w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-card transition-all hover:border-volt-400/40 hover:bg-white/[0.07] active:scale-[0.98]"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-volt-400/10 text-volt-400 transition-colors group-hover:bg-volt-400/20">
                <Film size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">上传训练视频，AI 帮你复盘</div>
                <div className="mt-0.5 text-xs text-white/45">无需实时拍摄，事后一样能分析动作</div>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-volt-400"
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 px-2 py-3 text-center">
                <Upload size={16} className="text-volt-400" />
                <span className="text-[11px] leading-tight text-white/60">上传视频复盘</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 px-2 py-3 text-center">
                <PersonStanding size={16} className="text-volt-400" />
                <span className="text-[11px] leading-tight text-white/60">逐帧骨骼回放</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 px-2 py-3 text-center">
                <ClipboardList size={16} className="text-volt-400" />
                <span className="text-[11px] leading-tight text-white/60">纠错报告</span>
              </div>
            </div>
          </button>
        </section>

        {/* 机位提示 */}
        <p className="mt-8 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/30">
          <Info size={12} className="mt-0.5 shrink-0" />
          建议侧面固定机位，距手机 1.5-3.5 米，确保全身入框后再开始训练
        </p>
      </main>
    </div>
  )
}
