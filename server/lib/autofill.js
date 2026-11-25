// Autofill support: the application profile the extension fills forms from, the user's saved answers,
// and drafts for free-text questions.
//
// Rules this file enforces (the extension enforces the rest: it never submits and never uploads a file):
// - Facts come from the user's resume and from details the user typed. Nothing is invented.
// - A draft may only use the resume, saved answers and the job. A number that appears nowhere in those is dropped.
// - Page text (the job description, question labels) is data. It is fenced, and the model only returns strings.

import { askJSON, aiEnabled, fence, DATA_ONLY_RULE } from './ai.js';
import { deriveProfile } from './derive.js';
import { resumePlainText } from './resume-text.js';

const s = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : '');
const yesNo = (v) => (/^yes$/i.test(String(v)) ? 'Yes' : /^no$/i.test(String(v)) ? 'No' : '');

// The details a user can confirm or edit on top of what the resume says. Everything is optional.
export function sanitizeApply(input = {}) {
  const e = input.eeo && typeof input.eeo === 'object' ? input.eeo : {};
  const out = {
    firstName: s(input.firstName, 60), lastName: s(input.lastName, 60), preferredName: s(input.preferredName, 60),
    phone: s(input.phone, 30), phoneCountryCode: s(input.phoneCountryCode, 6),
    city: s(input.city, 80), state: s(input.state, 80), country: s(input.country, 80), postalCode: s(input.postalCode, 12),
    linkedin: s(input.linkedin, 200), github: s(input.github, 200), portfolio: s(input.portfolio, 200),
    workAuthorization: s(input.workAuthorization, 200), requiresSponsorship: yesNo(input.requiresSponsorship),
    earliestStart: s(input.earliestStart, 60), dateOfBirth: s(input.dateOfBirth, 20), pronouns: s(input.pronouns, 40),
    eeo: { autoFill: e.autoFill === true, gender: s(e.gender, 60), disability: s(e.disability, 80), veteran: s(e.veteran, 80), race: s(e.race, 80) },
  };
  return out;
}

const looksLikeSchool = /university|institute|college|school|iit|nit|bits|academy/i;

// The profile in the shape the extension's mapper reads. `facts` and `apply` are the user's own words; `resume` fills the rest.
export function buildApplyProfile({ resume, facts = {}, apply = {}, accountEmail = '', confirmedSkills = [] }) {
  const d = resume ? deriveProfile(resume) : {};
  const [first, ...rest] = String(d.name || '').split(/\s+/).filter(Boolean);
  const phoneDigits = String(apply.phone || d.phone || '').replace(/[^\d+]/g, '');
  const loc = String(d.location || '').split(',').map((x) => x.trim()).filter(Boolean);
  const link = (re) => (d.links || []).find((l) => re.test(l)) || '';
  const withScheme = (u) => (u && !/^https?:\/\//i.test(u) ? `https://${u}` : u);
  const exp = resume?.sections?.find((x) => x.kind === 'experience')?.items || [];
  const edu = resume?.sections?.find((x) => x.kind === 'education')?.items || [];
  return {
    personal: {
      first_name: apply.firstName || first || '', last_name: apply.lastName || rest.join(' '), preferred_name: apply.preferredName || '',
      email: d.email || accountEmail || '', phone: phoneDigits.replace(/^\+/, ''), phone_country_code: apply.phoneCountryCode || (String(apply.phone || d.phone || '').trim().startsWith('+') ? '' : '+91'),
      date_of_birth: apply.dateOfBirth || null, pronouns: apply.pronouns || null,
    },
    location: {
      current_city: apply.city || loc[0] || '', current_state: apply.state || (loc.length > 2 ? loc[1] : ''), country: apply.country || (loc.length > 1 ? loc[loc.length - 1] : ''),
      postal_code: apply.postalCode || '', willing_to_relocate: facts.relocation || null,
    },
    links: { linkedin: withScheme(apply.linkedin || link(/linkedin\.com/i)), github: withScheme(apply.github || link(/github\.com/i)), portfolio: withScheme(apply.portfolio || (d.links || []).find((l) => !/linkedin|github/i.test(l)) || '') },
    work_authorization: { requires_sponsorship: apply.requiresSponsorship || null, notes: apply.workAuthorization || '' },
    employment: {
      current_company: d.currentCompany || '', current_title: d.currentRole || '',
      total_experience_years: facts.yearsExperience ?? d.yearsExperience ?? null,
      notice_period: facts.noticePeriod || '', current_ctc: facts.currentCtc || null, expected_ctc: facts.expectedCtc || null, ctc_currency: 'INR',
      earliest_start_date: apply.earliestStart || null,
    },
    education: edu.slice(0, 4).map((e) => {
      const [institution, degree] = looksLikeSchool.test(e.subtitle || '') && !looksLikeSchool.test(e.title || '') ? [e.subtitle, e.title] : [e.title, e.subtitle];
      return { institution: s(institution), degree: s(degree), dates: s(e.date, 60) };
    }),
    work_history: exp.slice(0, 6).map((e) => ({ title: s(e.title), company: s(e.subtitle), dates: s(e.date, 60) })),
    skills: [...new Set([...(d.skills || []), ...confirmedSkills])].slice(0, 40),
    eeo_and_sensitive: { auto_fill: apply.eeo?.autoFill === true, gender: apply.eeo?.gender || null, disability: apply.eeo?.disability || null, veteran_status: apply.eeo?.veteran || null, race_ethnicity: apply.eeo?.race || null },
  };
}

// Details forms commonly ask for that we cannot know. The panel lists them so the user adds them once.
export function missingDetails(p) {
  const out = [];
  if (!p.personal.first_name) out.push('name');
  if (!p.personal.phone) out.push('phone');
  if (!p.location.current_city) out.push('city');
  if (!p.employment.notice_period) out.push('noticePeriod');
  if (p.employment.current_ctc == null) out.push('currentCtc');
  if (p.employment.expected_ctc == null) out.push('expectedCtc');
  return out;
}

export const qkey = (q) => String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 300);
export const sanitizeAnswer = (b = {}) => ({ question: s(b.question, 300), tags: s(b.tags, 80), answer: s(b.answer, 3000) });

