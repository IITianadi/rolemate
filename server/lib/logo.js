import { promises as dns } from 'node:dns';

// When a posting shows no logo, guess the company's website from its name and check that the name exists in DNS.
// Only DNS is queried (no HTTP request is made to the guessed site), so a hostile name cannot make the server call anything.
const LEGAL = /\b(pvt\.?|private|ltd\.?|limited|inc\.?|llc|llp|corp\.?|corporation|co\.?|gmbh|plc|india|technologies|technology|solutions|systems|labs|software|services)\b/gi;
export function domainGuesses(company) {
  const base = String(company || '').toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ');
  const names = [...new Set([base.replace(LEGAL, ' '), base.replace(/\b(pvt\.?|private|ltd\.?|limited|inc\.?|llc|llp|corp\.?|corporation)\b/gi, ' ')]
    .map((n) => n.replace(/[^a-z0-9]+/g, '')).filter((n) => n.length >= 2 && n.length <= 40))];
  const out = [];
  for (const n of names) for (const tld of ['com', 'in', 'io', 'co', 'ai', 'co.in']) out.push(`${n}.${tld}`);
  return out;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export async function findCompanyDomain(company, lookup = (d) => dns.lookup(d)) {
  const guesses = domainGuesses(company);
  for (let i = 0; i < guesses.length; i += 3) {
    const batch = guesses.slice(i, i + 3);
    const res = await Promise.all(batch.map((d) => withTimeout(lookup(d), 2500).then(() => d, () => '')));
    const hit = res.find(Boolean);
    if (hit) return hit;
  }
  return '';
}

export const faviconFor = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
