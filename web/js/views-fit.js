// Job page: the three outputs (score, gap analysis, optimized resume) and the ATS check.
import { h, toast } from './dom.js';
import { api, download } from './api.js';
import { icon } from './icons.js';

const STATUS = { strong: 'Strongly matched', partial: 'Partially matched', weak: 'Weak evidence', missing: 'Not found', unverifiable: 'Unable to verify' };
const MARK = { strong: '✓', partial: '~', weak: '~', missing: '✕', unverifiable: '?' };
const KIND = { mandatory: ['Mandatory requirements', 'The job says these are required.'], must: ['Must-have skills', 'Core skills the role needs.'], nice: ['Good to have', 'Optional, but they strengthen your application.'], responsibility: ['Responsibilities', 'What you would do in this role.'] };
const tip = (text) => h('span', { class: 'tip', tabindex: '0', title: text, 'aria-label': text }, 'i');

// ---------- 1. Job match score: every dimension, with how it is worked out.
export function scoreCard(job) {
  const m = job.match || {};
  if (!m.dimensions?.length) return null;
  const md = m.mandatory || {};
  return h('div', { class: 'card' }, h('h2', null, 'How the score is built'),
    h('p', { class: 'muted small' }, 'Each part is worked out from your resume and this job. Hover the “i” for how.'),
    md.total > 0 && h('div', { class: `mandbox ${m.mandatoryFailed ? 'bad' : md.unverified?.length ? 'mid' : 'ok'}` },
      h('strong', null, `Mandatory requirements: ${md.covered} of ${md.total - (md.unverified?.length || 0)} covered`),
      m.mandatoryFailed && h('div', { class: 'small' }, `Not found on your resume: ${md.missing.filter((x) => x.status === 'missing').map((x) => x.requirement).join(', ')}. The score can’t read as a strong match until you cover or confirm ${md.missing.length === 1 ? 'it' : 'them'}.`),
      md.unverified?.length > 0 && h('div', { class: 'small' }, `Please verify: ${md.unverified.join(', ')}. We couldn’t check ${md.unverified.length === 1 ? 'it' : 'these'} from your resume, so ${md.unverified.length === 1 ? 'it isn’t' : 'they aren’t'} held against you.`)),
    m.dimensions.map((d) => h('div', { class: 'dim' },
      h('div', { class: 'row', style: 'justify-content:space-between;gap:8px' }, h('span', null, d.label, ' ', tip(`${d.explain} Weight: ${d.weight}% of the score.`)), h('span', { class: 'small muted' }, `${d.points} / ${d.weight}`)),
      h('div', { class: 'bar' }, h('i', { style: `width:${d.ratio}%` })), h('div', { class: 'small muted' }, d.detail))),
    h('p', { class: 'small muted', style: 'margin-top:12px' }, 'The weights are a starting estimate, not an industry standard. This is a match against this job, not a prediction of any recruiter’s or ATS’s decision.'));
}

