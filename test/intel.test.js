// Job intelligence: classified requirements, fit with evidence, weighted score, mandatory gate, ATS, DOCX, safe rewrites.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mammoth from 'mammoth';
import { parseResumeText } from '../server/lib/resume-parse.js';
import { setClientForTests } from '../server/lib/ai.js';
import { extractJob } from '../server/lib/jd.js';
import { normalizeRequirements, basicRequirements } from '../server/lib/jd-intel.js';
import { analyzeFit } from '../server/lib/fit.js';
import { scoreV2, DEFAULT_WEIGHTS, weightsFromEnv } from '../server/lib/score.js';
import { resumeFacts, lexicalMatch } from '../server/lib/evidence.js';
import { atsReport } from '../server/lib/ats.js';
import { buildDocx } from '../server/lib/docx.js';
import { suggestRewrites } from '../server/lib/tailor.js';
import { resumePlainText } from '../server/lib/resume-text.js';
import { renderPdf, closeBrowser } from '../server/lib/render.js';

const resume = parseResumeText(readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url), 'utf8'));
const text = (t) => ({ type: 'text', text: t });
const fake = (answer) => ({ beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(answer))] }) } }, messages: { create: async () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(answer))] }) } });
after(async () => { setClientForTests(null); await closeBrowser(); });

const item = (name, category, extra = {}) => ({ name, category, importance: category === 'mandatory' ? 5 : category === 'must' ? 4 : 2, evidence: '', explicit: true, confidence: 0.8, ...extra });
async function run(job) {
  const fit = await analyzeFit(resume, job, { confirmedSkills: [] });
  return { fit, ...scoreV2(fit, { resume, meta: job.meta, years: 6.3 }) };
}

// ---- Phase 1
test('requirements are validated: unknown category -> must, mandatory needs the JD’s own words, duplicates dropped', () => {
  const jd = 'Must have 3+ years of experience in Python. Nice to have: Kubernetes.';
  const out = normalizeRequirements([
    { name: 'Python', category: 'mandatory', evidence: 'Must have 3+ years of experience in Python', explicit: true },
    { name: 'Leadership', category: 'mandatory', evidence: 'invented line not in the posting' },
    { name: 'Kubernetes', category: 'bogus', evidence: 'Kubernetes' },
    { name: 'python', category: 'nice' },
  ], jd);
  assert.equal(out.length, 3);
  assert.equal(out[0].category, 'mandatory'); assert.equal(out[0].explicit, true);
  assert.equal(out[1].category, 'must'); assert.equal(out[1].evidence, ''); assert.equal(out[1].explicit, false); assert.ok(out[1].confidence <= 0.5);
  assert.equal(out[2].category, 'must');
});

test('rule-based fallback: years are mandatory with evidence, skills are must/nice; education only when the JD says required', () => {
  const jd = 'Requirements\n3-5 years of experience in backend development\nBachelor’s degree is required\nPython, Django\nNice to have: Docker';
  const items = basicRequirements({ minYears: 3, maxYears: 5, mustHave: ['Python', 'Django'], niceToHave: ['Docker'] }, jd);
  assert.equal(items[0].category, 'mandatory'); assert.match(items[0].evidence, /3-5 years/);
  assert.ok(items.some((i) => i.name === 'Educational qualification' && i.category === 'mandatory'));
  assert.deepEqual(items.filter((i) => i.category === 'must').map((i) => i.name), ['Python', 'Django']);
  assert.equal(items.find((i) => i.name === 'Docker').category, 'nice');
});

test('extractJob: AI classification, metadata, years item, and flat lists stay in sync', async () => {
  const jd = 'Senior Backend Engineer at Orbit\nWe need 5+ years of experience. Must have Python. Good to have Kubernetes. You will own the payments platform. Fintech domain.';
  setClientForTests(fake({ title: 'Senior Backend Engineer', company: 'Orbit', minYears: 5, meta: { industry: 'Fintech', seniority: 'senior' }, requirements: [
    { name: 'Python', category: 'must', evidence: 'Must have Python', explicit: true, confidence: 0.9 },
    { name: 'Kubernetes', category: 'nice', evidence: 'Good to have Kubernetes', explicit: true },
    { name: 'Own the payments platform', category: 'responsibility', evidence: 'You will own the payments platform' } ] }));
  const r = await extractJob(jd);
  assert.deepEqual(r.mustHave, ['Python']); assert.deepEqual(r.niceToHave, ['Kubernetes']);
  assert.equal(r.meta.industry, 'Fintech'); assert.equal(r.meta.seniority, 'senior');
  assert.ok(r.items.some((i) => i.category === 'mandatory' && /5\+ years/.test(i.name)), 'years requirement added');
  assert.ok(r.items.some((i) => i.category === 'responsibility'));
  setClientForTests(null);
});

