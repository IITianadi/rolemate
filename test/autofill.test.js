// Autofill server side: application profile, saved answers, drafts (with a fake AI client), follow-up dates, privacy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { setClientForTests } from '../server/lib/ai.js';
import { closeBrowser } from '../server/lib/render.js';

const resumeTxt = readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url));
const jdTxt = readFileSync(new URL('../fixtures/sample-jd.txt', import.meta.url), 'utf8');
let server; let base; let token; let other; let db; let jobId;
const call = async (path, { method = 'GET', body, tok = token } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const signup = async (email) => (await call('/api/auth/signup', { method: 'POST', body: { email, password: 'correct horse' }, tok: '' })).data.token;
const uploadResume = async (tok) => { const f = new FormData(); f.append('file', new Blob([resumeTxt]), 'resume.txt'); await fetch(base + '/api/profile/resume', { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: f }); };
const fakeAi = (answers) => ({ beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answers }) }] }) } }, messages: { create: async () => { throw new Error('unused'); } } });

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const app = createApp({ dbPath: ':memory:', freeLimit: 5 });
  db = app.locals.db;
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  token = await signup('rahul@example.com'); other = await signup('someone@example.com');
  await uploadResume(token);
});
after(async () => { setClientForTests(null); server.close(); await closeBrowser(); });

test('requires sign-in', async () => {
  for (const p of ['/api/autofill/context', '/api/autofill/profile', '/api/autofill/answers']) assert.equal((await call(p, { tok: '' })).status, 401, p);
});

test('profile is built from the resume, and lists what only the user can supply', async () => {
  const { data } = await call('/api/autofill/profile');
  assert.equal(data.hasResume, true);
  const p = data.profile;
  assert.equal(p.personal.first_name, 'RAHUL'); assert.equal(p.personal.last_name, 'SHARMA');
  assert.equal(p.personal.email, 'rahul.sharma@example.com');
  assert.match(p.links.linkedin, /^https:\/\/linkedin\.com\/in\/rahulsharma-demo/);
  assert.equal(p.employment.notice_period, '');
  assert.ok(data.missing.includes('noticePeriod') && data.missing.includes('expectedCtc'));
  assert.equal(p.eeo_and_sensitive.auto_fill, false, 'sensitive questions are asked unless the user opts in');
  assert.ok(p.education[0].institution.includes('Visvesvaraya'));
});

test('user-confirmed details replace gaps; EEO stays opt-in', async () => {
  const put = await call('/api/autofill/profile', { method: 'PUT', body: { apply: { city: 'Pune', state: 'Maharashtra', country: 'India', phone: '9876543210', requiresSponsorship: 'No', eeo: { gender: 'Male' } }, facts: { noticePeriod: '30 days', expectedCtc: '18 LPA' } } });
  assert.equal(put.status, 200);
  const { data } = await call('/api/autofill/profile');
  assert.equal(data.profile.employment.notice_period, '30 days');
  assert.equal(data.profile.location.current_city, 'Pune');
  assert.equal(data.profile.work_authorization.requires_sponsorship, 'No');
  assert.equal(data.profile.eeo_and_sensitive.auto_fill, false);
  assert.equal(data.profile.eeo_and_sensitive.gender, 'Male');
  assert.ok(!data.missing.includes('noticePeriod') && !data.missing.includes('city'));
});

test('saved answers: add, dedupe by question, edit, delete, and never visible to another user', async () => {
  const add = await call('/api/autofill/answers', { method: 'POST', body: { question: 'Why do you want to work here?', tags: 'motivation', answer: 'I like the problem.' } });
  assert.equal(add.status, 201);
  const again = await call('/api/autofill/answers', { method: 'POST', body: { question: 'why do you want to work here', answer: 'Updated.' } });
  assert.equal(again.status, 200);
  assert.equal(again.data.answers.length, 1);
  assert.equal(again.data.answers[0].answer, 'Updated.');
  assert.equal((await call('/api/autofill/answers', { method: 'POST', body: { question: '', answer: 'x' } })).status, 400);
  assert.deepEqual((await call('/api/autofill/answers', { tok: other })).data.answers, []);
  const id = again.data.answers[0].id;
  assert.equal((await call(`/api/autofill/answers/${id}`, { method: 'DELETE', tok: other })).status, 200);
  assert.equal((await call('/api/autofill/answers')).data.answers.length, 1, 'another user cannot delete it');
  assert.equal((await call(`/api/autofill/answers/${id}`, { method: 'PUT', body: { question: 'Why us?', answer: 'Because.' } })).data.answers[0].question, 'Why us?');
  assert.equal((await call(`/api/autofill/answers/${id}`, { method: 'DELETE' })).data.answers.length, 0);
});

