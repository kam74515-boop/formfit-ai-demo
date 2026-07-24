/**
 * AI 即层：确定性洞察引擎。
 * 不调用任何大模型，全部基于本地真实数据（训练记录 / 恢复分 / 负荷指标 / 睡眠演示数据）
 * 用模板生成教练口吻的叙事文案，供各页面内嵌展示。
 * 语气约定：先结论后依据、说"你"、不做诊断/治疗措辞。
 */
import { generateWellness } from '../health/mockData'
import { ACWR_SAFE_HI, ACWR_SAFE_LO, acwr, computeLoadSeries, weekOverWeek } from '../health/metrics'
import { ALL_MUSCLES, computeRecovery, daysSinceLastSession } from '../plan/recovery'
import { MUSCLE_LABELS } from '../plan/types'
import type { MuscleGroup, PlanDay } from '../plan/types'
import { loadPlan, loadSessions } from '../utils/storage'

export interface Insight {
  id: string
  level: 'good' | 'tip' | 'warn'
  title: string
  body: string
  actionLabel?: string
  actionTo?: string
}

/** 恢复分 → 训练建议措辞 */
function recoveryAdvice(score: number): string {
  if (score >= 80) return '状态很好，可以正常上强度'
  if (score >= 60) return '基本恢复，按计划完成即可'
  return '恢复不足，主动作建议减量或替换'
}

/** 恢复分最低的肌群 */
function lowestMuscle(recovery: Record<MuscleGroup, number>): MuscleGroup {
  let min = ALL_MUSCLES[0]
  for (const m of ALL_MUSCLES) if (recovery[m] < recovery[min]) min = m
  return min
}

/** 今天是计划中的训练日吗 */
function isTrainingDay(now: number): boolean {
  const plan = loadPlan()
  if (!plan) return false
  const idx = (new Date(now).getDay() + 6) % 7
  const day = plan.days[idx]
  return !!day && !day.restDay
}

/**
 * 每日洞察：最多 3 条，按优先级排序（负荷风险 > 睡眠恢复 > 肌群恢复 > 遗留问题）。
 * 每条都代入真实数值；一切正常时返回 1 条 good。
 */
export function dailyInsights(now: number = Date.now()): Insight[] {
  const sessions = loadSessions()

  if (sessions.length === 0) {
    return [
      {
        id: 'first_session',
        level: 'tip',
        title: '先完成一次 AI 训练',
        body: '还没有训练数据。完成一次 AI 纠错训练后，我会基于你的动作质量、负荷与恢复，每天给你具体建议。',
        actionLabel: '去训练',
        actionTo: '/train',
      },
    ]
  }

  const insights: Insight[] = []

  // 负荷数据
  const series = computeLoadSeries(sessions, 30, now)
  const latest = series[series.length - 1]
  const acwrNow = latest ? acwr(latest.ctl, latest.atl) : 0
  const wow = weekOverWeek(sessions, now)

  // 恢复数据
  const recovery = computeRecovery(sessions, now)

  // a) 负荷风险：ACWR 超区或周增幅 >10%
  if (acwrNow > ACWR_SAFE_HI || (wow !== null && wow > 0.1)) {
    const reason =
      acwrNow > ACWR_SAFE_HI
        ? `本周负荷比 ${acwrNow.toFixed(2)}，已超出安全区（${ACWR_SAFE_LO}-${ACWR_SAFE_HI}）`
        : `本周负荷较上周增加 ${Math.round((wow ?? 0) * 100)}%，超过 10% 的建议幅度`
    insights.push({
      id: 'load_risk',
      level: 'warn',
      title: '负荷增长过快',
      body: `${reason}。建议今天减量 30% 或改为主动恢复。`,
      actionLabel: '去看看',
      actionTo: '/health',
    })
  }

  // b) 睡眠 / HRV 恢复不足（演示数据）
  const wellness = generateWellness(14, now)
  const lastNight = wellness[wellness.length - 1]
  const hrvBaseline = Math.round(
    wellness.slice(0, -1).reduce((s, w) => s + w.hrv, 0) / Math.max(1, wellness.length - 1),
  )
  const sleepLow = lastNight.sleepHours < 6.5
  const hrvLow = lastNight.hrv < hrvBaseline
  if (sleepLow || hrvLow) {
    const evidence: string[] = []
    if (sleepLow) evidence.push(`昨晚睡眠 ${lastNight.sleepHours}h`)
    if (hrvLow) evidence.push(`HRV ${lastNight.hrv}ms 低于你的基线 ${hrvBaseline}ms`)
    insights.push({
      id: 'recovery_low',
      level: 'tip',
      title: '恢复不足',
      body: `${evidence.join('，')}。${isTrainingDay(now) ? '今天是训练日' : '今天如果是训练日'}，建议降低强度、动作质量优先。`,
      actionLabel: '去看看',
      actionTo: '/health',
    })
  }

  // c) 肌群恢复 <60%
  const lowMuscles = ALL_MUSCLES.filter((m) => recovery[m] < 60).sort(
    (a, b) => recovery[a] - recovery[b],
  )
  if (lowMuscles.length > 0) {
    const m = lowMuscles[0]
    insights.push({
      id: 'muscle_low',
      level: 'tip',
      title: `${MUSCLE_LABELS[m]}肌群还没恢复`,
      body: `${MUSCLE_LABELS[m]}肌群恢复仅 ${recovery[m]}%，今天避免安排该肌群主动作，可以改练其他部位或明显减量。`,
      actionLabel: '查看恢复',
      actionTo: '/health',
    })
  }

  // d) 上次训练的遗留问题
  const lastIssue = sessions[0]?.topIssues[0]
  if (sessions[0] && lastIssue) {
    insights.push({
      id: 'last_issue',
      level: lastIssue.count >= 3 ? 'warn' : 'tip',
      title: '上次训练的遗留问题',
      body: `上次${sessions[0].exerciseName}出现「${lastIssue.message}」${lastIssue.count} 次，今天训练重点关注，先用轻重量慢速做 1-2 组找感觉。`,
      actionLabel: '去纠正',
      actionTo: '/train',
    })
  }

  // e) 全部正常
  if (insights.length === 0) {
    const minMuscle = lowestMuscle(recovery)
    insights.push({
      id: 'all_good',
      level: 'good',
      title: '恢复良好，按计划推进',
      body: `各肌群恢复良好（最低的${MUSCLE_LABELS[minMuscle]}也有 ${recovery[minMuscle]}%），近期负荷比 ${acwrNow.toFixed(2)} 未超安全区。按计划推进即可。`,
    })
  }

  return insights.slice(0, 3)
}

