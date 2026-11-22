import { h, toast, clear } from './dom.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { pageHead, emptyState, nextStep, logoMark, ago, exact, parseTs, creditNudge } from './ui.js';

export const STATUS_LABEL = { saved: 'Saved', applied: 'Applied', screening: 'Screening call', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
export const bandOf = (m) => m?.band || 'unknown';
export const scorePill = (m) => h('span', { class: `pill ${bandOf(m)}`, title: m?.note || '' }, m?.score == null ? 'n/a' : `${m.score}%`);

const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// Paste a job description instead of using the extension: same pipeline (/api/capture).
function addJobPanel(go) {
  const text = h('textarea', { rows: 8, placeholder: 'Paste the job description', 'aria-label': 'Job description' });
  const url = h('input', { type: 'text', placeholder: 'Link to the job (optional)', 'aria-label': 'Job link' });
  const err = h('div', { class: 'error', hidden: true, role: 'alert' });
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      const r = await api('/api/capture', { method: 'POST', body: { text: text.value, url: url.value.trim(), source: 'pasted' } });
      toast(r.quotaExceeded ? 'Saved, but you’re out of free resumes. Pay now to keep going.' : 'Job added');
      go(`#/job/${r.job.id}`);
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
  } }, 'Add job');
  return h('div', { class: 'card', id: 'add-job', hidden: true, style: 'margin-bottom:26px' },
    h('div', { class: 'cardhead' }, h('div', null, h('h2', null, 'Add a job'), h('p', null, 'Paste the description. We do the rest.'))),
    h('div', { class: 'stack' }, text, url, err, h('div', { class: 'row' }, btn, h('button', { class: 'btn ghost', onclick: () => { document.getElementById('add-job').hidden = true; } }, 'Cancel'))));
}
const toggleAdd = () => { const el = document.getElementById('add-job'); el.hidden = !el.hidden; if (!el.hidden) el.querySelector('textarea').focus(); };

// Called by the "Add job" button in the top bar, from any screen.
let wantAdd = false;
export function requestAdd(go) {
  if (document.getElementById('add-job')) { toggleAdd(); return; }
  wantAdd = true; go('#/tracking');
}

// One sentence about what to do now: interviews first, then the best saved job (apply at 75% or more, otherwise tailor first).
const label = (j) => [j.title, j.company].filter(Boolean).join(' at ');
function suggestion(jobs, open) {
  const talk = jobs.find((j) => ['interview', 'screening', 'offer'].includes(j.status));
  const best = jobs.filter((j) => j.status === 'saved').sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1))[0];
  if (talk) return { id: talk.id, node: nextStep({ label: 'Next', title: `Prepare for ${label(talk)}`, sub: 'Likely questions, with answers drawn from your resume.', actions: [h('a', { class: 'btn', href: `#/job/${talk.id}` }, 'Open prep')] }) };
  if (best) {
    const sc = best.match?.score, ready = sc != null && sc >= 75, miss = (best.match?.missingMust || []).slice(0, 3).join(', ');
    return { id: best.id, node: nextStep({ label: 'Next', title: `${ready ? 'Apply to' : 'Tailor your resume for'} ${label(best)}`,
      sub: sc == null ? 'Review the job and your fit.' : ready ? `${sc}% fit${best.resumes.length ? '. Your tailored resume is ready. You press apply yourself.' : ''}` : `${sc}% fit${miss ? `. Missing: ${miss}` : ''}`,
      actions: [h('a', { class: 'btn', href: `#/job/${best.id}` }, ready ? 'Open resume' : 'Tailor resume')] }) };
  }
  return { id: null, node: nextStep({ label: 'Next', title: 'Add your next job', sub: 'Paste a description or use the extension.', actions: [h('button', { class: 'btn', onclick: open }, 'Add job')] }) };
}

