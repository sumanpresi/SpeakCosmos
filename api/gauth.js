/** Keeps the person signed in to Google Drive for about a year instead of one hour.
 * Google only hands out long-lived "refresh keys" to a server, so this small function holds it in an
 * encrypted, HttpOnly cookie that scripts on the page can never read, and trades it for 1-hour access keys.
 * Needs the GOOGLE_CLIENT_SECRET environment variable; without it the app falls back to the 1-hour sign-in.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '802821811865-n3l99l05scl1k2pv3bs2uctrd129p7k8.apps.googleusercontent.com';
const SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const RT = 'sc_rt', ST = 'sc_st', YEAR = 60 * 60 * 24 * 400;
const key = () => createHash('sha256').update('speakcosmos|' + SECRET).digest();
const seal = (t) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv), e = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]).toString('base64url'); };
const open = (v) => { try { const b = Buffer.from(v, 'base64url'), d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch (e) { return ''; } };
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
const cookie = (n, v, age) => `${n}=${v}; Path=/api; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
const origin = (req) => `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
const redirectUri = (req) => origin(req) + '/api/gauth';

async function post(url, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {}, action = String(q.action || '');
  if (action === 'status') return res.status(200).json({ enabled: !!SECRET });
  if (!SECRET) return res.status(503).json({ error: 'Long sign-in is not set up on the server yet.' });

  // 1. send the person to Google's consent page (asks for a refresh key)
  if (action === 'start') {
    const state = randomBytes(16).toString('hex');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
    res.setHeader('Set-Cookie', cookie(ST, state, 600));
    res.setHeader('Location', url); return res.status(302).end();
  }
  // 2. Google sends them back here with a code; keep the refresh key in a sealed cookie
  if (q.code || q.error) {
    const back = (flag) => { res.setHeader('Location', '/?view=cosmos&' + flag); return res.status(302).end(); };
    if (q.error || !q.state || cookies(req)[ST] !== q.state) return back('gerror=1');
    const t = await post('https://oauth2.googleapis.com/token', { code: String(q.code), client_id: CLIENT_ID, client_secret: SECRET, redirect_uri: redirectUri(req), grant_type: 'authorization_code' });
    if (!t.ok || !t.json.refresh_token) return back('gerror=1');
    res.setHeader('Set-Cookie', [cookie(RT, seal(t.json.refresh_token), YEAR), cookie(ST, '', 0)]);
    return back('gconnected=1');
  }
  // 3. the page asks for a fresh 1-hour access key
  if (action === 'token' && req.method === 'POST') {
    if (req.headers['x-sc'] !== '1') return res.status(403).json({ error: 'Bad request.' });
    const rt = open(cookies(req)[RT] || '');
    if (!rt) return res.status(401).json({ error: 'expired' });
    const t = await post('https://oauth2.googleapis.com/token', { refresh_token: rt, client_id: CLIENT_ID, client_secret: SECRET, grant_type: 'refresh_token' });
    if (!t.ok || !t.json.access_token) {
      if (t.status === 400 || t.status === 401) res.setHeader('Set-Cookie', cookie(RT, '', 0));
      return res.status(t.status === 400 || t.status === 401 ? 401 : 502).json({ error: t.status === 400 || t.status === 401 ? 'expired' : 'Google is not answering.' });
    }
    return res.status(200).json({ access_token: t.json.access_token, expires_in: t.json.expires_in || 3600 });
  }
  if (action === 'logout' && req.method === 'POST') { res.setHeader('Set-Cookie', cookie(RT, '', 0)); return res.status(200).json({ ok: true }); }
  return res.status(400).json({ error: 'Unknown request.' });
}
