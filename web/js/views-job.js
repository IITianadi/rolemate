import { h, append, clear, toast, spinner, fmtDate, copyText } from './dom.js';
import { api, download, streamPost } from './api.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { STATUS_LABEL, bandOf } from './views-tracking.js';
import { scoreCard, gapAnalysis, optimizeCard, atsCard } from './views-fit.js';
import { nextStep, ring, logoMark, sourceName, paywall, ago } from './ui.js';


const aiBadge = () => h('span', { class: 'ai-badge' }, icon('sparkle'), 'AI');

export async function jobView(id, me, go) {
  const host = h('div');
  let job; let tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'overview';
  const state = { prep: null, research: null, stale: false, createdAt: '', running: false, steps: [], error: '', loaded: false };
  const chat = { messages: [], busy: false };
  let editing = false;

  const load = async () => { ({ job } = await api(`/api/jobs/${id}`)); };
  await load();
  const body = h('div');

  const latest = () => job.resumes[0];
  const dl = (r) => download(`/api/resumes/${r.id}/pdf`, 'resume.pdf').then(() => { if (!r.downloaded) { r.downloaded = true; toast('Downloaded. Next: apply, then mark it as applied here.'); draw(); } }).catch((e) => toast(e.message, true));

  async function tailor() {
    try { await api(`/api/jobs/${id}/tailor`, { method: 'POST' }); toast('Tailored resume ready'); await load(); draw(); }
    catch (e) { toast(e.status === 402 ? 'You’ve used all your free resumes. Pay now to keep going.' : e.message, true); }
  }

  const yrs = (y) => { const r = Math.round(y * 2) / 2; return r < 1 ? 'less than a year' : `${r} year${r === 1 ? '' : 's'}`; };
  // The checks behind the score, in plain words: required skills, experience, past roles, nice-to-haves.
  function reasons(m) {
    const rq = job.requirements || {}; const out = [];
    const has = m.matchedMust || []; const miss = m.missingMust || []; const req = has.length + miss.length;
    if (req) out.push(miss.length ? [has.length / req >= 0.5 ? 'mid' : 'bad', `Has ${has.length} of ${req} required skills`, `Missing: ${miss.slice(0, 4).join(', ')}${miss.length > 4 ? ` and ${miss.length - 4} more` : ''}`] : ['ok', `Has all ${req} required skills`]);
    if (rq.minYears != null) {
      const ask = rq.maxYears ? `${rq.minYears}–${rq.maxYears}` : `${rq.minYears}+`;
      const y = m.yearsExperience;
      if (y == null) out.push(['mid', `Asks for ${ask} years of experience`, 'We couldn’t read the dates on your resume, so this wasn’t checked.']);
      else if (y >= rq.minYears) out.push(['ok', `Asks for ${ask} years. You have about ${yrs(y)}.`]);
      else out.push(['bad', `Asks for ${ask} years. You have about ${yrs(y)}.`, `About ${yrs(rq.minYears - y)} short. Strong, relevant projects can make up some of it.`]);
    }
    const t = (m.breakdown || []).find((b) => b.key === 'title');
    if (t) out.push(t.points >= t.max ? ['ok', 'You’ve held a similar role before'] : t.points > 0 ? ['mid', 'Your past roles are partly similar'] : ['mid', 'None of your past titles look like this role', 'Fine for a switch. Make the summary say why you fit.']);
    const nh = m.matchedNice || []; const nm = m.missingNice || [];
    if (nh.length + nm.length) out.push([nm.length ? 'mid' : 'ok', `Has ${nh.length} of ${nh.length + nm.length} nice-to-have skills`]);
    return out;
  }

  // ---------- Fit & resume: the result first (score + tailored resume), then what to fix.
  function hero() {
    const m = job.match || {}; const r = latest(); const band = bandOf(m);
    const req = (m.matchedMust || []).length + (m.missingMust || []).length;
    const up = m.score != null && m.firstScore != null && m.score > m.firstScore;
    // One number. Everything under it is a plain reason for that number, not another metric.
    const verdict = { strong: 'Good fit. Worth applying.', partial: 'Close. Cover the gaps below if you can.', weak: 'Big gaps for this role. Apply only if you can cover them.' }[band];
    const left = h('div', null,
      h('div', { class: 'fit' }, m.score != null && ring(m.score),
        h('div', { class: 'words' }, h('h2', null, { strong: 'Strong match', partial: 'Partial match', weak: 'Weak match', unknown: 'No requirements found' }[band]),
          h('p', null, m.score == null ? 'Paste the full description to score it.' : verdict),
          up && h('span', { class: 'delta' }, `↑ from ${m.firstScore}% when you saved it`))),
      m.score != null && h('div', { class: 'why' }, h('div', { class: 'label' }, `Why ${m.score}%`),
        reasons(m).map(([kind, text, sub]) => h('div', { class: `reason ${kind}` }, h('i', { 'aria-hidden': 'true' }, kind === 'ok' ? '✓' : kind === 'bad' ? '✕' : '!'),
          h('div', null, h('div', null, text), sub && h('div', { class: 'small muted' }, sub))))));
    const paper = h('div', { class: 'paper', 'aria-hidden': 'true' }, ['h', 'm', 's', 'c', 'm', 'c', 's', 'm', 'c', 's', 'm'].map((c) => h('i', { class: c })));
    const n = r ? (r.changes || []).length : 0;
    const right = h('div', { class: 'right' }, r
      ? [h('div', { class: 'resumeprev' }, paper, h('div', null,
          h('span', { class: 'chip good', style: 'margin-bottom:10px' }, r.downloaded ? 'Downloaded' : 'Tailored resume ready'),
          h('h2', { style: 'font-size:1.35rem;margin:0' }, n ? `${n} change${n === 1 ? '' : 's'} for this job` : 'Ready for this job'),
          h('div', { class: 'muted small', style: 'margin-top:2px' }, 'Same layout. Nothing added that isn’t yours.'),
          h('div', { class: 'row', style: 'margin-top:16px;gap:10px' }, h('button', { class: 'btn primary', onclick: () => dl(r) }, 'Download PDF'), h('a', { class: 'btn', href: `#/resume/${r.id}` }, 'Edit'),
            h('button', { class: 'btn ghost sm', onclick: tailor, title: 'Tailor again from your current resume' }, icon('refresh', 15), 'Redo')))),
        n > 0 && h('details', { class: 'changes' }, h('summary', null, 'See what we changed'),
          h('ul', null, r.changes.map((c) => h('li', null, c)), h('li', { class: 'keep' }, '✓ Layout, fonts and sections unchanged'))),
        job.resumes.length > 1 && h('div', { class: 'small muted', style: 'margin-top:12px' }, 'Earlier: ', job.resumes.slice(1).map((x) => h('a', { href: `#/resume/${x.id}`, style: 'margin-right:10px' }, fmtDate(x.created_at) || `#${x.id}`)))]
      : h('div', { class: 'resumeprev' }, paper, h('div', null, h('h2', { style: 'font-size:1.35rem;margin:0' }, 'Your resume for this job'),
          h('div', { class: 'muted small', style: 'margin:2px 0 16px' }, 'Same layout, reordered for this job.'), h('button', { class: 'btn primary', onclick: tailor }, 'Create resume'))));
    return h('div', { class: 'card hero' }, left, right);
  }

  // ---------- Interview prep (company research + brief + questions)
  // Returns true only when it actually loaded (so the caller redraws once, never in a loop).
  async function loadPrep() {
    if (state.loaded) return false;
    state.loaded = true;
    try {
      const r = await api(`/api/jobs/${id}/prep`);
      if (r.prep) Object.assign(state, { prep: r.prep, research: r.research, stale: r.stale, createdAt: r.createdAt });
      else { runPrep(false); return false; }
    } catch (e) { state.error = e.message; }
    return true;
  }

  async function runPrep(refresh) {
    state.running = true; state.steps = []; state.error = '';
    if (tab === 'prep') draw();
    try {
      await streamPost(`/api/jobs/${id}/prep`, { refresh }, (ev) => {
        if (ev.type === 'step') { state.steps.push(ev.label); if (tab === 'prep') draw(); }
        if (ev.type === 'result') Object.assign(state, { prep: ev.prep, research: ev.research, stale: false, createdAt: new Date().toISOString() });
        if (ev.type === 'error') state.error = ev.message;
      });
    } catch (e) { state.error = e.message; }
    state.running = false;
    if (tab === 'prep') draw();
  }

  const list = (items, ordered) => items?.length ? h(ordered ? 'ol' : 'ul', { class: 'tidy' }, items.map((x) => h('li', null, x))) : null;
  const sec = (title, ic) => h('div', { class: 'sec-title' }, ic && icon(ic, 15), title);

  function companyCard(r) {
    if (!r) return null;
    const c = r.company || {};
    const hasReviews = !!(r.culture && (r.culture.summary || r.culture.pros?.length || r.culture.cons?.length));
    const cov = (label, v) => h('span', { class: `chip ${v === 'good' ? 'good' : v === 'partial' ? 'warn' : ''}` }, `${label}: ${v === 'good' ? 'good coverage' : v === 'partial' ? 'partial' : 'not found'}`);
    return h('div', null,
      sec(`About ${job.company || 'the company'}`, 'building'),
      h('div', { class: 'card stack' },
        h('div', { class: 'row' }, r.mode === 'ai' && aiBadge(), r.mode === 'ai' && cov('Reviews', r.coverage?.reviews || 'none'), r.mode === 'ai' && cov('Interview reports', r.coverage?.interview || 'none'),
          r.cached && h('span', { class: 'muted small' }, 'from a recent lookup')),
        c.summary ? h('p', { style: 'margin:0' }, c.summary) : h('p', { class: 'muted', style: 'margin:0' }, 'No public company summary was found.'),
        !!(c.industry || c.size || c.hq) && h('div', { class: 'reqs' }, [c.industry, c.size, c.hq].filter(Boolean).map((x) => h('span', { class: 'chip' }, x))),
        hasReviews && h('div', { class: 'cols2' },
          h('div', null, h('h3', null, 'What employees tend to like'), list(r.culture.pros) || h('p', { class: 'muted small' }, 'Nothing consistent found.')),
          h('div', null, h('h3', null, 'Common complaints'), list(r.culture.cons) || h('p', { class: 'muted small' }, 'Nothing consistent found.'))),
        r.culture?.summary && h('p', { class: 'muted', style: 'margin:0' }, r.culture.summary),
        r.culture?.ratingNotes && h('p', { class: 'muted small', style: 'margin:0' }, r.culture.ratingNotes),
        r.watchOuts?.length > 0 && h('div', null, h('h3', null, 'Watch-outs'), list(r.watchOuts)),
        r.compensation?.notes && h('div', null, h('h3', null, 'Pay'), h('p', { style: 'margin:0' }, r.compensation.notes)),
        r.news?.length > 0 && h('div', null, h('h3', null, 'In the news'), h('ul', { class: 'tidy' }, r.news.map((n) => h('li', null, h('strong', null, n.headline), n.why ? ` — ${n.why}` : '')))),
        r.interview?.process?.length > 0 && h('div', null, h('h3', null, 'Reported interview process'), list(r.interview.process, true)),
        r.interview?.commonQuestions?.length > 0 && h('div', null, h('h3', null, 'Questions candidates report being asked'), list(r.interview.commonQuestions)),
        r.interview?.tips?.length > 0 && h('div', null, h('h3', null, 'Tips from candidates'), list(r.interview.tips)),
        r.gaps?.length > 0 && h('div', { class: 'info small' }, h('strong', null, 'Not found: '), r.gaps.join(' ')),
        r.sources?.length > 0 && h('div', null, h('h3', null, 'Sources'), h('div', { class: 'src' }, r.sources.map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', null, s.title || s.url), icon('external', 13)))),
          h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Reviews are individual opinions found on public pages. We summarise themes; open the sources to read them yourself.'))));
  }

  function prepView() {
    const el = h('div');
    loadPrep().then((loaded) => { if (loaded && tab === 'prep') draw(); });
    if (state.running || (!state.prep && !state.error)) {
      const steps = state.steps.length ? state.steps : ['Getting started…'];
      return h('div', { class: 'card', style: 'max-width:640px' },
        h('div', { class: 'row' }, aiBadge(), h('strong', null, 'Preparing your interview brief')),
        h('div', { class: 'progress', style: 'margin:18px 0 6px;max-width:none' }, steps.map((t, i) => h('div', { class: `stepline ${i < steps.length - 1 ? 'done' : ''}` }, i < steps.length - 1 ? icon('check') : h('span', { class: 'spin' }), t))),
        h('div', { class: 'shimmer', style: 'width:90%' }), h('div', { class: 'shimmer', style: 'width:75%' }), h('div', { class: 'shimmer', style: 'width:82%' }),
        h('p', { class: 'muted small' }, 'This can take a minute the first time. Results are saved.'));
    }
    if (state.error && !state.prep) return h('div', { class: 'card stack' }, h('div', { class: 'error' }, state.error), h('div', null, h('button', { class: 'btn primary', onclick: () => runPrep(false) }, 'Try again')));

    const p = state.prep; const b = p.brief || {};
    append(el,
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, p.mode === 'ai' && aiBadge(), h('span', { class: 'muted small' }, state.createdAt ? `Prepared ${fmtDate(state.createdAt)}` : '')),
        h('button', { class: 'btn sm', onclick: () => runPrep(true) }, icon('refresh', 15), 'Refresh')),
      state.stale && h('div', { class: 'notice', style: 'margin-top:12px' }, 'Your resume or settings changed since this was prepared. Refresh to update it.'),
      sec('The role', 'target'), h('div', { class: 'oneliner' }, b.oneLiner || job.title),
      h('div', { class: 'cols2', style: 'margin-top:14px' },
        h('div', { class: 'card' }, h('h3', null, 'What they’re looking for'), list(b.whatTheyWant) || h('p', { class: 'muted small' }, 'No clear requirements detected.')),
        h('div', { class: 'card' }, h('h3', null, 'Where you’re strong'), list(b.yourEdge) || h('p', { class: 'muted small' }, 'Capture the full job text for a sharper read.'))),
      b.stretchAreas?.length > 0 && h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', null, 'Gaps and how to frame them'), h('ul', { class: 'tidy' }, b.stretchAreas.map((x) => h('li', null, h('strong', null, x.skill), ': ', x.howToFrame)))),
      b.resumeAdvice?.length > 0 && h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', null, 'Resume advice'), list(b.resumeAdvice)),
      companyCard(state.research),
      sec('Likely questions', 'chat'),
      h('div', null, p.questions.map((q, i) => h('details', { class: 'q', open: i === 0 },
        h('summary', null, h('span', { class: 'chip' }, q.category), h('span', { class: 'qt' }, q.question)),
        h('div', { class: 'body' },
          q.whyTheyAsk && h('div', { class: 'why' }, h('strong', null, 'Why they ask: '), q.whyTheyAsk),
          h('div', null, h('div', { class: 'row between', style: 'margin-bottom:6px' }, h('strong', { class: 'small' }, 'Suggested answer'), h('button', { class: 'btn sm ghost', onclick: () => copyText(q.answer) }, icon('copy', 14), 'Copy')), h('div', { class: 'ans' }, q.answer)),
          q.evidence?.length > 0 && h('div', null, h('div', { class: 'small muted' }, 'From your resume'), q.evidence.map((e) => h('div', { class: 'ev' }, e))))))),
      p.askThem?.length > 0 && h('div', null, sec('Questions to ask', 'list'), h('div', { class: 'card' }, list(p.askThem))),
      (p.negotiation?.notice || p.negotiation?.ctc) && h('div', null, sec('Notice and pay', 'user'), h('div', { class: 'card cols2' },
        h('div', null, h('h3', null, 'Notice period'), h('p', { style: 'margin:0' }, p.negotiation.notice)), h('div', null, h('h3', null, 'CTC'), h('p', { style: 'margin:0' }, p.negotiation.ctc)))),
      h('p', { class: 'muted small', style: 'margin-top:18px' }, 'These are likely questions based on your resume, this job description and public information. They are predictions, not what the recruiter will definitely ask.'));
    return el;
  }

  // ---------- Ask AI (streaming chat)
  function chatView() {
    if (!me.aiEnabled) return h('div', { class: 'card stack', style: 'max-width:640px' }, h('div', { class: 'row' }, aiBadge(), h('strong', null, 'Ask is unavailable right now')), h('p', { class: 'muted', style: 'margin:0' }, 'Please try again later.'));
    const thread = h('div', { class: 'thread' });
    const input = h('textarea', { rows: 1, placeholder: 'Ask anything about this job…', 'aria-label': 'Message' });
    const send = h('button', { class: 'send', 'aria-label': 'Send', disabled: true }, icon('send', 18));
    const suggest = h('div', { class: 'suggest' }, [
      'What will they probably ask me, and how should I answer?',
      `What should I know about ${job.company || 'this company'} before the interview?`,
      'Where is my resume weakest for this role?',
      'Draft a short message to the recruiter.',
    ].map((q) => h('button', { onclick: () => ask(q) }, q)));

    const bubble = (m) => m.role === 'user'
      ? h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, m.content))
      : h('div', { class: 'msg ai' }, h('div', { class: 'av' }, icon('sparkle')), h('div', { class: 'text' }));
    const redraw = () => {
      clear(thread);
      for (const m of chat.messages) {
        const b = bubble(m);
        if (m.role === 'assistant') { const t = b.querySelector('.text'); append(t, renderMarkdown(m.content || ''), m.pending && h('span', { class: 'cursor' })); if (m.error) t.append(h('div', { class: 'error' }, m.error)); }
        thread.append(b);
      }
      suggest.hidden = chat.messages.length > 0;
      thread.lastElementChild?.scrollIntoView({ block: 'end' });
    };
    async function ask(text) {
      text = (text || input.value).trim(); if (!text || chat.busy) return;
      input.value = ''; grow(); chat.busy = true; send.disabled = true;
      chat.messages.push({ role: 'user', content: text });
      const reply = { role: 'assistant', content: '', pending: true }; chat.messages.push(reply); redraw();
      try {
        await streamPost(`/api/jobs/${id}/chat`, { messages: chat.messages.filter((m) => !m.error && m !== reply).map(({ role, content }) => ({ role, content })) }, (ev) => {
          if (ev.type === 'text') { reply.content += ev.text; redraw(); }
          if (ev.type === 'error') reply.error = ev.message;
        });
      } catch (e) { reply.error = e.message; }
      reply.pending = false; chat.busy = false; send.disabled = !input.value.trim(); redraw();
    }
    const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
    input.addEventListener('input', () => { grow(); send.disabled = chat.busy || !input.value.trim(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
    send.addEventListener('click', () => ask());
    queueMicrotask(redraw);
    return h('div', { class: 'chat', style: 'max-width:760px' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, aiBadge(), h('span', { class: 'muted small' }, `Knows this job, your resume${state.research ? ' and the company research' : ''}.`)),
      suggest, thread, h('div', { class: 'composer' }, input, send));
  }

  // Safety net: if extraction got the title/company/location wrong, fix it here. Prep and matching use these.
  function editForm() {
    const f = { title: h('input', { type: 'text', value: job.title }), company: h('input', { type: 'text', value: job.company }), location: h('input', { type: 'text', value: job.location }) };
    return h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { class: 'grid3' },
      h('label', { class: 'field' }, 'Job title', f.title), h('label', { class: 'field' }, 'Company', f.company), h('label', { class: 'field' }, 'Location', f.location)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary sm', onclick: async () => {
        try { const r = await api(`/api/jobs/${id}`, { method: 'PATCH', body: { title: f.title.value, company: f.company.value, location: f.location.value } }); job = { ...job, ...r.job }; editing = false; state.stale = true; toast('Details updated'); draw(); } catch (e) { toast(e.message, true); }
      } }, 'Save'), h('span', { class: 'muted small' }, 'Interview prep will refresh for the new company and role.')));
  }

  // ---------- Job info: the saved posting in a structured layout (sections on the left, keywords on the right)
  const HEAD = /^(about( the)?( job| role| us| the company| company| team)?|job (description|summary|overview|responsibilities|requirements)|(key )?responsibilities|what you('| wi)ll (do|bring|need)|who you are|(minimum |preferred |basic |required )?(qualifications|requirements|skills)|requirements|(nice|good) to have|benefits|perks|compensation|salary|about you|overview|summary|the role|your role|how to apply|why join us|what we offer|role and responsibilities|skills required|education)\s*:?$/i;
  function parseJd(text) {
    const secs = []; let cur = { title: 'About the job', lines: [] };
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      if (!line) { cur.lines.push(''); continue; }
      const isHead = line.length <= 60 && !/[.!?]$/.test(line) && (HEAD.test(line) || /:$/.test(line) && line.split(' ').length <= 6);
      if (isHead) { if (cur.lines.some((l) => l)) secs.push(cur); cur = { title: line.replace(/:$/, ''), lines: [] }; } else cur.lines.push(line);
    }
    if (cur.lines.some((l) => l)) secs.push(cur);
    return secs;
  }
  const BULLET = /^([-•*·▪●◦]|\d+[.)])\s+/;
  function secBody(lines) {
    // Job sites print list items one per line with no blank line between them; paragraphs are separated by blank lines.
    // A run of such lines (3+, or 2 short ones) is shown as a list, like on the posting.
    const marked = []; let run = [];
    const flush = () => { const asList = (run.length >= 3 && run.every((x) => x.length <= 320)) || (run.length === 2 && run.every((x) => x.length <= 200)); marked.push(...run.map((x) => (asList && !BULLET.test(x) ? `• ${x}` : x))); run = []; };
    for (const l of lines) { if (l) run.push(l); else { flush(); marked.push(''); } }
    flush();
    const out = []; let ul = null;
    for (const l of marked) {
      if (BULLET.test(l)) { if (!ul) { ul = h('ul', { class: 'tidy' }); out.push(ul); } ul.append(h('li', null, l.replace(BULLET, ''))); }
      else if (l) { ul = null; out.push(h('p', null, l)); } else ul = null;
    }
    return out;
  }
  function jobInfo() {
    const m = job.match || {}; const rq = job.requirements || {};
    const has = new Set([...(m.matchedMust || []), ...(m.matchedNice || [])].map((x) => String(x).toLowerCase()));
    const kw = (list, label) => list?.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, label),
      h('div', { class: 'reqs' }, list.map((x) => h('span', { class: `chip ${has.has(String(x).toLowerCase()) ? 'good' : 'warn'}` }, x))));
    const secs = parseJd(job.jdText);
    const left = h('div', { class: 'card jdinfo' }, h('h2', null, 'Job description'),
      secs.length ? secs.map((x) => h('section', null, h('h3', null, x.title), secBody(x.lines))) : h('p', { class: 'muted' }, 'No description was captured. Open the posting and capture it again.'),
      h('details', { style: 'margin-top:18px' }, h('summary', { class: 'small muted' }, 'Show the raw captured text'), h('pre', { class: 'jd', style: 'margin-top:12px' }, job.jdRaw || job.jdText || '')));
    const right = h('div', { class: 'stack' },
      h('div', { class: 'card stack' }, h('h3', null, 'Keywords from this job'),
        h('p', { class: 'muted small', style: 'margin:0' }, h('span', { class: 'chip good' }, 'In your resume'), ' ', h('span', { class: 'chip warn' }, 'Missing')),
        kw(rq.mustHave, 'Required') || h('p', { class: 'muted small' }, 'No required skills detected.'), kw(rq.niceToHave, 'Nice to have'),
        (m.missingMust || []).length > 0 && h('a', { class: 'btn sm', href: '#', onclick: toGaps }, 'Review missing skills')),
      h('div', { class: 'card' }, h('h3', null, 'Details'),
        h('dl', { class: 'facts' },
          h('dt', null, 'Company'), h('dd', null, job.company || '–'), h('dt', null, 'Location'), h('dd', null, job.location || '–'),
          h('dt', null, 'Posted on'), h('dd', null, job.url ? h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, `${sourceName(job)} ↗`) : '–'),
          h('dt', null, 'Saved'), h('dd', null, savedAgo() || '–'),
          (rq.minYears != null) && [h('dt', null, 'Experience'), h('dd', null, rq.maxYears ? `${rq.minYears}–${rq.maxYears} years` : `${rq.minYears}+ years`)])));
    return h('div', { class: 'layout2 wideinfo' }, left, right);
  }
  const savedAgo = () => ago(job.createdAt);

  // The one thing to do next on this job.
  const toGaps = (e) => { e?.preventDefault(); const go2 = () => document.getElementById('gaps')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (tab !== 'overview') { tab = 'overview'; draw(); setTimeout(go2, 50); } else go2(); };
  function next() {
    const m = job.match || {}; const r = latest(); const missing = m.missingMust || []; const miss = missing.length;
    const posting = job.url ? h('a', { class: 'btn', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open job posting ↗') : null;
    if (!r) return nextStep({ title: 'Create your resume for this job', sub: 'Same layout, tailored to the job', actions: [h('button', { class: 'btn primary', onclick: tailor }, 'Create resume')] });
    if (['screening', 'interview'].includes(job.status)) return nextStep({ title: `Prepare for your ${STATUS_LABEL[job.status].toLowerCase()}`, sub: 'Likely questions with answers from your resume', actions: [h('button', { class: 'btn primary', onclick: () => { tab = 'prep'; draw(); } }, 'Open prep')] });
    if (job.status === 'offer') return nextStep({ title: 'You got an offer 🎉', sub: 'Use Ask AI to plan your negotiation', actions: [h('button', { class: 'btn primary', onclick: () => { tab = 'chat'; draw(); } }, 'Ask AI')] });
    if (job.status === 'applied') return nextStep({ title: 'Applied. Get ready for the call', sub: 'Most screening calls come within two weeks. Prep takes 10 minutes.', actions: [h('button', { class: 'btn primary', onclick: () => { tab = 'prep'; draw(); } }, 'Open prep')] });
    if (job.status === 'rejected') return nextStep({ title: 'Not this one. Keep going', sub: 'Your next match is waiting on the board', actions: [h('a', { class: 'btn primary', href: '#/tracking' }, 'Back to jobs')] });
    if (miss > 0 && !r.downloaded) return nextStep({ title: miss === 1 ? `Confirm ${missing[0]}, then apply` : `${miss} required skills missing`, sub: miss === 1 ? 'If you have it, tap “I have this” and your score updates. If not, you can still apply.' : 'Confirm the ones you really have and your score updates. If not, you can still apply.', actions: [h('button', { class: 'btn primary', onclick: toGaps }, 'Review skills')] });
    if (!r.downloaded) return nextStep({ title: 'Download your resume and apply', sub: 'You press apply on the company’s site', actions: [h('button', { class: 'btn primary', onclick: () => dl(r) }, 'Download PDF'), posting] });
    return nextStep({ title: 'Now apply on the company’s site', sub: 'Then tap “Mark as applied” above, and interview prep opens up.', actions: posting ? [h('a', { class: 'btn primary', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open job posting ↗')] : [] });
  }

  const move = async (v) => {
    try {
      const r = await api(`/api/jobs/${id}`, { method: 'PATCH', body: { status: v } }); job = { ...job, ...r.job };
      toast(v === 'applied' ? 'Marked as applied. Nice work 🎉' : `Moved to ${STATUS_LABEL[v]}`); draw();
    } catch (x) { toast(x.message, true); }
  };

  function draw() {
    clear(host);
    const stage = h('label', { class: 'stagepill' }, h('small', null, 'Stage'),
      h('select', { 'aria-label': 'Stage', onchange: (e) => move(e.target.value) }, Object.keys(STATUS_LABEL).map((v) => h('option', { value: v, selected: v === job.status }, STATUS_LABEL[v]))));
    const notes = h('textarea', { rows: 3, placeholder: 'Notes' }); notes.value = job.notes || '';
    const meta = [job.company || 'Company not detected', job.location, savedAgo() && `Saved ${savedAgo()}`].filter(Boolean).join(' · ');
    append(host,
      h('div', { class: 'jobhead' }, logoMark(job, 56),
        h('div', { class: 'grow', style: 'min-width:240px' }, h('div', { class: 'titlerow' }, h('h1', null, job.title || 'Untitled role'),
            h('button', { class: `iconbtn ${editing ? 'on' : ''}`, title: editing ? 'Cancel editing' : 'Edit title, company, location', 'aria-label': 'Edit job details', onclick: () => { editing = !editing; draw(); } }, icon('pencil', 17)),
            h('button', { class: 'iconbtn danger', title: 'Delete this job', 'aria-label': 'Delete job', onclick: async () => { if (!confirm(`Delete “${job.title || 'this job'}”? Its tailored resumes are deleted too.`)) return; await api(`/api/jobs/${id}`, { method: 'DELETE' }); toast('Deleted'); go('#/tracking'); } }, icon('trash', 17))),
          h('div', { class: 'meta' }, meta, job.url && [' · ', h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, `Posted on ${sourceName(job)} ↗`)]),
          ),
        h('div', { class: 'acts' }, stage, job.status === 'saved' && h('button', { class: 'btn primary', onclick: () => move('applied') }, 'Mark as applied'))),
      editing && editForm(),
      next(),
      h('div', { class: 'tabs', role: 'tablist' }, [['overview', 'Fit & resume'], ['info', 'Job info'], ['prep', 'Interview prep'], ['chat', 'Ask AI']].map(([k, l]) =>
        h('button', { class: tab === k ? 'on' : '', role: 'tab', onclick: () => { tab = k; draw(); } }, l))));
    if (tab === 'overview') host.append(hero(), scoreCard(job), h('div', { class: 'layout2' }, gapAnalysis({ job, id, setJob: (j2, merge) => { job = merge ? { ...job, ...j2 } : j2; }, redraw: draw }), h('div', { class: 'card' }, h('h3', null, 'Notes'), notes, h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn sm', onclick: async () => { try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { notes: notes.value } }); toast('Saved'); } catch (e) { toast(e.message, true); } } }, 'Save')))), optimizeCard({ job, redraw: draw }), atsCard({ job }));
    else if (!job.credit && (tab === 'prep' || tab === 'chat')) host.append(paywall(me.quota, 'Pay now to unlock interview prep and Ask AI for this job.'));
    else if (tab === 'prep') host.append(prepView());
    else if (tab === 'chat') host.append(chatView());
    else host.append(jobInfo());
  }
  draw();
  return host;
}
