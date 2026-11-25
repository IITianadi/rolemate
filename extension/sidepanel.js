// Rolemate side panel: fill an application form with the details in the user's Rolemate profile.
//
// What this does: only for a job the user saved in Rolemate (and that has a credit), it reads the form in the open tab, fills it
// in one go from the profile and resume (assuming what the resume doesn't say) and shows only what needs the user's attention.
// The user attaches their tailored resume and presses Apply themselves. Nothing here clicks Submit, Apply or Next, or uploads a file.
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

const S = { tabId: null, url: '', ctx: null, data: null, wantFill: false, flash: '', forms: [], plan: [], job: null, pickedJob: false, filled: false, changed: false, notice: '', pause: null, busy: false, drafts: {}, applied: null };

// ---------- the page

const inTab = (frameIds, func, args = []) => chrome.scripting.executeScript({ target: frameIds ? { tabId: S.tabId, frameIds } : { tabId: S.tabId, allFrames: true }, func, args });
// Finds the application form(s) in the tab. Read-only; nothing is scanned field by field until a saved job is chosen.
async function detectForms() {
  await chrome.scripting.executeScript({ target: { tabId: S.tabId, allFrames: true }, files: ['content/autofill.js'] });
  const runs = await inTab(null, () => window.__rolemateAF?.detect());
  const found = runs.filter((r) => r.result && (r.result.isForm || r.result.fields >= 3)).sort((a, b) => (b.result.isForm - a.result.isForm) || (b.result.fields - a.result.fields));
  S.forms = found.filter((r) => r.result.isForm).map((r) => ({ frameId: r.frameId, ...r.result }));
  S.pause = runs.map((r) => r.result?.pause).find(Boolean) || null;
  S.page = runs.find((r) => r.frameId === 0)?.result || runs[0]?.result || {};
}
async function scanPlan() {
  const fields = [];
  for (const f of S.forms) {
    const got = (await inTab([f.frameId], () => window.__rolemateAF.scan()))[0]?.result || [];
    for (const x of got) fields.push({ ...x, frameId: f.frameId });
  }
  S.plan = planFields(fields, S.data.profile, S.data.bank);
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
  const r = j.resume;
  const dl = el('button', { class: 'btn primary small', onclick: async () => { dl.disabled = true; dl.textContent = 'Preparing your PDF…'; try { const n = await downloadResume(r.id); dl.textContent = `Downloaded ${n}`; } catch (e) { dl.disabled = false; dl.textContent = 'Download tailored resume'; S.notice = e.message; render(); } } }, 'Download tailored resume');
  const fileField = S.plan.find((p) => p.kind === 'file');
  return el('section', { class: 'mod' }, el('span', { class: 'tab' }, 'Applying to'),
    el('div', { class: 'jobline' }, j.title || 'Untitled role'),
    el('p', { class: 'muted' }, [j.company, j.fit != null ? `${j.fit}% fit` : ''].filter(Boolean).join(' · ')),
    r ? el('div', { class: 'note' }, el('b', {}, 'Your tailored resume: '), r.label, el('br'), 'Rolemate doesn’t upload files. Download it and attach it to the form’s resume field yourself.',
        el('div', { class: 'row' }, dl, fileField && el('button', { class: 'btn small', onclick: () => focusField(fileField) }, 'Show the resume field')))
      : el('div', { class: 'note warn' }, 'No tailored resume for this job yet. Open it in Rolemate to tailor one, then attach it to the form yourself.', el('div', {}, el('button', { class: 'btn small', onclick: () => SERVER_OPEN(`/#/job/${j.id}`) }, 'Open job in Rolemate'))),
    !S.pickedJob && S.ctx.jobs.filter((x) => x.status === 'saved' && x.credit).length > 1 && el('button', { class: 'link', onclick: changeJob }, 'Wrong job? Choose another'));
}

// Only what needs the user is on show: what Rolemate couldn't do, what it assumed or couldn't fill, and the file to attach.
// Everything it filled confidently is folded into one line.
const GROUPS = [['red', 'Needs you'], ['yellow', 'Check these'], ['attach', 'You attach']];
const STATE_WORD = { green: 'Will fill', yellow: 'Will fill, check it' };

