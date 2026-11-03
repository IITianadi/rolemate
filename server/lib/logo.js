// Company logo lookup through Brandfetch. Two steps: Brand Search turns the company NAME into its website, then the Logo
// link for that website is stored. Search results are used only when the brand name matches the company closely, because
// a wrong logo is worse than none. The client ID is read from the BRANDFETCH_CLIENT_ID environment variable.
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and')
  .replace(/\b(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|plc|gmbh|india|technologies|technology|solutions|software|services|systems|labs)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '');

export function sameBrand(company, brand) {
  const a = norm(company); const b = norm(brand);
  if (!a || !b) return false;
  return a === b; // exact after dropping legal words: "Razor" is never accepted for "Razorpay"
}

const okDomain = (d) => /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(d);
export const logoUrl = (domain, clientId) => `https://cdn.brandfetch.io/${encodeURIComponent(domain)}?c=${encodeURIComponent(clientId)}`;

export async function findCompanyLogo(company, { clientId = process.env.BRANDFETCH_CLIENT_ID, fetchFn = fetch } = {}) {
  const name = String(company || '').trim().slice(0, 80);
  if (!clientId || name.length < 2) return '';
  try {
    const res = await fetchFn(`https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}?c=${encodeURIComponent(clientId)}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return '';
    const list = await res.json();
    if (!Array.isArray(list)) return '';
    const hit = list.find((b) => b && okDomain(String(b.domain || '').toLowerCase()) && sameBrand(name, b.name));
    return hit ? logoUrl(String(hit.domain).toLowerCase(), clientId) : '';
  } catch { return ''; }
}
