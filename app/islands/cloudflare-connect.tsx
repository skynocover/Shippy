import { useState } from 'hono/jsx'

interface Props {
  isConnected: boolean
}

const CF_TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens?name=' + encodeURIComponent('VibeShip DNS')

export default function CloudflareConnect({ isConnected }: Props) {
  const [connected, setConnected] = useState(isConnected)
  const [showForm, setShowForm] = useState(false)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const openCfAndShowForm = () => {
    window.open(CF_TOKEN_URL, '_blank', 'noopener')
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!token.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/cloudflare/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; zoneCount?: number }

      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to verify token')
        return
      }

      setConnected(true)
      setShowForm(false)
      setToken('')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (connected) {
    return (
      <div>
        <span class="text-sm text-orange-400 flex items-center gap-1.5">
          <span class="w-2 h-2 bg-orange-400 rounded-full"></span>
          Cloudflare connected
        </span>
      </div>
    )
  }

  if (!showForm) {
    return (
      <div>
        <button
          onClick={openCfAndShowForm}
          class="px-4 py-2 bg-gray-800 text-gray-200 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          Connect Cloudflare
        </button>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="px-4 py-3 bg-gray-800/50 rounded-lg border border-gray-700 text-xs text-gray-400 space-y-1">
        <p class="font-medium text-gray-300">Create Token &gt; use "Edit zone DNS" template</p>
        <p>Zone Resources: Include &gt; All zones</p>
        <p>Then copy the token and paste below.</p>
      </div>
      <div class="flex items-center gap-2">
        <input
          type="password"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          placeholder="Paste your Cloudflare API Token"
          class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-400 w-64"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !token.trim()}
          class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying...' : 'Connect'}
        </button>
        <button
          onClick={() => { setShowForm(false); setError('') }}
          class="px-2 py-2 text-gray-400 hover:text-gray-200 text-sm"
        >
          Cancel
        </button>
        <a
          href={CF_TOKEN_URL}
          target="_blank"
          rel="noopener"
          class="text-xs text-gray-500 hover:text-orange-400 transition-colors whitespace-nowrap"
        >
          Open Cloudflare
        </a>
      </div>
      {error && (
        <div class="text-xs text-red-400">{error}</div>
      )}
    </div>
  )
}
