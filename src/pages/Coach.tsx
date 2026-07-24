import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useBack } from '../utils/useBack'
import { ArrowLeft, SendHorizonal, Sparkles } from 'lucide-react'
import { askCoach, SUGGESTED_QUESTIONS, welcomeMessage } from '../agent/coachAgent'

interface Message {
  role: 'user' | 'coach'
  text: string
  chips?: string[]
}

/** AI 私教对话页（整页，非浮层）：会话存内存，路由切换后重置 */
export default function Coach() {
  const back = useBack('/')
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'coach', text: welcomeMessage(), chips: SUGGESTED_QUESTIONS.slice(0, 4) },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing])

  const send = (raw: string) => {
    const q = raw.trim()
    if (!q || typing) return
    setMessages((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setTyping(true)
    setTimeout(() => {
      const reply = askCoach(q)
      setMessages((m) => [...m, { role: 'coach', text: reply.text, chips: reply.chips }])
      setTyping(false)
    }, 500)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const lastCoach = [...messages].reverse().find((m) => m.role === 'coach')
  const chips = typing ? [] : (lastCoach?.chips ?? SUGGESTED_QUESTIONS)

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950 text-white">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <button
            onClick={back}
            aria-label="返回"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-95"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-volt-400/15 text-volt-400">
              <Sparkles size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold leading-tight">AI 私教</div>
              <div className="text-[10px] leading-tight text-white/35">基于你的真实训练数据</div>
            </div>
          </div>
        </div>
      </header>

      {/* 消息区 */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-44 pt-4">
        <div ref={scrollRef} className="space-y-3">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md border border-volt-400/60 bg-volt-400/10 px-3.5 py-2 text-sm leading-relaxed text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-volt-400/15 text-volt-400">
                  <Sparkles size={13} />
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white/5 px-3.5 py-2 text-sm leading-relaxed text-white/90">
                  {m.text}
                </div>
              </div>
            ),
          )}
          {typing && (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-volt-400/15 text-volt-400">
                <Sparkles size={13} />
              </span>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white/5 px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 底部：chips + 输入 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
          {chips.length > 0 && (
            <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => send(c)}
                    className="flex-none rounded-full border border-volt-400/40 bg-volt-400/5 px-3 py-1.5 text-xs text-volt-300 transition-colors active:bg-volt-400/20"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={onSubmit} className="flex items-center gap-2 pt-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问问私教…"
              className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-volt-400/50"
            />
            <button
              type="submit"
              aria-label="发送"
              disabled={!input.trim() || typing}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-volt-400 text-ink-950 transition-transform active:scale-90 disabled:opacity-30"
            >
              <SendHorizonal size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