test('context lists the user\'s open jobs with their credit and tailored resume, and gives away no profile data', async () => {
  const cap = await call('/api/capture', { method: 'POST', body: { url: 'https://jobs.example/acme/123', title: 'Senior Backend Engineer', text: jdTxt } });
  assert.equal(cap.status, 201);
  jobId = cap.data.job.id;
  const { data } = await call('/api/autofill/context?url=' + encodeURIComponent('https://jobs.example/acme/123?utm_source=x'));
  assert.equal(data.jobs.length, 1);
  assert.equal(data.jobs[0].sameUrl, true); assert.equal(data.jobs[0].credit, true);
  assert.ok(data.jobs[0].resume?.id, 'the tailored resume is named so the user knows which file to attach');
  assert.ok(!('profile' in data) && !('bank' in data), 'the fill data is only given for a specific credited job');
  assert.equal((await call('/api/autofill/context', { tok: other })).data.jobs.length, 0);
});

const lockedJob = () => Number(db.prepare("INSERT INTO jobs (user_id, title, company, jd_text, status) VALUES ((SELECT id FROM users WHERE email = 'rahul@example.com'), 'Locked role', 'NoCredit Inc', 'x', 'saved')").run().lastInsertRowid);

test('the fill data is given only for the user\'s own saved job that has a credit', async () => {
  const ok = await call(`/api/autofill/jobs/${jobId}/data`);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.profile.personal.first_name, 'RAHUL'); assert.ok(Array.isArray(ok.data.bank));
  assert.equal((await call(`/api/autofill/jobs/${jobId}/data`, { tok: other })).status, 404, 'someone else\'s job');
  assert.equal((await call('/api/autofill/jobs/99999/data')).status, 404);
  // A job saved without a credit (the free credits ran out when it was captured) stays locked.
  const id = lockedJob();
  const locked = await call(`/api/autofill/jobs/${id}/data`);
  assert.equal(locked.status, 402); assert.match(locked.data.error, /credit/i);
  assert.equal((await call('/api/autofill/context')).data.jobs.find((x) => x.title === 'Locked role').credit, false);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
});

test('drafting needs a saved, credited job; without one nothing is drafted and no AI call is made', async () => {
  let calls = 0;
  setClientForTests({ beta: { messages: { create: async () => { calls++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"answers":[]}' }] }; } } }, messages: { create: async () => { calls++; throw new Error('unused'); } } });
  const q = [{ id: 'q1', label: 'Why do you want to join us?' }];
  assert.equal((await call('/api/autofill/draft', { method: 'POST', body: { questions: q } })).status, 400, 'no job');
  assert.equal((await call('/api/autofill/draft', { method: 'POST', body: { jobId, questions: q }, tok: other })).status, 404, 'not their job');
  const id = lockedJob();
  assert.equal((await call('/api/autofill/draft', { method: 'POST', body: { jobId: id, questions: q } })).status, 402, 'no credit');
  assert.equal(calls, 0, 'rejected before any tokens were spent');
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  setClientForTests(null);
});

test('drafting is off without a key: nothing is made up', async () => {
  const { data } = await call('/api/autofill/draft', { method: 'POST', body: { jobId, questions: [{ id: 'q1', label: 'Why do you want to join us?' }] } });
  assert.equal(data.drafts[0].answer, null);
});

test('drafts answer every question, assuming what the resume does not say; only a non-option answer is dropped', async () => {
  let seen = '';
  const reply = async (p) => { seen = p.system + p.messages[0].content; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answers: [
    { id: 'a', answer: 'I have 4 years of backend experience in fintech.' },
    { id: 'b', answer: 'I expect around 22 LPA.' },
    { id: 'c', answer: 'Maybe' },
    { id: 'd', answer: 'Yes' }] }) }] }; };
  setClientForTests({ beta: { messages: { create: reply } }, messages: { create: reply } });
  const { data } = await call('/api/autofill/draft', { method: 'POST', body: { jobId, questions: [
    { id: 'a', label: 'Tell us about your experience' }, { id: 'b', label: 'What is your expected salary?' },
    { id: 'c', label: 'Open to relocation?', options: ['Yes', 'No'] }, { id: 'd', label: 'Comfortable with on-call?', options: ['Yes', 'No'] }] } });
  const by = Object.fromEntries(data.drafts.map((d) => [d.id, d]));
  assert.match(by.a.answer, /4 years/);
  assert.match(by.b.answer, /22 LPA/, 'an assumption is filled, not dropped');
  assert.equal(by.c.answer, null, 'a field with options cannot take an answer that is not one of them');
  assert.equal(by.d.answer, 'Yes');
  assert.match(seen, /most reasonable assumption/);
  setClientForTests(null);
});

