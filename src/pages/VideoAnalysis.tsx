import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBack } from '../utils/useBack'
import {
  ArrowLeft,
  Check,
  Film,
  Info,
  LoaderCircle,
  Pause,
  Play,
  Repeat,
  Sparkles,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { PoseEngine } from '../pose/PoseEngine'
import { WorkoutAnalyzer } from '../pose/analyzer'
import { EXERCISES, getExercise } from '../pose/exercises'
import { videoReviewComment } from '../agent/insights'
import type { DrawStatus } from '../pose/drawing'
import type { Issue, Landmark, RepResult, Severity } from '../pose/types'
import { computeStreak, loadSessions, saveSession } from '../utils/storage'
import ShareCardButton from '../components/ShareCardButton'
import SkeletonOverlay from '../components/SkeletonOverlay'
import StatCard from '../components/StatCard'

type Stage = 'pick' | 'configure' | 'processing' | 'result'

interface Sample {
  t: number
  angle: number | null
  landmarks: Landmark[] | null
}

const SEVERITY_ORDER: Record<Severity, number> = { danger: 3, warning: 2, info: 1 }
const SEVERITY_COLOR: Record<Severity, string> = {
  danger: '#F87171',
  warning: '#FBBF24',
  info: '#60A5FA',
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const on = () => {
      video.removeEventListener('seeked', on)
      resolve()
    }
    video.addEventListener('seeked', on)
    video.currentTime = Math.min(t, Math.max(0, (video.duration || t) - 0.05))
  })
}

