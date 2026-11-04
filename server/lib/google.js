// Verifies a Google Sign-In ID token (a signed JWT) without any dependency.
// Checks: RS256 signature against Google's published keys, issuer, audience (our client id), expiry, verified email.
import { createPublicKey, createVerify } from 'node:crypto';

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { keys: null, at: 0 };

async function googleKeys(fetchFn) {
  if (cache.keys && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await fetchFn(CERTS, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('Could not load Google keys');
  cache = { keys: (await res.json()).keys || [], at: Date.now() };
  return cache.keys;
}

const b64 = (s) => Buffer.from(s, 'base64url');

export async function verifyGoogleToken(idToken, { clientId = process.env.GOOGLE_CLIENT_ID, fetchFn = fetch, now = Date.now() } = {}) {
  if (!clientId) throw new Error('not configured');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const header = JSON.parse(b64(parts[0]).toString());
  const claims = JSON.parse(b64(parts[1]).toString());
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const jwk = (await googleKeys(fetchFn)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), b64(parts[2]));
  if (!ok) throw new Error('bad signature');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('bad issuer');
  if (claims.aud !== clientId) throw new Error('bad audience');
  if (!claims.exp || claims.exp * 1000 < now) throw new Error('expired');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('email not verified');
  if (!claims.sub || !claims.email) throw new Error('missing claims');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase() };
}