function fieldCard(p) {
  const done = p.done;
  const status = done ? 'green' : p.status;
  const q = el('div', { class: 'q' }, el('button', { title: 'Show on the page', onclick: () => focusField(p) }, p.label), !p.required && p.status === 'red' && el('span', { class: 'opt' }, 'optional'), p.aiDraft && !done && el('span', { class: 'opt' }, 'assumed'));
  const card = el('div', { class: `fld ${status}` }, q);
  const reviewing = p.aiDraft && S.filled && !done && !p.failed; // the editor below shows the draft, so don't print it twice
  if (done || p.status === 'green' || p.status === 'yellow') card.append(!reviewing && el('div', { class: 'v' }, p.value), el('div', { class: 'why' }, done ? p.doneNote || 'Filled.' : S.filled ? (p.failed ? 'Couldn’t fill this one. Do it on the page.' : p.reason) : `${STATE_WORD[p.status]}. ${p.reason}`));
  else card.append(el('div', { class: 'why' }, p.reason));
  if (!done && !p.failed && p.status === 'red' && (p.canAsk || p.sensitive)) card.append(answerBox(p));
  if (!done && p.aiDraft && S.filled && !p.failed) card.append(answerBox(p, true));
  return card;
}

// The user's own answer for a field Rolemate can't fill. Sensitive questions are answered here and not saved.
function answerBox(p, review = false) {
  const opts = p.options || [];
  const long = p.kind === 'textarea' || p.needsDraft;
  let input;
  if (opts.length && ['select', 'radio', 'boolean', 'combobox'].includes(p.kind)) input = el('select', { 'aria-label': p.label }, el('option', { value: '' }, 'Choose…'), opts.map((o) => el('option', { value: o }, o)));
  else if (long) input = el('textarea', { 'aria-label': p.label, maxlength: p.maxLength || 4000 });
  else input = el('input', { 'aria-label': p.label, type: p.kind === 'number' ? 'number' : 'text' });
  const draft = S.drafts[p.id];
  if (review) input.value = p.value; else if (draft?.answer) input.value = draft.answer;
  const box = el('div', {}, input, draft && !draft.answer && el('div', { class: 'why' }, draft.reason));
  const use = el('button', { class: 'btn primary small', onclick: async () => {
    const v = String(input.value || '').trim(); if (!v) return;
    use.disabled = true;
    await applyAnswer(p, v, !p.sensitive);
  } }, review ? 'Looks right: keep for next time' : p.sensitive ? 'Fill' : 'Fill and save for next time');
  const row = el('div', { class: 'row' }, use);
  if (review) row.append(el('button', { class: 'btn small', onclick: async () => { const v = String(input.value || '').trim(); if (v) await applyAnswer(p, v, false); } }, 'Update on form only'));
  if (!review && p.needsDraft && S.ctx.aiEnabled && !draft?.answer) row.append(el('button', { class: 'btn small', onclick: () => draftFor(p) }, S.drafts[p.id] ? 'Try drafting again' : 'Draft with Rolemate'));
  box.append(row);
  if (draft?.answer) box.append(el('div', { class: 'why' }, 'Assumed from your resume and this job. Change it if it isn’t right.'));
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
    try { const r = await callApi('/api/autofill/answers', { method: 'POST', body: { question: p.label, answer: value } }); S.data.bank = r.answers; } catch (e) { p.doneNote = `Filled, but not saved: ${e.message}`; }
  }
  S.flash = ok ? `${save ? 'Filled and saved for next time' : 'Filled'}: ${p.label}` : '';
  markAll(); render();
}

// Questions the profile can't answer. Sensitive (EEO) questions, consent checkboxes, files and unsupported fields are never drafted: those are the user's to answer.
const draftable = (p) => p.status === 'red' && !p.sensitive && !p.failed && p.canAsk && !['checkbox', 'unsupported', 'file'].includes(p.kind);
const dkey = (p) => `${p.frameId}:${p.id}`;

// First time or not: one batched call answers every one of those from the resume, profile and job, assuming what they don't say.
async function draftMissing() {
  if (!S.ctx.aiEnabled) return;
  const todo = S.plan.filter(draftable);
  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    try {
      const r = await callApi('/api/autofill/draft', { method: 'POST', body: { jobId: S.job?.id, page: { title: S.page?.heading || S.page?.title, company: S.job?.company }, questions: chunk.map((p) => ({ id: dkey(p), label: p.label, options: p.options, maxLength: p.maxLength })) } });
      for (const d of r.drafts || []) {
        const p = chunk.find((x) => dkey(x) === d.id); if (!p) continue;
        if (d.answer) Object.assign(p, { status: 'yellow', value: d.answer, source: 'AI draft', aiDraft: true, reason: 'Assumed from your resume and profile. Check it before you apply.' });
        else S.drafts[p.id] = d;
      }
    } catch (e) { S.notice = e.message; break; }
  }
}