export default function VideoAnalysis() {
  const [stage, setStage] = useState<Stage>('pick')
  const [videoURL, setVideoURL] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [duration, setDuration] = useState(0)
  const [exerciseId, setExerciseId] = useState('squat')
  const [progress, setProgress] = useState({ pct: 0, t: 0 })
  const [error, setError] = useState('')

  const [samples, setSamples] = useState<Sample[]>([])
  const [reps, setReps] = useState<RepResult[]>([])
  const [issues, setIssues] = useState<Issue[]>([])

  const [playing, setPlaying] = useState(false)
  const [loopPlay, setLoopPlay] = useState(true)
  const [currentT, setCurrentT] = useState(0)
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 })

  const procVideoRef = useRef<HTMLVideoElement>(null)
  const playVideoRef = useRef<HTMLVideoElement>(null)
  const cancelRef = useRef(false)
  const draggingRef = useRef(false)

  const exercise = getExercise(exerciseId)

  // 卸载释放
  useEffect(() => {
    return () => {
      cancelRef.current = true
      PoseEngine.close()
    }
  }, [])
  useEffect(() => {
    return () => {
      if (videoURL) URL.revokeObjectURL(videoURL)
    }
  }, [videoURL])

  const back = useBack('/train')

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file.name) && !file.type.startsWith('video/')) {
      setError('请选择 mp4 / mov / webm 视频文件')
      return
    }
    setError('')
    if (videoURL) URL.revokeObjectURL(videoURL)
    const url = URL.createObjectURL(file)
    setVideoURL(url)
    setFileName(file.name)
    setStage('configure')
  }

  const loadSample = async (path: string, name: string) => {
    try {
      setError('')
      const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      pickFile(new File([blob], name, { type: 'video/mp4' }))
    } catch {
      setError('示例视频加载失败，请检查 public/samples 目录')
    }
  }

  const startAnalysis = async () => {
    const video = procVideoRef.current
    if (!video || !videoURL) return
    cancelRef.current = false
    setStage('processing')
    setProgress({ pct: 0, t: 0 })
    try {
      await PoseEngine.init()
      if (cancelRef.current) return
      const ex = getExercise(exerciseId)
      const analyzer = new WorkoutAnalyzer(ex)
      const dur = video.duration && isFinite(video.duration) ? video.duration : 0
      if (dur <= 0) throw new Error('无法读取视频时长')
      setDuration(dur)
      const step = Math.max(1 / 12, dur / 400)
      const newSamples: Sample[] = []
      for (let t = 0; t < dur && !cancelRef.current; t += step) {
        await seekTo(video, t)
        if (cancelRef.current) return
        const lm = PoseEngine.detectForVideo(video, Math.round(t * 1000))
        const res = analyzer.pushFrame(Math.round(t * 1000), lm)
        newSamples.push({ t, angle: res.currentAngle, landmarks: res.landmarks })
        if (newSamples.length % 5 === 0) {
          setProgress({ pct: Math.min(99, Math.round((t / dur) * 100)), t })
        }
      }
      if (cancelRef.current) return
      setProgress({ pct: 100, t: dur })
      setSamples(newSamples)
      setReps([...analyzer.reps])
      setIssues([...analyzer.issues])
      if (analyzer.reps.length > 0) {
        const avg = Math.round(analyzer.reps.reduce((s, r) => s + r.score, 0) / analyzer.reps.length)
        const agg = new Map<string, number>()
        for (const iss of analyzer.issues) agg.set(iss.message, (agg.get(iss.message) ?? 0) + 1)
        saveSession({
          exerciseId: ex.id,
          exerciseName: ex.name,
          reps: analyzer.reps.length,
          avgScore: avg,
          topIssues: [...agg.entries()]
            .map(([message, count]) => ({ message, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3),
          durationSec: Math.round(dur),
          source: 'video',
        })
      }
      setStage('result')
    } catch (e) {
      if (!cancelRef.current) {
        setError(e instanceof Error ? e.message : '分析失败')
        setStage('configure')
      }
    }
  }

  const reset = () => {
    cancelRef.current = true
    if (videoURL) URL.revokeObjectURL(videoURL)
    setVideoURL(null)
    setFileName('')
    setSamples([])
    setReps([])
    setIssues([])
    setCurrentT(0)
    setPlaying(false)
    setStage('pick')
  }

  // 播放控制
  const togglePlay = () => {
    const v = playVideoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const onTimeUpdate = () => {
    const v = playVideoRef.current
    if (!v) return
    setCurrentT(v.currentTime)
    if (loopPlay && v.duration && v.currentTime >= v.duration - 0.08) {
      v.currentTime = 0
      void v.play()
    }
  }

  // 当前时间最近的采样帧（二分：最后一个 t <= currentT）
  const activeSampleIndex = useMemo(() => {
    if (samples.length === 0) return -1
    let lo = 0
    let hi = samples.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (samples[mid].t <= currentT) lo = mid
      else hi = mid - 1
    }
    return lo
  }, [samples, currentT])
  const activeSample = activeSampleIndex >= 0 ? samples[activeSampleIndex] : null

  // 回放 HUD：当前 rep、主角度、阶段
  const hud = useMemo(() => {
    const rep = reps.find((r) => currentT >= r.startT && currentT <= r.endT) ?? null
    const angle = activeSample?.angle ?? null
    let phaseLabel = '—'
    if (angle !== null && activeSampleIndex >= 0) {
      // 完成度：0=起始位，1=目标位（两种方向的动作共用同一公式）
      const span = exercise.startAngle - exercise.targetAngle || 1
      const p = (exercise.startAngle - angle) / span
      const next = samples[Math.min(activeSampleIndex + 1, samples.length - 1)]
      const dp = next?.angle != null ? (exercise.startAngle - next.angle) / span - p : 0
      if (p >= 0.8) phaseLabel = exercise.flexedIsMin ? '底部' : '顶点'
      else if (dp > 0.003) phaseLabel = exercise.flexedIsMin ? '下放' : '上推'
      else if (dp < -0.003) phaseLabel = '站起'
      else phaseLabel = '保持'
    }
    return { rep, angle, phaseLabel }
  }, [reps, currentT, activeSample, activeSampleIndex, samples, exercise])

  // 当前时间窗内的 issue（最近 1.5s）
  const activeIssues = useMemo(
    () => issues.filter((i) => i.t <= currentT && currentT - i.t < 1.5),
    [issues, currentT],
  )
  const activeHighlight = useMemo(() => activeIssues.flatMap((i) => i.joints), [activeIssues])
  const activeStatus: DrawStatus = useMemo(() => {
    if (activeIssues.length === 0) return 'ok'
    const top = Math.max(...activeIssues.map((i) => SEVERITY_ORDER[i.severity]))
    return top >= 3 ? 'danger' : 'warning'
  }, [activeIssues])

  // 问题聚合
  const issueGroups = useMemo(() => {
    const map = new Map<string, { message: string; severity: Severity; count: number }>()
    for (const iss of issues) {
      const g = map.get(iss.message)
      if (g) g.count += 1
      else map.set(iss.message, { message: iss.message, severity: iss.severity, count: 1 })
    }
    return [...map.values()].sort(
      (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || b.count - a.count,
    )
  }, [issues])

  const avgScore = reps.length ? Math.round(reps.reduce((s, r) => s + r.score, 0) / reps.length) : 0

  // 时间轴角度范围
  const angleRange = useMemo(() => {
    const lo = Math.min(exercise.startAngle, exercise.targetAngle) - 10
    const hi = Math.max(exercise.startAngle, exercise.targetAngle) + 10
    return { lo, hi }
  }, [exercise])

  const seekVideo = (t: number) => {
    const v = playVideoRef.current
    if (!v) return
    v.currentTime = t
    setCurrentT(t)
  }

  return (
    <div className="min-h-dvh bg-ink-950 pb-10 text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button onClick={back} aria-label="返回" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-95">
            <ArrowLeft size={18} />
          </button>
          <span className="font-display text-lg font-bold">视频动作分析</span>
          {fileName && <span className="ml-auto max-w-[45%] truncate text-xs text-white/35">{fileName}</span>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6">
        {/* 空态上传 */}
        {stage === 'pick' && (
          <div>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                draggingRef.current = true
              }}
              onDrop={(e) => {
                e.preventDefault()
                pickFile(e.dataTransfer.files?.[0])
              }}
              className="flex min-h-[52dvh] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.03] p-8 text-center transition-colors hover:border-volt-400/40 hover:bg-white/[0.05]"
            >
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-volt-400/10 text-volt-400">
                <Upload size={30} />
              </div>
              <div>
                <p className="font-display text-xl font-bold">拖放或点击上传训练视频</p>
                <p className="mt-2 text-sm text-white/45">支持 mp4 / mov / webm · 建议 10-60 秒、侧面固定机位</p>
              </div>
              {error && <p className="text-sm text-red-300">{error}</p>}
            </label>
            <div className="mt-4 flex flex-col items-center gap-2.5">
              <p className="text-xs text-white/35">没有素材？试试示例视频（Pexels 免版权）</p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => loadSample('samples/squat-demo.mp4', 'squat-demo.mp4')}
                  className="flex h-10 items-center rounded-full border border-volt-400/30 bg-volt-400/10 px-4 text-xs font-medium text-volt-300 transition-transform active:scale-95"
                >
                  深蹲示例 · 30s
                </button>
                <button
                  onClick={() => loadSample('samples/pushup-demo.mp4', 'pushup-demo.mp4')}
                  className="flex h-10 items-center rounded-full border border-volt-400/30 bg-volt-400/10 px-4 text-xs font-medium text-volt-300 transition-transform active:scale-95"
                >
                  俯卧撑示例 · 9s
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 配置 */}
        {stage === 'configure' && videoURL && (
          <div className="mx-auto max-w-xl">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-card">
              <video
                ref={procVideoRef}
                src={videoURL}
                muted
                playsInline
                preload="auto"
                className="max-h-[42dvh] w-full object-contain"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  setDuration(v.duration || 0)
                  setVideoSize({ w: v.videoWidth, h: v.videoHeight })
                }}
              />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm text-white/60">选择视频中的动作</p>
              <div className="flex flex-wrap gap-2">
                {EXERCISES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setExerciseId(ex.id)}
                    className={`flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors active:scale-95 ${
                      exerciseId === ex.id
                        ? 'border-volt-400 bg-volt-400/15 text-volt-300'
                        : 'border-white/15 bg-white/5 text-white/60'
                    }`}
                  >
                    {exerciseId === ex.id && <Check size={14} />}
                    {ex.name}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                onClick={startAnalysis}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt-400 font-semibold text-ink-950 shadow-glow active:scale-95"
              >
                <Film size={17} />
                开始分析
              </button>
              <button
                onClick={reset}
                className="flex h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 font-semibold active:scale-95"
              >
                重新选择
              </button>
            </div>
          </div>
        )}

        {/* 处理中 */}
        {stage === 'processing' && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-5 pt-24 text-center">
            <LoaderCircle size={44} className="animate-spin text-volt-400" />
            <p className="font-display text-lg font-bold">正在逐帧分析动作…</p>
            <div className="w-full">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-volt-400 transition-all duration-200" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="mt-2 font-display text-sm text-white/50">
                {progress.pct}% · {progress.t.toFixed(1)}s
              </p>
            </div>
            <button onClick={reset} className="text-sm text-white/40 underline underline-offset-4">
              取消
            </button>
          </div>
        )}

        {/* 结果 */}
        {stage === 'result' && videoURL && (
          <div className="space-y-5">
            {/* 顶部统计 */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="总次数" value={reps.length} sub={exercise.name} />
              <StatCard label="平均质量分" value={avgScore} sub="30-100" />
              <StatCard label="问题数" value={issues.length} sub={`${issueGroups.length} 类问题`} accent="text-amber-300" />
              <StatCard label="视频时长" value={`${duration.toFixed(1)}s`} sub={`${samples.length} 帧采样`} accent="text-blue-300" />
            </div>

            <div className="space-y-5">
              {/* 回放 + 时间轴 */}
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-card">
                  <video
                    ref={playVideoRef}
                    src={videoURL}
                    muted
                    playsInline
                    preload="auto"
                    className="max-h-[52dvh] w-full object-contain"
                    onTimeUpdate={onTimeUpdate}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      setVideoSize({ w: v.videoWidth, h: v.videoHeight })
                      if (!duration && v.duration) setDuration(v.duration)
                    }}
                    onClick={togglePlay}
                  />
                  <SkeletonOverlay
                    landmarks={activeSample?.landmarks ?? null}
                    highlightJoints={activeHighlight}
                    status={activeStatus}
                    videoWidth={videoSize.w}
                    videoHeight={videoSize.h}
                    fit="contain"
                  />
                  {/* 实时信息 HUD */}
                  <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col gap-0.5 rounded-xl bg-black/50 px-2.5 py-2 leading-tight backdrop-blur-md">
                    <span className="text-[11px] font-medium text-white/85">
                      {hud.rep ? `第 ${hud.rep.index} 次` : '间歇'}
                    </span>
                    <span className="font-display text-base font-bold text-volt-300">
                      {hud.angle !== null ? `${Math.round(hud.angle)}°` : '--'}
                    </span>
                    <span className="text-[10px] text-white/55">{hud.phaseLabel}</span>
                    {activeIssues.length > 0 && (
                      <span className="mt-0.5 max-w-[130px] text-[10px] leading-snug text-red-300">
                        {activeIssues[0].message}
                      </span>
                    )}
                  </div>
                  {/* 播放控制 */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                    <button
                      onClick={togglePlay}
                      aria-label={playing ? '暂停' : '播放'}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/50 backdrop-blur-md active:scale-95"
                    >
                      {playing ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button
                      onClick={() => setLoopPlay((v) => !v)}
                      aria-label="循环"
                      className={`flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md active:scale-95 ${
                        loopPlay ? 'border-volt-400/50 bg-volt-400/15 text-volt-300' : 'border-white/15 bg-black/50 text-white/60'
                      }`}
                    >
                      <Repeat size={17} />
                    </button>
                    <span className="ml-auto rounded-full bg-black/50 px-3 py-1.5 font-display text-xs text-white/70 backdrop-blur-md">
                      {currentT.toFixed(1)} / {duration.toFixed(1)}s
                    </span>
                  </div>
                </div>

                {/* 时间轴 */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-2 text-xs text-white/40">主角度曲线 · 点击问题标记跳转</p>
                  <Timeline
                    samples={samples}
                    reps={reps}
                    issues={issues}
                    duration={duration}
                    angleRange={angleRange}
                    currentT={currentT}
                    onSeek={seekVideo}
                  />
                </div>
              </div>

              {/* rep 列表 + 问题汇总 */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-3 text-sm font-semibold text-white/80">动作次数（{reps.length}）</p>
                  {reps.length === 0 ? (
                    <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/40">
                      未识别到完整动作，试试侧面固定机位、全身入框的视频
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {reps.map((r) => (
                        <button
                          key={r.index}
                          onClick={() => seekVideo(r.startT)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-volt-400/30 active:scale-[0.99]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">第 {r.index} 次</span>
                            <span
                              className={`font-display text-lg font-bold ${
                                r.score >= 80 ? 'text-volt-400' : r.score >= 60 ? 'text-amber-300' : 'text-red-300'
                              }`}
                            >
                              {r.score}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40">
                            <span>
                              {r.startT.toFixed(1)}-{r.endT.toFixed(1)}s
                            </span>
                            <span>
                              {exercise.flexedIsMin ? '最小角' : '最大角'} {Math.round(r.peakAngle)}°
                            </span>
                            <span>模板 {r.templateScore}</span>
                          </div>
                          {r.issues.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.issues.map((iss, i) => (
                                <span
                                  key={`${iss.ruleId}-${i}`}
                                  className="rounded-full px-2 py-0.5 text-[10px]"
                                  style={{ backgroundColor: `${SEVERITY_COLOR[iss.severity]}22`, color: SEVERITY_COLOR[iss.severity] }}
                                >
                                  {iss.message}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-3 text-sm font-semibold text-white/80">问题汇总</p>
                  {/* AI 总评 */}
                  <div className="mb-3 flex items-start gap-1.5 text-xs leading-relaxed text-volt-300/90">
                    <Sparkles size={13} className="mt-0.5 shrink-0 text-volt-400" />
                    {videoReviewComment({
                      exerciseName: exercise.name,
                      reps: reps.length,
                      avgScore,
                      topIssues: issueGroups,
                    })}
                  </div>
                  {issueGroups.length === 0 ? (
                    <p className={`rounded-xl p-4 text-center text-sm ${reps.length === 0 ? 'bg-white/5 text-white/40' : 'bg-volt-400/10 text-volt-300'}`}>
                      {reps.length === 0 ? '未检测到动作，没有问题可汇总' : '动作标准，未发现问题'}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {issueGroups.map((g) => (
                        <div key={g.message} className="flex items-start gap-2.5 rounded-xl bg-white/5 p-3">
                          {g.severity === 'info' ? (
                            <Info size={16} className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLOR[g.severity] }} />
                          ) : (
                            <TriangleAlert size={16} className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLOR[g.severity] }} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white/85">{g.message}</p>
                            <p className="mt-0.5 text-[11px] text-white/35">出现 {g.count} 次 · 注意下一组纠正</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ShareCardButton
              className="mb-3"
              stats={{
                exerciseName: exercise.name,
                reps: reps.length,
                score: avgScore,
                dateText: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
                streak: computeStreak(loadSessions()),
                source: '视频分析',
              }}
            />
            <button
              onClick={reset}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 font-semibold active:scale-95"
            >
              <Upload size={16} />
              重新选择视频
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

/** SVG 时间轴：主角度曲线 + rep 区间底纹 + issue 标记点 */
function Timeline({
  samples,
  reps,
  issues,
  duration,
  angleRange,
  currentT,
  onSeek,
}: {
  samples: Sample[]
  reps: RepResult[]
  issues: Issue[]
  duration: number
  angleRange: { lo: number; hi: number }
  currentT: number
  onSeek: (t: number) => void
}) {
  const W = 600
  const H = 90
  const pad = 6
  const x = (t: number) => pad + (t / Math.max(duration, 0.001)) * (W - pad * 2)
  const y = (a: number) =>
    H - pad - ((a - angleRange.lo) / (angleRange.hi - angleRange.lo)) * (H - pad * 2)

  const pts = samples.filter((s) => s.angle !== null)
  const path = pts
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)},${y(s.angle!).toFixed(1)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* rep 区间交替底纹 */}
      {reps.map((r, i) => (
        <rect
          key={r.index}
          x={x(r.startT)}
          y={0}
          width={Math.max(2, x(r.endT) - x(r.startT))}
          height={H}
          fill={i % 2 === 0 ? 'rgba(212,255,63,0.07)' : 'rgba(255,255,255,0.04)'}
          rx={3}
        />
      ))}
      {/* 角度曲线 */}
      {path && <path d={path} fill="none" stroke="#D4FF3F" strokeWidth={1.8} strokeLinejoin="round" />}
      {/* issue 标记 */}
      {issues.map((iss, i) => (
        <circle
          key={`${iss.ruleId}-${iss.t}-${i}`}
          cx={x(iss.t)}
          cy={10}
          r={4}
          fill={SEVERITY_COLOR[iss.severity]}
          className="cursor-pointer"
          onClick={() => onSeek(iss.t)}
        >
          <title>{iss.message}</title>
        </circle>
      ))}
      {/* 播放头 */}
      <line x1={x(currentT)} y1={0} x2={x(currentT)} y2={H} stroke="white" strokeOpacity={0.5} strokeWidth={1} />
    </svg>
  )
}
