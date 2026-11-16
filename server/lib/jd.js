// Job description -> structured requirements. Rule-based reading lives in jd-basic.js; this adds the AI pass.

import { canonicalSkill } from './skills.js';
import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { extractBasic } from './jd-basic.js';
export * from './jd-basic.js';

// The AI reads the whole capture and decides title, company and location; page-scraped hints and the rule-based reader
// are only fallbacks. An AI answer is kept only if the captured text actually contains it (no invented companies).
const inText = (v, text) => { const x = String(v || '').trim(); return x.length >= 2 && String(text).toLowerCase().includes(x.toLowerCase()); };

export async function extractJob(text, hints = {}, { context = '' } = {}) {
  const body = String(text || '').slice(0, 14000);
  const head = String(context || '').trim();
  const input = head && !body.includes(head.slice(0, 200)) ? `${head.slice(0, 1500)}\n\n${body}` : body;
  const ai = await askJSON(
    `You extract structured data from a job posting or a LinkedIn hiring post. ${DATA_ONLY_RULE}
Schema: {"title":string,"company":string,"location":string,"mustHave":string[],"niceToHave":string[],"minYears":number|null,"maxYears":number|null,"applyEmail":string,"summary":string}
mustHave/niceToHave are concrete skills, tools, or qualifications (2-4 words each), not sentences. summary is one sentence. Use "" or null when unknown; never guess.
In a hiring post the company is usually the one named in the heading or the first sentence ("Role – Company", "Company is looking for…"), not the person posting. Ignore page chrome such as notifications, menus and buttons.`,
    fence('job_page', input),
  );
  const basic = extractBasic(body, hints);
  if (!ai || !Array.isArray(ai.mustHave)) return basic;

  const norm = (arr) => [...new Set((arr || []).map((s) => canonicalSkill(String(s)) || String(s).trim()).filter(Boolean))].slice(0, 25);
  const must = norm(ai.mustHave);
  const nice = norm(ai.niceToHave).filter((s) => !must.includes(s));
  return {
    title: (inText(ai.title, input) && ai.title.trim()) || hints.title || basic.title,
    company: (inText(ai.company, input) && ai.company.trim()) || hints.company || basic.company,
    location: (inText(ai.location, input) && ai.location.trim()) || hints.location || basic.location || '',
    mustHave: must.length ? must : basic.mustHave,
    niceToHave: nice,
    anyOf: [],
    minYears: ai.minYears ?? basic.minYears,
    maxYears: ai.maxYears ?? basic.maxYears,
    applyEmail: ai.applyEmail || basic.applyEmail,
    summary: ai.summary || '',
    mode: 'ai',
  };
}
