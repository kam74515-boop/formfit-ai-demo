import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Camera,
  CircleCheck,
  Flag,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  SwitchCamera,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { PoseEngine } from '../pose/PoseEngine'
import { WorkoutAnalyzer } from '../pose/analyzer'
import { getExercise } from '../pose/exercises'
import { setCoachComment } from '../agent/insights'
import { visOK } from '../pose/angles'
import type { DrawStatus } from '../pose/drawing'
import type { Issue, RepResult } from '../pose/types'
import { isSpeechEnabled, resetSpeechCooldowns, setSpeechEnabled, speak, speakUrgent } from '../utils/speech'
import { computeStreak, loadSessions, saveSession } from '../utils/storage'
import { useBack } from '../utils/useBack'
import ShareCardButton from '../components/ShareCardButton'
import SkeletonOverlay from '../components/SkeletonOverlay'
import CorrectionBanner from '../components/CorrectionBanner'
import DepthGauge from '../components/DepthGauge'

type Stage = 'boot' | 'bootError' | 'noCamera' | 'calibrate' | 'countdown' | 'active' | 'summary'

const COUNTDOWN_FROM = 3
const CALIBRATE_FRAMES = 20
const HIGHLIGHT_MS = 1500

interface Checklist {
  shoulder: boolean
  hip: boolean
  knee: boolean
  ankle: boolean
}

interface Summary {
  reps: RepResult[]
  avgScore: number
  topIssues: { message: string; count: number }[]
}

/** 计划模式：由 WorkoutSession 嵌入时传入，跑满 targetSets 组后回调而不是停在总结页 */
export interface PlanMode {
  targetSets: number
  targetReps: number
  onPlanComplete: (result: { sets: number; avgScore: number }) => void
}

interface LiveWorkoutProps {
  /** 计划模式下显式指定动作 id（此时不在 /live/:exerciseId 路由上） */
  exerciseId?: string
  planMode?: PlanMode
}