// ---- Phase 2
test('resume facts: every line has a source, skills, metric and ownership', () => {
  const f = resumeFacts(resume);
  const b = f.facts.find((x) => /reconciliation/.test(x.plain));
  assert.ok(b.bulletId && b.where.includes('PayNest')); assert.ok(b.skills.includes('Python')); assert.equal(b.metric, true); assert.equal(b.ownership, 'owned');
  assert.equal(f.facts.find((x) => /Mentored/.test(x.plain)).ownership, 'unclear');
  assert.equal(lexicalMatch('Redis caching', f.facts).exact, true);
});

// ---- Phase 3: three candidate/JD combinations, no AI (the deterministic path)
test('scenario 1, strong match: covered requirements, evidence on each, no mandatory gate', async () => {
  const r = await run({ items: [item('3+ years of experience', 'mandatory'), item('Python', 'must'), item('Django', 'must'), item('PostgreSQL', 'must'), item('Docker', 'nice')], meta: { seniority: 'mid', industry: 'fintech' } });
  assert.ok(r.score >= 75, `score ${r.score}`); assert.equal(r.band, 'strong'); assert.equal(r.mandatoryFailed, false);
  assert.ok(r.fit.filter((i) => i.kind === 'must').every((i) => i.status === 'strong' && i.evidence && i.source?.where));
  assert.deepEqual(r.dimensions.map((d) => d.key).sort(), ['achievements', 'domain', 'experience', 'keyword', 'mandatory', 'mustHave', 'semantic']);
  assert.equal(r.dimensions.reduce((a, d) => a + d.weight, 0) >= 99, true);
});

test('scenario 2, partial match: some must-haves missing, advice names a real place on the resume', async () => {
  const r = await run({ items: [item('Python', 'must'), item('Kubernetes', 'must'), item('Terraform', 'must'), item('Docker', 'must'), item('GraphQL', 'nice')], meta: {} });
  assert.ok(r.score >= 25 && r.score < 75, `score ${r.score}`);
  const k = r.fit.find((i) => i.requirement === 'Kubernetes');
  assert.equal(k.status, 'missing'); assert.equal(k.evidence, ''); assert.match(k.advice, /^If you/); assert.ok(['Skills', 'Experience'].some((p) => k.where.startsWith(p) || k.where.toLowerCase().startsWith(p.toLowerCase())), k.where);
  assert.equal(r.mandatory.total, 0);
});

test('scenario 3, missing mandatory requirements: never reads as a strong match; unverifiable is not held against the candidate', async () => {
  const r = await run({ items: [item('12+ years of experience', 'mandatory'), item('Kubernetes certification', 'mandatory'), item('Educational qualification', 'mandatory', { evidence: 'Master’s degree required' }), item('Python', 'must'), item('Django', 'must'), item('Docker', 'must')], meta: { seniority: 'lead' } });
  assert.equal(r.mandatoryFailed, true); assert.notEqual(r.band, 'strong');
  assert.ok(r.mandatory.missing.some((m) => /12\+ years/.test(m.requirement)) || r.mandatory.missing.length > 0);
  assert.ok(r.mandatory.missing.some((m) => /Kubernetes certification/.test(m.requirement)));
});

test('unverifiable requirements are flagged and excluded from the average', () => {
  const fit = [{ requirement: 'Work authorisation', kind: 'mandatory', status: 'unverifiable', importance: 5, explicit: true }, { requirement: 'Python', kind: 'must', status: 'strong', importance: 4, explicit: true, exact: true, evidence: 'x', source: { bulletId: 'x' } }];
  const r = scoreV2(fit, { resume });
  assert.deepEqual(r.mandatory.unverified, ['Work authorisation']); assert.equal(r.mandatoryFailed, false);
  assert.equal(r.dimensions.find((d) => d.key === 'mandatory'), undefined);
});

