// Tailoring (reordering, confirmed skills) lives in tailor-core.js. This adds the optional AI rewording suggestions.

import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { stripMd, resumePlainText } from './resume-text.js';
import { findSkills } from './skills.js';
import { jobKeywords, relevance, numbersPreserved } from './tailor-core.js';
export * from './tailor-core.js';

// Optional AI: suggest rewordings of existing bullets using the job's wording.
// Returned as suggestions the candidate accepts or rejects; nothing is applied silently.
// Bullets that are the evidence for a weakly supported requirement come first (that is where better wording helps most).
export async function suggestRewrites(resume, job, limit = 6, fit = []) {
  const bullets = [];
  const keywords = jobKeywords(job);
  const target = new Map();
  for (const f of fit) if ((f.status === 'partial' || f.status === 'weak') && f.source?.bulletId && !target.has(f.source.bulletId)) target.set(f.source.bulletId, f.requirement);
  for (const s of resume.sections) {
    if (s.kind !== 'experience' && s.kind !== 'projects') continue;
    for (const it of s.items) for (const b of it.bullets) if (b.style !== 'sub') bullets.push({ itemId: it.id, bulletId: b.id, text: stripMd(b.text), rel: relevance(b.text, keywords) + (target.has(b.id) ? 100 : 0), target: target.get(b.id) || '' });
  }
  const top = bullets.sort((a, b) => b.rel - a.rel).slice(0, limit);
  if (!top.length) return [];
  const res = await askJSON(
    `You help a job seeker reword resume bullets to fit a job description. ${DATA_ONLY_RULE}
Hard rules: keep every fact, number, employer and date exactly as given; never add a skill, tool, metric, scope or responsibility that is not already in the bullet; never raise the level of ownership (do not turn "supported" into "led"); use the job's own wording only where it truthfully describes the same work; keep roughly the same length; if a bullet cannot be improved truthfully, omit it.
Shape: action + scope + skill or method + the outcome the bullet already states. Where a bullet has a "target", it is the requirement the bullet is the closest evidence for: make that connection clearer without claiming more.
Schema: {"suggestions":[{"bulletId":string,"proposed":string,"reason":string}]}`,
    `${fence('job', JSON.stringify({ title: job.title, mustHave: job.mustHave, niceToHave: job.niceToHave }))}\n${fence('bullets', JSON.stringify(top.map((t) => ({ bulletId: t.bulletId, text: t.text, target: t.target || undefined }))))}`,
  );
  if (!res || !Array.isArray(res.suggestions)) return [];
  const byId = new Map(top.map((t) => [t.bulletId, t]));
  const known = new Set(findSkills(resumePlainText(resume)));
  return res.suggestions
    .filter((s) => byId.has(s.bulletId) && typeof s.proposed === 'string' && s.proposed.trim() && s.proposed.trim() !== byId.get(s.bulletId).text)
    .filter((s) => numbersPreserved(byId.get(s.bulletId).text, s.proposed))
    // A rewrite may not bring in a skill the resume never mentions.
    .filter((s) => findSkills(s.proposed).every((k) => known.has(k)))
    .map((s) => ({ ...byId.get(s.bulletId), proposed: s.proposed.trim(), reason: String(s.reason || '').slice(0, 200) }))
    .map(({ itemId, bulletId, text, proposed, reason, target }) => ({ itemId, bulletId, original: text, proposed, reason, requirement: target || '', status: 'pending' }));
}
