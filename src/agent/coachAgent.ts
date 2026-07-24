import { loadPlan, loadSessions } from '../utils/storage'
import type { SessionRecord } from '../utils/storage'
import { computeRecovery } from '../plan/recovery'
import {
  ACWR_SAFE_HI,
  ACWR_SAFE_LO,
  acwr,
  acwrZone,
  computeLoadSeries,
} from '../health/metrics'
import { EXERCISES } from '../pose/exercises'
import type { ExerciseConfig } from '../pose/exercises'
import { MUSCLE_LABELS } from '../plan/types'
import type { PlanDay, WeekPlan } from '../plan/types'

export interface CoachReply {
  text: string
  /** 追问建议（点击即发送） */
  chips?: string[]
}

export const SUGGESTED_QUESTIONS: string[] = [
  '今天练什么？',
  '我恢复得怎么样，能练吗？',
  '深蹲怎么练才标准？',
  '最近练得怎么样？',
  '想加重量，怎么安排？',
  '今天只有20分钟，怎么练？',
]

/** 计划 dayIndex：0=周一 … 6=周日 */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7
}

function findToday(plan: WeekPlan | null): PlanDay | null {
  if (!plan) return null
  return plan.days.find((d) => d.dayIndex === todayIndex()) ?? null
}

/** 指定肌群中的最低恢复分 */
function lowestRecovery(
  sessions: SessionRecord[],
  muscles: string[],
): { label: string; score: number } | null {
  if (sessions.length === 0) return null
  const rec = computeRecovery(sessions)
  let best: { label: string; score: number } | null = null
  for (const m of muscles) {
    const score = rec[m as keyof typeof rec]
    if (score === undefined) continue
    if (!best || score < best.score) best = { label: MUSCLE_LABELS[m as keyof typeof MUSCLE_LABELS], score }
  }
  return best
}

/** 今日 ACWR；无记录返回 null */
function currentAcwr(sessions: SessionRecord[]): number | null {
  if (sessions.length === 0) return null
  const series = computeLoadSeries(sessions, 30)
  const latest = series[series.length - 1]
  return acwr(latest.ctl, latest.atl)
}

// ---------- 意图 1：今天练什么 ----------
function answerToday(plan: WeekPlan | null, sessions: SessionRecord[]): CoachReply {
  const day = findToday(plan)
  if (!day) {
    return {
      text: '你还没有本周计划。先去「计划」页做个评估，我再按你的数据安排每一天。',
      chips: ['深蹲怎么练才标准？', '俯卧撑有什么注意事项？'],
    }
  }
  if (day.restDay || day.exercises.length === 0) {
    return {
      text: `今天是休息日${day.reason ? `，${day.reason}` : '，让身体恢复'}。可以散步、拉伸，别上大强度。`,
      chips: ['我恢复得怎么样，能练吗？', '最近练得怎么样？'],
    }
  }
  const names = day.exercises.slice(0, 3).map((e) => e.name).join('、')
  const rec = lowestRecovery(sessions, day.exercises.map((e) => e.muscle))
  const why = rec
    ? `你的${rec.label}恢复 ${rec.score} 分，${rec.score >= 70 ? '状态在线，放心练。' : '略低，重量保守一点。'}`
    : '练完我会用记录持续跟踪你的恢复。'
  return {
    text: `今天练「${day.focus}」：${names}，约 ${day.estMinutes} 分钟。${why}`,
    chips: ['今天只有20分钟，怎么练？', '我恢复得怎么样，能练吗？'],
  }
}

// ---------- 意图 2：恢复 / 疲劳 ----------
function answerRecovery(sessions: SessionRecord[]): CoachReply {
  if (sessions.length === 0) {
    return {
      text: '还没有训练记录，没法评估恢复。先完成一次 AI 训练，我再来盯你的状态。',
      chips: ['今天练什么？', '深蹲怎么练才标准？'],
    }
  }
  const rec = computeRecovery(sessions)
  const entries = Object.entries(rec) as [keyof typeof MUSCLE_LABELS, number][]
  const [minMuscle, minScore] = entries.reduce((a, b) => (b[1] < a[1] ? b : a))
  const v = currentAcwr(sessions)!
  const zone = acwrZone(v)
  const advice =
    zone === 'high'
      ? '建议今天休息或训练量减半'
      : zone === 'low' && minScore >= 80
        ? '可以正常练，甚至小幅加量'
        : '可以正常训练，强度别超计划'
  return {
    text: `结论：${advice}。恢复最低的是${MUSCLE_LABELS[minMuscle]}（${minScore} 分），ACWR ${v.toFixed(2)}（安全区 ${ACWR_SAFE_LO}-${ACWR_SAFE_HI}）。仅供参考，不构成医疗建议。`,
    chips: ['今天练什么？', '最近练得怎么样？'],
  }
}

// ---------- 意图 3：动作怎么练 ----------
function answerExercise(ex: ExerciseConfig): CoachReply {
  const tips = [ex.depthRule.message, ...ex.rules.map((r) => r.message)].slice(0, 3)
  const others = EXERCISES.filter((e) => e.id !== ex.id).slice(0, 2).map((e) => `${e.name}怎么练？`)
  return {
    text: `${ex.name}：${ex.guide} AI 纠错会盯这几点：${tips.join('；')}。机位建议：${ex.cameraHint}。`,
    chips: [...others, '今天练什么？'],
  }
}

