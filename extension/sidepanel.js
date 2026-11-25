// Rolemate side panel: fill an application form with the details in the user's Rolemate profile.
//
// What this does, in order: reads the form in the open tab (read-only), shows what it can fill and what it can't, and fills
// only when the user presses "Fill". Free-text drafts are filled only after the user approves them. The user attaches their
// tailored resume and presses Apply themselves. Nothing here clicks Submit, Apply or Next, or uploads a file.
import { callApi, downloadResume, store } from './lib/api.js';
import { planFields, summarize } from './lib/plan.js';

const root = document.getElementById('root');
const params = new URLSearchParams(location.search);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== false && kid != null) e.append(kid instanceof Node ? kid : document.createTextNode(kid)); // text only: page content is never parsed as HTML
  return e;
}
const SERVER_OPEN = async (path) => { const { server } = await store.get(); chrome.tabs.create({ url: (server || 'https://app.rolemate.in') + path }); };

const S = { tabId: null, url: '', ctx: null, forms: [], plan: [], job: null, pickedJob: false, filled: false, changed: false, notice: '', pause: null, busy: false, drafts: {}, applied: null };

// ---------- the page

const inTab = (frameIds, func, args = []) => chrome.scripting.executeScript({ target: frameIds ? { tabId: S.tabId, frameIds } : { tabId: S.tabId, allFrames: true }, func, args });
async function readForms() {
  await chrome.scripting.executeScript({ target: { tabId: S.tabId, allFrames: true }, files: ['content/autofill.js'] });
  const runs = await inTab(null, () => window.__rolemateAF?.detect());
  const found = runs.filter((r) => r.result && (r.result.isForm || r.result.fields >= 3)).sort((a, b) => (b.result.isForm - a.result.isForm) || (b.result.fields - a.result.fields));
  S.forms = found.filter((r) => r.result.isForm).map((r) => ({ frameId: r.frameId, ...r.result }));
  S.pause = runs.map((r) => r.result?.pause).find(Boolean) || null;
  S.page = runs.find((r) => r.frameId === 0)?.result || runs[0]?.result || {};
  const fields = [];
  for (const f of S.forms) {
    const got = (await inTab([f.frameId], () => window.__rolemateAF.scan()))[0]?.result || [];
    for (const x of got) fields.push({ ...x, frameId: f.frameId });
  }
  S.plan = planFields(fields, S.ctx.profile, S.ctx.bank);
  S.changed = false;
}
const markAll = () => {
  for (const f of S.forms) {
    const st = Object.fromEntries(S.plan.filter((p) => p.frameId === f.frameId).map((p) => [p.id, p.status === 'kept' ? 'none' : p.status]));
    inTab([f.frameId], (s) => window.__rolemateAF.mark(s), [st]).catch(() => {});
  }
};
const fillItems = async (items) => {
  const results = [];
  for (const frameId of [...new Set(items.map((i) => i.frameId))]) {
    const mine = items.filter((i) => i.frameId === frameId).map(({ id, kind, value }) => ({ id, kind, value }));
    results.push(...((await inTab([frameId], (i) => window.__rolemateAF.fill(i), [mine]))[0]?.result || []));
  }
  return results;
};
const focusField = (p) => inTab([p.frameId], (id) => window.__rolemateAF.focus(id), [p.id]).catch(() => {});

// ---------- which job is this form for

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function pickJob() {
  const jobs = S.ctx.jobs.filter((j) => j.status === 'saved' || j.sameUrl);
  const same = jobs.find((j) => j.sameUrl);
  if (same) return same;
  const hay = key(`${S.page?.title} ${S.page?.heading} ${S.page?.site} ${S.page?.host} ${S.url}`);
  const hits = jobs.filter((j) => key(j.company).length >= 3 && hay.includes(key(j.company)));
  return hits.length === 1 ? hits[0] : null;
}

// ---------- views

const show = (...nodes) => root.replaceChildren(el('header', {}, el('div', { class: 'row between' }, el('strong', {}, 'Rolemate autofill'), el('button', { class: 'link', onclick: () => SERVER_OPEN('/#/tracking') }, 'Dashboard'))), el('main', {}, ...nodes));
const msg = (kind, title, text, ...actions) => el('section', { class: `msg ${kind}` }, el('div', { class: 'tab' }, kind === 'stop' ? 'Needs attention' : 'Next step'), el('h1', {}, title), text && el('p', {}, text), ...actions);
const btn = (label, onclick, cls = '') => el('button', { class: `btn ${cls}`, onclick }, label);

