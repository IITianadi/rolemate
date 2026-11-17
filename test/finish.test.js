// The finished tailored resume: summary aimed at the job, job's wording applied safely, key terms bold, one page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResumeText } from '../server/lib/resume-parse.js';
import { setClientForTests } from '../server/lib/ai.js';
import { tailorSummary, rewordForJob, highlightKeywords } from '../server/lib/tailor.js';
import { fitOnePage } from '../server/lib/onepage.js';
import { renderPdf, closeBrowser } from '../server/lib/render.js';

const base = parseResumeText(readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url), 'utf8'));
const fresh = () => JSON.parse(JSON.stringify(base));
const text = (t) => ({ type: 'text', text: t });
const fake = (answer) => ({ beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(answer))] }) } }, messages: { create: async () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(answer))] }) } });
after(async () => { setClientForTests(null); await closeBrowser(); });
const job = { title: 'Backend Engineer', mustHave: ['Python', 'PostgreSQL', 'Docker'], niceToHave: ['Kubernetes'] };

test('summary: rewritten toward the job only with facts from the resume; invented numbers or skills are refused', async () => {
  const good = 'Backend engineer with 4 years of experience building Python and Django APIs on PostgreSQL for fintech products.';
  for (const [answer, ok] of [[good, true], ['Backend engineer with 9 years of experience in Python.', false], ['Backend engineer with 4 years of experience in Python and Kubernetes.', false], ['x'.repeat(900), false]]) {
    setClientForTests(fake({ summary: answer }));
    const r = fresh(); const out = await tailorSummary(r, job);
    assert.equal(out, ok ? answer : null);
    assert.equal(r.sections.find((s) => s.kind === 'summary').items[0].text, ok ? answer : base.sections.find((s) => s.kind === 'summary').items[0].text);
  }
  setClientForTests(null);
  assert.equal(await tailorSummary(fresh(), job), null, 'no AI: summary untouched');
});

test('rewording: applied only if it keeps every number, adds no new skill, does not grow, and picks up a job term', async () => {
  const r = fresh();
  const b = r.sections.find((s) => s.kind === 'experience').items[1].bullets[2]; // Containerised services with Docker and set up Jenkins pipelines.
  const plain = b.text.replace(/\*/g, '');
  const cases = [
    [plain.replace('Containerised services with Docker', 'Containerized Python services with Docker'), false], // adds no new job term beyond Docker (already there) -> not worth it
    [plain.replace('Docker', 'Docker and Kubernetes'), false], // new skill
    [plain + ' ' + 'Extra words that make this bullet much longer than before for no reason at all, really.', false], // grows
  ];
  for (const [proposed, ok] of cases) {
    setClientForTests(fake({ suggestions: [{ bulletId: b.id, proposed, reason: 'x' }] }));
    const rr = fresh(); const out = await rewordForJob(rr, { ...job, mustHave: ['Docker', 'Jenkins', 'CI/CD'] });
    assert.equal(out.length > 0, ok);
  }
  // A skill only implied by the resume (Jenkins -> CI/CD) is refused too.
  setClientForTests(fake({ suggestions: [{ bulletId: b.id, proposed: plain.replace('Jenkins pipelines', 'Jenkins CI/CD pipelines'), reason: 'x' }] }));
  assert.equal((await rewordForJob(fresh(), { ...job, mustHave: ['CI/CD', 'Docker'] })).length, 0);
  // A truthful rewording that picks up a job term the bullet lacked.
  const good = plain.replace('set up Jenkins pipelines', 'set up Jenkins pipeline automation');
  setClientForTests(fake({ suggestions: [{ bulletId: b.id, proposed: good, reason: 'uses the job wording' }] }));
  const rr = fresh(); const out = await rewordForJob(rr, { ...job, mustHave: ['Pipeline automation', 'Docker'] });
  assert.equal(out.length, 1); assert.equal(out[0].status, 'accepted');
  assert.equal(rr.sections.find((s) => s.kind === 'experience').items[1].bullets[2].text, good);
  setClientForTests(null);
});

test('highlighting: job must-haves are bolded once each where they already appear; nothing is added; existing bold is kept', () => {
  const r = fresh();
  r.sections.find((s) => s.kind === 'experience').items[0].bullets[0].text = 'Built services in **Python** and Django.';
  const done = highlightKeywords(r, job);
  assert.ok(done.includes('PostgreSQL') && done.includes('Docker'));
  const all = JSON.stringify(r);
  assert.equal((all.match(/\*\*PostgreSQL\*\*/g) || []).length, 1);
  assert.ok(!all.includes('****'), 'no double bolding');
  assert.ok(!all.includes('**Kubernetes**'), 'nice-to-have is not highlighted');
  assert.equal(r.sections.find((s) => s.kind === 'experience').items[0].bullets[0].text.replace(/\*/g, ''), 'Built services in Python and Django.');
  assert.ok(done.length <= 8);
});

test('one page: an overlong resume is cut by least relevant bullets until it fits; roles, education and skills stay', async () => {
  const r = fresh();
  const exp = r.sections.find((s) => s.kind === 'experience');
  const filler = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${n}${i}`, text: `Maintained internal reporting tool number ${i} used by operations teams every week across several regions and offices.`, style: 'bullet', indent: 0 }));
  exp.items[0].bullets.push(...filler(14)); exp.items[1].bullets.push(...filler(14));
  const before = JSON.parse(JSON.stringify(r));
  const pdfPages = async (x) => { const { PDFParse } = await import('pdf-parse'); const p = new PDFParse({ data: new Uint8Array(Buffer.from(await renderPdf(x))) }); try { return (await p.getText()).total; } finally { await p.destroy?.(); } };
  assert.ok(await pdfPages(before) > 1, 'fixture really overflows');
  const out = await fitOnePage(r, job);
  assert.equal(await pdfPages(r), 1); assert.equal(out.pages, 1); assert.ok(out.removed > 0);
  assert.deepEqual(r.sections.map((s) => s.heading), base.sections.map((s) => s.heading));
  assert.equal(r.sections.find((s) => s.kind === 'experience').items.length, 2);
  const kept = r.sections.find((s) => s.kind === 'experience').items.flatMap((i) => i.bullets.map((b) => b.text)).join('\n');
  assert.match(kept, /payment reconciliation/, 'the relevant, numeric bullets survive');
  assert.equal(JSON.stringify(r.sections.find((s) => s.kind === 'education')), JSON.stringify(before.sections.find((s) => s.kind === 'education')));
});

test('one page: a resume that already fits is untouched; a measuring failure leaves it as is', async () => {
  const r = fresh(); const before = JSON.stringify(r);
  assert.equal((await fitOnePage(r, job)).removed, 0); assert.equal(JSON.stringify(r), before);
  const out = await fitOnePage(r, job, { measureFn: async () => { throw new Error('no browser'); } });
  assert.equal(out.pages, null); assert.equal(JSON.stringify(r), before);
});