// First-run checklist: five steps from "resume uploaded" to "first application". Progress comes from real data
// (jobs, downloads, stages); only "extension installed" and "skip" are remembered in this browser.
const userKey = (me, k) => `rm_${k}_${me.user.email}`;
function checklist(me, jobs, go) {
  const firstWithResume = jobs.find((j) => j.resumes.length);
  const steps = [
    { title: 'Upload your resume', sub: 'Done. Every tailored version keeps its layout.', done: true },
    { title: 'Install the Chrome extension', sub: 'Save jobs from LinkedIn, Naukri and company pages in one click. Pin it so it’s always there.',
      done: store.get(userKey(me, 'ext'), '') === '1' || jobs.some((j) => j.source && j.source !== 'pasted'),
      act: (now) => [h('a', { class: `btn ${now ? 'primary' : 'sm'}`, href: '#/settings/extension' }, 'Install extension'),
        h('button', { class: 'btn ghost sm', onclick: () => { store.set(userKey(me, 'ext'), '1'); go('#/tracking'); } }, 'I’ve installed it')] },
    { title: 'Capture your first job', sub: 'Open any job and click the extension. Or paste the description here.', done: jobs.length > 0,
      act: (now) => [h('button', { class: `btn ${now ? 'primary' : 'sm'}`, onclick: toggleAdd }, 'Paste a job')] },
    { title: 'Download your tailored resume', sub: 'It’s ready seconds after you capture a job.', done: jobs.some((j) => j.status !== 'saved' || j.resumes.some((r) => r.downloaded)),
      act: (now) => firstWithResume ? [h('a', { class: `btn ${now ? 'primary' : 'sm'}`, href: `#/job/${firstWithResume.id}` }, 'Open your resume')] : [] },
    { title: 'Mark your first application', sub: 'Applied? Tell us, and your tracker stays honest.', done: jobs.some((j) => j.status !== 'saved'),
      act: (now) => jobs[0] ? [h('a', { class: `btn ${now ? 'primary' : 'sm'}`, href: `#/job/${(firstWithResume || jobs[0]).id}` }, 'Open job')] : [] },
  ];
  const doneN = steps.filter((s) => s.done).length;
  const nowAt = steps.findIndex((s) => !s.done);
  if (nowAt === -1) {
    store.set(userKey(me, 'setup'), '1'); // setup is done: the This week module takes the column
    return null;
  }
  if (store.get(userKey(me, 'skip'), '') === '1') {
    // Hidden, not gone: a compact reminder that always names the next step, until setup is finished.
    const next = steps[nowAt];
    return h('section', { class: 'dmod setup-mini', 'aria-label': 'Finish setup' }, h('div', { class: 'dtab' }, 'Finish setup'),
      h('p', { class: 'count' }, h('b', null, `${doneN} of ${steps.length}`), ' done'),
      h('div', { class: 'progress-track' }, h('i', { style: `width:${Math.round((doneN / steps.length) * 100)}%` })),
      h('p', null, h('b', null, 'Next: '), next.title),
      h('div', { class: 'row' }, ...(next.act ? next.act(true) : []),
        h('button', { class: 'btn ghost sm', onclick: () => { store.set(userKey(me, 'skip'), ''); go('#/tracking'); } }, 'Show all steps')));
  }
  return h('div', { class: 'card onboard', style: 'margin-bottom:26px' },
    h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Your progress'), h('span', { class: 'muted small' }, h('b', null, `${doneN} of ${steps.length}`), ' done')),
    h('div', { class: 'progress-track' }, h('i', { style: `width:${Math.round((doneN / steps.length) * 100)}%` })),
    h('div', { style: 'margin-top:10px' }, steps.map((s, i) => h('div', { class: `todo ${s.done ? 'done' : i === nowAt ? 'now' : 'later'}` },
      h('span', { class: 'dot' }, s.done ? '✓' : String(i + 1)),
      h('div', { class: 'grow' }, h('h3', null, s.title), !s.done && h('div', { class: 'muted small' }, s.sub)),
      !s.done && s.act && h('div', { class: 'act' }, s.act(i === nowAt))))),
    h('p', { class: 'small muted', style: 'text-align:center;margin:14px 0 0' }, 'Prefer to look around first? ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); store.set(userKey(me, 'skip'), '1'); go('#/tracking'); } }, 'Hide this checklist')));
}

export async function trackingView(me, go) {
  // #/tracking/add (from the extension on an unsupported site): open the paste panel.
  if (location.hash === '#/tracking/add') { wantAdd = true; history.replaceState(null, '', '#/tracking'); }
  const { jobs, statuses } = await api('/api/jobs');
  const host = h('div');
  const credits = me.quota?.remaining;
  if (!jobs.length) {
    const list = checklist(me, jobs, go);
    if (list) {
      host.append(h('div', { style: 'max-width:820px;margin:0 auto' },
        h('h1', { style: 'font-size:clamp(2rem,4vw,2.6rem)' }, 'Welcome. Let’s get your first tailored resume.'),
        h('p', { class: 'muted', style: 'margin:12px 0 22px;font-weight:500' }, 'A few quick steps. About 3 minutes.'),
        credits != null && h('div', { class: 'reward-line' }, 'You have ', h('b', null, `${credits} free credit${credits === 1 ? '' : 's'}`), '. One credit covers one job, from saving it to interview prep.'),
        addJobPanel(go), list));
    } else {
      host.append(pageHead('Jobs'), addJobPanel(go),
        emptyState(icon('board', 22), 'Add your first job', 'Paste a job description or use the extension.', h('button', { class: 'btn primary lg', onclick: toggleAdd }, 'Paste a job')));
    }
    if (wantAdd) { wantAdd = false; queueMicrotask(toggleAdd); }
    return host;
  }

  // Jobs in the new look: fit first, what is missing, one clear action per row, valid stage moves only.
  const NEXT = { saved: ['applied'], applied: ['screening', 'rejected'], screening: ['interview', 'rejected'], interview: ['offer', 'rejected'], offer: ['rejected'], rejected: [] };
  const n = (k) => jobs.filter((j) => j.status === k).length;
  const talking = n('screening') + n('interview');
  const weekAgo = Date.now() - 7 * 864e5;
  const appliedWeek = jobs.filter((j) => j.status !== 'saved' && j.appliedAt && (parseTs(j.appliedAt)?.getTime() || 0) > weekAgo).length;
  let q = '', stage = 'all', sort = 'action';
  const body = h('div'), pipe = h('div', { class: 'dpipe', role: 'group', 'aria-label': 'Filter by stage' });
  const search = h('input', { type: 'search', placeholder: 'Search role or company', 'aria-label': 'Search jobs', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  const sorter = h('select', { 'aria-label': 'Sort jobs', onchange: (e) => { sort = e.target.value; draw(); } },
    h('option', { value: 'action' }, 'Action needed'), h('option', { value: 'fit' }, 'Highest fit'), h('option', { value: 'new' }, 'Newest'));
  const score = (j) => j.match?.score ?? -1;
  const rank = (j) => (j.status === 'interview' || j.status === 'offer' ? 0 : j.status === 'screening' ? 1 : j.status === 'saved' ? (score(j) >= 75 ? 2 : 3) : j.status === 'applied' ? 4 : 5);
  const visible = () => jobs.filter((j) => (stage === 'all' || j.status === stage) && (!q || `${j.title} ${j.company}`.toLowerCase().includes(q)))
    .sort(sort === 'fit' ? (a, b) => score(b) - score(a) : sort === 'new' ? (a, b) => b.id - a.id : (a, b) => rank(a) - rank(b) || score(b) - score(a));

  const move = async (j, st) => {
    const was = j.status;
    try {
      await api(`/api/jobs/${j.id}`, { method: 'PATCH', body: { status: st } });
      toast(`${label(j)} moved to ${STATUS_LABEL[st]}.`, false, { label: 'Undo', fn: async () => { try { await api(`/api/jobs/${j.id}`, { method: 'PATCH', body: { status: was } }); } catch (x) { toast(x.message, true); } go('#/tracking'); } });
      go('#/tracking');
    } catch (x) { toast(x.message, true); }
  };
  const when = (j) => j.appliedAt && j.status !== 'saved' ? `Applied ${ago(j.appliedAt)}` : `Saved ${ago(j.createdAt)}`;
  const next = suggestion(jobs, toggleAdd);

  function drawPipe() {
    clear(pipe);
    for (const [k, l] of [['all', 'All'], ...statuses.map((s) => [s, STATUS_LABEL[s]])]) {
      const c = k === 'all' ? jobs.length : n(k);
      pipe.append(h('button', { class: c ? '' : 'dim', 'aria-pressed': String(stage === k), onclick: () => { stage = k; draw(); } }, l, ' ', h('b', null, c)));
    }
  }
  function row(j) {
    const off = j.status === 'rejected', sc = j.match?.score, band = off ? 'off' : bandOf(j.match);
    const miss = (j.match?.missingMust || []).slice(0, 3);
    const hint = off ? 'Not this time. Your notes and prep stay saved.' : miss.length ? [h('b', null, 'Missing: '), miss.join(', ')] : j.status === 'saved' && sc >= 75 ? [h('b', null, 'Ready to apply.'), ' Your tailored resume is done.'] : null;
    const act = j.status === 'saved' ? (sc >= 75 ? h('button', { class: 'btn', onclick: () => move(j, 'applied') }, 'Mark applied') : h('a', { class: 'btn', href: `#/job/${j.id}` }, 'Tailor resume')) : null;
    const opts = [j.status, ...(NEXT[j.status] || [])];
    return h('li', { class: `djob${off ? ' off' : ''}` },
      h('div', { class: 'drole' }, logoMark(j, 40), h('div', null,
        h('h3', null, h('a', { href: `#/job/${j.id}` }, j.title || 'Untitled role'), j.id === next.id && h('span', { class: 'dmark' }, 'Next')),
        h('p', { title: `Saved ${exact(j.createdAt)}` }, [j.company || 'Company not detected', when(j)].join(' · ')),
        hint && h('p', { class: 'hint' }, hint))),
      h('div', { class: `dfit ${band}` }, h('span', null, sc == null ? 'No score' : `${sc}% `, sc != null && h('small', null, 'fit')),
        sc != null && h('div', { class: 'dmeter', role: 'meter', 'aria-label': `Fit for ${label(j)}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': sc }, h('i', { style: `width:${sc}%` }))),
      h('div', { class: 'dstage' }, h('select', { 'aria-label': `Move ${label(j)} to a later stage`, disabled: opts.length < 2, onchange: (e) => { if (e.target.value !== j.status) move(j, e.target.value); } },
        opts.map((k, i) => h('option', { value: k, selected: i === 0 }, i === 0 ? STATUS_LABEL[k] : `Move to ${STATUS_LABEL[k]}`)))),
      h('div', { class: 'dact' }, act));
  }
  function draw() {
    drawPipe(); clear(body);
    const v = visible();
    body.append(h('ul', { class: 'djobs' }, v.length ? v.map(row) : h('li', { class: 'dempty' }, h('b', null, 'No jobs match'), 'Nothing fits that search and stage. ',
      h('button', { class: 'btn link', onclick: () => { stage = 'all'; q = ''; search.value = ''; draw(); } }, 'Clear filters'))));
  }

  const list = checklist(me, jobs, go);
  const side = list || h('div', { class: 'dside dmod' }, h('div', { class: 'dtab' }, 'This week'),
    h('div', { class: 'dweek' }, h('span', { class: 'big' }, String(appliedWeek)), h('b', null, `application${appliedWeek === 1 ? '' : 's'} sent`), h('p', null, appliedWeek >= 4 ? 'A strong week. Keep the interviews first.' : 'One more good-fit job today keeps you moving.')),
    h('div', { class: 'dweek' }, h('ul', { class: 'counts' }, statuses.map((k) => h('li', null, h('span', null, STATUS_LABEL[k]), h('b', null, n(k)))))),
    credits != null && credits > 10 && h('div', { class: 'dweek' }, h('b', null, `${credits} credits left`), h('p', null, 'One credit covers one job. Credits never expire.')));
  const nudge = credits != null && credits <= 10 ? creditNudge(me.quota, { buy: false }) : null;
  if (nudge) { nudge.append(h('a', { class: 'btn', href: '#/settings/billing' }, 'See credit packs')); }
  host.classList.add('dash');
  host.append(pageHead('Jobs', `${n('saved')} saved · ${n('applied')} applied · ${talking} interviewing.${appliedWeek ? ` You applied to ${appliedWeek} job${appliedWeek === 1 ? '' : 's'} this week. Nice work.` : ''}`), addJobPanel(go), next.node,
    h('div', { class: 'dcols' },
      h('section', { class: 'dmod', 'aria-label': 'Your jobs' }, h('div', { class: 'dtab' }, 'Jobs'), pipe,
        h('div', { class: 'dtools' }, h('div', { class: 'search' }, icon('search'), search), h('label', { class: 'sort' }, 'Sort ', sorter)),
        h('p', { class: 'dlegend' }, h('b', null, 'Fit'), ' is how many of a job’s required skills your resume covers. The line on each bar is ', h('b', null, '75%'), ', a good score to apply at.'),
        h('div', { class: 'dhdr', 'aria-hidden': 'true' }, h('span', null, 'Role'), h('span', null, 'Fit'), h('span', null, 'Stage'), h('span', null, 'Action')), body),
      h('aside', { 'aria-label': 'Progress', class: 'dside' }, side, nudge)));
  draw();
  if (wantAdd) { wantAdd = false; queueMicrotask(toggleAdd); }
  return host;
}
