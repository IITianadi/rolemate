// Requirement-by-requirement fit: what the job wants, what the resume already shows (with the line that proves it),
// what is missing, and where in the resume it could honestly go. The AI judges meaning ("owned a roadmap" covers
// "end-to-end ownership"); every quote it gives must really appear in the resume or it is dropped.

import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { resumePlainText, stripMd } from './resume-text.js';

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

const SKILL_LIKE = /^[\w+#./& -]{1,24}$/;
// Without AI: coverage comes from the keyword match, and the advice is generic but still names a real place.
function basicFit(resume, job, match) {
  const places = resumeOutline(resume);
  const skillsPlace = (resume.sections || []).find((s) => s.kind === 'skills')?.heading;
  const expPlace = places.find((p) => p.includes('›') && /experience|work|intern/i.test(p)) || (resume.sections || []).find((s) => s.kind === 'experience')?.heading || '';
  const mk = (req, kind, covered) => ({
    requirement: req, kind, status: covered ? 'have' : 'missing', evidence: '', where: covered ? '' : (SKILL_LIKE.test(req) && skillsPlace) || expPlace || skillsPlace || '',
    advice: covered ? '' : (SKILL_LIKE.test(req) && skillsPlace ? `If you know ${req}, add it under ${skillsPlace}.` : `If you have done this, add a bullet showing it${expPlace ? ` under ${expPlace}` : ''}.`),
  });
  return [
    ...(job.mustHave || []).map((r) => mk(r, 'must', (match.matchedMust || []).includes(r))),
    ...(job.niceToHave || []).map((r) => mk(r, 'nice', (match.matchedNice || []).includes(r))),
  ];
}

export async function analyzeFit(resume, job, match = {}, confirmedSkills = []) {
  const reqs = [...(job.mustHave || []).map((r) => ({ r, kind: 'must' })), ...(job.niceToHave || []).map((r) => ({ r, kind: 'nice' }))].slice(0, 30);
  if (!reqs.length) return [];
  const text = resumePlainText(resume);
  const places = resumeOutline(resume);
  const ai = await askJSON(
    `You compare a candidate's resume with the requirements of a job. ${DATA_ONLY_RULE}
For EACH requirement decide: "have" (the resume clearly shows it, even in different words), "partial" (related experience but not the same thing), or "missing".
- evidence: for have/partial, ONE short quote copied exactly from the resume (max 160 chars) that proves it. "" if missing.
- where: for partial/missing, the single best place to add it, chosen EXACTLY from the places list ("" if nowhere fits).
- advice: for partial/missing, one or two plain sentences: what to add and how, starting with "If you have…" (never claim the candidate has it). Where useful, give a short example line with [brackets] for details only the candidate knows. Never invent numbers, employers, tools or results.
Schema: {"items":[{"requirement":string,"status":"have"|"partial"|"missing","evidence":string,"where":string,"advice":string}]}
Return one item per requirement, in the order given, with the requirement text unchanged.`,
    `${fence('requirements', JSON.stringify(reqs.map((x) => ({ requirement: x.r, kind: x.kind }))))}\n${fence('places', JSON.stringify(places))}\n${fence('resume', text.slice(0, 12000))}`,
    { maxTokens: 4000 },
  );
  if (!ai || !Array.isArray(ai.items)) return basicFit(resume, job, match);
  const hay = norm(stripMd(text));
  const byReq = new Map(ai.items.map((i) => [norm(i?.requirement), i]));
  const confirmed = new Set(confirmedSkills.map(norm));
  return reqs.map(({ r, kind }) => {
    const i = byReq.get(norm(r)) || {};
    let status = ['have', 'partial', 'missing'].includes(i.status) ? i.status : 'missing';
    let evidence = String(i.evidence || '').trim().slice(0, 200);
    if (confirmed.has(norm(r))) return { requirement: r, kind, status: 'have', evidence: 'You confirmed you have this.', where: '', advice: '' };
    if (status !== 'missing' && !(evidence && hay.includes(norm(evidence)))) { status = status === 'have' && (match.matchedMust || []).concat(match.matchedNice || []).includes(r) ? 'have' : 'partial'; evidence = ''; }
    const where = places.includes(i.where) ? i.where : '';
    return { requirement: r, kind, status, evidence, where: status === 'have' ? '' : where, advice: status === 'have' ? '' : String(i.advice || '').trim().slice(0, 400) };
  });
}