// ---- drafts for free-text questions

const numbersIn = (t) => new Set((String(t).match(/\d[\d,.]*%?/g) || []).map((x) => x.replace(/[,.]+$/, '').replace(/,/g, '')));

// True when every number in the answer already appears in the sources. Years, salaries and counts are never made up.
export function numbersSupported(answer, sources) {
  const have = numbersIn(sources);
  return [...numbersIn(answer)].every((n) => n.length < 2 || have.has(n));
}

const pickOption = (answer, options) => {
  const a = String(answer || '').trim().toLowerCase();
  return options.find((o) => String(o).trim().toLowerCase() === a) || null;
};

export async function draftAnswers({ questions, resume, profile, bank = [], job = null, page = {} }) {
  if (!aiEnabled()) return questions.map((q) => ({ id: q.id, answer: null, reason: 'Drafting is off right now. Write this one yourself.' }));
  const resumeText = resume ? resumePlainText(resume).slice(0, 6000) : '';
  const jd = job?.jd_text ? String(job.jd_text).slice(0, 5000) : '';
  const approved = bank.slice(0, 12).map((b) => `Q: ${b.question}\nA: ${b.answer}`).join('\n\n');
  const system = [
    'You write draft answers to job application questions for a candidate. The candidate will read each draft and approve it before anything is filled in.',
    'Use only the candidate\'s resume, profile, approved answers and the job. Write in the first person, plain and specific, in the candidate\'s voice, with no filler.',
    'Answer every question the sources support, even if it is the first time: pick the option the resume supports for yes/no and multiple-choice questions, and write a short tailored answer for open questions.',
    'Never invent experience, employers, dates, numbers, salary, credentials or skills. If the sources do not support an answer, return null for it.',
    'If a question lists options, the answer must be exactly one of the options, or null.',
    'Respect maxLength when given. Short questions get one or two sentences; "why do you want to work here" style questions get at most four.',
    DATA_ONLY_RULE,
    'Return {"answers":[{"id":"<id>","answer":"<text or null>"}]} with one entry per question.',
  ].join('\n');
  const user = [
    fence('candidate_resume', resumeText),
    fence('candidate_profile', JSON.stringify({ employment: profile?.employment, location: profile?.location, education: profile?.education, work_history: profile?.work_history, skills: profile?.skills })),
    approved && fence('approved_answers', approved),
    fence('job', `Title: ${job?.title || page.title || ''}\nCompany: ${job?.company || page.company || ''}\n${jd}`),
    fence('questions', JSON.stringify(questions.map((q) => ({ id: q.id, question: q.label, options: q.options?.length ? q.options : undefined, maxLength: q.maxLength || undefined })))),
  ].filter(Boolean).join('\n\n');
  const r = await askJSON(system, user, { maxTokens: 2500, effort: 'low' });
  const byId = new Map((Array.isArray(r?.answers) ? r.answers : []).map((a) => [String(a?.id), a?.answer]));
  const sources = [resumeText, approved, jd, JSON.stringify(profile || {})].join('\n');
  return questions.map((q) => {
    let a = byId.get(String(q.id));
    if (typeof a !== 'string' || !a.trim() || /^null$/i.test(a.trim())) return { id: q.id, answer: null, reason: 'Not enough in your resume to answer this. Write it yourself.' };
    a = a.trim().slice(0, q.maxLength || 1500);
    if (q.options?.length) { const o = pickOption(a, q.options); if (!o) return { id: q.id, answer: null, reason: 'No option clearly matches. Choose one yourself.' }; a = o; }
    if (!numbersSupported(a, sources)) return { id: q.id, answer: null, reason: 'The draft used a number that is not in your resume, so it was dropped. Write this one yourself.' };
    return { id: q.id, answer: a };
  });
}
