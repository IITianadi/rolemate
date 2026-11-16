// Resume facts: every bullet/line of the resume with where it lives, which skills it shows, its metrics and its ownership
// level. Matching points at these ids, so every claim of "you have this" traces back to a real line of the resume.

import { findSkills, normalize } from './skills.js';
import { stripMd } from './resume-text.js';

const OWN = /\b(led|owned|spearheaded|headed|founded|built|launched|drove|architected|managed|directed|established|created|designed|delivered|introduced)\b/i;
const SUPPORT = /\b(assisted|supported|helped|contributed|participated|collaborated|worked with|involved)\b/i;
const METRIC = /\d[\d,.]*\s*(%|x|k|m|cr|crore|lakh|lakhs|\+)|[₹$€£]\s*\d|\b\d{2,}[\d,.]*\b/i;

export function resumeFacts(resume) {
  const facts = [];
  const add = (f) => { const plain = stripMd(f.text).trim(); if (plain) facts.push({ ...f, plain, skills: findSkills(plain), metric: METRIC.test(plain), action: (plain.match(/^[A-Za-z]+/) || [''])[0].toLowerCase(), ownership: OWN.test(plain) ? 'owned' : SUPPORT.test(plain) ? 'supported' : 'unclear' }); };
  let summary = '';
  for (const s of resume.sections || []) {
    if (s.kind === 'summary') { for (const it of s.items) { summary += `${stripMd(it.text)} `; add({ id: it.id, itemId: it.id, section: s.heading, kind: 'summary', where: s.heading, text: it.text }); } continue; }
    for (const it of s.items || []) {
      if (s.kind === 'skills') { add({ id: it.id, itemId: it.id, section: s.heading, kind: 'skills', where: s.heading, text: `${it.label || ''} ${(it.skills || []).join(', ')} ${it.text || ''}`.trim() }); continue; }
      const place = `${s.heading} › ${[it.title, it.subtitle].filter(Boolean).join(', ') || s.heading}`.slice(0, 100);
      if (it.title || it.subtitle) add({ id: `${it.id}:t`, itemId: it.id, section: s.heading, kind: 'title', where: place, text: [it.title, it.subtitle].filter(Boolean).join(' ') });
      for (const b of it.bullets || []) add({ id: b.id, itemId: it.id, bulletId: b.id, section: s.heading, kind: s.kind, where: place, text: b.text });
      if (it.text) add({ id: it.id, itemId: it.id, section: s.heading, kind: s.kind, where: place, text: it.text });
    }
  }
  return { facts, summary: summary.trim(), byId: new Map(facts.map((f) => [f.id, f])) };
}

// ---- Lexical similarity: the offline stand-in for semantic matching (and a check on the AI's answers).
const STOP = new Set(['the', 'and', 'of', 'for', 'a', 'an', 'in', 'at', 'to', 'with', 'on', 'or', 'as', 'by', 'is', 'are', 'be', 'your', 'our', 'we', 'you', 'strong', 'good', 'excellent', 'experience', 'ability', 'skills', 'knowledge', 'understanding', 'working']);
const stem = (w) => w.replace(/(ing|ed|es|s|ion|ions|ment|ments|ity|al|ly)$/i, '').slice(0, 7);
export const tokens = (s) => [...new Set(normalize(String(s)).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map(stem).filter((w) => w.length > 1))];

export function lexicalMatch(requirement, facts) {
  const rt = tokens(requirement);
  const phrase = normalize(requirement);
  if (!rt.length) return { score: 0, fact: null, exact: false };
  let best = { score: 0, fact: null, exact: false };
  for (const f of facts) {
    const text = normalize(f.plain);
    const exact = phrase.length > 2 && ` ${text} `.includes(` ${phrase} `);
    const ft = new Set(tokens(f.plain));
    const hit = rt.filter((t) => ft.has(t)).length / rt.length;
    const score = exact ? 1 : hit;
    if (score > best.score || (score === best.score && exact && !best.exact)) best = { score, fact: f, exact };
  }
  return best;
}
export const statusFromLexical = (score) => (score >= 0.99 ? 'strong' : score >= 0.6 ? 'partial' : score >= 0.34 ? 'weak' : 'missing');
