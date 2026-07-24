import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Dumbbell, Sparkles } from 'lucide-react'
import { generateWeekPlan } from '../plan/planEngine'
import {
  EQUIPMENT_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  INJURY_LABELS,
} from '../plan/types'
import type { Equipment, Experience, Goal, Injury, Profile } from '../plan/types'
import { loadSessions, savePlan, saveProfile } from '../utils/storage'

const GOALS: { id: Goal; desc: string }[] = [
  { id: 'muscle', desc: '增加肌肉量与围度' },
  { id: 'strength', desc: '提升最大力量' },
  { id: 'shape', desc: '紧致线条、改善体态' },
  { id: 'health', desc: '保持健康与活力' },
]
const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced']
const EQUIPMENTS: Equipment[] = ['bodyweight', 'dumbbell', 'barbell', 'gym']
const DAYS = [2, 3, 4, 5] as const
const MINUTES = [30, 45, 60, 90] as const
const INJURIES: Injury[] = ['waist', 'knee', 'shoulder']

const STEP_TITLES = ['训练目标', '训练经验', '可用器械', '时间安排', '伤病史']

export default function Onboarding() {
  const navigate = useNavigate()
  const sessions = useMemo(() => loadSessions(), [])
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [experience, setExperience] = useState<Experience | null>(null)
  const [equipment, setEquipment] = useState<Equipment[]>(['bodyweight'])
  const [daysPerWeek, setDaysPerWeek] = useState<2 | 3 | 4 | 5>(3)
  const [sessionMinutes, setSessionMinutes] = useState<30 | 45 | 60 | 90>(45)
  const [injuries, setInjuries] = useState<Injury[]>([])

  const toggleEquip = (e: Equipment) =>
    setEquipment((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]))
  const toggleInjury = (i: Injury) =>
    setInjuries((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))

  const canNext =
    (step === 0 && goal !== null) ||
    (step === 1 && experience !== null) ||
    step >= 2

  const finish = () => {
    const profile: Profile = {
      goal: goal ?? 'health',
      experience: experience ?? 'beginner',
      equipment: equipment.length > 0 ? equipment : ['bodyweight'],
      daysPerWeek,
      sessionMinutes,
      injuries,
      createdAt: new Date().toISOString(),
    }
    saveProfile(profile)
    savePlan(generateWeekPlan(profile, sessions))
    navigate('/plan', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950 text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <button
            onClick={() => (step === 0 ? navigate('/') : setStep(step - 1))}
            aria-label="返回"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-95"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-display text-lg font-bold">定制你的计划</span>
          <span className="ml-auto font-display text-sm text-white/40">
            {step + 1} / {STEP_TITLES.length}
          </span>
        </div>
        <div className="mx-auto flex max-w-md gap-1.5 px-4 pb-3">
          {STEP_TITLES.map((t, i) => (
            <div
              key={t}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-volt-400' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-40 pt-6">
        <h1 className="font-display text-2xl font-bold">{STEP_TITLES[step]}</h1>

        {step === 0 && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-white/45">你想通过力量训练获得什么？</p>
            {GOALS.map((g) => (
              <SelectCard
                key={g.id}
                selected={goal === g.id}
                title={GOAL_LABELS[g.id]}
                desc={g.desc}
                onClick={() => setGoal(g.id)}
              />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-white/45">你的力量训练经验？</p>
            {EXPERIENCES.map((e) => (
              <SelectCard
                key={e}
                selected={experience === e}
                title={EXPERIENCE_LABELS[e]}
                desc={e === 'beginner' ? '从零开始，动作模式优先' : e === 'intermediate' ? '有稳定训练习惯' : '系统训练多年'}
                onClick={() => setExperience(e)}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="mt-5">
            <p className="text-sm text-white/45">你有哪些器械可用？（可多选）</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {EQUIPMENTS.map((e) => (
                <SelectCard
                  key={e}
                  selected={equipment.includes(e)}
                  title={EQUIPMENT_LABELS[e]}
                  onClick={() => toggleEquip(e)}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-white/35">不选任何项时默认按自重训练编排</p>
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 space-y-6">
            <div>
              <p className="text-sm text-white/45">每周能练几天？</p>
              <div className="mt-3 flex gap-2">
                {DAYS.map((d) => (
                  <Chip key={d} selected={daysPerWeek === d} onClick={() => setDaysPerWeek(d)} label={`${d} 天`} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-white/45">每次大约练多久？</p>
              <div className="mt-3 flex gap-2">
                {MINUTES.map((m) => (
                  <Chip key={m} selected={sessionMinutes === m} onClick={() => setSessionMinutes(m)} label={`${m} 分`} />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="mt-5">
            <p className="text-sm text-white/45">是否有需要规避的伤病部位？（可多选，将自动过滤禁忌动作）</p>
            <div className="mt-4 space-y-3">
              {INJURIES.map((i) => (
                <SelectCard
                  key={i}
                  selected={injuries.includes(i)}
                  title={INJURY_LABELS[i]}
                  desc={
                    i === 'waist'
                      ? '将禁用大重量硬拉，硬拉类动作降重'
                      : i === 'knee'
                        ? '将禁用弓步类动作，深蹲改半蹲'
                        : '将禁用站姿推举类动作'
                  }
                  onClick={() => toggleInjury(i)}
                />
              ))}
              <SelectCard
                selected={injuries.length === 0}
                title="没有伤病"
                onClick={() => setInjuries([])}
              />
            </div>
          </div>
        )}
      </main>

      {/* 底部操作 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-ink-950/90 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md gap-3 px-4">
          {step < STEP_TITLES.length - 1 ? (
            <button
              onClick={() => canNext && setStep(step + 1)}
              disabled={!canNext}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 transition-opacity active:scale-95 disabled:opacity-30"
            >
              下一步
              <ArrowRight size={17} />
            </button>
          ) : (
            <button
              onClick={finish}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 shadow-glow active:scale-95"
            >
              <Sparkles size={17} />
              生成我的周计划
            </button>
          )}
        </div>
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-white/30">
          <Dumbbell size={11} />
          计划由确定性规则引擎生成，可随时重新评估调整
        </p>
      </div>
    </div>
  )
}

function SelectCard({
  selected,
  title,
  desc,
  onClick,
}: {
  selected: boolean
  title: string
  desc?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
        selected ? 'border-volt-400 bg-volt-400/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className={`font-medium ${selected ? 'text-volt-300' : 'text-white/90'}`}>{title}</div>
        {desc && <div className="mt-0.5 text-xs text-white/40">{desc}</div>}
      </div>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-volt-400 bg-volt-400 text-ink-950' : 'border-white/20'
        }`}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </div>
    </button>
  )
}

function Chip({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-11 flex-1 rounded-xl border font-display text-sm font-semibold transition-all active:scale-95 ${
        selected ? 'border-volt-400 bg-volt-400/15 text-volt-300' : 'border-white/10 bg-white/5 text-white/50'
      }`}
    >
      {label}
    </button>
  )
}
