// Rolemate popup. Capture runs only when the user clicks: the job page is read from the active tab (activeTab
// permission) and sent to the user's own Rolemate account. Only job posts on supported sites (sites.js) are captured.
'use strict';

const SERVER = 'https://app.rolemate.in';
const root = document.getElementById('root');
const store = {
  get: () => chrome.storage.local.get({ token: '', email: '' }),
  set: (v) => chrome.storage.local.set(v),
};
const openTab = (path) => chrome.tabs.create({ url: SERVER + path });

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== false && kid != null) e.append(kid instanceof Node ? kid : document.createTextNode(kid));
  return e;
}
const svg = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; };

// The Rolemate mark (two-module R): a tall ink block, a red block, an open outlined box. `loop` replays the assembly while we work.
const markInner = '<rect class="m-ink" x="0" y="4" width="22" height="48" fill="#111"/><rect class="m-red" x="26" y="4" width="22" height="22" fill="#D0021B"/><rect class="m-box" pathLength="1" x="27.5" y="31.5" width="19" height="19" fill="none" stroke="#111" stroke-width="3"/>';
const MARK = (loop) => svg(`<svg class="mark ${loop ? 'loop' : ''}" viewBox="0 0 48 56" aria-hidden="true">${markInner}</svg>`);
const LOGO = () => svg(`<svg class="logo" viewBox="0 0 230 56" role="img" aria-label="Rolemate">${markInner}<text x="62" y="40" textLength="164" lengthAdjust="spacingAndGlyphs" font-family="'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="32" fill="#111">Rolemate</text></svg>`);

let credits = null; // from /api/me, shown in the footer
function show(...nodes) {
  root.replaceChildren(
    el('header', {}, LOGO()),
    el('main', {}, ...nodes));
}
const footer = async () => {
  const { email } = await store.get();
  return el('footer', {},
    el('button', { class: 'link', onclick: () => openTab('/#/tracking') }, 'Open dashboard'),
    el('span', { class: 'muted' }, credits != null ? `${credits} credit${credits === 1 ? '' : 's'} left` : ''),
    email && el('button', { class: 'link', title: email, onclick: () => signIn('', true) }, 'Account'));
};
// A titled message: icon state, a one-line title, and what to do next.
const message = (kind, title, text, ...actions) => el('section', { class: `msg ${kind}` },
  el('div', { class: 'tab' }, kind === 'stop' ? 'Needs attention' : 'Next step'),
  el('h1', {}, title), text && el('p', {}, text), ...actions);

