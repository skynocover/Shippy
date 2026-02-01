import { createRoute } from 'honox/factory';
import { getCookie, setCookie } from 'hono/cookie';

export const POST = createRoute(async (c) => {
  const kv = c.env.SESSION;
  const sid = getCookie(c, 'sid');

  if (sid) {
    await kv.delete(sid);
  }

  setCookie(c, 'sid', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });

  return c.redirect('/');
});
