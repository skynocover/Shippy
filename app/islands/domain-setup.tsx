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
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 class="font-semibold mb-2">Custom Domain</h3>
        <p class="text-sm text-gray-400">Connect Cloudflare on the dashboard to set up a custom domain.</p>
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
        setError(data.error || 'Failed to load zones')
        return
      }
      setZones(data.zones)
      setStep('select')
    } catch {
      setError('Network error. Please try again.')
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
        setError(data.error || 'Failed to setup domain')
        return
      }

      setDomain(data.domain || '')
      setStatus(data.status || 'active')
      setStep('done')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSetting(false)
    }
  }

  const previewDomain = selectedZone
    ? (subdomain.trim() && subdomain.trim() !== '@'
      ? `${subdomain.trim()}.${selectedZone.name}`
      : selectedZone.name)
    : ''

  const statusStyles: Record<string, { color: string; bg: string }> = {
    pending: { color: 'text-yellow-400', bg: 'bg-yellow-400' },
    active: { color: 'text-green-400', bg: 'bg-green-400' },
    error: { color: 'text-red-400', bg: 'bg-red-400' },
  }

  return (
    <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h3 class="font-semibold mb-4">Custom Domain</h3>

      {error && (
        <div class="mb-4 px-4 py-2 bg-red-400/10 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {step === 'done' && domain && (
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class={`w-2.5 h-2.5 rounded-full ${statusStyles[status]?.bg || 'bg-gray-400'}`}></span>
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener"
              class="font-mono text-sm text-indigo-400 hover:underline"
            >
              {domain}
            </a>
            <span class={`text-xs font-medium ${statusStyles[status]?.color || 'text-gray-400'}`}>
              {status}
            </span>
          </div>
          <button
            onClick={() => { setStep('idle'); setSelectedZone(null); setSubdomain(''); setError('') }}
            class="text-xs text-gray-500 hover:text-gray-300"
          >
            Change
          </button>
        </div>
      )}

      {step === 'idle' && (
        <button
          onClick={loadZones}
          disabled={loadingZones}
          class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-400 transition-colors disabled:opacity-50"
        >
          {loadingZones ? 'Loading domains...' : 'Setup Custom Domain'}
        </button>
      )}

      {step === 'select' && (
        <div class="space-y-4">
          <div>
            <label class="text-sm text-gray-400 block mb-2">Select domain</label>
            <div class="space-y-1">
              {zones.length === 0 && (
                <p class="text-sm text-gray-500">No active zones found in your Cloudflare account.</p>
              )}
              {zones.map(zone => (
                <button
                  key={zone.id}
                  onClick={() => { setSelectedZone(zone); setStep('preview') }}
                  class={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                    selectedZone?.id === zone.id
                      ? 'border-orange-400 bg-orange-400/10 text-orange-400'
                      : 'border-gray-700 hover:border-gray-600 text-gray-200'
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setStep('idle'); setError('') }}
            class="text-sm text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      )}

      {step === 'preview' && selectedZone && (
        <div class="space-y-4">
          <div>
            <label class="text-sm text-gray-400 block mb-2">Subdomain (leave empty for root domain)</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                value={subdomain}
                onInput={(e) => setSubdomain((e.target as HTMLInputElement).value)}
                placeholder="e.g. app"
                class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-400 w-40"
              />
              <span class="text-gray-500 text-sm">.{selectedZone.name}</span>
            </div>
          </div>

          <div class="px-4 py-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div class="text-xs text-gray-500 mb-1">DNS Record Preview</div>
            <div class="font-mono text-sm text-gray-200">
              <span class="text-orange-400">{previewDomain}</span>
              {' '}<span class="text-gray-500">CNAME</span>{' '}
              <span class="text-green-400">cname.vercel-dns.com</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              onClick={handleSetup}
              disabled={setting}
              class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-400 transition-colors disabled:opacity-50"
            >
              {setting ? 'Setting up...' : 'Setup Domain'}
            </button>
            <button
              onClick={() => { setStep('select'); setSubdomain('') }}
              class="text-sm text-gray-500 hover:text-gray-300"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