function problem(e) {
  if (e.status === 401) return show(msg('stop', 'Sign in to Rolemate', 'Click the Rolemate icon in the toolbar, sign in, then come back to this panel.', btn('Check again', start, 'primary')));
  if (/Cannot access|extension manifest|permission/i.test(e.message || '')) return show(msg('stop', 'Rolemate can’t read this tab yet', 'Click the Rolemate icon on the form’s tab, then choose “Fill the form”. Chrome only lets Rolemate read a page after you click it.', btn('Try again', start, 'primary')));
  show(msg('stop', 'Something went wrong', e.message || 'Try again.', btn('Try again', start, 'primary')));
}

function jobModule() {
  const j = S.job;
  if (!j) {
    const open = S.ctx.jobs.filter((x) => x.status === 'saved');
    return el('section', { class: 'mod' }, el('span', { class: 'tab' }, 'Which job?'),
      el('p', {}, open.length ? 'Pick the job you are applying to, so Rolemate can show the tailored resume and track the application.' : 'This isn’t one of your saved jobs. Capture the job with Rolemate first to get a tailored resume and tracking. You can still fill this form.'),
      open.length > 0 && el('div', { class: 'picker' }, open.slice(0, 8).map((x) => el('button', { onclick: () => { S.job = x; S.pickedJob = true; render(); } }, el('b', {}, x.title || 'Untitled role'), el('span', {}, [x.company, x.fit != null ? `${x.fit}% fit` : ''].filter(Boolean).join(' · '))))));
  }
  const r = j.resume;
  const dl = el('button', { class: 'btn primary small', onclick: async () => { dl.disabled = true; dl.textContent = 'Preparing your PDF…'; try { const n = await downloadResume(r.id); dl.textContent = `Downloaded ${n}`; } catch (e) { dl.disabled = false; dl.textContent = 'Download tailored resume'; S.notice = e.message; render(); } } }, 'Download tailored resume');
  const fileField = S.plan.find((p) => p.kind === 'file');
  return el('section', { class: 'mod' }, el('span', { class: 'tab' }, 'Applying to'),
    el('div', { class: 'jobline' }, j.title || 'Untitled role'),
    el('p', { class: 'muted' }, [j.company, j.fit != null ? `${j.fit}% fit` : ''].filter(Boolean).join(' · ')),
    r ? el('div', { class: 'note' }, el('b', {}, 'Your tailored resume: '), r.label, el('br'), 'Rolemate doesn’t upload files. Download it and attach it to the form’s resume field yourself.',
        el('div', { class: 'row' }, dl, fileField && el('button', { class: 'btn small', onclick: () => focusField(fileField) }, 'Show the resume field')))
      : el('div', { class: 'note warn' }, 'No tailored resume for this job yet. Open it in Rolemate to tailor one, then attach it to the form yourself.', el('div', {}, el('button', { class: 'btn small', onclick: () => SERVER_OPEN(`/#/job/${j.id}`) }, 'Open job in Rolemate'))),
    !S.pickedJob && S.ctx.jobs.filter((x) => x.status === 'saved').length > 1 && el('button', { class: 'link', onclick: () => { S.job = null; render(); } }, 'Wrong job? Choose another'));
}

const GROUPS = (filled) => [['green', filled ? 'Filled from your profile' : 'Ready to fill from your profile'], ['yellow', 'Check these'], ['red', 'Needs you'], ['attach', 'You attach'], ['kept', 'Already filled by you']];
const STATE_WORD = { green: 'Will fill', yellow: 'Will fill, check it' };

function fieldCard(p) {
  const done = p.done;
  const status = done ? 'green' : p.status;
  const q = el('div', { class: 'q' }, el('button', { title: 'Show on the page', onclick: () => focusField(p) }, p.label), !p.required && p.status === 'red' && el('span', { class: 'opt' }, 'optional'));
  const card = el('div', { class: `fld ${status}` }, q);
  if (done || p.status === 'green' || p.status === 'yellow') card.append(el('div', { class: 'v' }, p.value), el('div', { class: 'why' }, done ? p.doneNote || 'Filled.' : S.filled ? (p.failed ? 'Couldn’t fill this one. Do it on the page.' : p.reason) : `${STATE_WORD[p.status]}. ${p.reason}`));
  else card.append(el('div', { class: 'why' }, p.reason));
  if (!done && !p.failed && p.status === 'red' && (p.canAsk || p.sensitive)) card.append(answerBox(p));
  return card;
}