// ---------- 意图 4：最近练得怎么样 ----------
function answerWeekly(sessions: SessionRecord[]): CoachReply {
  const now = Date.now()
  const week = sessions.filter((s) => now - Date.parse(s.date) < 7 * 86_400_000)
  if (week.length === 0) {
    return {
      text: '最近 7 天还没有训练记录。从今天开始练一次，下周我就能给你出周报了。',
      chips: ['今天练什么？', '我恢复得怎么样，能练吗？'],
    }
  }
  const reps = week.reduce((s, r) => s + r.reps, 0)
  const avg = Math.round(week.reduce((s, r) => s + r.avgScore, 0) / week.length)
  const last = sessions[0]
  const issue = last?.topIssues[0]?.message
  const tail = issue ? `最近一次主要问题：「${issue}」，下次先改它。` : '最近一次没有明显问题，继续保持。'
  return {
    text: `本周练了 ${week.length} 次，共 ${reps} 次动作，平均质量 ${avg} 分。${tail}`,
    chips: ['想加重量，怎么安排？', '今天练什么？'],
  }
}

// ---------- 意图 5：加重 / 平台期 ----------
function answerProgression(sessions: SessionRecord[]): CoachReply {
  const recent = sessions.slice(0, 3)
  if (recent.length === 0) {
    return {
      text: '先积累几次训练记录，我才能判断能不能加重。质量分低于 60 的组不算有效组。',
      chips: ['今天练什么？', '深蹲怎么练才标准？'],
    }
  }
  const avg = Math.round(recent.reduce((s, r) => s + r.avgScore, 0) / recent.length)
  const v = currentAcwr(sessions)
  const loadOK = v === null || acwrZone(v) !== 'high'
  if (avg >= 80 && loadOK) {
    return {
      text: `最近质量分 ${avg}，负荷也在安全区，可以进阶：下次每个主动作 +2 次/组，或负重加 5%。加量后盯紧动作分，掉到 70 以下就退回。`,
      chips: ['最近练得怎么样？', '今天练什么？'],
    }
  }
  return {
    text: `最近质量分 ${avg}，还不到加重的时候。质量分低于 60 的组不算有效组——先把动作做稳到 80 分以上，再谈加重，进步反而更快。`,
    chips: ['深蹲怎么练才标准？', '最近练得怎么样？'],
  }
}

// ---------- 意图 6：没时间 / 计划调整 ----------
function answerTimeCrunch(plan: WeekPlan | null): CoachReply {
  const day = findToday(plan)
  if (!day || day.restDay || day.exercises.length === 0) {
    return {
      text: '今天没有安排训练。只有 20 分钟的话，练一组深蹲 + 俯卧撑循环最划算，去训练页直接开始。',
      chips: ['深蹲怎么练才标准？', '俯卧撑怎么练？'],
    }
  }
  const mains = day.exercises.filter((e) => e.isMain)
  const kept = (mains.length > 0 ? mains : day.exercises.slice(0, 2))
    .map((e) => `${e.name} ${e.sets} 组`)
    .join('，')
  return {
    text: `20 分钟版：砍辅助、保主动作——${kept}，组间休 60 秒，热身压缩到 2 分钟。辅助动作挪到下次。`,
    chips: ['今天练什么？', '我恢复得怎么样，能练吗？'],
  }
}

// ---------- 意图 7：兜底 ----------
function fallback(): CoachReply {
  return {
    text: '我是你的本地 AI 私教，建议都来自你的真实训练数据：今日计划、恢复评估、动作纠错、周报和加重规划都可以问我。',
    chips: SUGGESTED_QUESTIONS.slice(0, 4),
  }
}

/**
 * 本地 AI 私教：基于训练记录 / 计划 / 恢复 / 负荷数据的规则意图引擎。
 * 按优先级匹配意图，回答引用真实计算结果，先结论后依据。
 */
export function askCoach(question: string): CoachReply {
  const q = question.trim().toLowerCase()
  if (!q) return fallback()
  const sessions = loadSessions()
  const plan = loadPlan()

  // 1. 今日计划（"只有 X 分钟"类让给意图 6）
  if (/今天|今日|练什么|计划/.test(q) && !/只有|分钟|没时间|调整/.test(q)) {
    return answerToday(plan, sessions)
  }
  // 2. 恢复 / 疲劳
  if (/恢复|疲劳|累|能不能练|状态|休息|酸痛|伤/.test(q)) {
    return answerRecovery(sessions)
  }
  // 3. 动作技术（按五个 AI 纠错动作名匹配）
  const ex = EXERCISES.find(
    (e) => q.includes(e.name) || q.includes(e.id) || q.includes(e.nameEn.toLowerCase()),
  )
  if (ex) return answerExercise(ex)
  // 4. 周报 / 最近表现
  if (/怎么样|周报|最近|总结|记录|表现/.test(q)) {
    return answerWeekly(sessions)
  }
  // 5. 加重 / 进度 / 平台期
  if (/加重|重量|平台|进度|进阶|突破|加量/.test(q)) {
    return answerProgression(sessions)
  }
  // 6. 时间调整
  if (/分钟|没时间|时间|调整|只有|来不及/.test(q)) {
    return answerTimeCrunch(plan)
  }
  // 7. 兜底
  return fallback()
}

/** 面板首条欢迎语：引用今日计划或引导评估 */
export function welcomeMessage(): string {
  const day = findToday(loadPlan())
  if (day && !day.restDay && day.exercises.length > 0) {
    return `你好，我是你的 AI 私教。今天的计划是「${day.focus}」，约 ${day.estMinutes} 分钟。想问安排、恢复或动作细节，直接说。`
  }
  if (day?.restDay) {
    return '你好，我是你的 AI 私教。今天是休息日，想聊恢复状态或动作技术，随时问我。'
  }
  return '你好，我是你的 AI 私教。还没看到本周计划，先去「计划」页评估生成；也可以直接问我动作怎么练。'
}