async function callApi(path, { method = 'GET', body } = {}) {
  const { token } = await store.get();
  let res;
  try {
    res = await fetch(SERVER + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error('Can’t reach Rolemate. Check your internet connection and try again.'), { network: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}). Try again.`), { status: res.status, data });
  return data;
}

// --- runs inside the page. Must be self-contained.
function extractPage() {
  const clean = (s) => (s || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const q = (sel) => { for (const s of sel) { const n = document.querySelector(s); if (n && n.innerText && n.innerText.trim().length > 20) return n; } return null; };
  const text1 = (sel) => { const n = q(sel); return n ? clean(n.innerText).split('\n')[0].slice(0, 160) : ''; };
  const host = location.hostname;
  const out = { url: location.href.split('#')[0], title: '', company: '', location: '', text: '', source: host.replace(/^www\./, '') };

  const sel = window.getSelection ? window.getSelection().toString() : '';
  // Structured data many career pages publish for search engines. Single-page sites (LinkedIn, Workday...) leave the
  // PREVIOUS job's data in the page when you click another job, so only trust it when it matches what is on screen.
  const visible = (document.body.innerText || '').toLowerCase();
  const onScreen = (t) => !!t && visible.includes(String(t).toLowerCase().replace(/\s+/g, ' ').trim());
  let ld = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const list = Array.isArray(data) ? data : data['@graph'] || [data];
      const jp = list.find((x) => x && (x['@type'] === 'JobPosting' || (Array.isArray(x['@type']) && x['@type'].includes('JobPosting'))) && onScreen(x.title));
      if (jp) { ld = jp; break; }
    } catch { /* ignore invalid JSON-LD */ }
  }
  if (ld) {
    // innerText on a detached node drops line breaks, which glues requirements together. Add them back before reading text.
    const html = String(ld.description || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section|table)>/gi, '\n').replace(/<li[^>]*>/gi, '- ');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    out.title = String(ld.title || '');
    out.company = String((ld.hiringOrganization && ld.hiringOrganization.name) || '');
    const addr = ld.jobLocation && (Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation);
    out.location = addr && addr.address ? [addr.address.addressLocality, addr.address.addressRegion].filter(Boolean).join(', ') : '';
    out.jsonld = clean(parsed.body.textContent);
  }

  // A stable id for "this exact posting" so two different jobs on the same page address are never confused.
  const q2 = new URLSearchParams(location.search);
  out.externalId = q2.get('currentJobId') || q2.get('jobId') || q2.get('job_id') || q2.get('gh_jid') || q2.get('jid') || q2.get('reqId')
    || (location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/) || [])[1] || (location.pathname.match(/-(\d{6,})\/?$/) || [])[1] || '';

  // The job description container (class names used by LinkedIn, Naukri and common job pages). Used on any site.
  const DESC = ['.jobs-description__content', '.jobs-box__html-content', '#job-details', '.feed-shared-update-v2__description', '.update-components-text', '.styles_job-desc-container__txpYf', '[class*="job-desc"]', '[class*="JDC"]', '[class*="job-description"]', '[class*="jobDescription"]', '[id*="job-description"]', '[id*="jobDescription"]'];
  // LinkedIn posts (feed/update, posts): the post's own text box. LinkedIn has shipped several layouts, so try each.
  const isPost = /(^|\.)linkedin\.com$/.test(host) && /\/(feed\/update|posts)\//.test(location.pathname);
  const POST = ['.feed-shared-update-v2__description', '[data-test-id="main-feed-activity-card__commentary"]', '.update-components-update-v2__commentary', '.feed-shared-inline-show-more-text', '.update-components-text', '[class*="commentary"]'];
  const descNode = isPost ? (q(POST) || q(DESC)) : q(DESC);
  if (/linkedin\.com$/.test(host) && /\/jobs\//.test(location.pathname)) out.title = out.title || text1(['.job-details-jobs-unified-top-card__job-title h1', '.jobs-unified-top-card__job-title', 'h1']);
  if (/naukri\.com$/.test(host)) out.title = out.title || text1(['h1']);
  if (descNode && clean(descNode.innerText).length >= (isPost ? 80 : 150)) out.text = clean(descNode.innerText);

  // Company candidates (the server verifies and picks): the company link in the SAME panel as the description,
  // page metadata, the page title and the site address. A card elsewhere in a job list is never used.
  const cc = [];
  const addCo = (name, source) => { const n = clean(String(name || '')).split('\n')[0].trim(); if (n && n.length <= 80) cc.push({ name: n, source }); };
  if (ld && ld.hiringOrganization && ld.hiringOrganization.name) { out.companyTrusted = true; out.company = String(ld.hiringOrganization.name); }
  // Company logo + website. Order: structured data, the company link in the job panel, then (only on a company's own
  // careers site) the site icon. A job board's own icon is never used: that would be the board's logo, not the company's.
  const httpUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
  out.logo = ''; out.companyDomain = '';
  if (ld && ld.hiringOrganization) {
    const o = ld.hiringOrganization;
    out.logo = httpUrl(typeof o.logo === 'string' ? o.logo : (o.logo && o.logo.url) || '');
    const site = [].concat(o.sameAs || o.url || [])[0];
    try { if (site) out.companyDomain = new URL(site).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  }
  // Walk up from the description to the panel that also holds its heading / company link. Both belong to THIS job.
  let paneTitle = ''; let panel = null;
  if (descNode) {
    let a = descNode;
    for (let i = 0; i < 12 && a && a !== document.body; i++) {
      a = a.parentElement;
      if (!a) break;
      const links = [...a.querySelectorAll('a[href*="/company/"], a[href*="/companies/"]')];
      const hd = a.querySelector('h1, [class*="top-card__job-title"], [class*="job-title"], [class*="jobTitle"]');
      const hdText = hd ? clean(hd.innerText).split('\n')[0] : '';
      if (links.length || hdText.length >= 3) {
        // Prefer a link with visible text; a logo-only link falls back to its alt text ("Acme logo" is cleaned by the server).
        for (const l of [...links].sort((a, b) => (b.innerText.trim() ? 1 : 0) - (a.innerText.trim() ? 1 : 0)).slice(0, 4)) addCo(l.innerText || l.getAttribute('aria-label') || (l.querySelector('img') && l.querySelector('img').alt), 'link');
        // Hidden page headings ("0 notifications", "Feed detail update") are not the job's title.
        paneTitle = isPost || /notification|feed|^post$|messaging/i.test(hdText) ? '' : hdText; panel = a;
        break;
      }
    }
  }
  // Logo hunt inside the job panel: real src or the lazy-load attributes, scored by "logo" hints and a sensible size.
  if (!out.logo && panel) {
    const srcOf = (i) => httpUrl(i.currentSrc || i.getAttribute('src') || '') || httpUrl(i.getAttribute('data-delayed-url') || i.getAttribute('data-src') || i.getAttribute('data-lazy-src') || '');
    let best = null; let bestScore = 0;
    const root = panel;
    for (const im of root.querySelectorAll('img')) {
      if (descNode && descNode.contains(im)) continue;
      const u = srcOf(im); if (!u) continue;
      const hint = (im.className + ' ' + im.alt + ' ' + u + ' ' + (im.closest('a') ? im.closest('a').getAttribute('href') || '' : '')).toLowerCase();
      const w = im.naturalWidth || im.width || 0;
      let sc = 0;
      if (/logo/.test(hint)) sc += 3;
      if (/\/company\/|\/companies\/|company-logo|comp-|compan/.test(hint)) sc += 2;
      if (/profile|avatar|ghost|person|banner|sprite|icon-|emoji/.test(hint)) sc -= 4;
      if (w && (w < 20 || w > 400)) sc -= 3;
      if (sc > bestScore) { best = u; bestScore = sc; out.logoAlt = (im.alt || im.getAttribute('aria-label') || '').slice(0, 120); }
    }
    if (best) { out.logo = best; out.logoHow = 'scan'; } else out.logoAlt = '';
  }
  for (const sel of ['meta[property="og:site_name"]', 'meta[name="author"]', 'meta[name="application-name"]']) { const m = document.querySelector(sel); if (m) addCo(m.content, 'meta'); }
  for (const part of clean(document.title).split(/\s+[|\u2013\u2014-]\s+/)) addCo(part, 'title');
  try {
    const u = new URL(location.href); const hh = u.hostname.replace(/^www\./, ''); const segs = u.pathname.split('/').filter(Boolean);
    let slug = '';
    const wd = hh.match(/^([a-z0-9-]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/);
    if (/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|jobvite\.com|recruitee\.com|breezy\.hr)$/.test(hh)) slug = segs[0] || '';
    else if (wd) slug = wd[1];
    else if (!/(linkedin|naukri|indeed|glassdoor|foundit|monster|instahyre|wellfound|cutshort|shine|timesjobs|apna|internshala|google|localhost)\./.test(hh + '.') && hh.includes('.') && !/^[\d.]+$/.test(hh)) { const lab = hh.split('.'); slug = lab[lab.length - (/^(co|com|org|net)$/.test(lab[lab.length - 2]) ? 3 : 2)] || ''; }
    if (slug) addCo(slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'url');
  } catch { /* ignore */ }
  out.companyCandidates = cc.slice(0, 10);
  if (!out.logo && !/(linkedin|naukri|indeed|glassdoor|foundit|monster|instahyre|wellfound|cutshort|shine|timesjobs|apna|internshala|google|greenhouse|lever|ashbyhq|workable|smartrecruiters|jobvite|recruitee|breezy|myworkdayjobs|localhost)\./.test(host + '.')) {
    const ic = document.querySelector('link[rel~="apple-touch-icon"]') || document.querySelector('link[rel~="icon"]');
    if (ic) out.logo = httpUrl(ic.getAttribute('href'));
  }

  // Some pages (LinkedIn posts among them) render text inside shadow DOM, which innerText of the page does not include.
  const shadowText = (rootNode) => {
    let t = '';
    for (const e of rootNode.querySelectorAll('*')) if (e.shadowRoot) { for (const c of e.shadowRoot.children) t += '\n' + (c.innerText || ''); t += shadowText(e.shadowRoot); }
    return t;
  };
  if (!out.text) {
    const body = q(['main', '[role="main"]', 'article']);
    out.text = clean((body || document.body).innerText);
    if (out.text.length < 300) out.text = clean(`${document.body.innerText || ''}\n${shadowText(document)}`);
  } else if (descNode) {
    // A description rarely repeats the job title or company; add what the panel says so they travel with the text.
    const head = [paneTitle, cc.find((c) => c.source === 'link')?.name].filter(Boolean).join('\n');
    if (head && !out.text.startsWith(head)) out.text = `${head}\n\n${out.text}`;
  }
  if (out.jsonld && out.jsonld.length > 200) out.text = `${out.title}\n${out.company}\n${out.location}\n\n${out.jsonld}`;
  if (sel && sel.trim().length >= 80) { out.text = clean(sel); out.selection = true; }
  // Titles from structured data are trusted. Everything else is only a CANDIDATE: the server keeps one only if it
  // matches the captured text (page scraping can grab a card from a job list, a hidden heading, or site chrome).
  out.titleTrusted = !!ld && !!out.title;
  const cands = [];
  if (!out.titleTrusted && out.title) cands.push(out.title);
  for (const el of [...document.querySelectorAll('h1')].slice(0, 6)) cands.push(clean(el.innerText).split('\n')[0]);
  const og = document.querySelector('meta[property="og:title"]'); if (og) cands.push(og.content);
  for (const part of clean(document.title).split(/\s+[|\u2013\u2014-]\s+/)) cands.push(part);
  if (paneTitle) cands.unshift(paneTitle);
  out.titleCandidates = [...new Set(cands.map((c) => String(c || '').trim()).filter((c) => c.length >= 3 && c.length <= 120))].slice(0, 12);
  out.title = out.titleTrusted ? out.title : '';
  out.text = out.text.slice(0, 40000);
  out.isJobPosting = !!ld;
  delete out.jsonld;
  return out;
}


// ---------- Screens

const sitesList = () => el('details', { class: 'sites' }, el('summary', {}, `See all ${SITES.length} supported sites`),
  el('p', {}, SITES.map((s) => s.name).join(', ') + '.'));

// Has this account already saved the job in the active tab? Matches on the URL (ignoring #fragments and tracking
// parameters) or the LinkedIn job id. A failed lookup just means we offer a normal capture.
const jobIdOf = (u) => { try { const x = new URL(u); return x.searchParams.get('currentJobId') || (x.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/) || [])[1] || ''; } catch { return ''; } };
const plainUrl = (u) => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ''); } catch { return ''; } };
async function savedJobFor(url) {
  try {
    const { jobs } = await Promise.race([callApi('/api/jobs'), new Promise((_, no) => setTimeout(no, 1500))]);
    const id = jobIdOf(url), plain = plainUrl(url);
    return jobs.find((j) => (id && jobIdOf(j.url) === id) || (plain && plainUrl(j.url) === plain && !id)) || null;
  } catch { return null; }
}

async function home() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const f = await footer();
  if (!tab || !/^https?:/.test(tab.url || '')) {
    return show(message('info', 'Open a job post first', 'Go to LinkedIn, Naukri or another job site, open a job, then click Rolemate.'), sitesList(), f);
  }
  const site = findSite(tab.url);
  if (!site) {
    return show(message('stop', 'This site isn’t supported yet', `Rolemate captures jobs from ${SITES.length} job sites and career pages, like LinkedIn, Naukri and Indeed.`,
      el('button', { class: 'btn', onclick: () => openTab('/#/tracking/add') }, 'Paste the job in Rolemate instead')), sitesList(), f);
  }
  const seen = site.isJobUrl ? await savedJobFor(tab.url) : null;
  const title = String(tab.title || '').replace(/\s*[|–-]\s*(LinkedIn|Naukri\.com|Indeed\.com|Glassdoor|foundit).*$/i, '').trim();
  if (seen) {
    const fit = seen.match?.score != null ? ` · ${seen.match.score}% fit` : '';
    return show(el('section', { class: 'ready mod' },
      el('span', { class: 'tab' }, 'Already captured'),
      el('h1', {}, 'You saved this job'),
      title && el('p', { class: 'jobline' }, title),
      el('p', {}, `It’s in your dashboard as ${seen.status}${fit}. Capture again if the posting changed; it updates the saved job and costs no credit.`),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => openTab(`/#/job/${seen.id}`) }, 'Open in dashboard'),
        el('button', { class: 'btn', onclick: () => capture(tab, site) }, 'Capture again'))), f);
  }
  show(el('section', { class: 'ready mod' },
    el('span', { class: 'tab' }, site.isJobUrl ? `${site.name} job` : site.name),
    el('h1', {}, site.isJobUrl ? 'Ready to capture' : 'Open the job you want'),
    site.isJobUrl && title && el('p', { class: 'jobline' }, title),
    el('p', {}, site.isJobUrl ? 'Rolemate saves this job, scores how well you match, and tailors your resume to it.' : `Click a job on ${site.name} so its full description is open, then capture it.`),
    el('button', { class: 'btn primary', onclick: () => capture(tab, site) }, 'Capture this job'),
    el('p', { class: 'hint' }, 'Uses 1 credit for each new job.')), f);
}

