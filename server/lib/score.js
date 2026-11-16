// Match score from the requirement-by-requirement reading. Pure and deterministic: the AI decides what each line of the
// resume shows (fit.js); the arithmetic here is fixed, explained, and its weights can be changed.
// The weights are a starting heuristic, not an industry-standard ATS formula.

import { resumeFacts, tokens } from './evidence.js';
import { resumePlainText } from './resume-text.js';

export const DEFAULT_WEIGHTS = { mandatory: 20, mustHave: 20, semantic: 15, experience: 15, keyword: 10, achievements: 10, domain: 10 };
export function weightsFromEnv(env = process.env) {
  try { const w = JSON.parse(env.MATCH_WEIGHTS || '{}'); return { ...DEFAULT_WEIGHTS, ...Object.fromEntries(Object.entries(w).filter(([k, v]) => k in DEFAULT_WEIGHTS && Number.isFinite(v) && v >= 0)) }; } catch { return { ...DEFAULT_WEIGHTS }; }
}

const CREDIT = { strong: 1, partial: 0.6, weak: 0.25, missing: 0 };
const credit = (i) => CREDIT[i.status];
const counted = (list) => list.filter((i) => i.status !== 'unverifiable');
const avg = (list, f = credit) => { const w = list.reduce((a, i) => a + (i.importance || 3), 0); return w ? list.reduce((a, i) => a + f(i) * (i.importance || 3), 0) / w : null; };
const SENIOR_YEARS = { intern: [0, 1], junior: [0, 3], mid: [2, 6], senior: [5, 12], lead: [7, 40], executive: [10, 60] };

export function scoreV2(items, { resume, meta = {}, years = null, weights = DEFAULT_WEIGHTS } = {}) {
  const facts = resumeFacts(resume);
  const text = resumePlainText(resume);
  const mand = items.filter((i) => i.kind === 'mandatory');
  const must = items.filter((i) => i.kind === 'must');
  const resp = items.filter((i) => i.kind === 'responsibility');
  const wording = items.filter((i) => i.kind !== 'responsibility' && !/years? of experience|educational qualification/i.test(i.requirement));
  const dims = [];
  const dim = (key, label, ratio, detail, explain) => { if (ratio != null) dims.push({ key, label, ratio: Math.max(0, Math.min(1, ratio)), detail, explain, weight: weights[key] ?? 0 }); };
  const covered = (l) => counted(l).filter((i) => i.status === 'strong' || i.status === 'partial').length;

  dim('mandatory', 'Mandatory requirements', avg(counted(mand)), `${covered(mand)} of ${counted(mand).length} covered`,
    'The non-negotiables the posting states (minimum experience, required degree or certification). Strong evidence counts in full, partial evidence at 60%. Anything we could not verify is left out and flagged, never held against you.');
  dim('mustHave', 'Must-have skills', avg(counted(must)), `${covered(must)} of ${counted(must).length} covered`,
    'The core skills and competencies the role needs, weighted by how important the posting makes each one.');
  dim('semantic', 'Meaning match', avg(counted(items)), `${counted(items).filter((i) => i.status !== 'missing').length} of ${counted(items).length} requirements have related evidence`,
    'Whether your experience shows each requirement even in different words. Related experience counts as partial, not as having the skill.');

  // Experience: responsibilities, years, seniority.
  const parts = [];
  const rr = avg(counted(resp)); if (rr != null) parts.push(rr);
  const yr = items.find((i) => /years? of experience/i.test(i.requirement) && i.status !== 'unverifiable'); if (yr) parts.push(credit(yr));
  if (meta.seniority && years != null && SENIOR_YEARS[meta.seniority]) { const [lo, hi] = SENIOR_YEARS[meta.seniority]; parts.push(years >= lo ? (years <= hi + 4 ? 1 : 0.7) : Math.max(0, years / lo)); }
  dim('experience', 'Experience and responsibilities', parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
    [resp.length ? `${covered(resp)} of ${counted(resp).length} responsibilities` : '', yr ? 'years of experience' : '', meta.seniority ? `${meta.seniority} level` : ''].filter(Boolean).join(', '),
    'How closely your past work matches what you would do in this role: the responsibilities listed, the years asked for, and the seniority of the role.');

  const kw = wording;
  dim('keyword', 'Keywords', kw.length ? kw.filter((i) => i.exact).length / kw.length : null, `${kw.filter((i) => i.exact).length} of ${kw.length} keywords appear word for word`,
    'Exact words from the posting that appear on your resume. A plain count: ATS software often searches for exactly these.');

  // Achievements: matched evidence that carries numbers, plus how much of the resume is quantified at all.
  const evid = items.filter((i) => (i.status === 'strong' || i.status === 'partial') && i.source?.bulletId);
  const metricLine = (i) => facts.facts.find((f) => f.bulletId === i.source.bulletId)?.metric;
  const quantified = facts.facts.filter((f) => f.bulletId && f.metric).length;
  const bullets = facts.facts.filter((f) => f.bulletId).length;
  if (bullets) {
    const share = evid.length ? evid.filter(metricLine).length / evid.length : null;
    const spread = Math.min(1, quantified / Math.max(3, Math.min(8, bullets)));
    dim('achievements', 'Achievements and impact', share == null ? spread : (share + spread) / 2, `${quantified} of ${bullets} bullets show a number`,
      'Whether the lines that prove each requirement show a measurable result, and how much of your resume is quantified overall.');
  }

  // Domain: the industry/domain the posting names against your history.
  const dom = tokens(`${meta.industry || ''} ${meta.department || ''}`);
  if (dom.length) { const hay = new Set(tokens(text)); const hit = dom.filter((t) => hay.has(t)).length; dim('domain', 'Domain relevance', Math.min(1, hit / Math.min(dom.length, 2)), hit ? `${meta.industry || meta.department} appears in your history` : `No ${meta.industry || meta.department} experience found`, 'Whether your history is in the same industry or function as the role.'); }

  const total = dims.reduce((a, d) => a + d.weight, 0);
  const score = total ? Math.round(dims.reduce((a, d) => a + d.weight * d.ratio, 0) / total * 100) : null;
  const mandatory = {
    total: mand.length, covered: covered(mand),
    missing: mand.filter((i) => i.status === 'missing' || i.status === 'weak').map((i) => ({ requirement: i.requirement, status: i.status, explicit: i.explicit })),
    unverified: mand.filter((i) => i.status === 'unverifiable').map((i) => i.requirement),
    inferred: mand.filter((i) => !i.explicit).map((i) => i.requirement),
  };
  // A failed, explicitly stated mandatory requirement can never read as a strong match, whatever the average says.
  const failed = mandatory.missing.some((m) => m.explicit && m.status === 'missing');
  let band = score == null ? 'unknown' : score >= 75 ? 'strong' : score >= 50 ? 'partial' : 'weak';
  if (failed && band === 'strong') band = 'partial';
  return {
    score, band, mandatoryFailed: failed, mandatory,
    dimensions: dims.map((d) => ({ key: d.key, label: d.label, detail: d.detail, explain: d.explain, weight: Math.round(d.weight / total * 100), points: Math.round(d.weight * d.ratio / total * 100), ratio: Math.round(d.ratio * 100) })),
  };
}