// ---------- 2. Gap analysis: what the job expects, what your resume shows, what to do.
export function gapAnalysis({ job, id, setJob, redraw }) {
  const m = job.match || {}; const fit = m.fit || [];
  const confirm = async (skill) => {
    try {
      const before = job.match?.score; const r = await api(`/api/jobs/${id}/gaps`, { method: 'POST', body: { skill, has: true } }); setJob({ ...job, ...r.job });
      const after = r.job.match?.score; toast(after != null && before != null && after > before ? `${skill} added. Score ${before}% → ${after}%` : `${skill} added`); redraw();
    } catch (e) { toast(e.message, true); }
  };
  const row = (i) => h('div', { class: `fitrow ${i.status}` },
    h('i', { class: 'fitdot', 'aria-hidden': 'true' }, MARK[i.status]),
    h('div', { class: 'grow' },
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('strong', null, i.requirement), h('span', { class: 'small muted' }, STATUS[i.status]), !i.explicit && h('span', { class: 'small muted' }, '· inferred from the post')),
      i.need && h('div', { class: 'small muted', style: 'margin-top:4px' }, h('b', null, 'The job says: '), `“${i.need}”`),
      h('div', { class: 'small', style: 'margin-top:4px' }, h('b', null, 'Your resume shows: '), i.evidence ? `“${i.evidence}”${i.source?.where ? ` (${i.source.where})` : ''}` : 'Nothing on this yet.'),
      i.status !== 'strong' && (i.where || i.advice) && h('div', { class: 'fixbox' },
        i.where && h('div', { class: 'small' }, h('b', null, 'Where to add it: '), i.where),
        i.advice && h('div', { class: 'small', style: 'margin-top:4px' }, h('b', null, 'What to do: '), i.advice)),
      i.status !== 'strong' && h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: () => confirm(i.requirement) }, i.status === 'unverifiable' ? 'Yes, I meet this' : 'I have this')));
  if (!fit.length) return h('div', { class: 'card', id: 'gaps' }, h('h2', null, 'What you’re missing'), h('p', { class: 'muted' }, m.score == null ? 'Nothing to compare yet.' : 'Tap “Re-check” to read this job against your resume.'), recheck(id, setJob, redraw));
  const n = (st) => fit.filter((i) => i.status === st).length;
  const order = ['missing', 'weak', 'unverifiable', 'partial', 'strong'];
  const group = (kind) => {
    const list = fit.filter((i) => i.kind === kind); if (!list.length) return null;
    const todo = list.filter((i) => i.status !== 'strong').sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)); const done = list.filter((i) => i.status === 'strong');
    return h('div', { style: 'margin-top:20px' }, h('div', { class: 'label' }, KIND[kind][0], ` · ${done.length} of ${list.length} covered`), h('p', { class: 'muted small', style: 'margin:2px 0 6px' }, KIND[kind][1]),
      todo.map(row), done.length > 0 && h('details', { class: 'covered' }, h('summary', { class: 'small muted' }, `Already covered (${done.length})`), done.map(row)));
  };
  const noNumber = fit.filter((i) => (i.status === 'strong' || i.status === 'partial') && i.evidence && i.source?.bulletId && !i.metric);
  return h('div', { class: 'card', id: 'gaps' }, h('h2', null, 'What you’re missing'),
    h('p', { class: 'muted small' }, `${n('strong')} strong · ${n('partial')} partial · ${n('weak')} weak · ${n('missing')} not found${n('unverifiable') ? ` · ${n('unverifiable')} to verify` : ''}. A missing word on your resume isn’t always a missing skill: tap “I have this” only if it’s true, and we add it. We never add anything you haven’t confirmed.`),
    ['mandatory', 'must', 'nice', 'responsibility'].map(group),
    noNumber.length > 0 && h('div', { style: 'margin-top:20px' }, h('div', { class: 'label' }, 'Lines that need a measurable result'), h('p', { class: 'muted small', style: 'margin:2px 0 6px' }, 'These lines support the job but state no number. If you know the result (users, revenue, time saved, %), add it.'),
      noNumber.slice(0, 6).map((i) => h('div', { class: 'small', style: 'padding:6px 0' }, h('b', null, i.requirement), ': “', i.evidence, '”'))),
    recheck(id, setJob, redraw));
}
const recheck = (id, setJob, redraw) => h('div', { class: 'row', style: 'margin-top:16px' }, h('button', { class: 'btn ghost sm', onclick: async () => {
  try { const r = await api(`/api/jobs/${id}/fit`, { method: 'POST' }); setJob(r.job, true); toast('Checked against your latest resume'); redraw(); } catch (e) { toast(e.message, true); }
} }, icon('refresh', 15), 'Re-check after editing my resume'));

// ---------- 3. Resume optimization: original vs optimized, approve each change, then download.
export function optimizeCard({ job, redraw }) {
  const r = job.resumes?.[0];
  const host = h('div', { class: 'card', id: 'optimize' }, h('h2', null, 'Optimized resume'));
  if (!r) { host.append(h('p', { class: 'muted' }, 'Create the tailored resume to see the changes here.')); return host; }
  const body = h('div', null, h('p', { class: 'muted small' }, 'Loading the changes…'));
  host.append(body);
  (async () => {
    let data; try { data = await api(`/api/resumes/${r.id}`); } catch (e) { body.replaceChildren(h('p', { class: 'muted' }, e.message)); return; }
    const sugs = data.suggestions || [];
    const find = (bid) => { for (const s of data.resume.sections) for (const it of s.items) { const b = (it.bullets || []).find((x) => x.id === bid); if (b) return b; } return null; };
    const save = async () => { await api(`/api/resumes/${r.id}`, { method: 'PUT', body: { resume: data.resume, suggestions: sugs } }); };
    const decide = async (sg, ok) => {
      try {
        if (ok) { const b = find(sg.bulletId); if (!b) return toast('That bullet no longer exists.', true); b.text = sg.proposed; }
        sg.status = ok ? 'accepted' : 'rejected'; await save(); draw();
      } catch (e) { toast(e.message, true); }
    };
    const draw = () => {
      const pending = sugs.filter((x) => x.status === 'pending'); const acc = sugs.filter((x) => x.status === 'accepted');
      body.replaceChildren(
        h('p', { class: 'muted small' }, 'Reordered for this job: ', (r.changes || []).length ? `${r.changes.length} change${r.changes.length === 1 ? '' : 's'} (skills and bullets moved to the front, confirmed skills added). ` : 'nothing needed moving. ', 'Reworded lines below only use facts already in your resume. Approve each one you want.'),
        !sugs.length && h('p', { class: 'muted small' }, 'No rewording suggestions for this job. Your own wording was kept.'),
        sugs.map((sg) => h('div', { class: `sug ${sg.status}` },
          sg.requirement && h('div', { class: 'small muted' }, `Supports: ${sg.requirement}`),
          h('div', { class: 'diff' }, h('div', null, h('div', { class: 'label' }, 'Original'), h('p', { class: 'orig' }, sg.original)), h('div', null, h('div', { class: 'label' }, 'Optimized'), h('p', { class: 'new' }, sg.proposed))),
          sg.reason && h('div', { class: 'small muted' }, sg.reason),
          sg.status === 'pending' ? h('div', { class: 'row', style: 'gap:8px;margin-top:8px' }, h('button', { class: 'btn sm primary', onclick: () => decide(sg, true) }, 'Accept'), h('button', { class: 'btn sm', onclick: () => decide(sg, false) }, 'Keep mine'))
            : h('div', { class: 'small', style: 'margin-top:6px' }, sg.status === 'accepted' ? '✓ Accepted' : 'Kept your wording'))),
        h('div', { class: 'row', style: 'gap:10px;margin-top:16px;flex-wrap:wrap' },
          h('button', { class: 'btn primary', onclick: () => download(`/api/resumes/${r.id}/pdf`, 'resume.pdf').then(redraw).catch((e) => toast(e.message, true)) }, 'Download PDF'),
          h('button', { class: 'btn', onclick: () => download(`/api/resumes/${r.id}/docx`, 'resume.docx').catch((e) => toast(e.message, true)) }, 'Download Word (.docx)'),
          h('a', { class: 'btn ghost', href: `#/resume/${r.id}` }, 'Edit in full'),
          pending.length > 0 && h('span', { class: 'small muted' }, `${pending.length} suggestion${pending.length === 1 ? '' : 's'} waiting`), acc.length > 0 && h('span', { class: 'small muted' }, `${acc.length} accepted`)));
    };
    draw();
  })();
  return host;
}

