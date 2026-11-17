// Tailoring (reordering, confirmed skills) lives in tailor-core.js. This adds the optional AI rewording suggestions.

import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { stripMd, resumePlainText } from './resume-text.js';
import { findSkills } from './skills.js';
import { jobKeywords, relevance, numbersPreserved } from './tailor-core.js';
export * from './tailor-core.js';

// Optional AI: suggest rewordings of existing bullets using the job's wording.
// Returned as suggestions the candidate accepts or rejects; nothing is applied silently.
export async function suggestRewrites(resume, job, limit = 6) {
  const bullets = [];
  const keywords = jobKeywords(job);
  for (const s of resume.sections) {
    if (s.kind !== 'experience' && s.kind !== 'projects') continue;
    for (const it of s.items) for (const b of it.bullets) if (b.style !== 'sub') bullets.push({ itemId: it.id, bulletId: b.id, text: stripMd(b.text), rel: relevance(b.text, keywords) });
  }
  const top = bullets.sort((a, b) => b.rel - a.rel).slice(0, limit);
  if (!top.length) return [];
  const res = await askJSON(
    `You help a job seeker reword resume bullets to fit a job description. ${DATA_ONLY_RULE}
Hard rules: keep every fact, number, employer and date exactly as given; never add a skill, tool, metric or responsibility that is not already in the bullet; use the job's own wording only where it truthfully describes the same work; keep roughly the same length; if a bullet cannot be improved truthfully, omit it.
Schema: {"suggestions":[{"bulletId":string,"proposed":string,"reason":string}]}`,
    `${fence('job', JSON.stringify({ title: job.title, mustHave: job.mustHave, niceToHave: job.niceToHave }))}\n${fence('bullets', JSON.stringify(top.map((t) => ({ bulletId: t.bulletId, text: t.text }))))}`,
  );
  if (!res || !Array.isArray(res.suggestions)) return [];
  const byId = new Map(top.map((t) => [t.bulletId, t]));
  const known = new Set(findSkills(resumePlainText(resume)));
  return res.suggestions
    .filter((s) => byId.has(s.bulletId) && typeof s.proposed === 'string' && s.proposed.trim() && s.proposed.trim() !== byId.get(s.bulletId).text)
    .filter((s) => numbersPreserved(byId.get(s.bulletId).text, s.proposed))
    // A rewrite may not bring in a skill the resume never mentions.
    .filter((s) => findSkills(s.proposed).every((k) => known.has(k)))
    .map((s) => ({ ...byId.get(s.bulletId), proposed: s.proposed.trim(), reason: String(s.reason || '').slice(0, 200), status: 'pending' }))
    .map(({ itemId, bulletId, text, proposed, reason, status }) => ({ itemId, bulletId, original: text, proposed, reason, status }));
}


// ---------- Tailored resume, finished: the job's own words, a summary aimed at the job, key terms highlighted.
// Everything here only rephrases facts already in the resume (numbers and tools are checked), so no approval step is needed.

const nums = (t) => (String(t).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, '').replace(/,/g, ''));

// Rewords the most relevant bullets with the job's terms, and applies them. Returns the applied rewrites (for the editor's list).
export async function rewordForJob(resume, job, limit = 8) {
  const sugs = await suggestRewrites(resume, job, limit);
  const kw = jobKeywords(job);
  const applied = [];
  for (const sg of sugs) {
    if (sg.proposed.length > sg.original.length * 1.2 + 10) continue; // must not grow the page
    if (relevance(sg.proposed, kw) <= relevance(sg.original, kw)) continue; // only worth it if it picks up a job term
    let done = false;
    for (const sec of resume.sections) for (const it of sec.items) for (const b of it.bullets || []) if (b.id === sg.bulletId && stripMd(b.text) === sg.original) { b.text = sg.proposed; done = true; }
    if (done) applied.push({ ...sg, status: 'accepted' });
  }
  return applied;
}

// A short summary that leads with who the candidate really is, then the strengths that match this job.
export async function tailorSummary(resume, job) {
  const sec = resume.sections.find((s) => s.kind === 'summary');
  const item = sec?.items?.[0];
  if (!item?.text) return null;
  const kw = jobKeywords(job);
  const lines = [];
  for (const s of resume.sections) if (s.kind === 'experience' || s.kind === 'projects') for (const it of s.items) for (const b of it.bullets || []) lines.push({ text: stripMd(b.text), rel: relevance(b.text, kw) });
  const top = lines.sort((a, b) => b.rel - a.rel).slice(0, 8).map((l) => l.text);
  const res = await askJSON(
    `You rewrite the professional summary of a resume so it speaks to one job. ${DATA_ONLY_RULE}
Rules: use only facts that appear in the resume text given (roles, years, tools, results). Open with who the candidate actually is (their real title and years from the resume), then the 2 or 3 strengths that best match the job's must-haves, in the job's own words where the resume shows the same thing. Do not claim the job's title unless the resume shows it. Do not add any skill, number, employer or claim that is not in the resume. No first person, no buzzwords. At most ${Math.max(180, Math.round(item.text.length * 1.15))} characters, one paragraph.
Schema: {"summary":string}`,
    `${fence('job', JSON.stringify({ title: job.title, mustHave: job.mustHave, niceToHave: job.niceToHave }))}\n${fence('current_summary', stripMd(item.text))}\n${fence('resume_lines', JSON.stringify(top))}`,
  );
  const next = String(res?.summary || '').replace(/\s+/g, ' ').trim();
  const limit = Math.max(180, Math.round(item.text.length * 1.15));
  if (!next || next.length > limit || next === stripMd(item.text)) return null;
  const plain = resumePlainText(resume);
  const have = new Set(nums(plain));
  if (nums(next).some((n) => !have.has(n))) return null; // an invented or changed number
  const known = new Set(findSkills(plain));
  if (findSkills(next).some((k) => !known.has(k))) return null; // a skill the resume never mentions
  item.text = next;
  return next;
}

// Bold the job's most important terms where they already appear (once each, at most `max` in all), so a reader sees the match.
export function highlightKeywords(resume, job, max = 8) {
  const MD = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  const targets = [];
  for (const s of resume.sections) {
    if (s.kind === 'summary') for (const it of s.items) targets.push(it);
    if (s.kind === 'experience' || s.kind === 'projects') for (const it of s.items) for (const b of it.bullets || []) if (b.style !== 'sub') targets.push(b);
  }
  const done = [];
  for (const k of (job.mustHave || []).slice(0, 16)) {
    if (done.length >= max) break;
    const re = new RegExp(`(^|[^\\w+#])(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w+#])`, 'i');
    for (const t of targets) {
      if (!t.text) continue;
      const spans = [...t.text.matchAll(MD)].map((m) => [m.index, m.index + m[0].length]);
      const m = re.exec(t.text);
      if (!m) continue;
      const at = m.index + m[1].length;
      if (spans.some(([a, b]) => at >= a && at < b)) continue;
      t.text = `${t.text.slice(0, at)}**${m[2]}**${t.text.slice(at + m[2].length)}`;
      done.push(k); break;
    }
  }
  return done;
}
