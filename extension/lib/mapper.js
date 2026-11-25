// Maps application-form fields to the user's own facts. No network, no model, no page access: pure functions, so it runs in
// the side panel and in Node tests. Ported from the filltheform field mapper.
//
// answerFor(field, profile, bank) returns one of:
//   { value, source }                 a confident answer: fill it (green)
//   { value, source, soft: true }     an answer we are less sure about: fill it, mark it "check" (yellow)
//   { value: null, source }           we know what the field is but have no data
//   { check, source }                 needs the user (sensitive, unclear option, unknown)
// Facts come only from the profile and the saved answers. Nothing is invented here.

const STOP = new Set('what is your are you the a an of to do does for please in on and or any have with this that how many which when where who will would can could be we our us my i'.split(' '));
export const SENSITIVE_RE = /gender|\bsex\b|race|ethnic|disabilit|veteran|sexual orientation|religio|caste|transgender|marital|pronoun/i;
const MATCH_MIN = 0.70;
const MATCH_GAP = 0.10;
const SYN = { compensation: 'ctc', salary: 'ctc', package: 'ctc', remuneration: 'ctc', joining: 'notice' };
const NOISE = new Set(['yearly', 'annual', 'annually', 'lpa', 'inr']);

export const clean = (s) => String(s || '').replace(/ /g, ' ').replace(/[✱*]/g, '').replace(/\s+/g, ' ').trim();

export function tokens(s) {
  const out = new Set();
  for (let t of (String(s).toLowerCase().replace(/\(.*?\)/g, ' ').match(/[a-z0-9]+/g) || [])) {
    t = SYN[t] || t;
    if (!STOP.has(t) && !NOISE.has(t)) out.add(t);
  }
  return out;
}

const bigrams = (s) => { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; };
function dice(a, b) {
  if (a === b) return 1;
  const x = bigrams(a); const y = bigrams(b);
  let inter = 0; let total = 0;
  for (const [g, n] of x) { inter += Math.min(n, y.get(g) || 0); total += n; }
  for (const n of y.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

export function similarity(label, question) {
  const a = tokens(label); const b = tokens(question);
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  const jac = inter / (a.size + b.size - inter);
  return 0.5 * jac + 0.5 * dice([...a].sort().join(' '), [...b].sort().join(' '));
}

// Best saved answer for a label. A near-tie (a plain and a "ranges" variant of one question) is broken by whether the field
// offers options; any other ambiguity returns null rather than guessing.
export function matchBank(label, bank, hasOptions = false) {
  const scored = bank.map((e) => [similarity(label, e.question), e]).sort((x, y) => y[0] - x[0]);
  if (!scored.length || scored[0][0] < MATCH_MIN) return null;
  const close = scored.filter(([sc]) => scored[0][0] - sc < MATCH_GAP).map(([, e]) => e);
  if (close.length === 1) return close[0];
  const ranged = close.filter((e) => /range|option/i.test(e.question));
  const plain = close.filter((e) => !ranged.includes(e));
  const pick = hasOptions ? ranged : plain;
  return pick.length === 1 ? pick[0] : null;
}

// The option that clearly matches the answer, else null.
export function pickOption(answer, options) {
  const a = clean(answer).toLowerCase();
  const opts = options.map((o) => [clean(o), clean(o).toLowerCase()]);
  for (const [o, lo] of opts) if (lo === a) return o;
  const m = a.match(/^(yes|no)\b/);
  if (m) for (const [o, lo] of opts) if (lo === m[1]) return o;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = opts.filter(([, lo]) => lo && new RegExp(`\\b${esc(lo)}\\b`).test(a)).map(([o]) => o);
  return hits.length === 1 ? hits[0] : null;
}

export function e164(p) {
  const cc = String(p.phone_country_code || '').replace(/\D/g, '');
  const ph = String(p.phone || '').replace(/\D/g, '');
  if (!ph) return null;
  return cc ? `+${ph.startsWith(cc) && ph.length > 10 ? '' : cc}${ph}` : ph;
}

const CITY_GROUPS = [
  ['delhi', 'new delhi', 'ncr', 'delhi ncr', 'gurgaon', 'gurugram', 'noida', 'ghaziabad', 'faridabad'],
  ['bangalore', 'bengaluru'], ['mumbai', 'navi mumbai', 'thane'], ['hyderabad', 'secunderabad'],
].map((g) => new Set(g));
export function sameCity(a, b) {
  a = String(a).trim().toLowerCase(); b = String(b).trim().toLowerCase();
  return !!a && (a === b || CITY_GROUPS.some((g) => g.has(a) && g.has(b)));
}

// "2 months" -> "60" when the label asks for days (or months).
export function convertUnits(label, text) {
  const m = String(text).trim().match(/^(\d+(?:\.\d+)?)\s*(day|month|year)s?\b/i);
  if (!m) return text;
  const days = Number(m[1]) * { day: 1, month: 30, year: 365 }[m[2].toLowerCase()];
  const low = label.toLowerCase();
  if (/in days|days\)/.test(low)) return String(Math.round(days));
  if (/in months|months\)/.test(low)) return String(Number((days / 30).toFixed(1)));
  return text;
}