// Loading: the logo plays on a loop while each step is named. Steps advance as the work does.
function loading(steps) {
  let i = 0;
  const label = el('p', { class: 'step' }, steps[0] + '…');
  const list = el('ol', { class: 'steps' }, steps.map((s, k) => el('li', { class: k === 0 ? 'now' : '' }, s)));
  root.replaceChildren(el('main', { class: 'loading' }, MARK(true), label, list));
  const set = (n) => { i = Math.min(n, steps.length); [...list.children].forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'now' : ''; }); if (i < steps.length) label.textContent = steps[i] + '…'; };
  return { next: () => set(i + 1), done: () => set(steps.length) };
}

const tryAgain = () => el('button', { class: 'btn', onclick: home }, 'Try again');

async function capture(tab, site) {
  const steps = loading(['Reading the job post', 'Matching it to your resume', 'Tailoring your resume']);
  let page;
  try {
    // Read every frame on the tab (some sites show the post inside a frame) and keep the one with the most text.
    let runs;
    try { runs = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: extractPage }); }
    catch { runs = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage }); }
    const pages = runs.map((r) => r && r.result).filter(Boolean);
    const top = (runs.find((r) => r && r.frameId === 0) || {}).result;
    page = top && (top.selection || top.text.length >= 300) ? top : pages.sort((a, b) => b.text.length - a.text.length)[0] || top;
    if (page && top && page !== top) { page.url = top.url; page.source = top.source; page.externalId = page.externalId || top.externalId; }
  } catch {
    return show(message('stop', 'Can’t read this page', 'Chrome doesn’t let extensions read this page. Reload it and try again.', tryAgain()), await footer());
  }
  if (!page || !(site.isJobUrl || page.isJobPosting || page.selection)) {
    return show(message('info', 'Open a single job post', `This ${site.name} page isn’t one job. Click a job so its full description is open, then click Rolemate again.`,
      el('p', { class: 'hint' }, 'Tip: you can also select the job’s text on the page, then capture.'), tryAgain()), await footer());
  }
  if (page.text.length < 120) {
    return show(message('stop', 'Couldn’t find the job description', 'Scroll until the description is visible, or select its text, then click Rolemate again.', tryAgain()), await footer());
  }
  steps.next();
  const later = setTimeout(steps.next, 1800);
  try {
    const res = await callApi('/api/capture', { method: 'POST', body: { url: page.url, externalId: page.externalId, source: page.source, text: page.text, hints: { title: page.title, titleTrusted: page.titleTrusted && !page.selection, titleCandidates: page.titleCandidates, company: page.company, companyTrusted: !!page.companyTrusted, companyCandidates: page.companyCandidates, location: page.location, logo: page.logo, companyDomain: page.companyDomain, logoAlt: page.logoAlt, logoHow: page.logoHow } } });
    clearTimeout(later); steps.done();
    await result(res);
  } catch (e) {
    clearTimeout(later);
    if (e.status === 401) return signIn('Your session ended. Please sign in again.');
    if (e.status === 409) return needResume();
    show(message('stop', e.status === 422 ? 'Couldn’t read this job' : 'Something went wrong', e.message, tryAgain()), await footer());
  }
}