/**
 * 计划页每日一句：结合当日 focus 涉及肌群的恢复分与训练间隔给出建议。
 * 休息日单独文案。
 */
export function planDayAdvice(day: PlanDay, now: number = Date.now()): string {
  const sessions = loadSessions()
  const recovery = computeRecovery(sessions, now)

  if (day.restDay) {
    if (sessions.length === 0) {
      return '今天是休息日。还没有训练数据，从下一个训练日开始积累，我会帮你盯住恢复节奏。'
    }
    const minMuscle = lowestMuscle(recovery)
    return `今天是休息日。当前恢复最慢的是${MUSCLE_LABELS[minMuscle]}肌群（${recovery[minMuscle]}%），散散步、做做拉伸，明天再练状态更好。`
  }

  // 当日涉及肌群：优先主动作，去重，最多 2 个
  const mains = day.exercises.filter((e) => e.isMain)
  const source = mains.length > 0 ? mains : day.exercises
  const muscles: MuscleGroup[] = []
  for (const e of source) {
    if (!muscles.includes(e.muscle)) muscles.push(e.muscle)
    if (muscles.length >= 2) break
  }

  const parts = muscles.map((m) => {
    const score = recovery[m]
    const days = daysSinceLastSession(sessions, m, now)
    const gap = days === null ? '近期没练过该肌群' : days === 0 ? '昨天刚练过' : `距上次训练 ${days} 天`
    return `${MUSCLE_LABELS[m]}恢复 ${score}%（${gap}），${recoveryAdvice(score)}`
  })

  return `今天练${day.focus}：${parts.join('；')}。`
}

/**
 * 动作历史提示：该 /live 动作最近一次训练的 topIssues[0]。
 * 无记录或无问题返回 null。
 */
export function exerciseHistoryTip(liveId: string): string | null {
  const sessions = loadSessions()
  const last = sessions.find((s) => s.exerciseId === liveId)
  const issue = last?.topIssues[0]
  if (!last || !issue) return null
  return `你上次${last.exerciseName}「${issue.message}」×${issue.count}，本次重点关注`
}

export interface CoachCommentInput {
  exerciseName: string
  reps: number
  avgScore: number
  topIssues: { message: string; count?: number }[]
}

/** 问题文案拆成「问题名」与「纠正口令」：逗号前是问题，后是口令 */
function splitIssue(message: string): { problem: string; cue: string } {
  const segs = message.split('，')
  if (segs.length === 1) return { problem: message, cue: message }
  return { problem: segs[0], cue: segs.slice(1).join('，') }
}

/** 组后点评（实时训练组总结用） */
export function setCoachComment({ exerciseName, reps, avgScore, topIssues }: CoachCommentInput): string {
  if (reps === 0) {
    return `这组没有计入有效的${exerciseName}次数。别着急，调整机位让全身入框、把动作做完整，再来一组，我帮你盯着。`
  }
  const parts: string[] = [`这组 ${reps} 次、平均 ${avgScore} 分。`]
  const issue = topIssues[0]
  if (issue) {
    const { problem, cue } = splitIssue(issue.message)
    const times = issue.count !== undefined ? `出现 ${issue.count} 次，` : ''
    parts.push(`「${problem}」${times}下组注意${cue}。`)
  }
  if (avgScore >= 85) {
    parts.push('动作质量很高，保持这个节奏。')
  } else if (avgScore < 60) {
    parts.push('质量分偏低，建议放慢速度或降低负重，先把动作做标准。')
  }
  return parts.join('')
}

/** 视频分析结果页总评（教练口吻，1-2 句） */
export function videoReviewComment({ exerciseName, reps, avgScore, topIssues }: CoachCommentInput): string {
  if (reps === 0) {
    return `这段视频里没有识别到完整的${exerciseName}。建议换侧面固定机位、全身入框再拍一段，我逐帧帮你抠动作。`
  }
  const first = `这段${exerciseName}完成 ${reps} 次、平均 ${avgScore} 分。`
  const issue = topIssues[0]
  if (issue) {
    const { problem } = splitIssue(issue.message)
    const times = issue.count !== undefined ? `（${issue.count} 次）` : ''
    return `${first}最该改的是「${problem}」${times}，下次先徒手慢速把动作做标准，再恢复节奏。`
  }
  if (avgScore >= 85) return `${first}动作整体很标准，保持这个发力模式，可以循序渐进加量。`
  if (avgScore < 60) return `${first}整体质量分偏低，别追次数，先对照实时纠错把每个动作做满做稳。`
  return `${first}没有明显问题，继续保持动作的一致性。`
}