async function fillAll() {
  S.busy = true; S.flash = ''; render();
  await draftMissing();
  const items = S.plan.filter((p) => (p.status === 'green' || p.status === 'yellow') && p.value);
  const res = await fillItems(items).catch(() => []);
  const ok = new Map(res.map((r) => [r.id, r.ok]));
  for (const p of items) if (ok.get(p.id) === false || !ok.has(p.id)) { p.failed = true; p.status = 'yellow'; }
  S.filled = true; S.busy = false;
  markAll(); render();
  // Questions seen and what happened to each. Labels only, never the answers.
  callApi('/api/autofill/log', { method: 'POST', body: { jobId: S.job?.id, host: S.page?.host, questions: S.plan.map((p) => ({ label: p.label, kind: p.kind, outcome: p.failed ? 'check' : p.status === 'green' ? 'filled' : p.aiDraft ? 'drafted' : p.status === 'yellow' ? 'check' : p.status === 'attach' ? 'attach' : p.status === 'kept' ? 'kept' : 'asked' })) } }).catch(() => {});
}

async function markApplied() {
  S.busy = true; render();
  try { const r = await callApi(`/api/jobs/${S.job.id}`, { method: 'PATCH', body: { status: 'applied' } }); S.applied = r.job; S.job = { ...S.job, status: 'applied' }; }
  catch (e) { S.notice = e.message; }
  S.busy = false; render();
}