// ---------- ATS compatibility: separate from the match score.
export function atsCard({ job }) {
  const r = job.resumes?.[0];
  const body = h('div', null);
  const run = h('button', { class: 'btn sm', onclick: async () => {
    run.disabled = true; run.textContent = 'Reading your PDF…';
    try { const { ats } = await api(`/api/resumes/${r.id}/ats`); show(ats); run.textContent = 'Check again'; } catch (e) { toast(e.message, true); run.textContent = 'Check ATS readability'; }
    run.disabled = false;
  } }, 'Check ATS readability');
  const list = (title, checks) => checks.length > 0 && h('div', { style: 'margin-top:12px' }, h('div', { class: 'label' }, title), checks.map((c) => h('div', { class: `reason ${c.ok === true ? 'ok' : c.ok === 'warn' ? 'mid' : 'bad'}` }, h('i', { 'aria-hidden': 'true' }, c.ok === true ? '✓' : c.ok === 'warn' ? '!' : '✕'), h('div', null, h('div', null, c.label), h('div', { class: 'small muted' }, c.detail), c.fix && h('div', { class: 'small' }, `Fix: ${c.fix}`)))));
  const show = (a) => body.replaceChildren(...[
    h('div', { class: 'atsgrid' }, [['Overall', a.score], ['Formatting', a.scores.formatting], ['Sections', a.scores.sections], ['Parsing', a.scores.parsing], ['Keywords', a.scores.keywords]].filter(([, v]) => v != null).map(([k, v]) => h('div', { class: 'atsnum' }, h('b', null, v), h('span', { class: 'small muted' }, k)))),
    !a.parsed && h('p', { class: 'small muted' }, 'We couldn’t read the generated PDF just now, so parsing wasn’t checked.'),
    list('Formatting', a.formatting), list('Section headings', a.sections), list('What a parser reads from the PDF', a.parsing),
    a.keywords && h('div', { style: 'margin-top:12px' }, h('div', { class: 'label' }, 'Keyword coverage'),
      h('div', { class: 'small' }, `Present and supported: ${a.keywords.supported.join(', ') || 'none'}`), h('div', { class: 'small' }, `Present but weakly supported: ${a.keywords.weak.join(', ') || 'none'}`), h('div', { class: 'small' }, `Missing: ${a.keywords.missing.join(', ') || 'none'}`), a.keywords.notApplicable.length > 0 && h('div', { class: 'small' }, `Not applicable / to verify: ${a.keywords.notApplicable.join(', ')}`)),
    h('p', { class: 'small muted', style: 'margin-top:12px' }, a.note)].filter(Boolean));
  return h('div', { class: 'card', id: 'ats' }, h('h2', null, 'ATS compatibility'), h('p', { class: 'muted small' }, 'Can recruitment software read this resume? Checked on the real PDF. This is separate from how well you match the job.'), r ? [run, body] : h('p', { class: 'muted' }, 'Create the tailored resume first.'));
}
