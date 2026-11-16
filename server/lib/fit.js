// Requirement-by-requirement fit. For each requirement of the job: is it on the resume, which line proves it, and if not,
// where could it honestly go. The AI judges meaning ("owned a roadmap" shows "end-to-end ownership"); it points at
// resume lines by id, so the evidence shown is always a real line. Without the AI, a lexical comparison does the same job.
//
// status: strong | partial | weak | missing | unverifiable   (unverifiable = needs the candidate to confirm; never held against them)
// kind:   mandatory | must | nice | responsibility

import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { resumeFacts, lexicalMatch, statusFromLexical } from './evidence.js';
import { estimateYears } from './match.js';
import { deriveLists } from './jd-intel.js';

const STATUS = ['strong', 'partial', 'weak', 'missing', 'unverifiable'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();

// The real places a line could go: "Experience › Product Analyst, Acme", "Skills", "Summary".
export function resumeOutline(resume) {
  const places = [];
  for (const s of resume.sections || []) {
    places.push(s.heading);
    if (s.kind === 'experience' || s.kind === 'projects') for (const it of s.items || []) if (it.title) places.push(`${s.heading} › ${[it.title, it.subtitle].filter(Boolean).join(', ')}`.slice(0, 100));
  }
  return places;
}

// The classified list for a job, also for jobs saved before classification existed.
export function jobItems(job) {
  if (Array.isArray(job.items) && job.items.length) return job.items;
  return [
    ...(job.minYears != null ? [{ name: `${job.minYears}${job.maxYears ? `–${job.maxYears}` : '+'} years of experience`, category: 'mandatory', importance: 5, evidence: '', explicit: true, confidence: 0.6 }] : []),
    ...(job.mustHave || []).map((name) => ({ name, category: 'must', importance: 4, evidence: '', explicit: true, confidence: 0.6 })),
    ...(job.niceToHave || []).map((name) => ({ name, category: 'nice', importance: 2, evidence: '', explicit: true, confidence: 0.6 })),
  ];
}
export { deriveLists };

const isYears = (r) => /years? of experience/i.test(r.name);
const isEducation = (r) => /educational qualification/i.test(r.name);

function advise(r, status, outline, facts) {
  if (status === 'strong' || status === 'unverifiable') return { where: '', advice: '' };
  const skills = (facts.facts.find((f) => f.kind === 'skills') || {}).where;
  const exp = outline.find((p) => p.includes('›') && /experience|work|intern|employment/i.test(p)) || outline.find((p) => /experience|work/i.test(p)) || '';
  const skillish = /^[\w+#./& -]{1,24}$/.test(r.name) && r.category !== 'responsibility';
  const where = (skillish && skills) || exp || skills || '';
  const lead = status === 'partial' || status === 'weak' ? `Your resume only partly shows “${r.name}”. ` : '';
  const advice = skillish && skills
    ? `${lead}If you have used ${r.name}, add it under ${skills}, and show it once in a bullet.`
    : `${lead}If you have done this, add a bullet showing what you did and the result${where ? ` under ${where}` : ''}.`;
  return { where, advice };
}

function shape(r, status, fact, exact, extra = {}) {
  return {
    requirement: r.name, kind: r.category, importance: r.importance ?? 3, explicit: r.explicit !== false, confidence: r.confidence ?? 0.7,
    need: r.evidence || '', status, exact: !!exact,
    evidence: fact ? fact.plain.slice(0, 220) : '', metric: !!fact?.metric, source: fact ? { where: fact.where, itemId: fact.itemId, bulletId: fact.bulletId || '' } : null,
    where: '', advice: '', ...extra,
  };
}

// Deterministic reading of one requirement (years and education are facts, everything else is wording).
function readOne(r, facts, years, confirmed) {
  if (confirmed.has(norm(r.name))) return shape(r, 'strong', null, true, { evidence: 'You confirmed you have this.' });
  if (isYears(r)) {
    const min = Number((r.name.match(/\d+/) || [0])[0]);
    if (years == null) return shape(r, 'unverifiable', null, false, { advice: 'We could not read the dates on your resume. Check that each role has a start and end date.' });
    return shape(r, years >= min ? 'strong' : years >= min * 0.7 ? 'partial' : 'missing', null, false, { evidence: `About ${Math.round(years * 10) / 10} years of experience from your dated roles.` });
  }
  if (isEducation(r)) {
    const edu = facts.facts.filter((f) => /educat|academic|qualification/i.test(f.section));
    const m = lexicalMatch(r.need || r.name, edu);
    return m.fact && m.score >= 0.34 ? shape(r, m.score >= 0.6 ? 'strong' : 'partial', m.fact, false) : shape(r, 'unverifiable', null, false, { advice: 'Check the education line on your resume against what the job asks.' });
  }
  const m = lexicalMatch(r.name, facts.facts);
  return shape(r, statusFromLexical(m.score), m.score >= 0.34 ? m.fact : null, m.exact);
}

export async function analyzeFit(resume, job, { confirmedSkills = [], yearsExperience = null } = {}) {
  const items = jobItems(job).slice(0, 40);
  if (!items.length) return [];
  const facts = resumeFacts(resume);
  const years = yearsExperience ?? estimateYears(resume);
  const confirmed = new Set(confirmedSkills.map(norm));
  const outline = resumeOutline(resume);
  const base = items.map((r) => readOne(r, facts, years, confirmed));

  // The AI refines the wording-based items (everything except the facts above).
  const askable = base.map((b, i) => ({ b, r: items[i] })).filter(({ b, r }) => !isYears(r) && !isEducation(r) && !confirmed.has(norm(r.name)));
  let ai = null;
  if (askable.length) {
    ai = await askJSON(
      `You compare a candidate's resume with the requirements of a job. ${DATA_ONLY_RULE}
The resume is a list of lines with ids. For EACH requirement decide the status:
- "strong": a line clearly shows it, even in different words.
- "partial": related experience, but not the same thing.
- "weak": only a faint or indirect hint.
- "missing": nothing on the resume supports it.
Do not stretch: "improved organic traffic through SEO pages" relates to "user acquisition" (partial) but does not prove it. Never treat a skill as shown just because it sounds adjacent.
- lineIds: the ids of up to 2 resume lines that support it (only ids from the list; [] when missing).
- where: for partial/weak/missing, the best place to add it, chosen EXACTLY from the places list ("" if none fits).
- advice: for partial/weak/missing, one or two plain sentences starting "If you have…" saying what to add and how. Never claim the candidate has it. A short example line may use [brackets] for details only they know. Never invent numbers, employers, tools or results.
Schema: {"items":[{"requirement":string,"status":"strong"|"partial"|"weak"|"missing","lineIds":string[],"where":string,"advice":string}]}
One item per requirement, requirement text unchanged.`,
      `${fence('requirements', JSON.stringify(askable.map(({ r }) => ({ requirement: r.name, category: r.category, jdSays: r.evidence }))))}\n${fence('places', JSON.stringify(outline))}\n${fence('resume_lines', JSON.stringify(facts.facts.slice(0, 220).map((f) => ({ id: f.id, where: f.where, text: f.plain.slice(0, 260) }))))}`,
      { maxTokens: 5000 },
    );
  }
  const byReq = new Map((ai?.items || []).map((i) => [norm(i?.requirement), i]));
  return base.map((b, idx) => {
    const r = items[idx];
    const a = byReq.get(norm(r.name));
    let out = b;
    if (a && STATUS.includes(a.status) && a.status !== 'unverifiable') {
      const ids = (Array.isArray(a.lineIds) ? a.lineIds : []).filter((id) => facts.byId.has(id));
      let status = a.status;
      // Evidence must be a real line. Without one, the AI cannot say anything stronger than weak; the lexical read can lift it.
      if ((status === 'strong' || status === 'partial') && !ids.length) status = b.status === 'strong' ? 'strong' : 'weak';
      const fact = ids.length ? facts.byId.get(ids[0]) : (b.source ? facts.facts.find((f) => f.itemId === b.source.itemId && f.plain === b.evidence) : null);
      out = shape(r, status, fact || null, b.exact, { where: outline.includes(a.where) ? a.where : '', advice: String(a.advice || '').trim().slice(0, 400) });
      if (b.exact && (status === 'missing' || status === 'weak')) out = { ...b };
    }
    if (out.status !== 'strong' && out.status !== 'unverifiable') {
      const g = advise(r, out.status, outline, facts);
      out.where = out.where || g.where; out.advice = out.advice || g.advice;
    }
    if (out.status === 'unverifiable' && !out.advice) out.advice = 'We could not confirm this from the resume. Check it yourself before you apply.';
    return out;
  });
}