function render() {
  const sum = summarize(S.plan.map((p) => (p.done ? { ...p, status: 'green' } : p)));
  const attention = sum.red + sum.yellow + sum.attach;
  const mods = [];
  if (S.notice) mods.push(el('div', { class: 'err' }, S.notice));
  if (S.flash) mods.push(el('div', { class: 'note' }, S.flash));
  if (S.pause) mods.push(el('div', { class: 'note warn' }, S.pause === 'captcha' ? 'This page has a captcha. Solve it yourself. Rolemate never does.' : 'This page asks for a code. Enter it yourself. Rolemate never reads or fills codes.'));
  if (S.changed && !S.auto) mods.push(el('div', { class: 'note' }, 'The form changed (maybe the next step). ', el('button', { class: 'link inline', onclick: () => rescan() }, 'Read it again')));
  mods.push(jobModule());

  const fillable = S.plan.filter((p) => (p.status === 'green' || p.status === 'yellow') && p.value && !p.done).length;
  const toDraft = S.ctx.aiEnabled && !S.filled ? S.plan.filter(draftable).length : 0;
  const head = el('section', { class: 'mod' }, el('span', { class: 'tab' }, S.filled ? 'Review' : 'Form found'),
    el('h1', {}, S.filled ? (attention ? 'Check these, then press Apply yourself' : 'All filled. Press Apply yourself') : `${S.plan.length} question${S.plan.length === 1 ? '' : 's'} on this form`),
    el('div', { class: 'sumbar' }, sum.green + sum.kept > 0 && el('span', { class: 'pill green' }, `${sum.green + sum.kept} ${S.filled ? 'filled' : 'ready'}`), sum.yellow > 0 && el('span', { class: 'pill yellow' }, `${sum.yellow} to check`), sum.red > 0 && el('span', { class: 'pill red' }, `${sum.red} need you`), sum.attach > 0 && el('span', { class: 'pill attach' }, `${sum.attach} to attach`)),
    S.busy && !S.filled && el('div', { class: 'note' }, S.auto ? 'Filling the whole form and drafting answers…' : 'Working…'),
    S.filled && attention > 0 && el('p', { class: 'muted' }, `${attention} thing${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} your attention. Each is outlined on the page.`),
    !S.filled && !S.busy && el('p', { class: 'muted' }, fillable || toDraft ? `Rolemate fills what your profile knows${toDraft ? ' and drafts the rest from your resume and this job, assuming what they don’t say. Assumed answers are marked yellow.' : '. Questions it can’t answer are left for you.'}` : 'Rolemate has nothing it can fill here yet. You can answer the questions below.'),
    !S.filled && !S.busy && (fillable > 0 || toDraft > 0) && el('button', { class: 'btn primary', onclick: fillAll }, toDraft ? `Fill ${fillable} and draft ${toDraft} answer${toDraft === 1 ? '' : 's'}` : `Fill ${fillable} field${fillable === 1 ? '' : 's'}`),
    S.filled && el('button', { class: 'btn', onclick: () => rescan() }, 'Read the form again (next step)'));
  mods.push(head);

  for (const [st, title] of GROUPS) {
    const rows = S.plan.filter((p) => (p.done ? 'green' : p.status) === st).sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
    if (rows.length) mods.push(el('div', { class: `group ${st}` }, el('h2', {}, el('i'), `${title} (${rows.length})`), rows.map(fieldCard)));
  }
  // Filled with confidence, or already filled by the user: nothing to do, so it is folded away.
  const filled = S.plan.filter((p) => p.done || (S.filled ? p.status === 'green' : false) || p.status === 'kept');
  if (filled.length) mods.push(el('details', { class: 'group green' }, el('summary', {}, `${filled.length} field${filled.length === 1 ? '' : 's'} filled from your profile`), filled.map(fieldCard)));
  if (!S.filled) {
    const ready = S.plan.filter((p) => p.status === 'green' && !p.done);
    if (ready.length) mods.push(el('details', { class: 'group green' }, el('summary', {}, `${ready.length} field${ready.length === 1 ? '' : 's'} ready to fill`), ready.map(fieldCard)));
  }

  if (S.data.missing?.length) mods.push(el('div', { class: 'note' }, 'Add details once and every form will use them: ', el('button', { class: 'link inline', onclick: () => SERVER_OPEN('/#/profile') }, 'Application details in your dashboard')));

  mods.push(el('section', { class: 'mod' }, el('span', { class: 'tab' }, 'When you’ve applied'),
    S.applied ? el('p', {}, `Tracked as applied.${S.applied.followUpDue ? ` Follow up on ${new Date(`${S.applied.followUpDue.slice(0, 10)}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} if you haven’t heard back.` : ''}`)
      : [el('p', {}, 'Press Apply on the form yourself. Then tell Rolemate so it can track the application and set a follow-up.'), btn('I pressed Apply: track it', markApplied, S.filled ? 'primary' : '')]));
  mods.push(el('p', { class: 'never' }, 'Rolemate fills in your details and assumes the rest from your resume, so read what is marked. It never uploads files, never solves captchas or reads codes, and never presses Apply for you.'));
  show(...mods);
}

// ---------- which saved job: nothing is read, filled or drafted until the form is tied to one of the user's saved, credited jobs

const buyCredits = () => SERVER_OPEN('/#/settings/billing');
function gateView() {
  const open = S.ctx.jobs.filter((x) => x.status === 'saved');
  const ready = open.filter((x) => x.credit); const locked = open.filter((x) => !x.credit);
  const lockedNote = locked.length > 0 && el('div', { class: 'note warn' }, `${locked.length} saved job${locked.length === 1 ? ' is' : 's are'} waiting for credits, so ${locked.length === 1 ? 'its form' : 'their forms'} can’t be filled yet. `, el('button', { class: 'link inline', onclick: buyCredits }, 'Buy credits'));
  if (ready.length) {
    return show(el('section', { class: 'mod' }, el('span', { class: 'tab' }, 'Which job?'),
      el('p', {}, 'Pick the saved job this form is for. Rolemate fills forms only for jobs you have saved.'),
      el('div', { class: 'picker' }, ready.slice(0, 8).map((x) => el('button', { onclick: () => chooseJob(x) }, el('b', {}, x.title || 'Untitled role'), el('span', {}, [x.company, x.fit != null ? `${x.fit}% fit` : ''].filter(Boolean).join(' · '))))),
      el('p', { class: 'hint' }, 'Not in the list? Open the job’s posting, click Rolemate and choose “Capture this job”.')), lockedNote,
      el('p', { class: 'never' }, 'Autofill is included with each saved job. It works only for jobs you have saved in Rolemate.'));
  }
  show(msg('stop', 'Save this job in Rolemate first', 'Rolemate fills in application forms only for jobs you have saved. Open the job’s posting, click Rolemate and choose “Capture this job”. That saves it, tailors your resume and unlocks this form.',
    btn('I’ve saved it: check again', start, 'primary')), lockedNote, el('p', { class: 'never' }, 'Autofill is included with each saved job, so there is nothing to pay for beyond the job’s credit.'));
}
function lockedView(job) {
  show(msg('stop', 'This job needs a credit', `“${job.title || 'This job'}” is saved, but it hasn’t been unlocked. Autofill is included once a job has a credit.`, btn('Buy credits', buyCredits, 'primary'), btn('Check again', start)));
}

async function chooseJob(job) { S.job = job; S.pickedJob = true; await proceed(); }
async function changeJob() {
  S.job = null; S.plan = []; S.data = null; S.filled = false; S.pickedJob = false;
  await inTab(null, () => window.__rolemateAF?.unmark()).catch(() => {});
  gateView();
}

// A saved, credited job is chosen: get the fill data for it from the server, read the form and show the plan.
async function proceed() {
  show(el('section', { class: 'msg info' }, el('div', { class: 'tab' }, 'One moment'), el('h1', {}, 'Reading the form…')));
  try {
    S.data = await callApi(`/api/autofill/jobs/${S.job.id}/data`);
    await scanPlan(); markAll(); render();
    // Opened by "Fill the form": fill straight away, then show what needs attention.
    if (S.wantFill) { S.wantFill = false; S.auto = true; passes = 0; await fillAll(); }
  } catch (e) { if (e.status === 402) return lockedView(S.job); problem(e); }
}

async function rescan({ fill = false } = {}) {
  S.busy = true; render();
  try { await detectForms(); await scanPlan(); S.filled = false; S.drafts = {}; S.flash = ''; markAll(); }
  catch (e) { return problem(e); }
  S.busy = false;
  if (fill) { await fillAll(); return; }
  render();
}

// One click fills the whole form. The page changes when the user moves to the next step (they press Next, never Rolemate):
// new fields are read and filled the same way, a few passes at most.
let passes = 0;
async function continueFilling() {
  if (!S.auto || S.busy || passes >= 5) return;
  passes++;
  await rescan({ fill: true });
}

async function takeRequest(tabId) {
  const { autofillRequest: r } = await chrome.storage.local.get('autofillRequest');
  if (!r || r.tabId !== tabId || Date.now() - r.at > 60000) return null; // only a request for this panel's own tab
  await chrome.storage.local.remove('autofillRequest');
  return r;
}

let starting = null;
const start = () => (starting ??= run().finally(() => { starting = null; }));
async function run() {
  show(el('section', { class: 'msg info' }, el('div', { class: 'tab' }, 'One moment'), el('h1', {}, 'Reading the form…')));
  Object.assign(S, { auto: false, ctx: null, data: null, wantFill: false, flash: '', forms: [], plan: [], job: null, pickedJob: false, filled: false, changed: false, notice: '', pause: null, busy: false, drafts: {}, applied: null });
  try {
    const tab = params.get('tab') ? await chrome.tabs.get(Number(params.get('tab'))) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab || !/^https?:/.test(tab.url || '')) return show(msg('info', 'Open an application form', 'Go to the job’s application form, then click the Rolemate icon and choose “Fill the form”.', btn('Check again', start, 'primary')));
    S.tabId = tab.id; S.url = tab.url;
    S.ctx = await callApi(`/api/autofill/context?url=${encodeURIComponent(tab.url)}`);
    if (!S.ctx.hasResume) return show(msg('stop', 'Upload your resume first', 'Rolemate builds your application details from your resume.', btn('Open Rolemate', () => SERVER_OPEN('/'), 'primary')));
    await detectForms();
    if (!S.forms.length) return show(msg('info', 'No application form here', 'Open the page with the form (the one with your name, email and a resume upload), then read it again.', btn('Read this page again', start, 'primary')), el('p', { class: 'never' }, 'Rolemate only reads a page after you click it. It does nothing in the background.'));
    S.wantFill = !!(await takeRequest(S.tabId)); // "Fill the form" was clicked
    S.job = pickJob();
    if (!S.job) return gateView();
    if (!S.job.credit) return lockedView(S.job);
    await proceed();
  } catch (e) { problem(e); }
}

// The form changes as the user moves through steps: offer to read it again, never do it silently.
chrome.runtime.onMessage.addListener((m, sender) => {
  if (m?.type !== 'rm:changed' || sender.tab?.id !== S.tabId || !S.data || S.busy) return;
  if (S.auto) continueFilling(); else { S.changed = true; render(); }
});
// "Fill the form" clicked while the panel is already open.
chrome.storage.onChanged.addListener(async (c, area) => {
  if (area !== 'local' || !c.autofillRequest?.newValue) return;
  if (starting) await starting; // a run that was already starting may have taken it
  const r = (await chrome.storage.local.get('autofillRequest')).autofillRequest;
  if (r && r.tabId === S.tabId) start();
});
chrome.tabs.onActivated.addListener(() => { if (!params.get('tab')) start(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (id === S.tabId && info.status === 'loading' && info.url && !params.get('tab')) start(); });
window.__rolemateStart = start; // for tests
start();
