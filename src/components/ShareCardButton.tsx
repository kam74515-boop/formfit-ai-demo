import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { shareOrDownload } from '../utils/shareCard'
import type { ShareCardStats } from '../utils/shareCard'

interface Props {
  stats: ShareCardStats
  className?: string
}

/** 「生成分享卡」按钮：生成 1080×1350 成绩卡，优先系统分享，否则下载 PNG */
export default function ShareCardButton({ stats, className = '' }: Props) {
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  const onClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await shareOrDownload(stats)
      setHint(r === 'shared' ? '已分享' : '已下载，去相册看看')
    } catch {
      setHint('生成失败，请重试')
    } finally {
      setBusy(false)
      setTimeout(() => setHint(''), 3000)
    }
  }

  return (
    <div className={className}>
      <button
        onClick={onClick}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-volt-400/40 bg-volt-400/10 text-sm font-semibold text-volt-300 transition-transform active:scale-95 disabled:opacity-40"
      >
        <Share2 size={15} />
        {busy ? '生成中…' : '生成分享卡'}
      </button>
      {hint && <p className="mt-2 text-center text-[11px] text-volt-300/80">{hint}</p>}
    </div>
  )
}