// The user's own answer for a field Rolemate can't fill. Sensitive questions are answered here and not saved.
function answerBox(p) {
  const opts = p.options || [];
  const long = p.kind === 'textarea' || p.needsDraft;
  let input;
  if (opts.length && ['select', 'radio', 'boolean', 'combobox'].includes(p.kind)) input = el('select', { 'aria-label': p.label }, el('option', { value: '' }, 'Choose…'), opts.map((o) => el('option', { value: o }, o)));
  else if (long) input = el('textarea', { 'aria-label': p.label, maxlength: p.maxLength || 4000 });
  else input = el('input', { 'aria-label': p.label, type: p.kind === 'number' ? 'number' : 'text' });
  const draft = S.drafts[p.id];
  if (draft?.answer) input.value = draft.answer;
  const box = el('div', {}, input, draft && !draft.answer && el('div', { class: 'why' }, draft.reason));
  const use = el('button', { class: 'btn primary small', onclick: async () => {
    const v = String(input.value || '').trim(); if (!v) return;
    use.disabled = true;
    await applyAnswer(p, v, !p.sensitive);
  } }, p.sensitive ? 'Fill' : 'Fill and save for next time');
  const row = el('div', { class: 'row' }, use);
  if (p.needsDraft && S.ctx.aiEnabled && !draft?.answer) row.append(el('button', { class: 'btn small', onclick: () => draftFor(p) }, S.drafts[p.id] ? 'Try drafting again' : 'Draft with Rolemate'));
  box.append(row);
  if (draft?.answer) box.append(el('div', { class: 'why' }, 'A draft from your resume and this job. Edit it, then fill it only if it is true.'));
  return box;
}

async function draftFor(p) {
  S.busy = true; render();
  try {
    const r = await callApi('/api/autofill/draft', { method: 'POST', body: { jobId: S.job?.id, page: { title: S.page?.heading || S.page?.title, company: S.job?.company }, questions: [{ id: p.id, label: p.label, options: p.options, maxLength: p.maxLength }] } });
    S.drafts[p.id] = r.drafts?.[0] || { answer: null, reason: 'No draft this time. Write it yourself.' };
  } catch (e) { S.drafts[p.id] = { answer: null, reason: e.message }; }
  S.busy = false; render();
}

async function applyAnswer(p, value, save) {
  const res = await fillItems([{ ...p, value }]);
  const ok = res[0]?.ok;
  Object.assign(p, ok ? { done: true, value, doneNote: save ? 'Filled and saved for your next applications.' : 'Filled.' } : { failed: true, reason: 'Couldn’t fill this one. Do it on the page.' });
  if (ok && save) {
    try { const r = await callApi('/api/autofill/answers', { method: 'POST', body: { question: p.label, answer: value } }); S.ctx.bank = r.answers; } catch (e) { p.doneNote = `Filled, but not saved: ${e.message}`; }
  }
  markAll(); render();
}

async function fillAll() {
  S.busy = true; render();
  const items = S.plan.filter((p) => (p.status === 'green' || p.status === 'yellow') && p.value);
  const res = await fillItems(items).catch(() => []);
  const ok = new Map(res.map((r) => [r.id, r.ok]));
  for (const p of items) if (ok.get(p.id) === false || !ok.has(p.id)) { p.failed = true; p.status = 'yellow'; }
  S.filled = true; S.busy = false;
  markAll(); render();
  // Questions seen and what happened to each. Labels only, never the answers.
  callApi('/api/autofill/log', { method: 'POST', body: { jobId: S.job?.id, host: S.page?.host, questions: S.plan.map((p) => ({ label: p.label, kind: p.kind, outcome: p.failed ? 'check' : p.status === 'green' ? 'filled' : p.status === 'yellow' ? 'check' : p.status === 'attach' ? 'attach' : p.status === 'kept' ? 'kept' : 'asked' })) } }).catch(() => {});
}

async function markApplied() {
  S.busy = true; render();
  try { const r = await callApi(`/api/jobs/${S.job.id}`, { method: 'PATCH', body: { status: 'applied' } }); S.applied = r.job; S.job = { ...S.job, status: 'applied' }; }
  catch (e) { S.notice = e.message; }
  S.busy = false; render();
}

