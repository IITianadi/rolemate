// Job description -> structured requirements. Rule-based reading lives in jd-basic.js; this adds the AI pass.

import { canonicalSkill } from './skills.js';
import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { extractBasic } from './jd-basic.js';
import { normalizeMeta, normalizeRequirements, basicRequirements, deriveLists, ensureYears } from './jd-intel.js';
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
Schema: {"title":string,"company":string,"location":string,"minYears":number|null,"maxYears":number|null,"applyEmail":string,"summary":string,
"meta":{"department":string,"industry":string,"seniority":"intern"|"junior"|"mid"|"senior"|"lead"|"executive"|"","education":string,"workAuth":string,"experienceRange":string},
"requirements":[{"name":string,"category":"mandatory"|"must"|"nice"|"responsibility","importance":1-5,"evidence":string,"explicit":boolean,"confidence":0-1}]}
Categories: "mandatory" = non-negotiable and the JD says so (minimum years, required degree/certification/work authorisation, "must have"); "must" = core skills and competencies the role clearly needs; "nice" = preferred / good to have / bonus; "responsibility" = what the person will do or own.
Do NOT treat every skill as mandatory. name is a short noun phrase (2-5 words), not a sentence. evidence is a short quote copied exactly from the posting. explicit is false when you inferred it. Use "" or null when unknown; never guess.`,
    fence('job_page', input),
  );
  const basic = extractBasic(body, hints);
  if (!ai || !(Array.isArray(ai.requirements) || Array.isArray(ai.mustHave))) return { ...basic, items: basicRequirements(basic, body), meta: normalizeMeta() };

  const norm = (arr) => [...new Set((arr || []).map((s) => canonicalSkill(String(s)) || String(s).trim()).filter(Boolean))].slice(0, 25);
  // Classified requirements (new shape); older answers with plain lists are still understood.
  let items = normalizeRequirements(ai.requirements, input);
  if (!items.length) items = basicRequirements({ ...basic, mustHave: norm(ai.mustHave), niceToHave: norm(ai.niceToHave), minYears: ai.minYears ?? basic.minYears, maxYears: ai.maxYears ?? basic.maxYears }, body);
  items = ensureYears(items.map((r) => ({ ...r, name: canonicalSkill(r.name) || r.name })), { minYears: ai.minYears ?? basic.minYears, maxYears: ai.maxYears ?? basic.maxYears }, body);
  const lists = deriveLists(items);
  const must = norm(lists.mustHave);
  const nice = norm(lists.niceToHave).filter((s) => !must.includes(s));
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
    items,
    meta: normalizeMeta(ai.meta),
    mode: 'ai',
  };
}
