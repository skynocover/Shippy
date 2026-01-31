import { useState, useEffect } from 'hono/jsx'

interface Project {
  id: string
  name: string
  subdomain: string
  framework: string | null
  status: string
  deploymentUrl: string | null
  createdAt: string
}

const statusConfig: Record<string, { color: string; bg: string }> = {
  created: { color: 'text-gray-400', bg: 'bg-gray-400/10' },
  uploading: { color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  deploying: { color: 'text-blue-400', bg: 'bg-blue-400/10' },
  live: { color: 'text-green-400', bg: 'bg-green-400/10' },
  failed: { color: 'text-red-400', bg: 'bg-red-400/10' },
}

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then((data: { projects: Project[] }) => {
        setProjects(data.projects)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div class="text-center py-8 text-gray-500">Loading projects...</div>
    )
  }

  if (projects.length === 0) {
    return (
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg">No projects yet</p>
        <p class="text-sm mt-1">Drop a folder above to create your first project</p>
      </div>
    )
  }

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map(project => {
        const sc = statusConfig[project.status] || statusConfig.created
        return (
          <a
            key={project.id}
            href={`/dashboard/${project.id}`}
            class="block bg-gray-900 rounded-lg p-5 border border-gray-800 hover:border-gray-700 transition-colors"
          >
            <div class="flex items-start justify-between mb-3">
              <span class="font-semibold text-gray-100 truncate">
                {project.name}
              </span>
              <div class="flex items-center gap-2">
                <span class={`px-2 py-0.5 rounded text-xs font-medium ${sc.color} ${sc.bg}`}>
                  {project.status}
                </span>
                <button
                  onClick={async (e: Event) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!confirm(`Delete "${project.name}"?`)) return
                    const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
                    if (res.ok) setProjects(prev => prev.filter(p => p.id !== project.id))
                  }}
                  class="px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div class="space-y-1.5 text-sm">
              <div class="text-gray-500 font-mono">{project.subdomain}.vibeship.dev</div>
              {project.framework && (
                <div class="text-gray-400">{project.framework}</div>
              )}
              {project.deploymentUrl && (
                <div class="text-indigo-400 truncate">{project.deploymentUrl}</div>
              )}
            </div>
          </a>
        )
      })}
    </div>
  )
}
