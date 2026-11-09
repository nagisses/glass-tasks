import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Env, User } from './types';

const SESSION_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';
const VERIFIER_COOKIE = 'oauth_verifier';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_MS = 15 * 24 * 60 * 60 * 1000;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const enc = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
}

function origin(c: Context<AppEnv>): string {
  return c.env.APP_ORIGIN || new URL(c.req.url).origin;
}

function isSecure(c: Context<AppEnv>): boolean {
  return origin(c).startsWith('https://');
}

function endpoints(env: Env) {
  return {
    auth: env.GOOGLE_AUTH_URL || GOOGLE_AUTH_URL,
    token: env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN_URL,
    userinfo: env.GOOGLE_USERINFO_URL || GOOGLE_USERINFO_URL,
  };
}

export const auth = new Hono<AppEnv>();

auth.get('/login', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.text('Google OAuth is not configured', 500);
  }
  const state = randomToken();
  const verifier = randomToken(48);
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax' as const,
    path: '/auth',
    maxAge: 600,
  };
  setCookie(c, STATE_COOKIE, state, cookieOpts);
  setCookie(c, VERIFIER_COOKIE, verifier, cookieOpts);

  const url = new URL(endpoints(c.env).auth);
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin(c)}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return c.redirect(url.toString(), 302);
});

auth.get('/callback', async (c) => {
  const fail = (reason: string, detail?: unknown) => {
    // Never logs codes, tokens or secrets: only the failing step and Google's error code
    console.warn('login failed', reason, detail ?? '');
    return c.redirect(`/?login_error=${encodeURIComponent(reason)}`, 302);
  };
  const { code, state, error } = c.req.query();
  const savedState = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/auth' });
  deleteCookie(c, VERIFIER_COOKIE, { path: '/auth' });

  if (error) return fail(error);
  if (!code || !state || !savedState || !verifier || state !== savedState) return fail('state');

  const ep = endpoints(c.env);
  const tokenRes = await fetch(ep.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${origin(c)}/auth/callback`,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) {
    const err = (await tokenRes.json().catch(() => ({}))) as { error?: string; error_description?: string };
    return fail('token', { status: tokenRes.status, error: err.error, description: err.error_description });
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return fail('token');

  const infoRes = await fetch(ep.userinfo, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) return fail('userinfo', { status: infoRes.status });
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.sub || !info.email || info.email_verified === false) return fail('email');

  const userId = await upsertUser(c.env.DB, {
    sub: info.sub,
    email: info.email,
    name: info.name ?? '',
    picture: info.picture ?? '',
  });

  const sessionToken = randomToken();
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(sessionToken), userId, now + SESSION_TTL_MS, now)
    .run();
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.redirect('/', 302);
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

async function upsertUser(
  db: D1Database,
  p: { sub: string; email: string; name: string; picture: string },
): Promise<string> {
  const existing = await db.prepare('SELECT id FROM users WHERE google_sub = ?').bind(p.sub).first<{ id: string }>();
  const now = Date.now();
  if (existing) {
    await db
      .prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?')
      .bind(p.email, p.name, p.picture, existing.id)
      .run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, p.sub, p.email, p.name, p.picture, now),
    db
      .prepare(
        'INSERT INTO lists (id, user_id, name, cover, is_inbox, position, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 0, ?, ?)',
      )
      .bind(crypto.randomUUID(), id, 'インボックス', now, now),
  ]);
  return id;
}

const GUEST_TTL_MS = 400 * 24 * 60 * 60 * 1000; // browsers cap cookies at 400 days
const GUEST_RENEW_MS = 200 * 24 * 60 * 60 * 1000;

function writeSessionCookie(c: Context<AppEnv>, token: string, ttlMs: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });
}

/** Guest mode: a first visit gets its own anonymous account, kept by an HttpOnly cookie. */
async function createGuest(c: Context<AppEnv>): Promise<User | null> {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (c.env.GUEST_LIMITER && !(await c.env.GUEST_LIMITER.limit({ key: ip })).success) return null;
  const db = c.env.DB;
  const id = crypto.randomUUID();
  const now = Date.now();
  const token = randomToken();
  await db.batch([
    db
      .prepare('INSERT INTO users (id, google_sub, email, name, picture, is_guest, created_at) VALUES (?, ?, \'\', ?, \'\', 1, ?)')
      .bind(id, `guest:${id}`, 'ゲスト', now),
    db
      .prepare(
        'INSERT INTO lists (id, user_id, name, cover, is_inbox, position, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 0, ?, ?)',
      )
      .bind(crypto.randomUUID(), id, 'インボックス', now, now),
    db
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), id, now + GUEST_TTL_MS, now),
  ]);
  writeSessionCookie(c, token, GUEST_TTL_MS);
  return { id, email: '', name: 'ゲスト', picture: '', guest: true };
}

/** Resolves the session cookie to a user, or answers 401 (guest mode: /api/me creates a guest). */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const now = Date.now();
  const row = token
    ? await c.env.DB.prepare(
        `SELECT s.expires_at, u.id, u.email, u.name, u.picture, u.is_guest
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > ?`,
      )
        .bind(await sha256Hex(token), now)
        .first<Omit<User, 'guest'> & { expires_at: number; is_guest: number }>()
    : null;

  if (!row) {
    if (c.env.AUTH_MODE === 'guest' && c.req.method === 'GET' && c.req.path === '/api/me') {
      const guest = await createGuest(c);
      if (!guest) return c.json({ error: 'too_many_requests' }, 429);
      c.set('user', guest);
      return next();
    }
    if (token) deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Sliding expiry: renew sessions that are past half their lifetime
  const guest = row.is_guest === 1;
  const ttl = guest ? GUEST_TTL_MS : SESSION_TTL_MS;
  if (row.expires_at - now < (guest ? GUEST_RENEW_MS : SESSION_RENEW_MS)) {
    const sid = await sha256Hex(token!);
    c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(now + ttl, sid).run());
    writeSessionCookie(c, token!, ttl);
  }
  c.set('user', { id: row.id, email: row.email, name: row.name, picture: row.picture, guest });
  await next();
};
