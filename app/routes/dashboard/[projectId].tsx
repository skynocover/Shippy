import { createRoute } from 'honox/factory'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../../db'
import { users, projects, deployments } from '../../db/schema'
import { requireAuth } from '../../lib/auth-guard'
import DeployStatus from '../../islands/deploy-status'
import DomainSetup from '../../islands/domain-setup'

export default createRoute(requireAuth, async (c) => {
  const session = c.get('session')
  const projectId = c.req.param('projectId')
  const db = getDb(c.env.DB)

  const project = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.userId!)))
    .get()

  if (!project) {
    return c.notFound()
  }

  const user = await db.select().from(users).where(eq(users.id, session.userId!)).get()
  const hasCloudflare = !!user?.cloudflareToken

  const deploymentHistory = await db.select().from(deployments)
    .where(eq(deployments.projectId, projectId))
    .orderBy(desc(deployments.createdAt))

  return c.render(
    <div class="min-h-screen">
      <nav class="border-b border-gray-800 px-6 py-4">
        <div class="max-w-6xl mx-auto flex items-center gap-4">
          <a href="/dashboard" class="text-gray-400 hover:text-gray-200 transition-colors">
            &larr; Back
          </a>
          <span class="text-gray-600">/</span>
          <span class="font-semibold">{project.name}</span>
          <div class="ml-auto">
            <button
              id="delete-btn"
              class="px-3 py-1.5 bg-red-500/10 text-red-400 text-sm rounded-lg hover:bg-red-500/20 transition-colors"
            >
              Delete Project
            </button>
            <script dangerouslySetInnerHTML={{__html: `
              document.getElementById('delete-btn').addEventListener('click', async () => {
                if (!confirm('Delete this project and all deployments?')) return;
                const res = await fetch('/api/projects/${project.id}', { method: 'DELETE' });
                if (res.ok) window.location.href = '/dashboard';
                else alert('Failed to delete');
              });
            `}} />
          </div>
        </div>
      </nav>

      <main class="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div class="text-sm text-gray-400 mb-1">Domain</div>
            <div class="font-mono text-sm">
              {project.customDomain ? (
                <a href={`https://${project.customDomain}`} target="_blank" rel="noopener" class="text-orange-400 hover:underline">
                  {project.customDomain}
                </a>
              ) : project.deploymentUrl ? (
                <a href={project.deploymentUrl} target="_blank" rel="noopener" class="text-indigo-400 hover:underline">
                  {project.deploymentUrl.replace('https://', '')}
                </a>
              ) : (
                <span class="text-gray-500">Not deployed yet</span>
              )}
            </div>
          </div>
          <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div class="text-sm text-gray-400 mb-1">Framework</div>
            <div class="font-medium">{project.framework || 'Not detected'}</div>
          </div>
          <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div class="text-sm text-gray-400 mb-1">GitHub</div>
            <div class="font-mono text-sm">
              {project.githubRepo ? (
                <a href={`https://github.com/${project.githubRepo}`} target="_blank" rel="noopener" class="text-indigo-400 hover:underline">
                  {project.githubRepo}
                </a>
              ) : (
                <span class="text-gray-500">Not created yet</span>
              )}
            </div>
          </div>
        </div>

        <DeployStatus projectId={project.id} initialStatus={project.status} initialUrl={project.deploymentUrl ?? undefined} />

        <DomainSetup
          projectId={project.id}
          hasCloudflare={hasCloudflare}
          currentDomain={project.customDomain ?? undefined}
          domainStatus={project.domainStatus ?? undefined}
        />

        {deploymentHistory.length > 0 && (
          <div>
            <h2 class="text-lg font-semibold mb-4">Deployment History</h2>
            <div class="space-y-2">
              {deploymentHistory.map(d => (
                <div class="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <StatusBadge status={d.status} />
                    <span class="text-sm text-gray-400 font-mono">{d.id.slice(0, 8)}</span>
                  </div>
                  <div class="flex items-center gap-4">
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noopener" class="text-sm text-indigo-400 hover:underline">
                        {d.url}
                      </a>
                    )}
                    {d.errorMessage && (
                      <span class="text-sm text-red-400">{d.errorMessage}</span>
                    )}
                    <span class="text-xs text-gray-500">
                      {d.createdAt instanceof Date ? d.createdAt.toLocaleString() : String(d.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>,
    { title: `${project.name} - VibeShip` }
  )
})

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-yellow-400/10 text-yellow-400',
    building: 'bg-blue-400/10 text-blue-400',
    ready: 'bg-green-400/10 text-green-400',
    error: 'bg-red-400/10 text-red-400',
    canceled: 'bg-gray-400/10 text-gray-400',
  }
  return (
    <span class={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.queued}`}>
      {status}
    </span>
  )
}
