import { useState } from 'hono/jsx'

interface Zone {
  id: string
  name: string
  status: string
}

interface Props {
  projectId: string
  hasCloudflare: boolean
  currentDomain?: string
  domainStatus?: string
}

export default function DomainSetup({ projectId, hasCloudflare, currentDomain, domainStatus }: Props) {
  const [zones, setZones] = useState<Zone[]>([])
  const [loadingZones, setLoadingZones] = useState(false)
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [subdomain, setSubdomain] = useState('')
  const [setting, setSetting] = useState(false)
  const [error, setError] = useState('')
  const [domain, setDomain] = useState(currentDomain || '')
  const [status, setStatus] = useState(domainStatus || '')
  const [step, setStep] = useState<'idle' | 'select' | 'preview' | 'done'>(currentDomain ? 'done' : 'idle')

  if (!hasCloudflare) {
    return (
      <div class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
        <h3 class="font-semibold mb-2">自訂網域</h3>
        <p class="text-sm" style="color:rgba(255,255,255,0.5)">
          請先在導航列連結 Cloudflare 以設定自訂網域。
        </p>
      </div>
    )
  }

  const loadZones = async () => {
    setLoadingZones(true)
    setError('')
    try {
      const res = await fetch('/api/cloudflare/zones')
      const data = await res.json() as { zones?: Zone[]; error?: string }
      if (!res.ok || !data.zones) {
        setError(data.error || '載入網域失敗')
        return
      }
      setZones(data.zones)
      setStep('select')
    } catch {
      setError('網路錯誤，請重試。')
    } finally {
      setLoadingZones(false)
    }
  }

  const handleSetup = async () => {
    if (!selectedZone) return
    setSetting(true)
    setError('')

    try {
      const res = await fetch(`/api/projects/${projectId}/domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId: selectedZone.id,
          zoneName: selectedZone.name,
          subdomain: subdomain.trim() || '@',
        }),
      })
      const data = await res.json() as { ok?: boolean; domain?: string; status?: string; error?: string }

      if (!res.ok || !data.ok) {
        setError(data.error || '設定網域失敗')
        return
      }

      setDomain(data.domain || '')
      setStatus(data.status || 'active')
      setStep('done')
    } catch {
      setError('網路錯誤，請重試。')
    } finally {
      setSetting(false)
    }
  }

  const previewDomain = selectedZone
    ? (subdomain.trim() && subdomain.trim() !== '@'
      ? `${subdomain.trim()}.${selectedZone.name}`
      : selectedZone.name)
    : ''

  const statusStyles: Record<string, { color: string }> = {
    pending: { color: '#facc15' },
    active: { color: '#34d399' },
    error: { color: '#ef4444' },
  }

  return (
    <div>
      {error && (
        <div class="mb-4 px-4 py-2 rounded-xl text-sm" style="background:rgba(239,68,68,0.1);color:#ef4444">
          {error}
        </div>
      )}

      {step === 'done' && domain && (
        <div class="flex items-center justify-between p-5 rounded-xl" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)">
          <div class="flex items-center gap-3">
            <span class="text-xl">✅</span>
            <div>
              <p class="font-semibold mb-1">網域已連結</p>
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener"
                class="font-mono text-sm no-underline"
                style="color:#34d399"
              >
                {domain}
              </a>
            </div>
          </div>
          <button
            onClick={() => { setStep('idle'); setSelectedZone(null); setSubdomain(''); setError('') }}
            class="text-xs border-none cursor-pointer" style="background:none;color:rgba(255,255,255,0.4)"
          >
            變更
          </button>
        </div>
      )}

      {step === 'idle' && (
        <div class="text-center p-10 rounded-xl" style="background:rgba(0,0,0,0.2)">
          <div class="text-4xl mb-4">🌐</div>
          <p class="mb-5" style="color:rgba(255,255,255,0.5)">
            綁定自訂網域，讓你的網站更專業
          </p>
          <button
            onClick={loadZones}
            disabled={loadingZones}
            class="px-6 py-3 bg-vs-gradient-cf rounded-xl text-white font-semibold border-none cursor-pointer disabled:opacity-50"
          >
            {loadingZones ? '載入中...' : '綁定 Cloudflare 網域'}
          </button>
        </div>
      )}

      {step === 'select' && (
        <div class="space-y-4">
          <div>
            <label class="text-sm block mb-2" style="color:rgba(255,255,255,0.5)">選擇網域</label>
            <div class="space-y-2">
              {zones.length === 0 && (
                <p class="text-sm" style="color:rgba(255,255,255,0.4)">在你的 Cloudflare 帳戶中沒有找到可用的網域。</p>
              )}
              {zones.map(zone => (
                <button
                  key={zone.id}
                  onClick={() => { setSelectedZone(zone); setStep('preview') }}
                  class="w-full text-left px-4 py-3 rounded-xl text-sm transition-colors border-none cursor-pointer"
                  style={`background:${selectedZone?.id === zone.id ? 'rgba(243,128,32,0.1)' : 'rgba(0,0,0,0.2)'};color:${selectedZone?.id === zone.id ? '#f38020' : 'rgba(255,255,255,0.8)'};border:1px solid ${selectedZone?.id === zone.id ? 'rgba(243,128,32,0.3)' : 'rgba(255,255,255,0.06)'}`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setStep('idle'); setError('') }}
            class="text-sm border-none cursor-pointer" style="background:none;color:rgba(255,255,255,0.4)"
          >
            取消
          </button>
        </div>
      )}

      {step === 'preview' && selectedZone && (
        <div class="space-y-4">
          <div>
            <label class="text-sm block mb-2" style="color:rgba(255,255,255,0.5)">子網域（留空使用根網域）</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                value={subdomain}
                onInput={(e) => setSubdomain((e.target as HTMLInputElement).value)}
                placeholder="例如 app"
                class="px-3 py-2 rounded-lg text-sm text-white focus:outline-none w-40"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
              />
              <span class="text-sm" style="color:rgba(255,255,255,0.4)">.{selectedZone.name}</span>
            </div>
          </div>

          <div class="px-4 py-3 rounded-xl" style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06)">
            <div class="text-xs mb-1" style="color:rgba(255,255,255,0.4)">DNS 記錄預覽</div>
            <div class="font-mono text-sm">
              <span style="color:#f38020">{previewDomain}</span>
              {' '}<span style="color:rgba(255,255,255,0.3)">CNAME</span>{' '}
              <span style="color:#34d399">cname.vercel-dns.com</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              onClick={handleSetup}
              disabled={setting}
              class="px-6 py-2.5 bg-vs-gradient-cf rounded-xl text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-50"
            >
              {setting ? '設定中...' : '設定網域'}
            </button>
            <button
              onClick={() => { setStep('select'); setSubdomain('') }}
              class="text-sm border-none cursor-pointer" style="background:none;color:rgba(255,255,255,0.4)"
            >
              返回
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
