// Autofill in a real browser: the content script reads each fixture form, the planner decides, the script fills.
// The fixtures follow the structure of Lever, Ashby and a plain career page, and are served under those hosts.
// Run with: npm run e2e:autofill   (needs Chrome/Chromium; set CHROMIUM_PATH if it is not auto-detected)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExtensionBrowser } from './browser.mjs';
import { planFields, summarize } from '../../extension/lib/plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(join(here, '..', '..', 'extension', 'content', 'autofill.js'), 'utf8');
const fixture = (n) => readFileSync(join(here, 'site', n), 'utf8');

const profile = {
  personal: { first_name: 'Rahul', last_name: 'Sharma', email: 'rahul@example.com', phone: '9876543210', phone_country_code: '+91' },
  location: { current_city: 'Gurugram', current_state: 'Haryana', country: 'India' },
  links: { linkedin: 'https://linkedin.com/in/rahul', github: '', portfolio: '' },
  work_authorization: { requires_sponsorship: 'No', notes: '' },
  employment: { current_company: 'PayNest', current_title: 'Software Engineer', total_experience_years: 4, notice_period: '2 months', current_ctc: '12 LPA', expected_ctc: '18 LPA' },
  education: [], eeo_and_sensitive: { auto_fill: false, gender: 'Male' },
};
const bank = [{ question: 'Are you willing to relocate?', answer: 'Yes' }];

const browser = await chromium.launch({ executablePath: findExtensionBrowser(), args: ['--no-sandbox'] });
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message.split('\n').slice(0, 6).join('\n     ')); } };

async function open(url, file) {
  const page = await browser.newPage();
  await page.route('**/*', (r) => (r.request().url() === url ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture(file) }) : r.fulfill({ status: 204, body: '' })));
  await page.goto(url);
  await page.addScriptTag({ content: script });
  return page;
}
const run = (page, fn, arg) => page.evaluate(fn, arg);
const scanPlan = async (page, prof = profile) => planFields(await run(page, () => window.__rolemateAF.scan()), prof, bank);
const fillPlan = async (page, plan) => {
  const items = plan.filter((p) => p.value).map((p) => ({ id: p.id, kind: p.kind, value: p.value }));
  return run(page, (i) => window.__rolemateAF.fill(i), items);
};
const by = (plan, re) => plan.find((p) => re.test(p.label));

await t('Lever: detects an application form, reads every question, skips the honeypot', async () => {
  const page = await open('https://jobs.lever.co/acme/1234abcd-0000-0000-0000-000000000000/apply', 'apply-lever.html');
  const d = await run(page, () => window.__rolemateAF.detect());
  assert.equal(d.isForm, true); assert.equal(d.ats, 'Lever'); assert.equal(d.resumeUpload, true);
  const plan = await scanPlan(page);
  const labels = plan.map((p) => p.label);
  assert.ok(labels.includes('Full name') && labels.includes('Email') && labels.includes('Are you willing to relocate?'), labels.join(' | '));
  assert.ok(!labels.some((l) => /honeypot/i.test(l)), 'honeypot skipped');
  assert.equal(by(plan, /Resume/).status, 'attach');
  assert.equal(by(plan, /relocate/).kind, 'radio');
  await page.close();
});

await t('Lever: fills what is known, keeps typed values, leaves sensitive and unknown questions, never uploads or submits', async () => {
  const page = await open('https://jobs.lever.co/acme/1234abcd-0000-0000-0000-000000000000/apply', 'apply-lever.html');
  const plan = await scanPlan(page);
  assert.equal(by(plan, /Current company/).status, 'kept');
  assert.equal(by(plan, /Gender/).status, 'red'); assert.equal(by(plan, /Gender/).sensitive, true);
  assert.equal(by(plan, /Favourite database/).status, 'red');
  assert.equal(by(plan, /Why do you want/).needsDraft, true);
  assert.equal(by(plan, /GitHub/).status, 'red', 'no GitHub on the profile: not made up');
  const res = await fillPlan(page, plan);
  assert.ok(res.every((r) => r.ok), JSON.stringify(res));
  const v = await run(page, () => ({
    name: document.querySelector('[name=name]').value, email: document.querySelector('[name=email]').value, phone: document.querySelector('[name=phone]').value,
    org: document.querySelector('[name=org]').value, li: document.querySelector('[name="urls[LinkedIn]"]').value, gh: document.querySelector('[name="urls[GitHub]"]').value,
    notice: document.querySelector('[name="cards[2]"]').value, why: document.querySelector('[name="cards[3]"]').value, fav: document.querySelector('[name="cards[4]"]').value,
    reloc: document.querySelector('[name="cards[1]"]:checked')?.value, gender: document.querySelector('[name="eeo[gender]"]').value,
    files: document.querySelector('[name=resume]').files.length, submitted: !!window.__submitted, clicked: !!window.__submitClicked,
  }));
  assert.deepEqual(v, { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '+919876543210', org: 'My own startup', li: 'https://linkedin.com/in/rahul', gh: '', notice: '2 months', why: '', fav: '', reloc: 'Yes', gender: '', files: 0, submitted: false, clicked: false });
  await page.close();
});

