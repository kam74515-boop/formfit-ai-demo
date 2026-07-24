/**
 * Web Speech API 语音反馈：
 * - 规则级 3s 冷却（同一 ruleId 不重复播报）
 * - 全局 1.2s 最小间隔（避免叠音）
 * - zh-CN，可开关
 */
const RULE_COOLDOWN_MS = 3000
const GLOBAL_GAP_MS = 1200
const VOICE_KEY = 'formfit.settings.voice'

function readInitialEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(VOICE_KEY)
    if (raw === null) return true
    return JSON.parse(raw) !== false
  } catch {
    return true
  }
}

let enabled = typeof window !== 'undefined' ? readInitialEnabled() : true
let lastGlobal = 0
const lastByRule = new Map<string, number>()

export function setSpeechEnabled(v: boolean): void {
  enabled = v
  try {
    window.localStorage.setItem(VOICE_KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
  if (!v && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export function isSpeechEnabled(): boolean {
  return enabled
}

export function speak(text: string, ruleId = 'global'): boolean {
  if (!enabled) return false
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const now = Date.now()
  const lastRule = lastByRule.get(ruleId) ?? -Infinity
  if (now - lastRule < RULE_COOLDOWN_MS) return false
  if (now - lastGlobal < GLOBAL_GAP_MS) return false
  lastByRule.set(ruleId, now)
  lastGlobal = now
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 1.05
  u.pitch = 1
  window.speechSynthesis.speak(u)
  return true
}

/**
 * 危险级（danger）即时播报：
 * - 立即打断当前播报（cancel 后马上说）
 * - 不受全局 1.2s 最小间隔限制
 * - 同规则 3s 冷却仍然保留
 */
export function speakUrgent(text: string, ruleId = 'global'): boolean {
  if (!enabled) return false
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const now = Date.now()
  const lastRule = lastByRule.get(ruleId) ?? -Infinity
  if (now - lastRule < RULE_COOLDOWN_MS) return false
  window.speechSynthesis.cancel()
  lastByRule.set(ruleId, now)
  lastGlobal = now
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 1.1
  u.pitch = 1
  window.speechSynthesis.speak(u)
  return true
}

export function resetSpeechCooldowns(): void {
  lastByRule.clear()
  lastGlobal = 0
}
