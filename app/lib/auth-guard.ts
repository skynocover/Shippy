import type { Context, Next } from 'hono';

export async function requireAuth(c: Context, next: Next) {
  const session = c.get('session');
  if (!session?.userId) {
    const isApi = c.req.path.startsWith('/api/');
    if (isApi) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return c.redirect('/');
  }
  await next();
}
