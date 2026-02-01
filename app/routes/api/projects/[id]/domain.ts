import { createRoute } from 'honox/factory';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { users, projects } from '../../../../db/schema';
import { requireAuth } from '../../../../lib/auth-guard';
import { decrypt } from '../../../../lib/crypto';
import * as cloudflare from '../../../../services/cloudflare';
import * as vercel from '../../../../services/vercel';

// POST /api/projects/:id/domain — setup custom domain (Cloudflare DNS + Vercel)
export const POST = createRoute(requireAuth, async (c) => {
  const session = c.get('session');
  const projectId = c.req.param('id');
  const db = getDb(c.env.DB);

  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.userId!)))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  if (!project.vercelProjectId) {
    return c.json({ error: 'Deploy to Vercel first' }, 400);
  }

  const body = await c.req
    .json<{ zoneId: string; zoneName: string; subdomain: string }>()
    .catch(() => ({}) as any);

  if (!body.zoneId || !body.zoneName) {
    return c.json({ error: 'zoneId and zoneName are required' }, 400);
  }

  // Build the full domain name
  const fullDomain =
    body.subdomain && body.subdomain !== '@' ? `${body.subdomain}.${body.zoneName}` : body.zoneName;

  try {
    const user = await db.select().from(users).where(eq(users.id, session.userId!)).get();
    if (!user?.cloudflareToken) {
      return c.json({ error: 'Cloudflare not connected' }, 400);
    }
    if (!user.vercelToken) {
      return c.json({ error: 'Vercel not connected' }, 400);
    }

    const cfToken = await decrypt(user.cloudflareToken, c.env.ENCRYPTION_KEY);
    const vercelToken = await decrypt(user.vercelToken, c.env.ENCRYPTION_KEY);

    // Mark as pending
    await db
      .update(projects)
      .set({
        customDomain: fullDomain,
        domainStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .run();

    // 1. Create CNAME record in Cloudflare
    await cloudflare.createDnsRecord(cfToken, {
      zoneId: body.zoneId,
      name: fullDomain,
    });

    // 2. Add custom domain in Vercel
    await vercel.addDomain(vercelToken, project.vercelProjectId, fullDomain);

    // 3. Mark as active
    await db
      .update(projects)
      .set({
        domainStatus: 'active',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .run();

    return c.json({ ok: true, domain: fullDomain, status: 'active' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Domain setup failed for project ${projectId}:`, message);

    // Mark as error
    await db
      .update(projects)
      .set({
        domainStatus: 'error',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .run();

    return c.json({ error: message }, 500);
  }
});

// GET /api/projects/:id/domain — get current domain status
export const GET = createRoute(requireAuth, async (c) => {
  const session = c.get('session');
  const projectId = c.req.param('id');
  const db = getDb(c.env.DB);

  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.userId!)))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({
    customDomain: project.customDomain,
    domainStatus: project.domainStatus,
  });
});
