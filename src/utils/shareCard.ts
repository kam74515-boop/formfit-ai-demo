/**
 * 训练成绩分享卡：Canvas 生成 1080×1350 社交尺寸图片
 * 深色运动风 + volt 主色，与 App 视觉一致
 */

export interface ShareCardStats {
  exerciseName: string
  reps: number
  score: number
  dateText: string
  streak: number
  source: '实时训练' | '视频分析'
}

/** 动作质量等级（游戏化） */
export function scoreLevel(score: number): { name: string; color: string } {
  if (score >= 96) return { name: '钻石', color: '#7DD3FC' }
  if (score >= 90) return { name: '铂金', color: '#A5B4FC' }
  if (score >= 80) return { name: '黄金', color: '#FBBF24' }
  if (score >= 65) return { name: '白银', color: '#D1D5DB' }
  if (score >= 50) return { name: '青铜', color: '#D97706' }
  return { name: '黑铁', color: '#9CA3AF' }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function generateShareCard(stats: ShareCardStats): Promise<Blob> {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const volt = '#D4FF3F'
  const level = scoreLevel(stats.score)

  // 背景
  ctx.fillStyle = '#0A0C10'
  ctx.fillRect(0, 0, W, H)
  // 顶部光晕
  const glow = ctx.createRadialGradient(W / 2, -200, 100, W / 2, -200, 900)
  glow.addColorStop(0, 'rgba(212,255,63,0.14)')
  glow.addColorStop(1, 'rgba(212,255,63,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 顶部 Logo
  ctx.fillStyle = volt
  rr(ctx, 64, 64, 56, 56, 16)
  ctx.fill()
  ctx.fillStyle = '#0A0C10'
  ctx.font = '700 34px "Space Grotesk", "PingFang SC", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('F', 82, 94)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '700 36px "Space Grotesk", "PingFang SC", sans-serif'
  ctx.fillText('FormFit AI', 140, 94)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '400 26px "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(stats.dateText, W - 64, 94)
  ctx.textAlign = 'left'

  // 中部主卡
  rr(ctx, 64, 200, W - 128, 760, 40)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '400 30px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(stats.source, W / 2, 280)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = '700 72px "PingFang SC", sans-serif'
  ctx.fillText(stats.exerciseName, W / 2, 390)

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '400 34px "PingFang SC", sans-serif'
  ctx.fillText(`完成 ${stats.reps} 次`, W / 2, 460)

  // 大分数
  ctx.fillStyle = volt
  ctx.font = '700 260px "Space Grotesk", "PingFang SC", sans-serif'
  ctx.fillText(String(stats.score), W / 2, 690)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '400 28px "PingFang SC", sans-serif'
  ctx.fillText('动作质量分', W / 2, 770)

  // 等级徽章
  const badgeText = `等级 · ${level.name}`
  ctx.font = '700 34px "PingFang SC", sans-serif'
  const bw = ctx.measureText(badgeText).width + 72
  rr(ctx, (W - bw) / 2, 830, bw, 72, 36)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fill()
  ctx.strokeStyle = level.color
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = level.color
  ctx.fillText(badgeText, W / 2, 868)
  ctx.textAlign = 'left'

  // 底部条
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '400 30px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  const streakText = stats.streak > 0 ? `连续训练 ${stats.streak} 天 · 继续加油` : '每一次训练都算数'
  ctx.fillText(streakText, W / 2, 1040)

  ctx.fillStyle = volt
  ctx.font = '700 34px "PingFang SC", sans-serif'
  ctx.fillText('口袋里的 AI 力量私教', W / 2, 1180)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '400 24px "PingFang SC", sans-serif'
  ctx.fillText('FormFit AI · 端侧实时姿态纠错', W / 2, 1240)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

/** 优先系统分享（移动端），否则下载 PNG */
export async function shareOrDownload(stats: ShareCardStats): Promise<'shared' | 'downloaded'> {
  const blob = await generateShareCard(stats)
  const file = new File([blob], `formfit-${Date.now()}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (navigator.share && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '我的训练成绩' })
      return 'shared'
    } catch {
      /* 用户取消则走下载 */
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
