import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { api } from './api';
import { auth } from './auth';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false }));

// CSRF: state-changing requests must come from our own origin.
app.use('*', async (c, next) => {
  const m = c.req.method;
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
    const expected = c.env.APP_ORIGIN || new URL(c.req.url).origin;
    if (c.req.header('origin') !== expected) return c.json({ error: 'forbidden' }, 403);
  }
  await next();
});

app.route('/auth', auth);
app.route('/api', api);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
