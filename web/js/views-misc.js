import { h, fmtDate, toast, copyText, clear } from './dom.js';
import { icon } from './icons.js';
import { api, download, setToken } from './api.js';
import { resumeEditor } from './editor.js';
import { EXT_STEPS } from './views-profile.js';
import { pageHead, emptyState, nextStep, paywall, packButtons } from './ui.js';

export async function resumesView() {
  const { resumes } = await api('/api/resumes');
  const host = h('div', null, pageHead('Resumes', resumes.length ? 'One per job. Pick one to edit or download.' : null));
  if (!resumes.length) { host.append(emptyState(icon('file', 22), 'No resumes yet', 'Add a job and your tailored resume appears here.', h('a', { class: 'btn primary lg', href: '#/tracking' }, 'Go to jobs'))); return host; }
  host.append(h('div', { class: 'card flush', style: 'overflow-x:auto' }, h('table', { class: 't' },
    h('tbody', null, resumes.map((r) => h('tr', null,
      h('td', null, h('div', { style: 'font-weight:600' }, r.jobId ? h('a', { href: `#/job/${r.jobId}`, style: 'color:inherit' }, r.title || r.label) : r.label), h('div', { class: 'muted small' }, [r.company, fmtDate(r.createdAt)].filter(Boolean).join(' · '))),
      h('td', { style: 'text-align:right;white-space:nowrap' },
        h('a', { class: 'btn sm', href: `#/resume/${r.id}` }, 'Edit'), ' ',
        h('button', { class: 'btn sm primary', onclick: () => download(`/api/resumes/${r.id}/pdf`, 'resume.pdf').catch((e) => toast(e.message, true)) }, 'Download'), ' ',
        h('button', { class: 'btn sm ghost danger', onclick: async (e) => { await api(`/api/resumes/${r.id}`, { method: 'DELETE' }); e.target.closest('tr').remove(); } }, 'Delete'))))))));
  return host;
}

export async function resumeEditorView(id) {
  const [data, me] = await Promise.all([api(`/api/resumes/${id}`), api('/api/me')]);
  const ed = resumeEditor({
    resume: data.resume, suggestions: data.suggestions, aiEnabled: me.aiEnabled, title: data.label || 'Tailored resume',
    onSave: async (resume, suggestions) => { await api(`/api/resumes/${id}`, { method: 'PUT', body: { resume, suggestions } }); },
    onDownload: () => download(`/api/resumes/${id}/pdf`, 'resume.pdf').catch((e) => toast(e.message, true)),
  });
  return h('div', null,
    pageHead(data.label || 'Tailored resume', null, data.jobId ? h('a', { class: 'btn', href: `#/job/${data.jobId}` }, 'Back to job') : h('a', { class: 'btn', href: '#/resumes' }, 'All resumes')),
    data.changes.length > 0 && h('div', { class: 'info', style: 'margin-bottom:18px' }, h('strong', null, 'Changed: '), data.changes.join(' ')),
    ed.el);
}

export async function gapsView() {
  const { gaps, totalJobs } = await api('/api/skill-gaps');
  const host = h('div', null, pageHead('Skills', gaps.length ? 'What your saved jobs ask for that your resume doesn’t show.' : null));
  if (!gaps.length) { host.append(emptyState(icon('target', 22), totalJobs ? 'No gaps' : 'Nothing to compare yet', totalJobs ? 'Your resume covers what your saved jobs ask for.' : 'Add a few jobs to see which skills come up.', !totalJobs && h('a', { class: 'btn primary lg', href: '#/tracking' }, 'Go to jobs'))); return host; }
  const top = gaps[0];
  host.append(nextStep({ title: `${top.skill} is your biggest gap`, sub: `Missing in ${top.jobs} of ${totalJobs} jobs. Learn it, or confirm it if you have it.`, actions: [] }),
    h('div', { class: 'card' }, gaps.map((g) => h('div', { class: 'gap' },
      h('span', { class: 'chip warn' }, g.skill),
      h('div', { class: 'grow' }, h('div', { class: 'small muted' }, `${g.jobs} of ${totalJobs} jobs`, g.must ? ` · required in ${g.must}` : ' · nice to have'))))));
  return host;
}

const codeBlock = (text) => h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap;align-items:flex-start' }, h('pre', { class: 'code grow', style: 'margin:0' }, text), h('button', { class: 'btn sm icon', 'aria-label': 'Copy', onclick: () => copyText(text) }, icon('copy', 15)));

export async function settingsView(me, go) {
  const paid = new URLSearchParams(location.search).get('paid') === '1';
  let tab = paid ? 'billing' : 'account';
  if (paid) history.replaceState(null, '', location.pathname + location.hash);
  const host = h('div');
  const body = h('div');
  const del = h('input', { type: 'text', placeholder: 'Type your email to confirm', style: 'max-width:280px' });

  const account = () => h('div', { class: 'stack' },
    h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('div', null, h('h2', null, 'Account'), h('p', null, 'Signed in as ', me.user.email))), h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already out */ } setToken(''); go('#/login'); } }, 'Sign out'),
      h('button', { class: 'btn', onclick: () => download('/api/export', 'tailorkit-export.json').catch((e) => toast(e.message, true)) }, 'Export my data'))),
    h('div', { class: 'card' }, h('h2', null, 'Delete account'), h('p', { class: 'muted small' }, 'Permanently deletes your resume, jobs and tailored versions.'),
      h('div', { class: 'row' }, del, h('button', { class: 'btn danger', onclick: async () => { try { await api('/api/account', { method: 'DELETE', body: { confirm: del.value.trim() } }); setToken(''); go('#/login'); } catch (e) { toast(e.message, true); } } }, 'Delete everything'))));

  const extension = () => h('div', { class: 'card' }, h('h2', null, 'Chrome extension'), h('p', { class: 'muted small' }, 'One click on any job page.'), EXT_STEPS());

  const billing = () => {
    const q = me.quota; const pct = q.limit ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
    return h('div', { class: 'stack' },
      paid && h('div', { class: 'info' }, 'Thank you. Your payment is being confirmed and your credits will show here in a moment.', ' ', h('a', { href: '#', onclick: async (e) => { e.preventDefault(); location.reload(); } }, 'Refresh')),
      h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('div', null, h('h2', null, 'Credits'), h('p', null, 'One credit covers one job: saving it, tailoring, interview prep and Ask AI for that job.')), h('span', { class: 'chip primary' }, q.limit == null ? 'Unlimited' : `${q.remaining} left`)),
        q.limit != null && h('div', null, h('div', { class: 'row between small', style: 'margin-bottom:6px' }, h('span', null, 'Credits used'), h('span', { class: 'muted' }, `${q.used} of ${q.limit}`)), h('div', { class: 'meter' }, h('i', { style: `width:${pct}%` })))),
      q.limit != null && h('div', { class: 'card' }, h('h2', null, 'Get more credits'), h('p', { class: 'muted small' }, 'Pay once, no subscription. Credits never expire.'), packButtons(q)));
  };

  const tabs = [['account', 'Account', account], ['extension', 'Extension', extension], ['billing', 'Plan', billing]];
  const draw = () => {
    clear(body); body.append(tabs.find((t) => t[0] === tab)[2]());
    [...bar.children].forEach((b, i) => b.classList.toggle('on', tabs[i][0] === tab));
  };
  const bar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', onclick: () => { tab = k; draw(); } }, l)));
  host.append(pageHead('Settings'), bar, body);
  draw();
  return host;
}
