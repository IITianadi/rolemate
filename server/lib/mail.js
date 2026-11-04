// Transactional email through Resend (plain HTTPS, no extra dependency).
// Env: RESEND_API_KEY, MAIL_FROM (for example "Rolemate <hello@rolemate.in>"). Without a key nothing is sent.
// Sending never blocks or breaks the request that triggered it.
export function createMailer({ apiKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM || 'Rolemate <hello@rolemate.in>', fetchFn = fetch } = {}) {
  return {
    enabled: !!apiKey,
    async send({ to, subject, html, text, sendAt }) {
      if (!apiKey) { console.log(`[mail] not configured, skipped "${subject}"`); return false; }
      try {
        const res = await fetchFn('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, html, text, ...(sendAt ? { scheduled_at: new Date(sendAt).toISOString() } : {}) }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) { console.error('[mail] provider said', res.status); return false; }
        return true;
      } catch (e) { console.error('[mail] failed:', e.message); return false; }
    },
  };
}
