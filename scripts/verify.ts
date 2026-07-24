/**
 * 纯函数逻辑验证脚本（非项目依赖，用 npx tsx 直接运行）：
 *   npx -y tsx scripts/verify.ts
 */
import { generateWeekPlan, validateAcsm, injuryRules, compressDay, swapExercise } from '../src/plan/planEngine'
import { computeRecovery, fatigueRemaining } from '../src/plan/recovery'
import {
  acwr,
  acwrZone,
  computeLoadSeries,
  dailyLoads,
  emaSeries,
  sessionTonnage,
  weekOverWeek,
} from '../src/health/metrics'
import { EXERCISE_LIBRARY } from '../src/plan/exerciseLibrary'
import type { PlanDay, Profile } from '../src/plan/types'
import type { SessionRecord } from '../src/utils/storage'

let passed = 0
let failed = 0
function assert(cond: boolean, name: string, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name} ${detail}`)
  }
}

const NOW = new Date('2026-07-20T12:00:00+08:00').getTime()

function mkSession(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: Math.random().toString(36).slice(2),
    exerciseId: 'squat',
    exerciseName: '深蹲',
    reps: 10,
    avgScore: 90,
    topIssues: [],
    durationSec: 120,
    date: new Date(NOW).toISOString(),
    source: 'live',
    ...partial,
  }
}

function mkProfile(partial: Partial<Profile>): Profile {
  return {
    goal: 'muscle',
    experience: 'intermediate',
    equipment: ['bodyweight', 'dumbbell', 'barbell', 'gym'],
    daysPerWeek: 3,
    sessionMinutes: 60,
    injuries: [],
    createdAt: new Date(NOW).toISOString(),
    ...partial,
  }
}

console.log('\n[1] 计划生成器 × ACSM 校验（2/3/5 天）')
for (const days of [2, 3, 5] as const) {
  const plan = generateWeekPlan(mkProfile({ daysPerWeek: days }), [], new Date(NOW))
  const { result } = validateAcsm(plan.days, null)
  const trainingDays = plan.days.filter((d) => !d.restDay)
  assert(result.ok, `${days} 天计划通过 ACSM 校验`, JSON.stringify(result.violations))
  assert(trainingDays.length === days, `${days} 天计划含 ${days} 个训练日`)
  assert(plan.warnings.length === 0, `${days} 天计划无告警`, plan.warnings.join(','))
  // 每个训练日主动作 1-2 个
  assert(
    trainingDays.every((d) => d.exercises.filter((e) => e.isMain).length >= 1),
    `${days} 天计划每个训练日有主动作`,
  )
}

console.log('\n[2] 伤病过滤')
{
  const knee = generateWeekPlan(mkProfile({ daysPerWeek: 5, injuries: ['knee'] }), [], new Date(NOW))
  const ids = knee.days.flatMap((d) => d.exercises.map((e) => e.libraryId))
  assert(!ids.some((i) => ['lunge', 'db_lunge', 'bulgarian'].includes(i)), '膝伤：无弓步类动作', ids.join(','))
  const squat = knee.days.flatMap((d) => d.exercises).find((e) => e.libraryId === 'squat')
  if (squat) assert(squat.note?.includes('半蹲') ?? false, '膝伤：深蹲标注半蹲')

  const shoulder = generateWeekPlan(mkProfile({ daysPerWeek: 5, injuries: ['shoulder'] }), [], new Date(NOW))
  const ids2 = shoulder.days.flatMap((d) => d.exercises.map((e) => e.libraryId))
  assert(
    !ids2.some((i) => ['press', 'db_press', 'barbell_press', 'pike_pushup'].includes(i)),
    '肩伤：无推举类动作',
    ids2.join(','),
  )

  const waist = generateWeekPlan(mkProfile({ daysPerWeek: 5, injuries: ['waist'] }), [], new Date(NOW))
  const ids3 = waist.days.flatMap((d) => d.exercises.map((e) => e.libraryId))
  assert(!ids3.includes('barbell_deadlift'), '腰伤：无杠铃硬拉', ids3.join(','))

  const rules = injuryRules(['knee', 'shoulder', 'waist'])
  assert(rules.excluded.has('lunge') && rules.excluded.has('press') && rules.excluded.has('barbell_deadlift'), 'injuryRules 覆盖三类伤病')
}

console.log('\n[3] ACWR 手算对照')
{
  // 场景 A：30 天恒定负荷 1000/天 → CTL=ATL=1000 → ACWR=1.00
  const constant = Array.from({ length: 30 }, (_, i) =>
    mkSession({ weightKg: 100, reps: 10, date: new Date(NOW - i * 86_400_000).toISOString() }),
  )
  const seriesA = computeLoadSeries(constant, 30, NOW)
  const latestA = seriesA[seriesA.length - 1]
  assert(Math.abs(latestA.ctl - 1000) < 1, `恒定负荷 CTL≈1000（实际 ${latestA.ctl}）`)
  assert(Math.abs(latestA.atl - 1000) < 1, `恒定负荷 ATL≈1000（实际 ${latestA.atl}）`)
  assert(Math.abs(acwr(latestA.ctl, latestA.atl) - 1.0) < 0.005, '恒定负荷 ACWR=1.00')

  // 场景 B：前 23 天 0 负荷，近 7 天 1000/天 → 手算 ATL≈866.52, CTL≈283.71, ACWR≈3.05
  const spiked = Array.from({ length: 7 }, (_, i) =>
    mkSession({ weightKg: 100, reps: 10, date: new Date(NOW - i * 86_400_000).toISOString() }),
  )
  const seriesB = computeLoadSeries(spiked, 30, NOW)
  const latestB = seriesB[seriesB.length - 1]
  assert(Math.abs(latestB.atl - 866.5) < 1.5, `突增负荷 ATL≈866.5（实际 ${latestB.atl}）`)
  assert(Math.abs(latestB.ctl - 283.7) < 1.5, `突增负荷 CTL≈283.7（实际 ${latestB.ctl}）`)
  const acwrB = acwr(latestB.ctl, latestB.atl)
  assert(Math.abs(acwrB - 3.05) < 0.02, `突增负荷 ACWR≈3.05（实际 ${acwrB}）`)
  assert(acwrZone(acwrB) === 'high', '突增负荷判为超区')

  // CTL 地板值：极低 CTL 时比值不失真
  assert(acwr(10, 100) === 2, `CTL 地板值生效（acwr(10,100)=${acwr(10, 100)}）`)

  // EMA 基本性质
  const ema = emaSeries([100, 100, 100], 7)
  assert(ema[0] === 100 && ema[2] === 100, 'EMA 常数序列保持不变')

  // sessionTonnage：自重深蹲 12 次 = 65×0.8×12 = 624
  assert(sessionTonnage(mkSession({ reps: 12 })) === 624, `自重吨位估算=624（实际 ${sessionTonnage(mkSession({ reps: 12 }))}）`)
}

console.log('\n[4] 恢复评分单调性')
{
  const s = [mkSession({ reps: 12, date: new Date(NOW - 1 * 3_600_000).toISOString() })]
  const scores = [1, 6, 12, 24, 36, 48, 72, 97].map(
    (h) => computeRecovery(s, NOW + (h - 1) * 3_600_000).lower_push,
  )
  let mono = true
  for (let i = 1; i < scores.length; i++) if (scores[i] < scores[i - 1]) mono = false
  assert(mono, `恢复评分随时间单调不减（${scores.join('→')}）`)
  assert(scores[scores.length - 1] === 100, '96h 后完全恢复')
  // 残留曲线端点
  assert(fatigueRemaining(0) === 1 && fatigueRemaining(96) === 0, '残留曲线端点正确')
  assert(Math.abs(fatigueRemaining(24) - 0.5) < 1e-9, '24h 残留 50%')
  assert(Math.abs(fatigueRemaining(48) - 0.25) < 1e-9, '48h 残留 25%')
  assert(Math.abs(fatigueRemaining(72) - 0.1) < 1e-9, '72h 残留 10%')
}

console.log('\n[5] ACSM 校验器一票否决与削减')
{
  // 同肌群连续两天 → 拒绝
  const lib = EXERCISE_LIBRARY.find((e) => e.id === 'squat')!
  const badDays: PlanDay[] = [0, 1].map((di) => ({
    dayIndex: di,
    dayLabel: `D${di}`,
    focus: '腿',
    restDay: false,
    estMinutes: 30,
    exercises: [
      { libraryId: lib.id, name: lib.name, muscle: lib.muscle, sets: 3, reps: lib.reps, suggestion: 'RPE', isMain: true },
    ],
  }))
  const { result } = validateAcsm(badDays, null)
  assert(!result.ok && result.violations.length > 0, '同肌群间隔<1天被拒绝', JSON.stringify(result))

  // 周负荷增幅>10% → 削减辅助组
  const bigDays: PlanDay[] = [0, 3].map((di) => ({
    dayIndex: di,
    dayLabel: `D${di}`,
    focus: '全身',
    restDay: false,
    estMinutes: 60,
    exercises: [
      { libraryId: 'barbell_squat', name: '杠铃深蹲', muscle: 'lower_push', sets: 5, reps: '5', suggestion: '', isMain: true },
      { libraryId: 'barbell_deadlift', name: '杠铃硬拉', muscle: 'lower_pull', sets: 5, reps: '5', suggestion: '', isMain: false },
      { libraryId: 'pullup', name: '引体向上', muscle: 'back_pull', sets: 5, reps: '6', suggestion: '', isMain: false },
    ],
  }))
  const trimmed = validateAcsm(bigDays, 3000)
  assert(trimmed.result.trimmed, '超负荷增幅触发削减')
  const afterLoad = trimmed.days.reduce(
    (sum, d) => sum + d.exercises.reduce((s, e) => s + e.sets * 10 * 65, 0),
    0,
  )
  const beforeAccessories = bigDays[0].exercises.length + bigDays[1].exercises.length
  const afterAccessories = trimmed.days[0].exercises.length + trimmed.days[1].exercises.length
  assert(afterAccessories < beforeAccessories || afterLoad <= 3000 * 1.1, '辅助组被实际削减')
}

console.log('\n[6] 计划调整函数')
{
  const plan = generateWeekPlan(mkProfile({ daysPerWeek: 3 }), [], new Date(NOW))
  const dayIdx = plan.days.findIndex((d) => !d.restDay && d.exercises.length >= 3)
  if (dayIdx >= 0) {
    const day = plan.days[dayIdx]
    const compressed = compressDay(day, 20)
    assert(
      compressed.exercises.every((e) => e.isMain) || compressed.exercises.filter((e) => !e.isMain).length <= 1,
      '20 分钟精简保留主动作',
    )
    assert(compressed.estMinutes < day.estMinutes, '精简后时长下降')
    const swapped = swapExercise(plan, dayIdx, 0, mkProfile({}))
    const origId = plan.days[dayIdx].exercises[0].libraryId
    const newId = swapped.days[dayIdx].exercises[0].libraryId
    assert(newId !== origId, `换一下替换动作（${origId}→${newId}）`)
    assert(
      swapped.days[dayIdx].exercises[0].muscle === plan.days[dayIdx].exercises[0].muscle,
      '替换后同肌群',
    )
  }
  // weekOverWeek：近7天 7000 vs 前7天 5000 → 0.4
  const wowSessions = [
    ...Array.from({ length: 7 }, (_, i) =>
      mkSession({ weightKg: 100, reps: 10, date: new Date(NOW - i * 86_400_000).toISOString() }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      mkSession({ weightKg: 100, reps: 10, date: new Date(NOW - (7 + i) * 86_400_000).toISOString() }),
    ),
  ]
  const wow = weekOverWeek(wowSessions, NOW)
  assert(wow !== null && Math.abs(wow - 0.4) < 0.001, `周环比=0.40（实际 ${wow}）`)
  const daily = dailyLoads(wowSessions, 14, NOW)
  assert(daily.length === 14 && daily[13].load === 1000, 'dailyLoads 结构正确')
}

console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed > 0) process.exit(1)