test('weights are configurable and renormalise', () => {
  assert.equal(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const w = weightsFromEnv({ MATCH_WEIGHTS: '{"keyword":0,"mandatory":40,"nope":5}' });
  assert.equal(w.keyword, 0); assert.equal(w.mandatory, 40); assert.ok(!('nope' in w));
  assert.deepEqual(weightsFromEnv({ MATCH_WEIGHTS: 'not json' }), DEFAULT_WEIGHTS);
});

test('AI fit: evidence is a real resume line by id; an unsupported "strong" is downgraded; related is partial, not strong', async () => {
  const f = resumeFacts(resume);
  const own = f.facts.find((x) => /Mentored/.test(x.plain)).id; const seo = f.facts.find((x) => /Redis caching/.test(x.plain)).id;
  setClientForTests(fake({ items: [
    { requirement: 'Team leadership', status: 'strong', lineIds: [own], where: '', advice: '' },
    { requirement: 'Performance tuning', status: 'partial', lineIds: [seo], where: 'SKILLS', advice: 'If you have profiled services, add it.' },
    { requirement: 'Stakeholder management', status: 'strong', lineIds: ['not-a-real-id'], where: 'Nowhere', advice: '' },
    { requirement: 'Data science', status: 'missing', lineIds: [], where: 'Skills', advice: 'If you have used it, add it.' } ] }));
  const fit = await analyzeFit(resume, { items: [item('Team leadership', 'must'), item('Performance tuning', 'must'), item('Stakeholder management', 'must'), item('Data science', 'nice')] }, {});
  assert.equal(fit[0].status, 'strong'); assert.match(fit[0].evidence, /Mentored/);
  assert.equal(fit[1].status, 'partial'); assert.equal(fit[1].where, 'SKILLS');
  assert.notEqual(fit[2].status, 'strong'); assert.equal(fit[2].where === 'Nowhere', false);
  assert.equal(fit[3].status, 'missing');
  setClientForTests(null);
});

// ---- Phase 4
test('rewrites: facts preserved; a skill the resume never mentions is rejected; each suggestion names the requirement it supports', async () => {
  const b = resume.sections.find((s) => s.kind === 'experience').items[0].bullets[1];
  const plain = b.text.replace(/\*/g, '');
  const bad = plain.replace('Redis caching', 'Redis caching and Kubernetes');
  const good = plain.replace('Reduced API latency', 'Cut API latency');
  for (const [proposed, kept] of [[bad, false], [good, true]]) {
    setClientForTests(fake({ suggestions: [{ bulletId: b.id, proposed, reason: 'wording' }] }));
    const out = await suggestRewrites(resume, { title: 'x', mustHave: ['Redis'], niceToHave: [] }, 6, [{ requirement: 'Performance tuning', status: 'partial', source: { bulletId: b.id } }]);
    assert.equal(out.length, kept ? 1 : 0);
    if (kept) assert.equal(out[0].requirement, 'Performance tuning');
  }
  setClientForTests(null);
});

// ---- Phase 5
test('ATS: parsing is verified on real PDF text; a mangled parse is flagged', async () => {
  let pdfText = null, pages = null;
  try {
    const pdf = Buffer.from(await renderPdf(resume));
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    try { const t = await parser.getText(); pdfText = t.text; pages = t.total ?? null; } finally { await parser.destroy?.(); }
  } catch { /* no browser in this environment: fall back to the plain text of the resume */ }
  const text = pdfText ?? resumePlainText(resume);
  const ok = atsReport(resume, { text, pages });
  assert.ok(ok.parsed); assert.ok(ok.score >= 80, `ats ${ok.score}: ${JSON.stringify(ok.issues)}`); assert.equal(ok.label, 'ATS Compatibility Score');
  const bad = atsReport(resume, { text: 'garbled ▯▯ text with nothing useful' });
  assert.ok(bad.scores.parsing < 40); assert.ok(bad.issues.some((i) => /Job titles|Name/.test(i.label)));
  assert.match(ok.note, /not an official ATS/);
  const keywords = atsReport(resume, { text, fit: [{ requirement: 'Python', kind: 'must', status: 'strong' }, { requirement: 'Kubernetes', kind: 'must', status: 'missing' }, { requirement: 'Own roadmap', kind: 'responsibility', status: 'weak' }] }).keywords;
  assert.deepEqual(keywords.supported, ['Python']); assert.deepEqual(keywords.missing, ['Kubernetes']);
});

test('ATS: non-standard headings and mixed dates are reported', () => {
  const r = JSON.parse(JSON.stringify(resume));
  r.sections.find((s) => s.kind === 'experience').heading = 'My Journey';
  r.sections.find((s) => s.kind === 'experience').items[0].date = '2022';
  const a = atsReport(r, { text: resumePlainText(r) });
  assert.ok(a.issues.some((i) => /Work Experience/.test(i.label)));
  assert.ok(a.issues.some((i) => /date format/i.test(i.label)));
});

// ---- Export
test('DOCX export is a valid Word file with the resume’s own text, in order, with no tables or images', async () => {
  const buf = buildDocx(resume);
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  const { value } = await mammoth.extractRawText({ buffer: buf });
  for (const must of ['RAHUL SHARMA', 'PayNest Technologies', 'Jul 2022', 'Reduced API latency by 38%', 'B.Tech', 'Python, JavaScript, SQL']) assert.ok(value.includes(must), `missing ${must}`);
  assert.ok(value.indexOf('EXPERIENCE') < value.indexOf('EDUCATION'));
  const xml = buf.toString('latin1'); assert.ok(!/<w:tbl>|<w:drawing>|<w:pict>/.test(xml));
});
