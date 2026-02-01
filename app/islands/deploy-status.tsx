import { useState, useEffect } from 'hono/jsx'

interface Props {
  projectId: string
  initialStatus: string
  initialUrl?: string
}

export default function DeployStatus({ projectId, initialStatus, initialUrl }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [url, setUrl] = useState(initialUrl || '')
  const [error, setError] = useState('')

  const isActive = ['created', 'uploading', 'deploying'].includes(status)

  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/status`)
        if (!res.ok) return

        const data = await res.json() as {
          project: { status: string; deploymentUrl: string | null }
          deployment: { status: string; url: string | null; errorMessage: string | null } | null
        }

        setStatus(data.project.status)
        if (data.project.deploymentUrl) {
          setUrl(data.project.deploymentUrl)
        }
        if (data.deployment?.errorMessage) {
          setError(data.deployment.errorMessage)
        }

        if (!['created', 'uploading', 'deploying'].includes(data.project.status)) {
          clearInterval(interval)
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [projectId, isActive])

  const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
    created: { label: '已建立', color: 'rgba(156,163,175,1)', dot: '#9ca3af' },
    uploading: { label: '上傳中', color: '#facc15', dot: '#facc15' },
    deploying: { label: '部署中', color: '#60a5fa', dot: '#60a5fa' },
    live: { label: '已上線', color: '#34d399', dot: '#34d399' },
    failed: { label: '失敗', color: '#ef4444', dot: '#ef4444' },
  }

  const config = statusConfig[status] || statusConfig.created

  return (
    <div class="card-vs p-6" style="cursor:default">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span
            class={`w-3 h-3 rounded-full ${isActive ? 'animate-pulse' : ''}`}
            style={`background:${config.dot}`}
          />
          <span class="font-semibold" style={`color:${config.color}`}>{config.label}</span>
          {isActive && (
            <span class="text-sm" style="color:rgba(255,255,255,0.4)">每 3 秒檢查...</span>
          )}
        </div>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener"
            class="px-4 py-2 bg-vs-gradient-btn text-white text-sm font-medium rounded-lg no-underline"
          >
            開啟網站 →
          </a>
        )}
      </div>

      {error && (
        <div class="mt-4 px-4 py-2 rounded-lg text-sm" style="background:rgba(239,68,68,0.1);color:#ef4444">
          {error}
        </div>
      )}

      {url && (
        <div class="mt-4">
          <div class="text-sm mb-2" style="color:rgba(255,255,255,0.5)">網域</div>
          <div class="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener" class="font-mono text-sm no-underline" style="color:#818cf8">
              {url.replace('https://', '')}
            </a>
            <span class="text-xs px-2 py-0.5 rounded" style="color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.05)">Production</span>
          </div>
        </div>
      )}
    </div>
  )
}
