import { useState } from 'react'

const BODY_KEY = 'formfit.body'

export interface BodyData {
  heightCm?: number
  weightKg?: number
  bodyFatPct?: number
}

type BodyField = keyof BodyData

const FIELDS: {
  key: BodyField
  label: string
  unit: string
  hint: string
  min: number
  max: number
  step: string
}[] = [
  { key: 'heightCm', label: '身高', unit: 'cm', hint: '100-230', min: 100, max: 230, step: '0.5' },
  { key: 'weightKg', label: '体重', unit: 'kg', hint: '30-200', min: 30, max: 200, step: '0.1' },
  { key: 'bodyFatPct', label: '体脂率', unit: '%', hint: '3-60', min: 3, max: 60, step: '0.1' },
]

/** 防御式解析身体数据：JSON 损坏或非对象视为未录入 */
function loadBody(): BodyData {
  try {
    const raw = localStorage.getItem(BODY_KEY)
    if (!raw) return {}
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return {}
    const o = p as Record<string, unknown>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    return { heightCm: num(o.heightCm), weightKg: num(o.weightKg), bodyFatPct: num(o.bodyFatPct) }
  } catch {
    return {}
  }
}

/** 身体数据紧凑 strip（AEKE 体测风）：三格数字展示，点击单格原位展开编辑行，存 formfit.body */
export default function BodyDataCard() {
  const [body, setBody] = useState<BodyData>(() => loadBody())
  const [editing, setEditing] = useState<BodyField | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const editingConf = FIELDS.find((f) => f.key === editing) ?? null

  const startEdit = (key: BodyField) => {
    setEditing(key)
    const v = body[key]
    setDraft(v != null ? String(v) : '')
    setError(null)
  }

  const cancel = () => {
    setEditing(null)
    setError(null)
  }

  const save = () => {
    if (!editingConf) return
    const v = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(v) || v < editingConf.min || v > editingConf.max) {
      setError(`请输入 ${editingConf.hint} 之间的数值`)
      return
    }
    const next: BodyData = { ...body, [editingConf.key]: Math.round(v * 10) / 10 }
    setBody(next)
    try {
      localStorage.setItem(BODY_KEY, JSON.stringify(next))
    } catch {
      // 存储不可用时静默失败
    }
    cancel()
  }

  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-white/5">
        {FIELDS.map((f) => {
          const v = body[f.key]
          return (
            <button
              key={f.key}
              onClick={() => startEdit(f.key)}
              className={`py-1.5 text-center transition-opacity active:opacity-60 ${editing === f.key ? 'opacity-100' : ''}`}
            >
              <div
                className={`font-display text-lg font-bold leading-tight ${
                  editing === f.key ? 'text-volt-400' : 'text-white'
                }`}
              >
                {v != null ? (
                  <>
                    {v}
                    <span className="ml-0.5 text-[10px] font-normal text-white/40">{f.unit}</span>
                  </>
                ) : (
                  <span className="text-white/25">—</span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-white/35">{f.label}</div>
            </button>
          )
        })}
      </div>

      {editingConf && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
          <span className="shrink-0 text-[11px] text-white/50">{editingConf.label}</span>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min={editingConf.min}
            max={editingConf.max}
            step={editingConf.step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
            placeholder={editingConf.hint}
            className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm outline-none focus:border-volt-400/60"
          />
          <span className="shrink-0 text-[11px] text-white/40">{editingConf.unit}</span>
          <button
            onClick={save}
            className="h-9 shrink-0 rounded-lg bg-volt-400 px-3 text-xs font-semibold text-ink-950 active:scale-95"
          >
            保存
          </button>
          <button
            onClick={cancel}
            className="h-9 shrink-0 rounded-lg border border-white/15 px-2.5 text-xs text-white/60 active:scale-95"
          >
            取消
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 px-1 text-[10px] text-red-300">{error}</p>}

      <p className="mt-1.5 px-1 text-[10px] text-white/25">手动录入 · 正式版支持体测设备同步</p>
    </div>
  )
}