await t('Lever: nothing is submitted even if the page tries during a fill', async () => {
  const page = await open('https://jobs.lever.co/acme/1234abcd-0000-0000-0000-000000000000/apply', 'apply-lever.html');
  // A hostile page: submits itself the moment a field changes.
  await run(page, () => document.querySelector('[name=name]').addEventListener('input', () => document.getElementById('application-form').requestSubmit()));
  await fillPlan(page, await scanPlan(page));
  assert.equal(await run(page, () => !!window.__submitted), false);
  await page.close();
});

await t('Ashby: adapter reads labels, Yes/No buttons, disability radios; checkbox and sensitive stay with the user', async () => {
  const page = await open('https://jobs.ashbyhq.com/acme/1234abcd-0000-0000-0000-000000000000/application', 'apply-ashby.html');
  const d = await run(page, () => window.__rolemateAF.detect());
  assert.equal(d.isForm, true); assert.equal(d.ats, 'Ashby');
  const plan = await scanPlan(page);
  assert.equal(by(plan, /visa sponsorship/).kind, 'boolean');
  assert.equal(by(plan, /visa sponsorship/).value, 'No');
  assert.equal(by(plan, /disability/).sensitive, true);
  assert.equal(by(plan, /privacy policy/).status, 'red', 'a consent checkbox is never ticked for the user');
  assert.equal(by(plan, /Expected CTC/).value, '18 LPA');
  assert.equal(by(plan, /Describe a challenging/).needsDraft, true);
  await fillPlan(page, plan);
  const v = await run(page, () => ({ yn: window.__yn, name: document.getElementById('_systemfield_name').value, ctc: document.getElementById('q3').value, dis: !!document.querySelector('[name=dis]:checked'), agree: document.getElementById('agree').checked, file: document.getElementById('_systemfield_resume').files.length, clicked: !!window.__submitClicked }));
  assert.deepEqual(v, { yn: 'No', name: 'Rahul Sharma', ctc: '18 LPA', dis: false, agree: false, file: 0, clicked: false });
  await page.close();
});

await t('Generic page: skips search box, password, honeypot and unsupported date; flags a skill-specific number', async () => {
  const page = await open('https://careers.globex.example/apply', 'apply-generic.html');
  const d = await run(page, () => window.__rolemateAF.detect());
  assert.equal(d.isForm, true); assert.equal(d.ats, '');
  const plan = await scanPlan(page);
  const labels = plan.map((p) => p.label);
  assert.ok(!labels.some((l) => /search jobs|password|website url/i.test(l)), labels.join(' | '));
  assert.equal(by(plan, /willing to relocate/)?.kind, 'radio', 'a radio group is named by its question, not by its first option');
  assert.equal(by(plan, /Date of birth/).status, 'red');
  assert.equal(by(plan, /Tableau/).status, 'yellow');
  assert.equal(by(plan, /Notice period/).value, '60');
  assert.equal(by(plan, /Current city/).value, 'Gurugram');
  await fillPlan(page, plan);
  const v = await run(page, () => ({ first: document.getElementById('fn').value, np: document.getElementById('np').value, city: document.getElementById('loc').value, pw: document.getElementById('pw').value, dob: document.getElementById('dob').value, file: document.getElementById('cv').files.length }));
  assert.deepEqual(v, { first: 'Rahul', np: '60', city: 'Gurugram', pw: '', dob: '', file: 0 });
  const s = summarize(plan);
  assert.ok(s.green >= 5 && s.yellow === 1 && s.attach === 1, JSON.stringify(s));
  await page.close();
});

await t('Marking outlines fields by status and clears again', async () => {
  const page = await open('https://careers.globex.example/apply', 'apply-generic.html');
  const plan = await scanPlan(page);
  await run(page, (st) => window.__rolemateAF.mark(st), Object.fromEntries(plan.map((p) => [p.id, p.status])));
  const marked = await run(page, () => [...document.querySelectorAll('[data-rolemate]')].map((e) => e.dataset.rolemate));
  assert.ok(marked.includes('green') && marked.includes('red') && marked.includes('yellow'));
  await run(page, () => window.__rolemateAF.unmark());
  assert.equal(await run(page, () => document.querySelectorAll('[data-rolemate]').length), 0);
  await page.close();
});

await t('A visible captcha or a one-time-code field pauses autofill', async () => {
  const page = await open('https://careers.example/apply', 'apply-captcha.html');
  const d = await run(page, () => window.__rolemateAF.detect());
  assert.ok(['captcha', 'otp'].includes(d.pause), String(d.pause));
  const plan = await scanPlan(page);
  assert.ok(!plan.some((p) => /verification code/i.test(p.label)), 'the code field is never read');
  await page.close();
});

await t('A page that is not an application form is not offered autofill', async () => {
  const page = await browser.newPage();
  await page.route('**/*', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Blog</h1><form><input name=q placeholder="Search"><button>Go</button></form>' }));
  await page.goto('https://blog.example/post'); await page.addScriptTag({ content: script });
  assert.equal((await run(page, () => window.__rolemateAF.detect())).isForm, false);
  await page.close();
});

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