const val = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());

// Free-form answer for a label. Returns [text, source, soft] or [null, source].
function textAnswer(label, p, bank, hasOptions) {
  const low = label.toLowerCase();
  const { personal: pers = {}, employment: emp = {}, location: loc = {}, links = {}, work_authorization: wa = {}, education = [] } = p;
  if (/^(full\s+|legal\s+)?name$/.test(low)) {
    const e = bank.find((b) => /full name/i.test(b.question));
    return e ? [e.answer, 'saved answer'] : [`${pers.first_name || ''} ${pers.last_name || ''}`.trim() || null, 'profile'];
  }
  if (/first name|given name/.test(low)) return [pers.first_name, 'profile'];
  if (/last name|surname|family name/.test(low)) return [pers.last_name, 'profile'];
  if (/preferred name|nickname/.test(low)) return [pers.preferred_name, 'profile'];
  if (/e-?mail/.test(low)) return [pers.email, 'profile'];
  if (/phone|mobile|contact number|whatsapp/.test(low)) return [e164(pers), 'profile'];
  if (/linkedin/.test(low)) return [links.linkedin, 'profile'];
  if (/github/.test(low)) return [links.github, 'profile'];
  if (/\bother\b.*(website|url|link|site)/.test(low)) return [null, 'profile'];
  if (/portfolio|website|personal (site|url)/.test(low)) return [links.portfolio, 'profile'];
  if (/date of birth|\bdob\b|birth ?date/.test(low)) return [pers.date_of_birth, 'profile'];
  const based = low.match(/based (?:out )?(?:of|in)\s+([a-z .]+?)\s*\??$/);
  if (based && loc.current_city) return [sameCity(based[1], loc.current_city) ? 'Yes' : 'No', 'profile'];
  if (/relocat/.test(low)) {
    const e = bank.find((b) => /relocat/i.test(b.question));
    if (e) return [e.answer, 'saved answer'];
    if (loc.willing_to_relocate) return [loc.willing_to_relocate, 'profile'];
  }
  if (/sponsor/.test(low)) return [wa.requires_sponsorship, 'profile'];
  if (/authori[sz]ed to work|work authori[sz]ation|right to work|eligible to work/.test(low)) return [wa.notes, 'profile', true];
  const e = matchBank(label, bank, hasOptions);
  if (e) return [e.answer, 'saved answer'];
  if (/notice period|how soon.*join|when can you (join|start)|joining (time|period)/.test(low)) return [emp.notice_period, 'profile'];
  if (/earliest.*(start|join)|available (from|to start)|start date/.test(low)) return [emp.earliest_start_date, 'profile'];
  if (/current.*(ctc|salary|compensation)|ctc.*current/.test(low)) return [emp.current_ctc, 'profile'];
  if (/expected.*(ctc|salary|compensation)|ctc.*expect|salary expectation/.test(low)) return [emp.expected_ctc, 'profile'];
  if (/current (company|employer|organi[sz]ation)/.test(low)) return [emp.current_company, 'profile'];
  if (/current (title|role|designation|position)/.test(low)) return [emp.current_title, 'profile'];
  if (/(university|college|school|institution|institute)/.test(low)) return [education[0]?.institution, 'profile'];
  if (/(highest )?(degree|qualification)/.test(low)) return [education[0]?.degree, 'profile', true];
  if (/(total|overall).*experience|experience.*(total|overall)|total years/.test(low)) return [val(emp.total_experience_years), 'profile'];
  if (/(years of|relevant|product).*experience|experience.*years/.test(low)) {
    // "Years of experience with Kubernetes" is about one skill: our total is only a guess, so it is marked for checking.
    return [val(emp.total_experience_years), 'profile', true];
  }
  if (/\b(city|location)\b/.test(low) && !/preferred|relocat/.test(low)) {
    return [[loc.current_city, loc.current_state, loc.country].filter(Boolean).join(', ') || null, 'profile'];
  }
  if (/(postal|zip|pin) ?code/.test(low)) return [loc.postal_code, 'profile'];
  if (/^(state|province)$/.test(low)) return [loc.current_state, 'profile'];
  if (/^country$/.test(low)) return [loc.country, 'profile'];
  return [null, null];
}

