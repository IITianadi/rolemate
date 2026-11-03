import { h } from './dom.js';

export const pageHead = (title, desc, ...actions) => h('div', { class: 'pagehead' }, h('div', null, h('h1', null, title), desc && h('p', null, desc)), actions.length > 0 && h('div', { class: 'row' }, actions));

// The one thing to do on this screen: a dark card with a single sentence and one or two buttons.
export const nextStep = ({ label = 'Next', title, sub, actions = [] }) =>
  h('div', { class: 'next' }, h('div', null, h('div', { class: 'k' }, label), h('div', { class: 't' }, title), sub && h('div', { class: 's' }, sub)), actions.length > 0 && h('div', { class: 'row' }, actions));

// Where this job is on the path from "found it" to "applied". `now` is the index of the current step.
export function path(steps, now) {
  return h('div', { class: 'path', 'aria-label': 'Progress' }, steps.map((s, i) => h('span', { class: i < now ? 'done' : i === now ? 'now' : '' }, h('i', null, i < now ? '✓' : String(i + 1)), s)));
}

const NS = 'http://www.w3.org/2000/svg';
// Score ring. Starts empty and fills, like the one on the website.
export function ring(score) {
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('aria-hidden', 'true');
  const mk = (cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', cls); c.setAttribute('cx', 60); c.setAttribute('cy', 60); c.setAttribute('r', 54); svg.append(c); return c; };
  mk('bg'); const arc = mk('arc'); arc.style.strokeDashoffset = '339.3';
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = String(339.3 * (1 - (score ?? 0) / 100)); }));
  return h('div', { class: 'ringbox', role: 'img', 'aria-label': `Match score ${score ?? 'unknown'} out of 100` }, svg, h('div', { class: 'n' }, score == null ? '–' : score, score != null && h('small', null, '%')));
}

export function stepper(current) {
  const steps = ['Resume', 'Check', 'Extension'];
  return h('div', { class: 'stepper', 'aria-label': 'Progress' }, steps.map((s, i) => [i > 0 && h('em'), h('span', { class: i === current ? 'on' : i < current ? 'done' : '' }, h('i', null, i < current ? '✓' : String(i + 1)), s)]));
}

export const emptyState = (ic, title, text, ...actions) => h('div', { class: 'card empty' }, h('div', { class: 'iconbox' }, ic), h('h2', null, title), text && h('p', { class: 'muted', style: 'max-width:440px;margin:6px auto 22px' }, text), actions.length > 0 && h('div', { class: 'row', style: 'justify-content:center' }, actions));

// Company logo from the job posting, with the company's first letter when there is no logo or it fails to load.
export function logoMark(job, size = 36) {
  const letter = ((job.company || job.title || '?').trim()[0] || '?').toUpperCase();
  const box = h('span', { class: 'logomark', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px`, 'aria-hidden': 'true' }, letter);
  if (job.logo) {
    const img = h('img', { src: job.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

// "linkedin.com" -> "LinkedIn": where the job was posted.
const SITES = { 'linkedin.com': 'LinkedIn', 'naukri.com': 'Naukri', 'indeed.com': 'Indeed', 'glassdoor.com': 'Glassdoor', 'foundit.in': 'foundit', 'instahyre.com': 'Instahyre', 'wellfound.com': 'Wellfound', 'cutshort.io': 'Cutshort', 'internshala.com': 'Internshala', 'greenhouse.io': 'Greenhouse', 'lever.co': 'Lever', 'ashbyhq.com': 'Ashby', 'myworkdayjobs.com': 'Workday' };
export function sourceName(job) {
  let host = job.source || ''; try { host = new URL(job.url).hostname; } catch { /* use source as is */ }
  host = host.replace(/^www\./, '').toLowerCase();
  const key = Object.keys(SITES).find((k) => host === k || host.endsWith(`.${k}`));
  return key ? SITES[key] : host;
}

// Shown when the free resumes are used up. "Pay now" goes to the payment link (PAY_URL on the server) or to Settings.
export function paywall(quota, extra) {
  const link = quota?.payUrl;
  return h('div', { class: 'card paywall' }, h('h2', null, 'You’re out of free resumes'),
    h('p', { class: 'muted' }, `You’ve used all ${quota?.limit ?? 50} free resumes. ${extra || 'Pay now to keep going.'}`),
    h('div', { class: 'row' }, link ? h('a', { class: 'btn primary', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Pay now') : h('span', { class: 'muted small' }, 'Payments are opening soon. We’ll let you know.')));
}
