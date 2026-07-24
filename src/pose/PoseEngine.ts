import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Landmark } from './types'

/**
 * BlazePose 封装（单例）：runningMode VIDEO + numPoses 1。
 * WASM 运行时与 .task 模型均放在 public/ 下，走同源加载。
 * delegate 优先 GPU，失败自动回退 CPU（兼容无 WebGL/受限内核的手机浏览器）。
 */
export class PoseEngine {
  private static landmarker: PoseLandmarker | null = null
  private static initPromise: Promise<void> | null = null
  private static delegate: 'GPU' | 'CPU' | null = null

  static async init(): Promise<void> {
    if (PoseEngine.landmarker) return
    if (PoseEngine.initPromise) return PoseEngine.initPromise
    PoseEngine.initPromise = (async () => {
      const base = import.meta.env.BASE_URL
      const vision = await FilesetResolver.forVisionTasks(`${base}wasm`)
      const create = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `${base}models/pose_landmarker_full.task`,
            delegate,
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
      try {
        PoseEngine.landmarker = await create('GPU')
        PoseEngine.delegate = 'GPU'
      } catch (gpuErr) {
        console.warn('[PoseEngine] GPU delegate 初始化失败，回退 CPU 模式', gpuErr)
        PoseEngine.landmarker = await create('CPU')
        PoseEngine.delegate = 'CPU'
      }
    })()
    try {
      await PoseEngine.initPromise
    } catch (e) {
      PoseEngine.initPromise = null
      throw e
    }
  }

  static isReady(): boolean {
    return PoseEngine.landmarker !== null
  }

  /** 当前生效的推理后端（GPU/CPU），用于诊断与 UI 提示 */
  static getDelegate(): 'GPU' | 'CPU' | null {
    return PoseEngine.delegate
  }

  /** tsMs 必须单调递增（用 performance.now() 或视频采样时间） */
  static detectForVideo(video: HTMLVideoElement, tsMs: number): Landmark[] | null {
    const lm = PoseEngine.landmarker
    if (!lm) return null
    const res = lm.detectForVideo(video, tsMs)
    const pose = res.landmarks?.[0]
    if (!pose) return null
    return pose.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }))
  }

  static close(): void {
    try {
      PoseEngine.landmarker?.close()
    } catch {
      // 忽略重复关闭
    }
    PoseEngine.landmarker = null
    PoseEngine.initPromise = null
    PoseEngine.delegate = null
  }
}
