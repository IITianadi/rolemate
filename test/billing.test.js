import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.js';
import { verifySignature, PACKS } from '../server/lib/billing.js';

const SECRET = 'whsec_test';
let server; let base; let token; let calls;
const sign = (body) => createHmac('sha256', SECRET).update(body).digest('hex');
const api = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const hook = (event, payId, amount, notes) => {
  const raw = JSON.stringify({ event, payload: { payment: { entity: { id: payId, amount, status: 'captured' } }, payment_link: { entity: { notes } } } });
  return api('/api/billing/webhook', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': sign(raw) } });
};

before(async () => {
  calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ short_url: 'https://rzp.io/i/abc' }) }; };
  const app = createApp({ dbPath: ':memory:', freeLimit: 2, billing: { keyId: 'rzp_test_x', keySecret: 'sec', webhookSecret: SECRET, publicUrl: 'https://app.example', fetchFn } });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const s = (await api('/api/auth/signup', { method: 'POST', body: { email: 'pay@example.com', password: 'password123' } })).data;
  token = s.token;
});
after(() => server.close());

test('signature check accepts the exact signed bytes only', () => {
  const raw = '{"a":1}';
  assert.equal(verifySignature(raw, sign(raw), SECRET), true);
  assert.equal(verifySignature(raw + ' ', sign(raw), SECRET), false);
  assert.equal(verifySignature(raw, '', SECRET), false);
  assert.equal(verifySignature(raw, sign(raw), ''), false);
});

test('checkout returns a payment link carrying the user and pack; unknown packs are refused', async () => {
  assert.equal((await api('/api/billing/checkout', { method: 'POST', body: { packId: 'nope' } })).status, 400);
  const r = await api('/api/billing/checkout', { method: 'POST', body: { packId: 'p100' } });
  assert.equal(r.data.url, 'https://rzp.io/i/abc');
  const sent = JSON.parse(calls.at(-1).init.body);
  assert.deepEqual([sent.amount, sent.currency, sent.notes.pack_id], [49900, 'INR', 'p100']);
  assert.equal(sent.callback_url, 'https://app.example/?paid=1');
  assert.match(calls.at(-1).init.headers.authorization, /^Basic /);
  assert.equal((await api('/api/me')).data.quota.packs.length, PACKS.length);
});

test('webhook: bad signature is rejected; a valid payment adds credits once; wrong amounts add nothing', async () => {
  assert.equal((await api('/api/billing/webhook', { method: 'POST', body: '{"event":"payment_link.paid"}', headers: { 'x-razorpay-signature': 'bad' } })).status, 400);
  const before = (await api('/api/me')).data.quota;
  assert.equal(before.limit, 2);
  const notes = { user_id: '1', pack_id: 'p100' };
  assert.equal((await hook('payment_link.paid', 'pay_1', 100, notes)).status, 200); // underpaid: ignored
  assert.equal((await api('/api/me')).data.quota.limit, 2);
  await hook('payment_link.paid', 'pay_2', 49900, notes);
  await hook('payment.captured', 'pay_2', 49900, notes); // same payment delivered twice
  const q = (await api('/api/me')).data.quota;
  assert.deepEqual([q.limit, q.bought, q.remaining], [102, 100, 102]);
});
