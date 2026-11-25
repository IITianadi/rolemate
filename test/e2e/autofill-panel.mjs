// The Rolemate side panel in real Chrome with the real extension and server: pick the job, show the tailored resume,
// fill, answer what is left, track the application, and never submit, upload or save a sensitive answer.
// Run with: npm run e2e:autofill-panel   (needs Chrome/Chromium; set CHROMIUM_PATH if it is not auto-detected)
import { chromium } from 'playwright-core';
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExtensionBrowser } from './browser.mjs';
import { createApp } from '../../server/app.js';
import { closeBrowser } from '../../server/lib/render.js';
import { setClientForTests } from '../../server/lib/ai.js';

delete process.env.ANTHROPIC_API_KEY;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'rolemate-panel-'));
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));

const dashServer = createApp({ dbPath: ':memory:' }).listen(0, '127.0.0.1');
await new Promise((r) => dashServer.once('listening', r));
const DASH = `http://127.0.0.1:${dashServer.address().port}`;
const site = http.createServer((req, res) => {
  let body; try { body = readFileSync(join(here, 'site', req.url.split('?')[0].slice(1))); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
});
const SITE = `http://127.0.0.1:${await listen(site)}`;

// A user with a resume, confirmed details and one captured job (with a tailored resume).
const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(DASH + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const { data: su } = await api('/api/auth/signup', { method: 'POST', body: { email: 'panel@example.com', password: 'correct horse' } });
const token = su.token;
const form = new FormData(); form.append('file', new Blob([readFileSync(join(root, 'fixtures', 'sample-resume.txt'))]), 'resume.txt');
await api('/api/profile/resume', { method: 'POST', body: form, token });
await api('/api/autofill/profile', { method: 'PUT', token, body: { apply: { city: 'Gurugram', state: 'Haryana', country: 'India', phone: '9876543210', requiresSponsorship: 'No', eeo: { gender: 'Male' } }, facts: { noticePeriod: '2 months', expectedCtc: '18 LPA' } } });
const cap = await api('/api/capture', { method: 'POST', token, body: { url: 'https://jobs.example/acme/1', text: readFileSync(join(root, 'fixtures', 'sample-jd.txt'), 'utf8'), hints: { company: 'Acme Payments' } } });
assert.equal(cap.status, 201);

const extDir = join(tmp, 'ext');
cpSync(join(root, 'extension'), extDir, { recursive: true });
const mf = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
mf.host_permissions = [`${SITE}/*`, `${DASH}/*`];
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(mf));
const exe = findExtensionBrowser();
const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), { executablePath: exe, headless: false, viewport: { width: 1000, height: 900 }, args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`] });

let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message.split('\n').slice(0, 8).join('\n     ')); } };
const text = (p) => p.locator('main').innerText();
const SHOTS = process.env.E2E_SHOTS; // optional: directory for screenshots (design review)
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); };

try {
  const probe = await ctx.newPage();
  await probe.goto('chrome://extensions');
  const extId = await probe.evaluate(() => document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item').id);
  await probe.goto(`chrome-extension://${extId}/popup.html`);
  await probe.evaluate(([t, s]) => chrome.storage.local.set({ token: t, email: 'panel@example.com', server: s }), [token, DASH]);

  async function openPanel(formUrl) {
    const formTab = await ctx.newPage(); await formTab.goto(formUrl);
    const id = await probe.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, formUrl);
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel.html?tab=${id}`);
    return { formTab, panel };
  }

  let formTab; let panel;
  await step('panel finds the form, picks the job from the page, and names the tailored resume', async () => {
    ({ formTab, panel } = await openPanel(`${SITE}/apply-lever.html`));
    await panel.waitForSelector('text=questions on this form', { timeout: 15000 });
    const t = await text(panel);
    assert.match(t, /Applying to/); assert.match(t, /Senior Backend Engineer/);
    assert.match(t, /Your tailored resume:/); assert.match(t, /Acme Payments – Senior Backend Engineer/);
    assert.match(t, /doesn’t upload files/);
    assert.doesNotMatch(t, /undefined|NaN|\[object/);
    assert.match(t, /You attach \(1\)/);
    await panel.setViewportSize({ width: 420, height: 900 }); await shot(panel, 'panel-1-found');
  });

  await step('nothing is typed until the user presses Fill', async () => {
    assert.equal(await formTab.evaluate(() => document.querySelector('[name=email]').value), '');
    assert.match(await text(panel), /Nothing is typed until you press Fill/);
  });

  await step('Fill types the known details, keeps what the user typed, and leaves the rest', async () => {
    await panel.click('button:has-text("Fill ")');
    await panel.waitForSelector('text=Check it, then press Apply yourself');
    const v = await formTab.evaluate(() => ({ name: document.querySelector('[name=name]').value, email: document.querySelector('[name=email]').value, phone: document.querySelector('[name=phone]').value, org: document.querySelector('[name=org]').value, notice: document.querySelector('[name="cards[2]"]').value, reloc: document.querySelector('[name="cards[1]"]:checked')?.value, gender: document.querySelector('[name="eeo[gender]"]').value, files: document.querySelector('[name=resume]').files.length, marks: document.querySelectorAll('[data-rolemate]').length }));
    assert.equal(v.name, 'RAHUL SHARMA'); assert.equal(v.email, 'rahul.sharma@example.com'); assert.equal(v.phone, '+919876543210');
    assert.equal(v.org, 'My own startup'); assert.equal(v.notice, '2 months'); assert.equal(v.gender, ''); assert.equal(v.files, 0);
    assert.ok(v.marks >= 5, 'fields are outlined on the page');
    const t = await text(panel);
    assert.match(t, /Needs you/); assert.match(t, /Favourite database engine/); assert.match(t, /Gender/);
    await shot(panel, 'panel-2-filled');
  });

  await step('an unknown question is answered in the panel, filled, and saved for next time', async () => {
    const card = panel.locator('.fld', { hasText: 'Favourite database engine' });
    await card.locator('input').fill('PostgreSQL');
    await card.locator('button:has-text("Fill and save")').click();
    await panel.waitForSelector('text=Filled and saved');
    assert.equal(await formTab.evaluate(() => document.querySelector('[name="cards[4]"]').value), 'PostgreSQL');
    const saved = (await api('/api/autofill/answers', { token })).data.answers;
    assert.ok(saved.some((a) => /Favourite database/.test(a.question) && a.answer === 'PostgreSQL'));
  });

  await step('a sensitive question is chosen by the user, filled, and never saved', async () => {
    const card = panel.locator('.fld', { hasText: 'Gender' }).first();
    await card.locator('select').selectOption('Male');
    await card.locator('button:has-text("Fill")').click();
    await panel.waitForFunction(() => /Filled\./.test(document.body.innerText));
    assert.equal(await formTab.evaluate(() => document.querySelector('[name="eeo[gender]"]').value), 'Male');
    const saved = (await api('/api/autofill/answers', { token })).data.answers;
    assert.ok(!saved.some((a) => /gender/i.test(a.question)), 'sensitive answers are not saved');
  });

  await step('without an AI key there is no Draft button and no made-up answer', async () => {
    const card = panel.locator('.fld', { hasText: 'Why do you want to work' });
    assert.equal(await card.locator('button:has-text("Draft")').count(), 0);
    assert.equal(await formTab.evaluate(() => document.querySelector('[name="cards[3]"]').value), '');
  });

  await step('"I pressed Apply" tracks the job as applied with a follow-up date', async () => {
    await panel.click('button:has-text("I pressed Apply")');
    await panel.waitForSelector('text=Tracked as applied');
    const job = (await api('/api/jobs', { token })).data.jobs[0];
    assert.equal(job.status, 'applied'); assert.ok(job.followUpDue);
  });

  await step('the form was never submitted, no file was attached, Apply was never clicked', async () => {
    const v = await formTab.evaluate(() => ({ submitted: !!window.__submitted, clicked: !!window.__submitClicked, file: document.querySelector('[name=resume]').files.length }));
    assert.deepEqual(v, { submitted: false, clicked: false, file: 0 });
    const questions = (await api('/api/export', { token })).data.questionLog;
    assert.ok(questions.length >= 8 && questions.every((q) => !('answer' in q)), 'the log holds labels only');
  });

  await step('a page with no application form says so', async () => {
    const other = await ctx.newPage(); await other.goto(`${SITE}/post.html`);
    const id = await probe.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, `${SITE}/post.html`);
    const p2 = await ctx.newPage(); await p2.goto(`chrome-extension://${extId}/sidepanel.html?tab=${id}`);
    await p2.waitForSelector('text=No application form here', { timeout: 15000 });
  });

  await step('a form for an unrecognised company asks which job it is for', async () => {
    const id = (await api('/api/jobs', { token })).data.jobs[0].id;
    await api(`/api/jobs/${id}`, { method: 'PATCH', token, body: { status: 'saved' } });
    const { panel: p3 } = await openPanel(`${SITE}/apply-generic.html`);
    await p3.waitForSelector('text=Which job?', { timeout: 15000 });
    await p3.click('.picker button');
    await p3.waitForSelector('text=Applying to');
    assert.match(await text(p3), /Your tailored resume/);
  });

  await step('first Fill with AI on: drafts answers from the resume into the form, never asks about sensitive questions', async () => {
    const seen = [];
    const reply = async (p) => {
      const qs = JSON.parse(p.messages[0].content.match(/<questions>\n([\s\S]*?)\n<\/questions>/)[1]);
      seen.push(...qs.map((q) => q.question));
      const answers = qs.map((q) => ({ id: q.id, answer: /why do you want/i.test(q.question) ? 'I build reliable backend systems in Python and Django, which is what this role needs.' : /favourite database/i.test(q.question) ? 'PostgreSQL' : null }));
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answers }) }] };
    };
    setClientForTests({ beta: { messages: { create: reply } }, messages: { create: reply } });
    try {
      const { formTab: ft, panel: pn } = await openPanel(`${SITE}/apply-lever.html?second`);
      await pn.waitForSelector('text=questions on this form', { timeout: 15000 });
      assert.match(await text(pn), /will also draft answers/);
      await pn.click('button:has-text("and draft")');
      await pn.waitForSelector('text=Check it, then press Apply yourself', { timeout: 20000 });
      const v = await ft.evaluate(() => ({ why: document.querySelector('[name="cards[3]"]').value, db: document.querySelector('[name="cards[4]"]').value, gender: document.querySelector('[name="eeo[gender]"]').value, files: document.querySelector('[name=resume]').files.length, clicked: !!window.__submitClicked }));
      assert.match(v.why, /Python and Django/); assert.equal(v.db, 'PostgreSQL');
      assert.equal(v.gender, '', 'sensitive questions are not drafted'); assert.deepEqual([v.files, v.clicked], [0, false]);
      assert.ok(seen.some((q) => /Why do you want/.test(q)) && !seen.some((q) => /gender|disabilit|veteran|race|privacy policy|Resume/i.test(q)), seen.join(' | '));
      const t = await text(pn);
      assert.match(t, /Check these/); assert.match(t, /Drafted from your resume and this job/);
      await shot(pn, 'panel-3-ai-drafts');
      await pn.locator('.fld', { hasText: 'Why do you want' }).locator('button:has-text("Looks right")').click();
      await pn.waitForSelector('text=Filled and saved');
      assert.ok((await api('/api/autofill/answers', { token })).data.answers.some((a) => /Why do you want/.test(a.question)), 'saved only once the user confirms it');
    } finally { setClientForTests(null); }
  });

  await step('one click: "Fill the form" fills the whole form, attention items come first, and the next step is filled too', async () => {
    const reply = async (p) => {
      const qs = JSON.parse(p.messages[0].content.match(/<questions>\n([\s\S]*?)\n<\/questions>/)[1]);
      const answers = qs.map((q) => ({ id: q.id, answer: /why do you want/i.test(q.question) ? 'Because the role matches my Python and Django work.' : null }));
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answers }) }] };
    };
    setClientForTests({ beta: { messages: { create: reply } }, messages: { create: reply } });
    try {
      const url = `${SITE}/apply-lever.html?oneclick`;
      const ft = await ctx.newPage(); await ft.goto(url);
      const id = await probe.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, url);
      await probe.evaluate((tabId) => chrome.storage.local.set({ autofillRequest: { tabId, at: Date.now() } }), id); // what the popup's button sets
      const pn = await ctx.newPage(); await pn.goto(`chrome-extension://${extId}/sidepanel.html?tab=${id}`);
      await pn.waitForSelector('text=Check it, then press Apply yourself', { timeout: 25000 }).catch(async (e) => { throw new Error(`${e.message.split('\n')[0]}\nPANEL SAYS: ${(await text(pn)).slice(0, 600)}`); }); // nobody pressed Fill
      const v = await ft.evaluate(() => ({ name: document.querySelector('[name=name]').value, why: document.querySelector('[name="cards[3]"]').value, gender: document.querySelector('[name="eeo[gender]"]').value, files: document.querySelector('[name=resume]').files.length, clicked: !!window.__submitClicked, submitted: !!window.__submitted }));
      assert.equal(v.name, 'RAHUL SHARMA'); assert.match(v.why, /Python and Django/); assert.deepEqual([v.gender, v.files, v.clicked, v.submitted], ['', 0, false, false]);
      const heads = await pn.locator('.group h2').allInnerTexts();
      assert.match(heads[0], /^Needs you/); assert.ok(heads.findIndex((h) => /Check these/.test(h)) < heads.findIndex((h) => /^Filled from your profile/.test(h)), heads.join(' | '));
      assert.match(await text(pn), /need your attention/);
      await pn.setViewportSize({ width: 420, height: 900 }); await shot(pn, 'panel-4-one-click');
      // The user presses the site's Next; new fields appear and are filled without another click.
      await ft.evaluate(() => { const d = document.createElement('div'); d.className = 'application-question'; d.innerHTML = '<label><div class="application-label">Expected CTC</div><input name="late" type="text"></label>'; document.getElementById('application-form').append(d); });
      await ft.waitForFunction(() => document.querySelector('[name=late]').value === '18 LPA', null, { timeout: 15000 });
      assert.equal(await ft.evaluate(() => !!window.__submitClicked), false);
    } finally { setClientForTests(null); }
  });

  await step('dashboard: Application details and Saved answers are editable', async () => {
    const dash = await ctx.newPage(); const errs = []; dash.on('pageerror', (e) => errs.push(e.message));
    await dash.goto(DASH); await dash.evaluate((t) => localStorage.setItem('tk_token', t), token);
    await dash.goto(`${DASH}/#/profile`); await dash.reload();
    await dash.waitForSelector('#application-details', { timeout: 15000 });
    const card = await dash.locator('#application-details').innerText();
    assert.match(card, /never submits a form and never uploads a file/); assert.match(card, /Sensitive questions/);
    await dash.locator('#application-details label.field', { hasText: 'Postal code' }).locator('input').fill('122001');
    await dash.click('#application-details button:has-text("Save")');
    await dash.waitForSelector('text=Saved. The extension will use these');
    const p = (await api('/api/autofill/profile', { token })).data;
    assert.equal(p.apply.postalCode, '122001'); assert.equal(p.apply.eeo.autoFill, false);
    const saved = dash.locator('.card', { hasText: 'Saved answers' }).first();
    const qs = await saved.locator('input[aria-label=Question]').evaluateAll((els) => els.map((e) => e.value));
    assert.ok(qs.some((q) => /Favourite database engine/.test(q)) && qs.some((q) => /Why do you want/.test(q)), qs.join(' | '));
    const row = saved.locator('.card.soft', { has: dash.locator('input[aria-label=Question]') }).filter({ has: dash.locator('textarea') });
    assert.ok((await row.locator('textarea').evaluateAll((els) => els.map((e) => e.value))).includes('PostgreSQL'));
    assert.deepEqual(errs, []);
    await dash.waitForTimeout(1200);
    if (SHOTS) await dash.locator('#application-details').screenshot({ path: join(SHOTS, 'dashboard-application-details.png') });
  });
} finally {
  await ctx.close(); dashServer.close(); site.close(); await closeBrowser();
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
