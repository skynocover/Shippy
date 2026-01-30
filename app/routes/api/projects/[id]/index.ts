import { createRoute } from 'honox/factory'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { projects, deployments } from '../../../../db/schema'
import { requireAuth } from '../../../../lib/auth-guard'

// DELETE /api/projects/:id - Delete a project and its deployments
export const DELETE = createRoute(requireAuth, async (c) => {
  const session = c.get('session')
  const projectId = c.req.param('id')
  const db = getDb(c.env.DB)

  const project = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.userId!)))
    .get()

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Delete deployments first (foreign key)
  await db.delete(deployments).where(eq(deployments.projectId, projectId)).run()
  // Delete project
  await db.delete(projects).where(eq(projects.id, projectId)).run()

  return c.json({ ok: true })
})
