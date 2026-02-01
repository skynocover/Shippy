import { useState, useEffect } from 'hono/jsx'

interface ProjectData {
  id: string
  name: string
  subdomain: string
  framework: string | null
  status: string
  deploymentUrl: string | null
  customDomain: string | null
  domainStatus: string | null
  githubRepo: string | null
  platform: string | null
  createdAt: string
}

interface DeploymentData {
  id: string
  status: string
  url: string | null
  errorMessage: string | null
  createdAt: string
}

interface Zone {
  id: string
  name: string
  status: string
}

interface Props {
  project: ProjectData
  deployments: DeploymentData[]
  hasCloudflare: boolean
}

type TabKey = 'overview' | 'deploys' | 'domain' | 'settings'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '📊 概覽' },
  { key: 'deploys', label: '📦 部署' },
  { key: 'domain', label: '🌐 網域' },
  { key: 'settings', label: '⚙️ 設定' },
]

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  const weeks = Math.floor(days / 7)
  return `${weeks} 週前`
}

export default function ProjectDetail({ project, deployments, hasCloudflare }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [projectName, setProjectName] = useState(project.name)
  const [deleting, setDeleting] = useState(false)

  // Deploy status polling state
  const [liveStatus, setLiveStatus] = useState(project.status)
  const [liveUrl, setLiveUrl] = useState(project.deploymentUrl || '')
  const [deployError, setDeployError] = useState('')

  // Domain setup state
  const [zones, setZones] = useState<Zone[]>([])
  const [loadingZones, setLoadingZones] = useState(false)
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [subdomain, setSubdomain] = useState('')
  const [settingDomain, setSettingDomain] = useState(false)
  const [domainError, setDomainError] = useState('')
  const [domain, setDomain] = useState(project.customDomain || '')
  const [domainStatus, setDomainStatus] = useState(project.domainStatus || '')
  const [domainStep, setDomainStep] = useState<'idle' | 'select' | 'preview' | 'done'>(project.customDomain ? 'done' : 'idle')

  const isLive = liveStatus === 'live'
  const isFailed = liveStatus === 'failed'
  const isActive = ['created', 'uploading', 'deploying'].includes(liveStatus)

  const statusLabel = isLive ? '已上線' : isFailed ? '部署失敗' : '處理中'
  const statusColor = isLive ? '#34d399' : isFailed ? '#ef4444' : '#60a5fa'

  // Poll deploy status
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/status`)
        if (!res.ok) return
        const data = await res.json() as {
          project: { status: string; deploymentUrl: string | null }
          deployment: { status: string; url: string | null; errorMessage: string | null } | null
        }
        setLiveStatus(data.project.status)
        if (data.project.deploymentUrl) setLiveUrl(data.project.deploymentUrl)
        if (data.deployment?.errorMessage) setDeployError(data.deployment.errorMessage)
        if (!['created', 'uploading', 'deploying'].includes(data.project.status)) {
          clearInterval(interval)
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [project.id, isActive])

  const handleDelete = async () => {
    if (!confirm('確定要刪除這個專案嗎？此操作無法復原。')) return
    setDeleting(true)
    const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    if (res.ok) {
      window.location.href = '/dashboard'
    } else {
      alert('刪除失敗')
      setDeleting(false)
    }
  }

  // Domain setup handlers
  const loadZones = async () => {
    setLoadingZones(true)
    setDomainError('')
    try {
      const res = await fetch('/api/cloudflare/zones')
      const data = await res.json() as { zones?: Zone[]; error?: string }
      if (!res.ok || !data.zones) {
        setDomainError(data.error || '載入網域失敗')
        return
      }
      setZones(data.zones)
      setDomainStep('select')
    } catch {
      setDomainError('網路錯誤，請重試。')
    } finally {
      setLoadingZones(false)
    }
  }

  const handleDomainSetup = async () => {
    if (!selectedZone) return
    setSettingDomain(true)
    setDomainError('')
    try {
      const res = await fetch(`/api/projects/${project.id}/domain`, {
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
        setDomainError(data.error || '設定網域失敗')
        return
      }
      setDomain(data.domain || '')
      setDomainStatus(data.status || 'active')
      setDomainStep('done')
    } catch {
      setDomainError('網路錯誤，請重試。')
    } finally {
      setSettingDomain(false)
    }
  }

  const previewDomain = selectedZone
    ? (subdomain.trim() && subdomain.trim() !== '@'
      ? `${subdomain.trim()}.${selectedZone.name}`
      : selectedZone.name)
    : ''

  return (
    <div>
      {/* Back + Header */}
      <div class="mb-8">
        <a
          href="/dashboard"
          class="inline-flex items-center gap-2 text-sm mb-5 no-underline transition-opacity hover:opacity-80"
          style="color:rgba(255,255,255,0.6)"
        >
          ← 返回專案列表
        </a>

        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <h1 class="text-2xl font-bold">{project.name}</h1>
              <div
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
                style={`background:${statusColor}15;border:1px solid ${statusColor}30`}
              >
                <div class="w-2 h-2 rounded-full" style={`background:${statusColor}`} />
                <span style={`color:${statusColor}`}>{statusLabel}</span>
              </div>
            </div>
            {isLive && liveUrl && (
              <a
                href={domain ? `https://${domain}` : liveUrl}
                target="_blank"
                rel="noopener"
                class="font-mono text-sm no-underline"
                style="color:#818cf8"
              >
                {domain || liveUrl} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div class="flex gap-1 mb-8 p-1 rounded-xl w-fit" style="background:rgba(255,255,255,0.03)">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            class="px-5 py-2.5 rounded-lg border-none cursor-pointer text-sm transition-all"
            style={`background:${activeTab === tab.key ? 'rgba(255,255,255,0.1)' : 'transparent'};color:${activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.5)'};font-weight:${activeTab === tab.key ? '600' : '400'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div class="card-vs p-8" style="cursor:default">

        {/* ===== Overview ===== */}
        {activeTab === 'overview' && (
          <div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {[
                { label: '部署次數', value: String(deployments.length), icon: '🚀' },
                { label: '平台', value: project.platform === 'cloudflare' ? 'Cloudflare' : 'Vercel', icon: project.platform === 'cloudflare' ? '☁️' : '▲' },
                { label: '框架', value: project.framework || '未偵測', icon: '⚡' },
              ].map((stat, i) => (
                <div key={i} class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                  <div class="flex items-center gap-2 mb-2">
                    <span>{stat.icon}</span>
                    <span class="text-sm" style="color:rgba(255,255,255,0.5)">{stat.label}</span>
                  </div>
                  <p class="text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            <h3 class="font-semibold mb-4" style="color:rgba(255,255,255,0.8)">連結資訊</h3>
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between p-4 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <div class="flex items-center gap-3">
                  <span>🐙</span>
                  <span>GitHub</span>
                </div>
                {project.githubRepo ? (
                  <a href={`https://github.com/${project.githubRepo}`} target="_blank" rel="noopener" class="font-mono text-sm no-underline" style="color:rgba(255,255,255,0.6)">
                    github.com/{project.githubRepo}
                  </a>
                ) : (
                  <span class="text-sm" style="color:rgba(255,255,255,0.3)">未連結</span>
                )}
              </div>
              <div class="flex items-center justify-between p-4 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <div class="flex items-center gap-3">
                  <span>🌐</span>
                  <span>自訂網域</span>
                </div>
                {domain ? (
                  <span class="font-mono text-sm" style="color:#34d399">{domain}</span>
                ) : (
                  <button
                    onClick={() => setActiveTab('domain')}
                    class="px-4 py-1.5 rounded-lg text-sm border-none cursor-pointer text-white"
                    style="background:rgba(255,255,255,0.1)"
                  >
                    綁定網域
                  </button>
                )}
              </div>
            </div>

            {/* Inline deploy status for active deployments */}
            {isActive && (
              <div class="mt-6 card-vs p-6" style="cursor:default">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="w-3 h-3 rounded-full animate-pulse" style={`background:${statusColor}`} />
                    <span class="font-semibold" style={`color:${statusColor}`}>{statusLabel}</span>
                    <span class="text-sm" style="color:rgba(255,255,255,0.4)">每 3 秒檢查...</span>
                  </div>
                  {liveUrl && (
                    <a href={liveUrl} target="_blank" rel="noopener" class="px-4 py-2 bg-vs-gradient-btn text-white text-sm font-medium rounded-lg no-underline">
                      開啟網站 →
                    </a>
                  )}
                </div>
                {deployError && (
                  <div class="mt-4 px-4 py-2 rounded-lg text-sm" style="background:rgba(239,68,68,0.1);color:#ef4444">
                    {deployError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Deploys ===== */}
        {activeTab === 'deploys' && (
          <div>
            <h3 class="font-semibold mb-5">部署歷史</h3>
            {deployments.length === 0 ? (
              <div class="text-center py-10" style="color:rgba(255,255,255,0.4)">
                <div class="text-3xl mb-3">📦</div>
                <p>尚無部署記錄</p>
              </div>
            ) : (
              <div class="flex flex-col gap-3">
                {deployments.map(d => (
                  <div key={d.id} class="flex items-center justify-between p-4 rounded-xl" style="background:rgba(0,0,0,0.2)">
                    <div class="flex items-center gap-4">
                      <span class="text-lg">
                        {d.status === 'ready' ? '✅' : d.status === 'error' ? '❌' : d.status === 'building' ? '🔨' : '⏳'}
                      </span>
                      <div>
                        <p class="font-mono text-sm mb-1">{d.id.slice(0, 8)}</p>
                        {d.errorMessage && (
                          <p class="text-xs" style="color:#ef4444">{d.errorMessage}</p>
                        )}
                      </div>
                    </div>
                    <div class="flex items-center gap-4">
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noopener" class="text-sm no-underline" style="color:#818cf8">
                          {d.url.replace('https://', '').slice(0, 30)}
                        </a>
                      )}
                      <span class="text-xs" style="color:rgba(255,255,255,0.4)">
                        {timeAgo(d.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== Domain ===== */}
        {activeTab === 'domain' && (
          <div>
            <h3 class="font-semibold mb-5">網域設定</h3>

            {!hasCloudflare ? (
              <div class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <p class="text-sm" style="color:rgba(255,255,255,0.5)">
                  請先在導航列連結 Cloudflare 以設定自訂網域。
                </p>
              </div>
            ) : (
              <div>
                {domainError && (
                  <div class="mb-4 px-4 py-2 rounded-xl text-sm" style="background:rgba(239,68,68,0.1);color:#ef4444">
                    {domainError}
                  </div>
                )}

                {domainStep === 'done' && domain && (
                  <div class="flex items-center justify-between p-5 rounded-xl" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)">
                    <div class="flex items-center gap-3">
                      <span class="text-xl">✅</span>
                      <div>
                        <p class="font-semibold mb-1">網域已連結</p>
                        <a href={`https://${domain}`} target="_blank" rel="noopener" class="font-mono text-sm no-underline" style="color:#34d399">
                          {domain}
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => { setDomainStep('idle'); setSelectedZone(null); setSubdomain(''); setDomainError('') }}
                      class="text-xs border-none cursor-pointer" style="background:none;color:rgba(255,255,255,0.4)"
                    >
                      變更
                    </button>
                  </div>
                )}

                {domainStep === 'idle' && (
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

                {domainStep === 'select' && (
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
                            onClick={() => { setSelectedZone(zone); setDomainStep('preview') }}
                            class="w-full text-left px-4 py-3 rounded-xl text-sm transition-colors border-none cursor-pointer"
                            style={`background:rgba(0,0,0,0.2);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.06)`}
                          >
                            {zone.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => { setDomainStep('idle'); setDomainError('') }}
                      class="text-sm border-none cursor-pointer" style="background:none;color:rgba(255,255,255,0.4)"
                    >
                      取消
                    </button>
                  </div>
                )}

                {domainStep === 'preview' && selectedZone && (
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
                        onClick={handleDomainSetup}
                        disabled={settingDomain}
                        class="px-6 py-2.5 bg-vs-gradient-cf rounded-xl text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-50"
                      >
                        {settingDomain ? '設定中...' : '設定網域'}
                      </button>
                      <button
                        onClick={() => { setDomainStep('select'); setSubdomain('') }}
                        class="text-sm border-none cursor-pointer" style="background:none;color:rgba(255,255,255,0.4)"
                      >
                        返回
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Settings ===== */}
        {activeTab === 'settings' && (
          <div>
            <h3 class="font-semibold mb-5">專案設定</h3>
            <div class="flex flex-col gap-5">
              <div class="p-5 rounded-xl" style="background:rgba(0,0,0,0.2)">
                <label class="block mb-2 font-medium text-sm">專案名稱</label>
                <input
                  type="text"
                  value={projectName}
                  onInput={(e: Event) => setProjectName((e.target as HTMLInputElement).value)}
                  class="w-full px-4 py-3 rounded-lg text-white text-sm focus:outline-none"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"
                />
              </div>

              <div class="p-5 rounded-xl" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2)">
                <h4 class="font-semibold mb-2" style="color:#ef4444">危險區域</h4>
                <p class="text-sm mb-4" style="color:rgba(255,255,255,0.5)">
                  刪除專案將會移除所有部署和設定，此操作無法復原。
                </p>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  class="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                  style="background:transparent;border:1px solid #ef4444;color:#ef4444"
                >
                  {deleting ? '刪除中...' : '刪除專案'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
