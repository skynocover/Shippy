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

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    created: { label: 'Created', color: 'text-gray-400', bg: 'bg-gray-400' },
    uploading: { label: 'Uploading', color: 'text-yellow-400', bg: 'bg-yellow-400' },
    deploying: { label: 'Deploying', color: 'text-blue-400', bg: 'bg-blue-400' },
    live: { label: 'Live', color: 'text-green-400', bg: 'bg-green-400' },
    failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-400' },
  }

  const config = statusConfig[status] || statusConfig.created

  return (
    <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class={`w-3 h-3 rounded-full ${config.bg} ${isActive ? 'animate-pulse' : ''}`}></span>
          <span class={`font-semibold ${config.color}`}>{config.label}</span>
          {isActive && (
            <span class="text-sm text-gray-500">Checking every 3s...</span>
          )}
        </div>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener"
            class="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-400 transition-colors"
          >
            Visit Site &rarr;
          </a>
        )}
      </div>

      {error && (
        <div class="mt-4 px-4 py-2 bg-red-400/10 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {url && (
        <div class="mt-4">
          <div class="text-sm text-gray-400 mb-2">Domains</div>
          <div class="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener" class="font-mono text-sm text-indigo-400 hover:underline">
              {url.replace('https://', '')}
            </a>
            <span class="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">Production</span>
          </div>
        </div>
      )}
    </div>
  )
}