test('drafting has a fair-use limit per job', async () => {
  db.prepare('INSERT INTO job_autofill (job_id, drafts) VALUES (?, 40) ON CONFLICT(job_id) DO UPDATE SET drafts = 40').run(jobId);
  const r = await call('/api/autofill/draft', { method: 'POST', body: { jobId, questions: [{ id: 'q', label: 'Anything else?' }] } });
  assert.equal(r.status, 429); assert.match(r.data.error, /limit/i);
  db.prepare('UPDATE job_autofill SET drafts = 0 WHERE job_id = ?').run(jobId);
});

test('marking a job applied sets a follow-up 7 days out, once', async () => {
  const jobs = (await call('/api/jobs')).data.jobs;
  const id = jobId;
  assert.equal(jobs[0].followUpDue, null);
  const r = await call(`/api/jobs/${id}`, { method: 'PATCH', body: { status: 'applied' } });
  const due = new Date(r.data.job.followUpDue).getTime();
  const days = (due - Date.now()) / 86400000;
  assert.ok(days > 5.5 && days < 7.5, `follow-up in ${days} days`);
  const moved = await call(`/api/jobs/${id}`, { method: 'PATCH', body: { status: 'screening' } });
  assert.equal(moved.data.job.followUpDue, r.data.job.followUpDue);
});

test('question log stores labels only; export includes saved answers; account deletion removes them', async () => {
  const jobs = (await call('/api/jobs')).data.jobs;
  assert.equal((await call('/api/autofill/log', { method: 'POST', body: { jobId: jobs[0].id, host: 'boards.greenhouse.io', questions: [{ label: 'Notice period', kind: 'text', outcome: 'filled', answer: 'SECRET' }] } })).status, 200);
  await call('/api/autofill/answers', { method: 'POST', body: { question: 'Salary expectation?', answer: '18 LPA' } });
  const res = await fetch(base + '/api/export', { headers: { Authorization: `Bearer ${token}` } });
  const exp = await res.json();
  assert.equal(exp.questionLog[0].label, 'Notice period');
  assert.ok(!JSON.stringify(exp.questionLog).includes('SECRET'));
  assert.equal(exp.savedAnswers[0].answer, '18 LPA');
  assert.equal((await call('/api/autofill/log', { method: 'POST', body: { jobId: 99999, questions: [{ label: 'x' }] } })).status, 404);
  const del = await call('/api/account', { method: 'DELETE', body: { confirm: 'rahul@example.com' } });
  assert.equal(del.status, 200);
  const db = server.listeners('request')[0].locals?.db;
  if (db) { assert.equal(db.prepare('SELECT COUNT(*) c FROM qa_bank').get().c, 0); assert.equal(db.prepare('SELECT COUNT(*) c FROM question_log').get().c, 0); }
});
