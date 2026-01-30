import { createRoute } from 'honox/factory'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import { requireAuth } from '../../lib/auth-guard'
import FileUploader from '../../islands/file-uploader'
import ProjectList from '../../islands/project-list'

export default createRoute(requireAuth, async (c) => {
  const session = c.get('session')
  const db = getDb(c.env.DB)
  const user = await db.select().from(users).where(eq(users.id, session.userId!)).get()

  const hasVercel = !!user?.vercelToken

  return c.render(
    <div class="min-h-screen">
      <nav class="border-b border-gray-800 px-6 py-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/dashboard" class="text-xl font-bold">
            <span class="text-indigo-400">Vibe</span>Ship
          </a>
          <div class="flex items-center gap-4">
            {!hasVercel && (
              <a
                href="/api/auth/vercel"
                class="px-4 py-2 bg-gray-800 text-gray-200 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Connect Vercel
              </a>
            )}
            {hasVercel && (
              <span class="text-sm text-green-400 flex items-center gap-1.5">
                <span class="w-2 h-2 bg-green-400 rounded-full"></span>
                Vercel connected
              </span>
            )}
            <span class="text-sm text-gray-400">{user?.username}</span>
            {user?.avatarUrl && (
              <img src={user.avatarUrl} alt="" class="w-8 h-8 rounded-full" />
            )}
          </div>
        </div>
      </nav>

      <main class="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 class="text-2xl font-bold mb-2">Projects</h1>
          <p class="text-gray-400">Upload your code and deploy it to production.</p>
        </div>

        <FileUploader hasVercel={hasVercel} />

        <ProjectList />
      </main>
    </div>,
    { title: 'Dashboard - VibeShip' }
  )
})