export default function LiveWorkout({ exerciseId: exerciseIdProp, planMode }: LiveWorkoutProps = {}) {
  const params = useParams()
  const exercise = getExercise(exerciseIdProp ?? params.exerciseId)
  const navigate = useNavigate()
  const planModeRef = useRef(planMode)
  planModeRef.current = planMode
  const planSetsRef = useRef<{ reps: number; score: number }[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const analyzerRef = useRef<WorkoutAnalyzer>(new WorkoutAnalyzer(exercise))
  const lastTsRef = useRef(0)
  const stableRef = useRef(0)
  const setIndexRef = useRef(1)
  const activeStartRef = useRef(0)
  const highlightUntilRef = useRef(0)
  const fpsRef = useRef({ frames: 0, windowStart: 0, fps: 0 })
  const cancelledRef = useRef(false)

  const [stage, setStageState] = useState<Stage>('boot')
  const stageRef = useRef<Stage>('boot')
  const setStage = useCallback((s: Stage) => {
    stageRef.current = s
    setStageState(s)
  }, [])

  const [bootMsg, setBootMsg] = useState('AI 引擎加载中…')
  const [facing, setFacing] = useState<'user' | 'environment'>('environment')
  const facingRef = useRef<'user' | 'environment'>('environment')
  const [checklist, setChecklist] = useState<Checklist>({ shoulder: false, hip: false, knee: false, ankle: false })
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM)
  const [landmarks, setLandmarks] = useState<import('../pose/types').Landmark[] | null>(null)
  const [highlight, setHighlight] = useState<number[]>([])
  const [skelStatus, setSkelStatus] = useState<DrawStatus>('ok')
  const [banner, setBanner] = useState<Issue | null>(null)
  const [hud, setHud] = useState({ reps: 0, progress: 0, angle: null as number | null, fps: 0, setIndex: 1 })
  const [speechOn, setSpeechOn] = useState(isSpeechEnabled())
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 })
  const [summary, setSummary] = useState<Summary | null>(null)

  const mirror = facing === 'user'

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(
    async (keepStage = false) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingRef.current, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setVideoSize({ w: video.videoWidth, h: video.videoHeight })
        if (!keepStage) {
          stableRef.current = 0
          setStage('calibrate')
        }
      } catch {
        if (!cancelledRef.current) setStage('noCamera')
      }
    },
    [setStage],
  )

  // 初始化：加载模型 → 请求摄像头
  useEffect(() => {
    cancelledRef.current = false
    ;(async () => {
      try {
        setBootMsg('AI 引擎加载中…')
        await PoseEngine.init()
      } catch (e) {
        if (!cancelledRef.current) {
          setBootMsg(e instanceof Error ? e.message : '模型加载失败')
          setStage('bootError')
        }
        return
      }
      if (cancelledRef.current) return
      setBootMsg('正在请求摄像头权限…')
      await startCamera()
    })()
    const loop = (tsNow: number) => {
      rafRef.current = requestAnimationFrame(loop)
      tick(tsNow)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelledRef.current = true
      cancelAnimationFrame(rafRef.current)
      stopStream()
      PoseEngine.close()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 倒计时
  useEffect(() => {
    if (stage !== 'countdown') return
    setCountdown(COUNTDOWN_FROM)
    let n = COUNTDOWN_FROM
    const iv = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(iv)
        speak('开始', 'countdown')
        activeStartRef.current = performance.now()
        setStage('active')
      } else {
        setCountdown(n)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [stage, setStage])

  const tick = (tsNow: number) => {
    const video = videoRef.current
    const st = stageRef.current
    if (!video || video.readyState < 2) return
    if (st !== 'calibrate' && st !== 'active') return

    let ts = tsNow
    if (ts <= lastTsRef.current) ts = lastTsRef.current + 1
    lastTsRef.current = ts

    const lm = PoseEngine.detectForVideo(video, ts)

    // FPS 统计
    const f = fpsRef.current
    f.frames += 1
    if (f.windowStart === 0) f.windowStart = tsNow
    if (tsNow - f.windowStart >= 1000) {
      f.fps = Math.round((f.frames * 1000) / (tsNow - f.windowStart))
      f.frames = 0
      f.windowStart = tsNow
    }

    if (st === 'calibrate') {
      setLandmarks(lm)
      const cl: Checklist = lm
        ? {
            shoulder: visOK(lm, [11, 12], 0.5),
            hip: visOK(lm, [23, 24], 0.5),
            knee: visOK(lm, [25, 26], 0.5),
            ankle: visOK(lm, [27, 28], 0.5),
          }
        : { shoulder: false, hip: false, knee: false, ankle: false }
      setChecklist(cl)
      if (cl.shoulder && cl.hip && cl.knee && cl.ankle) {
        stableRef.current += 1
        if (stableRef.current >= CALIBRATE_FRAMES) {
          stableRef.current = 0
          setStage('countdown')
        }
      } else {
        stableRef.current = 0
      }
      return
    }

    // active
    const analyzer = analyzerRef.current
    const res = analyzer.pushFrame(ts, lm)
    setLandmarks(res.landmarks)

    // 高亮过期
    if (tsNow > highlightUntilRef.current && highlightUntilRef.current !== 0) {
      highlightUntilRef.current = 0
      setHighlight([])
      setSkelStatus('ok')
    }

    for (const issue of res.newIssues) {
      setBanner(issue)
      if (issue.severity === 'danger') {
        // 危险级：立即打断当前播报 + 震动提醒
        speakUrgent(issue.message, issue.ruleId)
        navigator.vibrate?.(200)
      } else {
        speak(issue.message, issue.ruleId)
      }
      setHighlight(issue.joints)
      setSkelStatus(issue.severity === 'danger' ? 'danger' : 'warning')
      highlightUntilRef.current = tsNow + HIGHLIGHT_MS
    }

    setHud({
      reps: analyzer.reps.length,
      progress: res.progress,
      angle: res.currentAngle,
      fps: fpsRef.current.fps,
      setIndex: setIndexRef.current,
    })
  }

  const endSet = () => {
    const analyzer = analyzerRef.current
    const reps = [...analyzer.reps]
    const avgScore = reps.length ? Math.round(reps.reduce((s, r) => s + r.score, 0) / reps.length) : 0
    const agg = new Map<string, number>()
    for (const iss of analyzer.issues) agg.set(iss.message, (agg.get(iss.message) ?? 0) + 1)
    const topIssues = [...agg.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    const durationSec = Math.max(1, Math.round((performance.now() - activeStartRef.current) / 1000))
    if (reps.length > 0) {
      saveSession({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        reps: reps.length,
        avgScore,
        topIssues,
        durationSec,
        source: 'live',
      })
    }
    const pm = planModeRef.current
    if (pm) {
      planSetsRef.current.push({ reps: reps.length, score: avgScore })
      const doneSets = planSetsRef.current.length
      if (doneSets >= pm.targetSets) {
        // 计划组数完成：按次数加权平均后回调给编排页，不显示普通 summary
        const totalReps = planSetsRef.current.reduce((s, x) => s + x.reps, 0)
        const weighted = planSetsRef.current.reduce((s, x) => s + x.score * x.reps, 0)
        const overall =
          totalReps > 0
            ? Math.round(weighted / totalReps)
            : Math.round(planSetsRef.current.reduce((s, x) => s + x.score, 0) / doneSets)
        speak('动作完成', 'plan-complete')
        pm.onPlanComplete({ sets: doneSets, avgScore: overall })
        return
      }
    }
    setSummary({ reps, avgScore, topIssues })
    setStage('summary')
  }

  const nextSet = () => {
    analyzerRef.current.reset()
    resetSpeechCooldowns()
    setIndexRef.current += 1
    setBanner(null)
    setHighlight([])
    setSkelStatus('ok')
    setHud((h) => ({ ...h, reps: 0, progress: 0 }))
    setSummary(null)
    setStage('countdown')
  }

  const toggleFacing = async () => {
    const next = facingRef.current === 'environment' ? 'user' : 'environment'
    facingRef.current = next
    setFacing(next)
    stopStream()
    await startCamera(true)
  }

  const toggleSpeech = () => {
    const next = !speechOn
    setSpeechEnabled(next)
    setSpeechOn(next)
  }

  const back = useBack('/train')
  const quit = () => back()

  return (
    <div
      className={
        planMode
          ? 'relative h-full w-full overflow-hidden bg-black text-white'
          : 'fixed inset-0 overflow-hidden bg-black text-white'
      }
    >
      {/* 视频舞台 */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''}`}
        />
        {(stage === 'active' || stage === 'calibrate' || stage === 'countdown') && (
          <SkeletonOverlay
            landmarks={landmarks}
            highlightJoints={highlight}
            status={skelStatus}
            mirror={mirror}
            videoWidth={videoSize.w}
            videoHeight={videoSize.h}
            fit="cover"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* 顶部控制条（加载完成后常驻） */}
      {stage !== 'boot' && stage !== 'bootError' && (
        <div className="live-topbar absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">
            {exercise.name}
          </div>
          <div className="flex items-center gap-2">
            {stage === 'active' && (
              <div className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1.5 font-display text-[11px] text-white/60 backdrop-blur-md">
                {hud.fps} FPS · {PoseEngine.getDelegate() ?? '…'}
              </div>
            )}
            <button
              onClick={toggleSpeech}
              aria-label="语音开关"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-md active:scale-95"
            >
              {speechOn ? <Volume2 size={18} /> : <VolumeX size={18} className="text-white/40" />}
            </button>
            <button
              onClick={toggleFacing}
              aria-label="切换摄像头"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-md active:scale-95"
            >
              <SwitchCamera size={18} />
            </button>
            {!planMode && (
              <button
                onClick={quit}
                aria-label="退出"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-md active:scale-95"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* boot */}
      {stage === 'boot' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink-950">
          <LoaderCircle size={40} className="animate-spin text-volt-400" />
          <p className="text-sm text-white/60">{bootMsg}</p>
        </div>
      )}

      {/* bootError */}
      {stage === 'bootError' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink-950 px-8 text-center">
          <TriangleAlert size={40} className="text-amber-300" />
          <p className="text-sm text-white/70">AI 引擎加载失败</p>
          <p className="max-w-xs break-all text-xs text-white/35">{bootMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 flex h-11 items-center gap-2 rounded-2xl bg-volt-400 px-6 font-semibold text-ink-950 active:scale-95"
          >
            <RotateCcw size={16} />
            重试
          </button>
        </div>
      )}

      {/* 摄像头权限引导 */}
      {stage === 'noCamera' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink-950 px-8 text-center">
          <Camera size={40} className="text-white/30" />
          <p className="font-semibold text-white/90">需要摄像头权限</p>
          <p className="max-w-xs text-sm leading-relaxed text-white/50">
            请在浏览器地址栏左侧的站点设置中允许摄像头访问，然后点击重试。所有画面仅在本机处理，不会上传。
          </p>
          <button
            onClick={() => {
              setStage('boot')
              setBootMsg('正在请求摄像头…')
              void startCamera().then(() => {
                if (stageRef.current === 'noCamera') setStage('noCamera')
              })
            }}
            className="mt-2 flex h-11 items-center gap-2 rounded-2xl bg-volt-400 px-6 font-semibold text-ink-950 active:scale-95"
          >
            <RotateCcw size={16} />
            重试
          </button>
          {!planMode && (
            <button onClick={quit} className="text-sm text-white/40 underline underline-offset-4">
              返回首页
            </button>
          )}
        </div>
      )}

      {/* 校准 */}
      {stage === 'calibrate' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-3xl border border-white/15 bg-ink-900/80 p-5 shadow-card backdrop-blur-xl">
            <p className="text-center font-display text-lg font-bold">调整机位，全身入框</p>
            <p className="mt-1 text-center text-xs text-white/45">
              建议机位：{exercise.cameraHint} · 稳定后自动开始
            </p>
            <div className="mt-4 space-y-2.5">
              {(
                [
                  ['shoulder', '肩部'],
                  ['hip', '髋部'],
                  ['knee', '膝盖'],
                  ['ankle', '脚踝'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2.5 text-sm">
                  <CircleCheck
                    size={18}
                    className={checklist[key] ? 'text-volt-400' : 'text-white/20'}
                  />
                  <span className={checklist[key] ? 'text-white/90' : 'text-white/40'}>{label}入框</span>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/50">{exercise.guide}</p>
          </div>
        </div>
      )}

      {/* 倒计时 */}
      {stage === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            key={countdown}
            className="animate-[count-pop_0.9s_ease-out] font-display text-[120px] font-bold text-volt-400 drop-shadow-[0_0_40px_rgba(212,255,63,0.4)]"
          >
            {countdown}
          </div>
        </div>
      )}

      {/* active HUD */}
      {stage === 'active' && (
        <>
          {/* 左上计数器 */}
          <div className="absolute left-4 top-16 z-20">
            <div className="font-display text-[96px] font-bold leading-none text-volt-400 drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]">
              {hud.reps}
            </div>
            <div className="mt-1 text-sm font-medium text-white/70">第 {hud.setIndex} 组 · {exercise.name}</div>
            {planMode && (
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-volt-400/40 bg-volt-400/10 px-2.5 py-1 text-[11px] font-medium text-volt-300">
                计划 {planMode.targetSets} 组 × {planMode.targetReps} 次
              </div>
            )}
          </div>

          {/* 右侧深度计 */}
          <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2">
            <DepthGauge
              currentAngle={hud.angle}
              start={exercise.startAngle}
              target={exercise.targetAngle}
              flexedIsMin={exercise.flexedIsMin}
            />
          </div>

          {/* 右下结束按钮 */}
          <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30">
            <button
              onClick={endSet}
              className="flex h-12 items-center gap-2 rounded-2xl bg-volt-400 px-5 font-semibold text-ink-950 shadow-glow active:scale-95"
            >
              <Flag size={17} />
              结束本组
            </button>
          </div>

          <CorrectionBanner issue={banner} />
        </>
      )}

      {/* 总结 */}
      {stage === 'summary' && summary && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
          <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-card sm:rounded-3xl">
            <p className="text-center text-sm text-white/50">第 {setIndexRef.current} 组完成</p>
            <div className="mt-2 text-center">
              <span className="font-display text-6xl font-bold text-volt-400">{summary.avgScore}</span>
              <span className="ml-1 text-sm text-white/40">平均质量分</span>
            </div>
            <p className="mt-1 text-center text-sm text-white/60">本次 {summary.reps.length} 次</p>

            {/* AI 教练点评 */}
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-volt-400/20 bg-volt-400/5 p-3.5 text-xs leading-relaxed text-white/75">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-volt-400" />
              {setCoachComment({
                exerciseName: exercise.name,
                reps: summary.reps.length,
                avgScore: summary.avgScore,
                topIssues: summary.topIssues,
              })}
            </div>

            {/* 每次得分横条图 */}
            {summary.reps.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs text-white/40">每次得分</p>
                <div className="flex h-20 items-end gap-1.5">
                  {summary.reps.map((r) => (
                    <div key={r.index} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-md ${r.score >= 80 ? 'bg-volt-400' : r.score >= 60 ? 'bg-amber-300' : 'bg-red-400'}`}
                        style={{ height: `${Math.max(8, r.score * 0.72)}px` }}
                        title={`第${r.index}次 ${r.score}分`}
                      />
                      <span className="font-display text-[10px] text-white/40">{r.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 主要问题 Top3 */}
            <div className="mt-5">
              <p className="mb-2 text-xs text-white/40">主要问题</p>
              {summary.topIssues.length === 0 ? (
                <p className="rounded-xl bg-volt-400/10 p-3 text-center text-sm text-volt-300">
                  动作很标准，没有发现问题
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.topIssues.map((it) => (
                    <div key={it.message} className="flex items-center justify-between rounded-xl bg-white/5 px-3.5 py-2.5">
                      <span className="text-sm text-white/80">{it.message}</span>
                      <span className="ml-3 shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 font-display text-xs text-amber-200">
                        ×{it.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ShareCardButton
              className="mt-5"
              stats={{
                exerciseName: exercise.name,
                reps: summary.reps.length,
                score: summary.avgScore,
                dateText: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
                streak: computeStreak(loadSessions()),
                source: '实时训练',
              }}
            />

            <div className="mt-4 flex gap-3">
              {planMode ? (
                <button
                  onClick={nextSet}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 active:scale-95"
                >
                  <RotateCcw size={16} />
                  下一组（{setIndexRef.current}/{planMode.targetSets}）
                </button>
              ) : (
                <>
                  <button
                    onClick={nextSet}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 active:scale-95"
                  >
                    <RotateCcw size={16} />
                    再来一组
                  </button>
                  <button
                    onClick={quit}
                    className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/5 font-semibold active:scale-95"
                  >
                    完成返回
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
