import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBack } from '../utils/useBack'
import {
  ArrowLeft,
  Camera,
  CircleAlert,
  Dumbbell,
  Info,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { getLibraryExercise } from '../plan/exerciseLibrary'
import { EXERCISES } from '../pose/exercises'
import type { Equipment, MuscleGroup } from '../plan/types'

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  lower_push: '下肢 · 推',
  lower_pull: '下肢 · 拉',
  chest_push: '胸 · 推',
  shoulder_push: '肩 · 推',
  back_pull: '背 · 拉',
  core: '核心',
}

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: '自重',
  dumbbell: '哑铃',
  barbell: '杠铃',
  gym: '健身房',
}

/** 按动作模式的通用训练要点 */
const PATTERN_TIPS: Record<string, string[]> = {
  squat: ['双脚与肩同宽，脚尖微微外展', '先屈髋后屈膝，臀部向后下方坐', '起身时膝盖始终朝向脚尖方向', '全程核心收紧，脊柱保持中立'],
  hinge: ['动作从髋部发起，臀部向后推', '背部全程保持平直，不要弓腰', '感受大腿后侧与臀部的拉伸', '膝盖保持微屈，不要主动下蹲'],
  push: ['手腕置于肩膀正下方或略宽', '核心与臀部收紧，身体成一条直线', '下放有控制，推起不锁死肘关节', '全程保持自然呼吸，发力时呼气'],
  pull: ['先沉肩再发力，避免耸肩借力', '以肘部引导拉动，挤压背部', '顶峰收缩停顿 1 秒', '下放有控制，不要自由落体'],
  core: ['收紧腹部，腰部不要塌陷或拱起', '保持均匀呼吸，不要憋气', '动作宁慢勿快，感受核心发力'],
}

/** 按动作模式的常见错误（无 AI 纠错规则的动作使用） */
const PATTERN_PITFALLS: Record<string, string[]> = {
  squat: ['膝盖内扣', '脚跟离地', '躯干过度前倾', '下蹲深度不足'],
  hinge: ['弓背（腰椎屈曲）', '用膝盖蹲代替髋铰链', '负重时憋气'],
  push: ['塌腰或臀部过高', '肘部过度外展', '动作幅度不足'],
  pull: ['耸肩借力', '身体过度摆动', '下放失控'],
  core: ['腰部代偿', '憋气', '速度过快'],
}

const SEVERITY_STYLE = {
  danger: { icon: CircleAlert, cls: 'border-red-400/20 bg-red-400/10 text-red-300' },
  warning: { icon: TriangleAlert, cls: 'border-amber-400/20 bg-amber-400/10 text-amber-200' },
  info: { icon: Info, cls: 'border-sky-400/20 bg-sky-400/10 text-sky-300' },
} as const

export default function ExerciseDetail() {
  const { id = '' } = useParams()
  const back = useBack('/train')

  const entry = useMemo(() => getLibraryExercise(id), [id])
  const aiConfig = useMemo(
    () => EXERCISES.find((e) => e.id === (entry?.liveId ?? id)),
    [entry, id],
  )

  if (!entry && !aiConfig) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center text-white">
        <Dumbbell size={32} className="text-white/25" />
        <p className="text-sm text-white/50">没有找到这个动作</p>
        <button
          onClick={() => back()}
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm active:scale-95"
        >
          返回
        </button>
      </div>
    )
  }

  const name = entry?.name ?? aiConfig?.name ?? id
  const liveId = entry?.liveId ?? aiConfig?.id
  const difficulty = entry?.difficulty ?? aiConfig?.difficulty ?? 1
  const tips = entry ? PATTERN_TIPS[entry.pattern] ?? [] : []
  const pitfalls = entry ? PATTERN_PITFALLS[entry.pattern] ?? [] : []

  return (
    <div className="min-h-dvh bg-ink-950 pb-32 text-white">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <button
            onClick={() => back()}
            aria-label="返回"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-95"
          >
            <ArrowLeft size={17} />
          </button>
          <span className="text-sm font-semibold">动作详情</span>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 pt-5">
        {/* 标题区 */}
        <section className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-volt-400/10 text-volt-400">
            {aiConfig ? <aiConfig.icon size={30} /> : <Dumbbell size={30} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold">{name}</h1>
              {liveId && (
                <span className="flex items-center gap-1 rounded-full bg-volt-400/15 px-2 py-0.5 text-[10px] font-semibold text-volt-400">
                  <Zap size={10} />
                  AI 纠错
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-white/45">
              <span className="flex items-center gap-0.5">
                难度
                <span className="ml-1 flex gap-0.5">
                  {[1, 2, 3].map((d) => (
                    <span
                      key={d}
                      className={`h-1.5 w-1.5 rounded-full ${d <= difficulty ? 'bg-volt-400' : 'bg-white/15'}`}
                    />
                  ))}
                </span>
              </span>
              {entry && <span>· {MUSCLE_LABELS[entry.muscle]}</span>}
            </div>
          </div>
        </section>

        {/* 参数 chips */}
        {entry && (
          <section className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
              {entry.sets} 组 × {entry.reps}
            </span>
            {entry.equipment.map((eq) => (
              <span
                key={eq}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70"
              >
                {EQUIPMENT_LABELS[eq]}
              </span>
            ))}
            {aiConfig && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
                机位：{aiConfig.cameraHint}
              </span>
            )}
          </section>
        )}

        {/* 训练要点 */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/90">训练要点</h2>
          {aiConfig?.guide && (
            <p className="mb-3 rounded-xl bg-volt-400/5 p-3 text-xs leading-relaxed text-volt-200/80">
              {aiConfig.guide}
            </p>
          )}
          <ul className="space-y-2.5">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2.5 text-sm text-white/70">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-volt-400/70" />
                {tip}
              </li>
            ))}
          </ul>
        </section>

        {/* 常见错误 / AI 纠错规则 */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/90">
            {aiConfig ? 'AI 实时纠错规则' : '常见错误'}
          </h2>
          {aiConfig ? (
            <div className="space-y-2">
              {aiConfig.rules.map((rule) => {
                const s = SEVERITY_STYLE[rule.severity]
                return (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs ${s.cls}`}
                  >
                    <s.icon size={15} className="shrink-0" />
                    {rule.message}
                  </div>
                )
              })}
              <p className="pt-1 text-[11px] leading-relaxed text-white/35">
                训练中 AI 将实时检测以上问题，危险级问题会立即语音预警。
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {pitfalls.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-white/70">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* 底部 CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink-950/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-md">
          {liveId ? (
            <Link
              to={`/live/${liveId}`}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 shadow-glow transition-transform active:scale-95"
            >
              <Camera size={18} />
              开始 AI 训练
            </Link>
          ) : (
            <div className="flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/35">
              该动作暂不支持 AI 纠错
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
