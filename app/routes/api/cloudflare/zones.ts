import { createRoute } from 'honox/factory';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../db';
import { users } from '../../../db/schema';
import { requireAuth } from '../../../lib/auth-guard';
import { decrypt } from '../../../lib/crypto';
import * as cloudflare from '../../../services/cloudflare';

// GET /api/cloudflare/zones — list user's Cloudflare zones
export const GET = createRoute(requireAuth, async (c) => {
  const session = c.get('session');
  const db = getDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.id, session.userId!)).get();
  if (!user?.cloudflareToken) {
    return c.json({ error: 'Cloudflare not connected' }, 400);
  }

  try {
    const token = await decrypt(user.cloudflareToken, c.env.ENCRYPTION_KEY);
    const zones = await cloudflare.listZones(token);
    return c.json({
      zones: zones.map((z) => ({ id: z.id, name: z.name, status: z.status })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to list Cloudflare zones:', message);
    return c.json({ error: 'Failed to fetch zones from Cloudflare' }, 500);
  }
});