function render() {
  const sum = summarize(S.plan.map((p) => (p.done ? { ...p, status: 'green' } : p)));
  const fillable = S.plan.filter((p) => (p.status === 'green' || p.status === 'yellow') && p.value && !p.done).length;
  const mods = [];
  if (S.notice) mods.push(el('div', { class: 'err' }, S.notice));
  if (S.pause) mods.push(el('div', { class: 'note warn' }, S.pause === 'captcha' ? 'This page has a captcha. Solve it yourself. Rolemate never does.' : 'This page asks for a code. Enter it yourself. Rolemate never reads or fills codes.'));
  if (S.changed) mods.push(el('div', { class: 'note' }, 'The form changed (maybe the next step). ', el('button', { class: 'link inline', onclick: () => rescan() }, 'Read it again')));
  mods.push(jobModule());

  const head = el('section', { class: 'mod' }, el('span', { class: 'tab' }, S.filled ? 'Review' : 'Form found'),
    el('h1', {}, S.filled ? 'Check it, then press Apply yourself' : `${S.plan.length} question${S.plan.length === 1 ? '' : 's'} on this form`),
    el('div', { class: 'sumbar' }, sum.green > 0 && el('span', { class: 'pill green' }, `${sum.green} ${S.filled ? 'filled' : 'ready'}`), sum.yellow > 0 && el('span', { class: 'pill yellow' }, `${sum.yellow} to check`), sum.red > 0 && el('span', { class: 'pill red' }, `${sum.red} need you`), sum.attach > 0 && el('span', { class: 'pill attach' }, `${sum.attach} to attach`)),
    !S.filled && el('p', { class: 'muted' }, fillable ? 'Nothing is typed until you press Fill. Questions Rolemate can’t answer are left for you.' : 'Rolemate has nothing it can fill here yet. You can answer the questions below.'),
    !S.filled && fillable > 0 && el('button', { class: 'btn primary', disabled: S.busy, onclick: fillAll }, S.busy ? 'Filling…' : `Fill ${fillable} field${fillable === 1 ? '' : 's'}`),
    S.filled && el('button', { class: 'btn', onclick: () => rescan() }, 'Read the form again (next step)'));
  mods.push(head);

  for (const [st, title] of GROUPS(S.filled)) {
    const rows = S.plan.filter((p) => (p.done ? 'green' : p.status) === st).sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
    if (rows.length) mods.push(el('div', { class: `group ${st}` }, el('h2', {}, el('i'), `${title} (${rows.length})`), rows.map(fieldCard)));
  }

  if (S.ctx.missing?.length) mods.push(el('div', { class: 'note' }, 'Add details once and every form will use them: ', el('button', { class: 'link inline', onclick: () => SERVER_OPEN('/#/profile') }, 'Application details in your dashboard')));

  mods.push(el('section', { class: 'mod' }, el('span', { class: 'tab' }, 'When you’ve applied'),
    S.applied ? el('p', {}, `Tracked as applied.${S.applied.followUpDue ? ` Follow up on ${new Date(`${S.applied.followUpDue.slice(0, 10)}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} if you haven’t heard back.` : ''}`)
      : [el('p', {}, S.job ? 'Press Apply on the form yourself. Then tell Rolemate so it can track the application and set a follow-up.' : 'Pick the job above to track this application.'),
         S.job && btn('I pressed Apply: track it', markApplied, S.filled ? 'primary' : '')]));
  mods.push(el('p', { class: 'never' }, 'Rolemate fills in details you already gave it. It never uploads files, never solves captchas or reads codes, and never presses Apply for you.'));
  show(...mods);
}

async function rescan() {
  S.busy = true; render();
  try { await readForms(); S.filled = false; S.drafts = {}; markAll(); }
  catch (e) { return problem(e); }
  S.busy = false; render();
}

async function start() {
  show(el('section', { class: 'msg info' }, el('div', { class: 'tab' }, 'One moment'), el('h1', {}, 'Reading the form…')));
  Object.assign(S, { ctx: null, forms: [], plan: [], job: null, pickedJob: false, filled: false, changed: false, notice: '', pause: null, busy: false, drafts: {}, applied: null });
  try {
    const tab = params.get('tab') ? await chrome.tabs.get(Number(params.get('tab'))) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab || !/^https?:/.test(tab.url || '')) return show(msg('info', 'Open an application form', 'Go to the job’s application form, then click the Rolemate icon and choose “Fill the form”.', btn('Check again', start, 'primary')));
    S.tabId = tab.id; S.url = tab.url;
    S.ctx = await callApi(`/api/autofill/context?url=${encodeURIComponent(tab.url)}`);
    if (!S.ctx.hasResume) return show(msg('stop', 'Upload your resume first', 'Rolemate builds your application details from your resume.', btn('Open Rolemate', () => SERVER_OPEN('/'), 'primary')));
    await readForms();
    if (!S.forms.length) return show(msg('info', 'No application form here', 'Open the page with the form (the one with your name, email and a resume upload), then read it again.', btn('Read this page again', start, 'primary')), el('p', { class: 'never' }, 'Rolemate only reads a page after you click it. It does nothing in the background.'));
    S.job = pickJob(); markAll(); render();
  } catch (e) { problem(e); }
}

// The form changes as the user moves through steps: offer to read it again, never do it silently.
chrome.runtime.onMessage.addListener((m, sender) => { if (m?.type === 'rm:changed' && sender.tab?.id === S.tabId && S.ctx && !S.busy) { S.changed = true; render(); } });
chrome.tabs.onActivated.addListener(() => { if (!params.get('tab')) start(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (id === S.tabId && info.status === 'loading' && info.url && !params.get('tab')) start(); });
window.__rolemateStart = start; // for tests
start();
