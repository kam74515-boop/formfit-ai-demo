import type { Profile, WeekPlan } from '../plan/types'

export interface SessionRecord {
  id: string
  exerciseId: string
  exerciseName: string
  reps: number
  avgScore: number
  topIssues: { message: string; count: number }[]
  durationSec: number
  date: string
  source: 'live' | 'video'
  /** 可选：负重（kg），自重训练为空 */
  weightKg?: number
}

const KEY = 'formfit.sessions'
const PROFILE_KEY = 'formfit.profile'
const PLAN_KEY = 'formfit.plan'
const MAX_RECORDS = 50

export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as SessionRecord[]) : []
  } catch {
    return []
  }
}

export function saveSession(rec: Omit<SessionRecord, 'id' | 'date'>): SessionRecord {
  const full: SessionRecord = {
    ...rec,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
  }
  try {
    const list = [full, ...loadSessions()].slice(0, MAX_RECORDS)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // 存储不可用时静默失败（隐私模式等）
  }
  return full
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || !p.goal || !p.daysPerWeek) return null
    return p as Profile
  } catch {
    return null
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    // 忽略
  }
}

export function loadPlan(): WeekPlan | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || !Array.isArray(p.days)) return null
    return p as WeekPlan
  } catch {
    return null
  }
}

export function savePlan(p: WeekPlan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(p))
  } catch {
    // 忽略
  }
}

/** 连续训练天数：当天未练从昨天往前数，不断签 */
export function computeStreak(sessions: Pick<SessionRecord, 'date'>[]): number {
  const days = new Set(sessions.map((s) => new Date(s.date).toDateString()))
  const cur = new Date()
  if (!days.has(cur.toDateString())) cur.setDate(cur.getDate() - 1)
  let streak = 0
  while (days.has(cur.toDateString())) {
    streak += 1
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}
