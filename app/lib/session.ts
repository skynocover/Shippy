import type { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { generateId } from './id';

const COOKIE_NAME = 'sid';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

interface SessionData {
  userId?: string;
}

export const sessionMiddleware = async (c: Context, next: Next) => {
  const kv = c.env.SESSION;
  let sessionId = getCookie(c, COOKIE_NAME);
  let data: SessionData = {};

  if (sessionId) {
    const raw = await kv.get(sessionId, 'json');
    if (raw) {
      data = raw as SessionData;
    } else {
      sessionId = undefined;
    }
  }

  if (!sessionId) {
    sessionId = generateId();
  }

  c.set('session', { id: sessionId, ...data });

  setCookie(c, COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });

  await next();

  const session = c.get('session');
  const { id: _id, ...rest } = session;
  await kv.put(sessionId, JSON.stringify(rest), { expirationTtl: SESSION_TTL });
};