export function answerFor(f, profile, bank = []) {
  const label = clean(f.label); const kind = f.kind; const opts = f.options || [];
  if (kind === 'file') return { attach: true, source: 'none' }; // never touched: the user attaches their tailored resume
  let text; let src; let soft = false;
  if (SENSITIVE_RE.test(label)) {
    const eeo = profile.eeo_and_sensitive || {};
    if (!eeo.auto_fill) return { check: 'Sensitive question: you choose the answer', source: 'eeo', sensitive: true };
    const key = /race|ethnic/i.test(label) ? 'race_ethnicity' : /disabilit/i.test(label) ? 'disability' : /veteran/i.test(label) ? 'veteran_status' : /gender|\bsex\b/i.test(label) ? 'gender' : null;
    const raw = key ? val(eeo[key]) : null;
    if (!raw) return { check: 'Sensitive question and nothing saved for it: you choose the answer', source: 'eeo', sensitive: true };
    text = raw; src = 'profile (sensitive, you opted in)';
  } else {
    [text, src, soft] = textAnswer(label, profile, bank, opts.length > 0);
  }
  if (text === null || text === undefined || String(text).trim() === '') return { value: null, source: src || 'none' };
  text = String(text).trim();
  const out = (value) => ({ value, source: src, ...(soft ? { soft: true } : {}) });
  if (kind === 'boolean') {
    const m = text.match(/^(yes|no)\b/i);
    return m ? out(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) : { check: `Not a clear yes or no: ${text.slice(0, 60)}`, source: src };
  }
  if (['radio', 'select', 'checkbox_group', 'combobox'].includes(kind)) {
    if (kind === 'combobox' && !opts.length) return { value: text, source: src, soft: true };
    const o = pickOption(text, opts);
    return o ? out(o) : { check: `No option clearly matches: ${text.slice(0, 60)}`, source: src };
  }
  if (kind === 'checkbox') return { check: 'A single checkbox: you confirm it', source: src };
  if (['text', 'number', 'textarea'].includes(kind)) text = convertUnits(label, text);
  if (kind === 'number') {
    const m = text.match(/\d+(\.\d+)?/);
    return m ? out(m[0]) : { check: `Not a number: ${text.slice(0, 60)}`, source: src };
  }
  if (['text', 'tel', 'url', 'email'].includes(kind) || (kind === 'textarea' && text.length <= 60)) {
    text = text.replace(/\s*\([^)]*\)/g, '').trim().replace(/\.$/, ''); // single-line fields: no "(side notes)" or trailing full stop
  }
  return out(text);
}

// Free-text questions that deserve a drafted answer (when nothing is saved for them).
export const isLongText = (f) => f.kind === 'textarea' || (f.maxLength && f.maxLength > 200) || /why|describe|tell us|cover letter|about yourself|explain|motivat|what makes you/i.test(f.label || '');

// Does the label look like something the user must handle personally? Captcha, one-time codes and passwords are never filled.
export const NEVER_FILL_RE = /captcha|one[- ]time|\botp\b|verification code|security code|password|passcode/i;
