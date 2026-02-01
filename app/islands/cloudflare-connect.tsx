import { useState } from 'hono/jsx';

interface Props {
  isConnected: boolean;
}

const CF_TOKEN_URL =
  'https://dash.cloudflare.com/profile/api-tokens?name=' + encodeURIComponent('VibeShip DNS');

export default function CloudflareConnect({ isConnected }: Props) {
  const [connected, setConnected] = useState(isConnected);
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openCfAndShowForm = () => {
    window.open(CF_TOKEN_URL, '_blank', 'noopener');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/cloudflare/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; zoneCount?: number };

      if (!res.ok || !data.ok) {
        setError(data.error || '驗證 Token 失敗');
        return;
      }

      setConnected(true);
      setShowForm(false);
      setToken('');
    } catch {
      setError('網路錯誤，請重試。');
    } finally {
      setLoading(false);
    }
  };

  if (connected) {
    return (
      <div>
        <span class="text-sm flex items-center gap-1.5" style="color:#f38020">
          <span class="w-2 h-2 rounded-full inline-block" style="background:#f38020"></span>
          Cloudflare
        </span>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div>
        <button
          onClick={openCfAndShowForm}
          class="px-3 py-1.5 rounded-lg text-sm font-medium border-none cursor-pointer"
          style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7)"
        >
          連結 Cloudflare
        </button>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-3">
      <div
        class="px-4 py-3 rounded-xl text-xs space-y-1"
        style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5)"
      >
        <p class="font-medium" style="color:rgba(255,255,255,0.7)">
          建立 Token → 使用「Edit zone DNS」範本
        </p>
        <p>Zone Resources: Include → All zones</p>
        <p>然後複製 Token 並貼到下方。</p>
      </div>
      <div class="flex items-center gap-2">
        <input
          type="password"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          placeholder="貼上 Cloudflare API Token"
          class="px-3 py-2 rounded-lg text-sm text-white focus:outline-none w-64"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !token.trim()}
          class="px-4 py-2 bg-vs-gradient-cf rounded-lg text-white text-sm font-medium border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '驗證中...' : '連結'}
        </button>
        <button
          onClick={() => {
            setShowForm(false);
            setError('');
          }}
          class="px-2 py-2 text-sm border-none cursor-pointer"
          style="background:none;color:rgba(255,255,255,0.4)"
        >
          取消
        </button>
        <a
          href={CF_TOKEN_URL}
          target="_blank"
          rel="noopener"
          class="text-xs whitespace-nowrap no-underline transition-colors"
          style="color:rgba(255,255,255,0.4)"
        >
          開啟 Cloudflare
        </a>
      </div>
      {error && (
        <div class="text-xs" style="color:#ef4444">
          {error}
        </div>
      )}
    </div>
  );
}
