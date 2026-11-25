// An application form page is not a job posting: capture refuses it, and the real posting later repairs a job that was saved from the form.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { looksLikeApplicationForm } from '../server/lib/form-page.js';
import { closeBrowser } from '../server/lib/render.js';

const resumeTxt = readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url));
const sampleJd = readFileSync(new URL('../fixtures/sample-jd.txt', import.meta.url), 'utf8');
const FORM_URL = 'https://relx.wd3.myworkdayjobs.com/en-US/relx/job/Product-manager-II_R1/apply/autofillWithResume';
const POST_URL = 'https://relx.wd3.myworkdayjobs.com/en-US/relx/job/Product-manager-II_R1';
const FORM_TEXT = `Back to Job Posting
Product manager II
Autofill with Resume My Information My Experience Application Questions Voluntary Disclosures Review
Autofill with Resume
* Indicates a required field
You can quickly apply to our Career site by attaching your resume or CV, please review each field within the application.
Upload either DOC, DOCX, HTML, PDF, or TXT file types (5MB max)
Drop file here or Select file
Continue`;
const POSTING = `Product manager II
RELX
Gurugram, India

About the role
We are looking for a Product Manager II to own the roadmap for our analytics platform and work with engineering and design.

Responsibilities
- Define the product vision and prioritise the backlog using customer data and SQL.
- Run experiments and report on metrics to leadership.

Requirements
- 4+ years of experience in product management.
- Strong SQL and stakeholder management.
Nice to have: Roadmapping, Jira.`;

let server; let base; let token; let db;
const call = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const app = createApp({ dbPath: ':memory:', freeLimit: 5 });
  db = app.locals.db;
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await (await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'form@example.com', password: 'correct horse' }) })).json()).token;
  const f = new FormData(); f.append('file', new Blob([resumeTxt]), 'resume.txt');
  await fetch(base + '/api/profile/resume', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: f });
});
after(async () => { server.close(); await closeBrowser(); });

test('detector: a form page is a form, a posting is not, even a long posting with a form beside it', () => {
  assert.equal(looksLikeApplicationForm(FORM_TEXT, FORM_URL), true);
  assert.equal(looksLikeApplicationForm(POSTING, POST_URL), false);
  assert.equal(looksLikeApplicationForm(sampleJd, ''), false);
  assert.equal(looksLikeApplicationForm(`${POSTING}\n\nDrop file here or Select file\nI agree to the privacy policy. * Indicates a required field`, FORM_URL), false, 'a description wins over form words');
  assert.equal(looksLikeApplicationForm('Short page about nothing in particular, with no hiring words at all in it.', 'https://x.example/apply'), false);
});

test('capturing a form page saves nothing and spends no credit', async () => {
  const r = await call('/api/capture', { method: 'POST', body: { url: FORM_URL, text: FORM_TEXT, hints: { title: 'Product manager II', titleTrusted: true } } });
  assert.equal(r.status, 422); assert.match(r.data.error, /application form, not the job posting/); assert.match(r.data.error, /no credit was used/);
  assert.equal((await call('/api/jobs')).data.jobs.length, 0);
  assert.equal((await call('/api/me')).data.quota.used, 0);
});

test('a job saved earlier from its form page is flagged, then repaired by capturing the real posting (same job, no second credit)', async () => {
  // How the bad job got there before the check existed.
  const uid = db.prepare("SELECT id FROM users WHERE email = 'form@example.com'").get().id;
  const id = Number(db.prepare("INSERT INTO jobs (user_id, title, company, url, jd_text, status, job_key) VALUES (?, 'Product manager II', 'RELX', ?, ?, 'saved', ?)").run(uid, FORM_URL, FORM_TEXT, FORM_URL).lastInsertRowid);
  db.prepare("INSERT INTO usage (user_id, month, job_key) VALUES (?, '2026-11', ?)").run(uid, `job:${id}`);
  const before = (await call('/api/jobs')).data.jobs;
  assert.equal(before.length, 1); assert.equal(before[0].needsPosting, true);

  const r = await call('/api/capture', { method: 'POST', body: { url: POST_URL, text: POSTING, hints: { title: 'Product manager II', titleTrusted: true, company: 'RELX', companyTrusted: true } } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.existing, true);
  assert.equal(r.data.job.id, id);
  const jobs = (await call('/api/jobs')).data.jobs;
  assert.equal(jobs.length, 1, 'no duplicate job');
  assert.equal(jobs[0].needsPosting, false); assert.equal(jobs[0].url, POST_URL);
  assert.ok(jobs[0].requirements.mustHave?.length > 0, 'requirements now come from the real description');
  assert.equal((await call('/api/me')).data.quota.used, 1, 'the same credit, not a second one');
});
