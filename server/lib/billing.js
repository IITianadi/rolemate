import { createHmac, timingSafeEqual } from 'node:crypto';

// Credit packs. 1 credit = 1 job (saving it, tailoring, interview prep and Ask AI for that job). Prices are in paise.
// The server alone decides how many credits a payment is worth: it checks the amount that was actually paid.
export const PACKS = [
  { id: 'p30', credits: 30, amount: 19900, label: '30 credits' },
  { id: 'p100', credits: 100, amount: 49900, label: '100 credits', best: true },
  { id: 'p300', credits: 300, amount: 129900, label: '300 credits' },
];
export const packById = (id) => PACKS.find((p) => p.id === id) || null;
export const publicPacks = () => PACKS.map(({ id, credits, amount, label, best }) => ({ id, credits, price: amount / 100, label, best: !!best }));

export function billingConfig(o = {}) {
  return {
    keyId: o.keyId ?? process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: o.keySecret ?? process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: o.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    publicUrl: (o.publicUrl ?? process.env.PUBLIC_URL ?? 'https://app.rolemate.in').replace(/\/$/, ''),
    fetchFn: o.fetchFn ?? fetch,
  };
}
export const billingEnabled = (c) => !!(c.keyId && c.keySecret && c.webhookSecret);

// Razorpay signs the exact bytes it sends with HMAC-SHA256 using the webhook secret.
export function verifySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const want = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(want); const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createPaymentLink(c, { userId, email, pack }) {
  const res = await c.fetchFn('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64')}` },
    body: JSON.stringify({
      amount: pack.amount, currency: 'INR', accept_partial: false,
      description: `Rolemate ${pack.label}`, reference_id: `u${userId}-${pack.id}-${Date.now()}`,
      customer: { email }, notify: { email: false, sms: false }, reminder_enable: false,
      callback_url: `${c.publicUrl}/?paid=1`, callback_method: 'get',
      notes: { user_id: String(userId), pack_id: pack.id },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.short_url) throw new Error(`Payment link failed (${res.status})`);
  return data.short_url;
}
