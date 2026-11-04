import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/lib/mail.js';
import { verifyGoogleToken } from '../server/lib/google.js';

let server; let base; const sent = [];
let googleNext = null;
const post = async (path, body, token) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const resetTokenFrom = (mail) => /#\/reset\/([a-f0-9]{64})/.exec(mail.text)[1];

before(async () => {
  const mailer = { enabled: true, send: async (m) => { sent.push(m); return true; } };
  const googleVerify = async (cred) => { if (!googleNext) throw new Error('bad'); return googleNext; };
  const app = createApp({ dbPath: ':memory:', mailer, googleVerify, codeMax: 100 });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('signup sends the welcome email now and the guide a few minutes later', async () => {
  sent.length = 0;
  const r = await post('/api/auth/signup', { email: 'New@Example.com', password: 'correct horse' });
  assert.equal(r.status, 201);
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.to === 'new@example.com'));
  assert.match(sent[0].subject, /signed up/i); assert.equal(sent[0].sendAt, undefined);
  assert.match(sent[1].subject, /guide/i); assert.ok(sent[1].sendAt > Date.now() + 60_000);
  assert.match(sent[1].text, /Upload your resume/);
});

test('forgot password: same answer for unknown emails, one-time link, old sessions end', async () => {
  const s = await post('/api/auth/signup', { email: 'reset@example.com', password: 'old password 1' });
  sent.length = 0;
  const unknown = await post('/api/auth/forgot', { email: 'nobody@example.com' });
  assert.equal(unknown.status, 200); assert.deepEqual(unknown.data, { ok: true }); assert.equal(sent.length, 0);
  const known = await post('/api/auth/forgot', { email: 'reset@example.com' });
  assert.deepEqual(known.data, { ok: true }); assert.equal(sent.length, 1);
  const token = resetTokenFrom(sent[0]);
  assert.equal((await post('/api/auth/reset', { token, password: 'short' })).status, 400);
  assert.equal((await post('/api/auth/reset', { token: 'f'.repeat(64), password: 'new password 1' })).status, 400);
  const ok = await post('/api/auth/reset', { token, password: 'new password 1' });
  assert.equal(ok.status, 200); assert.ok(ok.data.token);
  assert.equal((await post('/api/auth/reset', { token, password: 'another one 22' })).status, 400, 'link works once');
  assert.equal((await post('/api/auth/login', { email: 'reset@example.com', password: 'old password 1' })).status, 401);
  assert.equal((await post('/api/auth/login', { email: 'reset@example.com', password: 'new password 1' })).status, 200);
  assert.equal((await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${s.data.token}` } })).status, 401, 'old session was signed out');
});

test('google sign-in creates an account, sends the emails, and signs the same person in again', async () => {
  sent.length = 0;
  googleNext = { sub: 'g-123', email: 'gus@example.com' };
  const a = await post('/api/auth/google', { credential: 'x' });
  assert.equal(a.status, 200); assert.equal(a.data.isNew, true); assert.equal(sent.length, 2);
  const b = await post('/api/auth/google', { credential: 'x' });
  assert.equal(b.data.isNew, false); assert.equal(sent.length, 2);
  assert.equal((await post('/api/auth/login', { email: 'gus@example.com', password: 'anything long' })).status, 401);
  googleNext = null;
  assert.equal((await post('/api/auth/google', { credential: 'x' })).status, 401);
});

test('google sign-in on an email that already has a password removes that password and its sessions', async () => {
  const s = await post('/api/auth/signup', { email: 'victim@example.com', password: 'attacker chose this' });
  googleNext = { sub: 'g-victim', email: 'victim@example.com' };
  const g = await post('/api/auth/google', { credential: 'x' });
  assert.equal(g.data.isNew, false);
  assert.equal((await post('/api/auth/login', { email: 'victim@example.com', password: 'attacker chose this' })).status, 401);
  assert.equal((await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${s.data.token}` } })).status, 401);
  googleNext = { sub: 'g-other', email: 'victim@example.com' };
  assert.equal((await post('/api/auth/google', { credential: 'x' })).status, 401, 'a different Google account cannot take it over');
});

test('connect code: signed-in user gets a code, the extension swaps it once for a session', async () => {
  const s = await post('/api/auth/signup', { email: 'ext@example.com', password: 'correct horse' });
  const c = await post('/api/auth/connect-code', {}, s.data.token);
  assert.match(c.data.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await post('/api/auth/connect-code', {})).status, 401);
  const used = await post('/api/auth/connect', { code: c.data.code.toLowerCase() });
  assert.equal(used.status, 200); assert.equal(used.data.user.email, 'ext@example.com');
  assert.equal((await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${used.data.token}` } })).status, 200);
  assert.equal((await post('/api/auth/connect', { code: c.data.code })).status, 400, 'works once');
  assert.equal((await post('/api/auth/connect', { code: 'ABCD-EFGH' })).status, 400);
});

test('reset and code endpoints are rate limited', async () => {
  const app = createApp({ dbPath: ':memory:', mailer: { send: async () => true } });
  const srv = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const url = `http://127.0.0.1:${srv.address().port}/api/auth/connect`;
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'ABCD-EFGH' }) })).status);
  srv.close();
  assert.equal(codes[0], 400); assert.equal(codes[9], 429);
});

test('mailer: no key means nothing is sent; with a key it calls Resend and schedules', async () => {
  assert.equal(await createMailer({ apiKey: '' }).send({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), false);
  let call;
  const m = createMailer({ apiKey: 'k', from: 'Rolemate <hello@rolemate.in>', fetchFn: async (url, o) => { call = { url, o }; return { ok: true }; } });
  assert.equal(await m.send({ to: 'a@b.co', subject: 's', html: 'h', text: 't', sendAt: 1_800_000_000_000 }), true);
  assert.equal(call.url, 'https://api.resend.com/emails');
  const body = JSON.parse(call.o.body);
  assert.deepEqual(body.to, ['a@b.co']); assert.equal(body.from, 'Rolemate <hello@rolemate.in>'); assert.ok(body.scheduled_at);
  assert.equal(await createMailer({ apiKey: 'k', fetchFn: async () => { throw new Error('down'); } }).send({ to: 'a@b.co', subject: 's' }), false);
});

test('google token check: accepts a valid token and rejects wrong audience, expiry, signature, unverified email', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const fetchFn = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const mk = (claims, key = privateKey) => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = enc({ alg: 'RS256', kid: 'k1' }); const body = enc(claims);
    return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url')}`;
  };
  const good = { iss: 'https://accounts.google.com', aud: 'cid', sub: '1', email: 'A@B.co', email_verified: true, exp: Math.floor(Date.now() / 1000) + 600 };
  const opts = { clientId: 'cid', fetchFn };
  assert.deepEqual(await verifyGoogleToken(mk(good), opts), { sub: '1', email: 'a@b.co' });
  await assert.rejects(verifyGoogleToken(mk({ ...good, aud: 'other' }), opts), /audience/);
  await assert.rejects(verifyGoogleToken(mk({ ...good, exp: 1 }), opts), /expired/);
  await assert.rejects(verifyGoogleToken(mk({ ...good, email_verified: false }), opts), /verified/);
  await assert.rejects(verifyGoogleToken(mk({ ...good, iss: 'https://evil.example' }), opts), /issuer/);
  await assert.rejects(verifyGoogleToken(mk(good, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), opts), /signature/);
});
