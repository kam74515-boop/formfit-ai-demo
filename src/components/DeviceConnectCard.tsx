import { useState } from 'react'
import { Activity, Smartphone, Watch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const DEVICES_KEY = 'formfit.devices'

interface DeviceLinks {
  appleWatch?: boolean
  huawei?: boolean
  xiaomi?: boolean
}

const DEVICES: { key: keyof DeviceLinks; name: string; icon: LucideIcon }[] = [
  { key: 'appleWatch', name: 'Apple Watch', icon: Watch },
  { key: 'huawei', name: '华为运动健康', icon: Smartphone },
  { key: 'xiaomi', name: '小米手环', icon: Activity },
]

/** 防御式解析设备连接状态：JSON 损坏或非对象视为全部未连接 */
function loadDevices(): DeviceLinks {
  try {
    const raw = localStorage.getItem(DEVICES_KEY)
    if (!raw) return {}
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return {}
    const o = p as Record<string, unknown>
    return {
      appleWatch: o.appleWatch === true,
      huawei: o.huawei === true,
      xiaomi: o.xiaomi === true,
    }
  } catch {
    return {}
  }
}

/** 设备连接分组列表（iOS 设置风紧凑行）：switch 模拟连接/断开，状态存 formfit.devices */
export default function DeviceConnectCard() {
  const [links, setLinks] = useState<DeviceLinks>(() => loadDevices())

  const toggle = (key: keyof DeviceLinks) => {
    const next: DeviceLinks = { ...links, [key]: !links[key] }
    setLinks(next)
    try {
      localStorage.setItem(DEVICES_KEY, JSON.stringify(next))
    } catch {
      // 存储不可用时静默失败
    }
  }

  return (
    <section>
      <h3 className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-white/35">设备连接</h3>
      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="divide-y divide-white/5">
          {DEVICES.map(({ key, name, icon: Icon }) => {
            const connected = links[key] === true
            return (
              <div key={key} className="flex items-center gap-3 px-3.5 py-2.5">
                <Icon size={18} className={`shrink-0 ${connected ? 'text-volt-400' : 'text-white/35'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight">{name}</div>
                  <div className={`mt-0.5 text-[10px] ${connected ? 'text-volt-400/70' : 'text-white/35'}`}>
                    {connected ? '已连接 · 同步心率·睡眠·HRV' : '未连接'}
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={connected}
                  aria-label={name}
                  onClick={() => toggle(key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    connected ? 'bg-volt-400' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      connected ? 'translate-x-[20px]' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
        <p className="border-t border-white/5 px-3.5 py-2 text-[10px] text-white/25">演示环境为模拟连接</p>
      </div>
    </section>
  )
}