function fitMeter(score) {
  const num = document.createTextNode('0');
  const n = el('b', {}, num, el('small', {}, '/100'));
  const m = el('div', { class: 'meter', style: '--p:0' }, el('i'));
  const t0 = performance.now();
  const tick = (t) => { const k = Math.min(1, (t - t0) / 700); const v = Math.round(score * (1 - Math.pow(1 - k, 3))); num.data = v; m.style.setProperty('--p', v); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { n, m };
}

async function result({ job, resumeId, quotaExceeded, quota, existing }) {
  if (quota && quota.remaining != null) credits = quota.remaining;
  const m = job.match || {};
  const missing = m.missingMust || []; const have = (m.matchedMust || []).length; const req = have + missing.length;
  const fit = m.fit || [];
  const gapNames = fit.length ? fit.filter((i) => i.status !== 'have' && i.kind !== 'responsibility').sort((a, b) => (a.kind === 'must' ? 0 : 1) - (b.kind === 'must' ? 0 : 1)).map((i) => i.requirement) : missing;
  const openJob = () => openTab(`/#/job/${job.id}`);
  const dl = el('button', { class: 'btn primary', onclick: async () => {
    dl.disabled = true; dl.textContent = 'Preparing your PDF…';
    try { await downloadPdf(resumeId); dl.textContent = 'Downloaded'; next.hidden = false; }
    catch (x) { dl.disabled = false; dl.textContent = 'Download tailored resume'; next.textContent = x.message; next.hidden = false; }
  } }, 'Download tailored resume');
  const next = el('p', { class: 'hint', hidden: true }, 'Next: apply on the job site, then mark it as applied in your dashboard.');
  show(
    el('section', { class: 'mod' }, el('span', { class: 'tab' }, existing ? 'Updated in your dashboard' : 'Saved to your dashboard'),
    el('div', { class: 'job' }, el('div', { class: 'title' }, job.title || 'Untitled role'), el('div', { class: 'muted' }, [job.company, job.location].filter(Boolean).join(' · ') || 'Company not detected')),
    m.score != null
      ? (() => { const f = fitMeter(m.score); return el('div', { class: `score ${m.band === 'weak' ? 'weak' : ''}` },
        el('div', { class: 'fit' }, f.n, el('strong', {}, { strong: 'Strong match', partial: 'Partial match', weak: 'Weak match' }[m.band] || 'Match')), f.m,
        el('div', { class: 'muted' }, req ? `Covers ${have} of ${req} required skills. 75 is a good target to apply.` : 'Scored on experience and role. 75 is a good target to apply.')); })()
      : el('p', { class: 'muted' }, 'No clear requirements found on this page, so there’s no score.'),
    // Missing items are only shown. Nothing is added for you: add them to your resume if you have them.
    gapNames.length > 0 && el('div', { class: 'gaps' }, el('div', { class: 'label' }, 'Not on your resume'),
      el('div', { class: 'chips' }, gapNames.slice(0, 5).map((s) => el('span', { class: 'chip' }, s)), gapNames.length > 5 && el('span', { class: 'chip more' }, `+${gapNames.length - 5}`)),
      el('p', { class: 'hint' }, 'Have any of these? Add them to your resume in the dashboard.'))),
    quotaExceeded
      ? message('stop', 'You’re out of credits', 'The job is saved and scored, but no resume was made. Buy credits to tailor it.',
        el('button', { class: 'btn primary', onclick: () => openTab('/#/settings/billing') }, 'Buy credits'))
      : resumeId && [dl, next],
    el('button', { class: 'btn', onclick: openJob }, gapNames.length ? 'See what’s missing' : 'Open in dashboard'),
    await footer());
}

async function downloadPdf(id) {
  const { token } = await store.get();
  let res;
  try { res = await fetch(`${SERVER}/api/resumes/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }); } catch { throw new Error('Can’t reach Rolemate. Check your connection and try again.'); }
  if (!res.ok) throw new Error('Couldn’t make the PDF. Try again, or download it from the dashboard.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'resume.pdf';
  const url = URL.createObjectURL(await res.blob());
  const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function needResume() {
  show(message('info', 'Upload your resume first', 'Rolemate tailors your own resume to each job. Upload it once in the dashboard, then capture this job again.',
    el('button', { class: 'btn primary', onclick: () => openTab('/#/welcome') }, 'Upload resume')));
}

async function signIn(msg, fromAccount) {
  const s = await store.get();
  const signedIn = fromAccount && s.token;
  const email = el('input', { type: 'email', autocomplete: 'email', value: s.email, placeholder: 'you@example.com' });
  const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password' });
  const err = el('p', { class: 'err', hidden: !msg }, msg || '');
  const btn = el('button', { class: 'btn primary', type: 'submit' }, 'Sign in');
  const done = async (r) => { await store.set({ token: r.token, email: r.user.email }); await loadMe(); home(); };
  const form = el('form', { onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; btn.textContent = 'Signing in…'; err.hidden = true;
    try { await done(await callApi('/api/auth/login', { method: 'POST', body: { email: email.value, password: pass.value } })); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Sign in'; }
  } }, el('label', {}, 'Email', email), el('label', {}, 'Password', pass), err, btn);
  // Google accounts have no password: a one-time code from the dashboard's Settings signs the extension in.
  const code = el('input', { type: 'text', autocomplete: 'off', placeholder: 'XXXX-XXXX', maxlength: '9', class: 'code' });
  const cerr = el('p', { class: 'err', hidden: true });
  const cbtn = el('button', { class: 'btn', type: 'submit' }, 'Sign in with code');
  const codeForm = el('form', { onsubmit: async (e) => {
    e.preventDefault(); cbtn.disabled = true; cerr.hidden = true;
    try { await done(await callApi('/api/auth/connect', { method: 'POST', body: { code: code.value } })); }
    catch (x) { cerr.textContent = x.message; cerr.hidden = false; cbtn.disabled = false; }
  } }, el('p', { class: 'muted' }, 'Get a one-time code in the dashboard: Settings → Extension.'), code, cerr, cbtn,
  el('button', { class: 'link', type: 'button', onclick: () => openTab('/#/settings/extension') }, 'Get a code'));
  show(
    signedIn && el('div', { class: 'acct' }, el('span', {}, 'Signed in as ', el('b', {}, s.email)),
      el('button', { class: 'link', onclick: async () => { await store.set({ token: '', email: '' }); credits = null; signIn(); } }, 'Sign out')),
    el('section', { class: 'signin mod' }, el('span', { class: 'tab' }, signedIn ? 'Account' : 'Sign in'), el('h1', {}, signedIn ? 'Switch account' : 'Sign in to Rolemate'),
      el('p', { class: 'muted' }, 'Use the same account as your Rolemate dashboard.'), form,
      el('details', { class: 'alt' }, el('summary', {}, 'Signed up with Google?'), codeForm),
      el('p', { class: 'muted center' }, 'New to Rolemate? ', el('button', { class: 'link inline', onclick: () => openTab('/') }, 'Create a free account'))),
    signedIn && el('button', { class: 'btn', onclick: home }, 'Back'));
}

async function loadMe() {
  try { const me = await callApi('/api/me'); credits = me.quota && me.quota.remaining != null ? me.quota.remaining : null; return me; }
  catch (e) { if (e.status === 401) throw e; return null; } // offline: carry on, capture will report it
}

(async () => {
  const { token } = await store.get();
  if (!token) return signIn();
  try { await loadMe(); } catch { return signIn('Your session ended. Please sign in again.'); }
  home();
})();
