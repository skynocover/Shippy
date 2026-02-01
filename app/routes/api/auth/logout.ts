import { createRoute } from 'honox/factory';
import { setCookie } from 'hono/cookie';

export const POST = createRoute(async (c) => {
  setCookie(c, 'sid', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });

  return c.redirect('/');
});
