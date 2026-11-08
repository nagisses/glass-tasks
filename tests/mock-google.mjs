// Minimal stand-in for Google's OAuth 2.0 / OpenID Connect endpoints, used only by E2E tests.
// It enforces the same things the Worker relies on: client credentials, redirect_uri, state and PKCE (S256).
import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.MOCK_GOOGLE_PORT || 9999);
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';

const codes = new Map(); // code -> { challenge, redirectUri, email, name }
const tokens = new Map(); // access_token -> { email, name }

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(new URLSearchParams(data)));
  });
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
    const p = url.searchParams;
    const problems = [];
    if (p.get('client_id') !== CLIENT_ID) problems.push('client_id');
    if (p.get('response_type') !== 'code') problems.push('response_type');
    if (!p.get('state')) problems.push('state');
    if (!p.get('code_challenge') || p.get('code_challenge_method') !== 'S256') problems.push('pkce');
    if (!/^https?:\/\/localhost(:\d+)?\/auth\/callback$/.test(p.get('redirect_uri') || '')) problems.push('redirect_uri');
    if (!(p.get('scope') || '').split(' ').includes('openid')) problems.push('scope');
    if (problems.length) return send(res, 400, { error: 'invalid_request', problems });

    const hidden = ['state', 'code_challenge', 'redirect_uri']
      .map((k) => `<input type="hidden" name="${k}" value="${esc(p.get(k))}">`)
      .join('');
    return send(
      res,
      200,
      `<!doctype html><meta charset="utf-8"><title>Mock Google Sign-in</title>
      <form method="post" action="/o/oauth2/v2/auth/approve">
        <label>Email <input name="email" value="test@example.com"></label>
        <label>Name <input name="name" value="テスト ユーザー"></label>
        ${hidden}
        <button name="decision" value="allow">Continue</button>
        <button name="decision" value="deny">Cancel</button>
      </form>`,
      'text/html; charset=utf-8',
    );
  }

  if (req.method === 'POST' && url.pathname === '/o/oauth2/v2/auth/approve') {
    const f = await readBody(req);
    const redirect = new URL(f.get('redirect_uri'));
    if (f.get('decision') === 'deny') {
      redirect.searchParams.set('error', 'access_denied');
    } else {
      const code = b64url(crypto.randomBytes(24));
      codes.set(code, {
        challenge: f.get('code_challenge'),
        redirectUri: f.get('redirect_uri'),
        email: f.get('email'),
        name: f.get('name'),
      });
      redirect.searchParams.set('code', code);
    }
    redirect.searchParams.set('state', f.get('state'));
    res.writeHead(302, { location: redirect.toString() });
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/token') {
    const f = await readBody(req);
    const entry = codes.get(f.get('code'));
    codes.delete(f.get('code'));
    if (f.get('grant_type') !== 'authorization_code' || !entry) return send(res, 400, { error: 'invalid_grant' });
    if (f.get('client_id') !== CLIENT_ID || f.get('client_secret') !== CLIENT_SECRET) {
      return send(res, 401, { error: 'invalid_client' });
    }
    if (f.get('redirect_uri') !== entry.redirectUri) return send(res, 400, { error: 'redirect_uri_mismatch' });
    const challenge = b64url(crypto.createHash('sha256').update(f.get('code_verifier') || '').digest());
    if (challenge !== entry.challenge) return send(res, 400, { error: 'invalid_grant', detail: 'pkce' });
    const access = b64url(crypto.randomBytes(24));
    tokens.set(access, { email: entry.email, name: entry.name });
    return send(res, 200, { access_token: access, token_type: 'Bearer', expires_in: 3599, scope: 'openid email profile' });
  }

  if (req.method === 'GET' && url.pathname === '/v1/userinfo') {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const t = tokens.get(bearer);
    if (!t) return send(res, 401, { error: 'invalid_token' });
    const sub = crypto.createHash('sha256').update(t.email).digest('hex').slice(0, 21);
    return send(res, 200, { sub, email: t.email, email_verified: true, name: t.name, picture: '' });
  }

  if (url.pathname === '/health') return send(res, 200, { ok: true });
  send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`mock google listening on ${PORT}`));
