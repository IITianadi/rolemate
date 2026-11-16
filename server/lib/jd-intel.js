// Job description intelligence: classified requirements (mandatory / must-have / good-to-have / responsibility), each with
// the JD's own words as evidence, whether it was stated or inferred, and a confidence. Validated against the real text.

export const CATEGORIES = ['mandatory', 'must', 'nice', 'responsibility'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
const clamp = (n, lo, hi, d) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const str = (v, n = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export const SENIORITY = ['intern', 'junior', 'mid', 'senior', 'lead', 'executive'];

export function normalizeMeta(m = {}) {
  const seniority = String(m.seniority || '').toLowerCase();
  return {
    department: str(m.department, 80), industry: str(m.industry, 80), education: str(m.education, 160), workAuth: str(m.workAuth, 160),
    seniority: SENIORITY.includes(seniority) ? seniority : '', experienceRange: str(m.experienceRange, 40),
  };
}

// Validates the AI's list: unknown categories become "must" (never silently "mandatory"), evidence must be in the JD.
export function normalizeRequirements(list, text) {
  const hay = norm(text);
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    const name = str(r?.name, 90);
    if (name.length < 2 || seen.has(norm(name))) continue;
    seen.add(norm(name));
    const category = CATEGORIES.includes(r?.category) ? r.category : 'must';
    let evidence = str(r?.evidence, 240);
    const found = evidence && hay.includes(norm(evidence));
    if (!found) evidence = '';
    const explicit = r?.explicit !== false && !!found;
    let confidence = clamp(r?.confidence, 0, 1, explicit ? 0.8 : 0.5);
    if (!found) confidence = Math.min(confidence, 0.5);
    // A mandatory label needs the JD's own words behind it; otherwise it is only a must-have.
    out.push({ name, category: category === 'mandatory' && !found ? 'must' : category, importance: clamp(r?.importance, 1, 5, category === 'mandatory' ? 5 : category === 'must' ? 4 : category === 'nice' ? 2 : 3), evidence, explicit, confidence: Math.round(confidence * 100) / 100 });
  }
  return out.slice(0, 40);
}

const EDU = /^.*\b(b\.?\s?tech|b\.?e\.?|bachelor'?s?|master'?s?|m\.?\s?tech|mba|pgdm|graduate|degree|b\.?sc|m\.?sc|phd)\b.*$/im;
const STRICT = /\b(must|required|mandatory|should have|need to have|minimum)\b/i;

// Without the AI: classify from what the rules found. Years and education lines are mandatory only when the JD says so.
export function basicRequirements(reqs, text) {
  const out = [];
  const body = String(text || '');
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (reqs.minYears != null) {
    const line = lines.find((l) => /\d\s*(?:\+|-|–|to)?\s*\d*\s*\+?\s*(years?|yrs?)/i.test(l)) || '';
    out.push({ name: `${reqs.minYears}${reqs.maxYears ? `–${reqs.maxYears}` : '+'} years of experience`, category: 'mandatory', importance: 5, evidence: line.slice(0, 240), explicit: !!line, confidence: line ? 0.85 : 0.5 });
  }
  const edu = lines.find((l) => EDU.test(l) && l.length < 200);
  if (edu && STRICT.test(edu)) out.push({ name: 'Educational qualification', category: 'mandatory', importance: 4, evidence: edu.slice(0, 240), explicit: true, confidence: 0.7 });
  for (const s of reqs.mustHave || []) out.push({ name: s, category: 'must', importance: 4, evidence: lines.find((l) => norm(l).includes(norm(s)))?.slice(0, 240) || '', explicit: true, confidence: 0.7 });
  for (const s of reqs.niceToHave || []) out.push({ name: s, category: 'nice', importance: 2, evidence: lines.find((l) => norm(l).includes(norm(s)))?.slice(0, 240) || '', explicit: true, confidence: 0.7 });
  return out;
}

const skillLike = (r) => r.category !== 'responsibility' && !/years of experience|educational qualification/i.test(r.name);
// The flat lists the rest of the app already uses.
export const deriveLists = (items) => ({
  mustHave: items.filter((r) => (r.category === 'must' || r.category === 'mandatory') && skillLike(r)).map((r) => r.name),
  niceToHave: items.filter((r) => r.category === 'nice').map((r) => r.name),
});

// The AI may leave the years requirement out of its list; it is still checked.
export function ensureYears(items, reqs, text) {
  if (reqs.minYears == null || items.some((r) => /years? of experience|\byrs?\b/i.test(r.name))) return items;
  return [...basicRequirements({ minYears: reqs.minYears, maxYears: reqs.maxYears }, text).filter((r) => /years/.test(r.name)), ...items];
}
