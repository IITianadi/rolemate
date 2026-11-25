// Profile → "Application details" and "Saved answers": what the Chrome extension fills into application forms.
// Rolemate fills these in; the user attaches the tailored resume and presses apply.
import { h, toast, clear } from './dom.js';
import { api } from './api.js';

const MISSING = { name: 'your name', phone: 'a phone number', city: 'your city', noticePeriod: 'notice period', currentCtc: 'current CTC', expectedCtc: 'expected CTC' };

export async function applicationDetailsCard() {
  const { apply, facts, missing } = await api('/api/autofill/profile');
  const f = {}; const fx = {};
  const inp = (store, key, label, ph, src) => h('label', { class: 'field' }, label, (store[key] = h('input', { type: 'text', value: src[key] ?? '', placeholder: ph || '', maxlength: 200 })));
  const sel = (key, label, options) => h('label', { class: 'field' }, label, (f[key] = h('select', null, options.map((o) => h('option', { value: o, selected: (apply[key] || '') === o }, o || 'Not set')))));
  const eeo = apply.eeo || {};
  const e = {};
  const optIn = h('input', { type: 'checkbox', checked: !!eeo.autoFill, id: 'eeo-opt' });
  const eeoBox = h('div', { class: 'grid2', style: 'margin-top:12px' },
    inp(e, 'gender', 'Gender', 'e.g. Male', eeo), inp(e, 'disability', 'Disability', 'e.g. No', eeo), inp(e, 'veteran', 'Veteran status', 'e.g. Not a veteran', eeo), inp(e, 'race', 'Race or ethnicity', '', eeo));
  const save = async (btn) => {
    btn.disabled = true;
    const body = { apply: { eeo: { autoFill: optIn.checked } }, facts: {} };
    for (const [k, el] of Object.entries(f)) body.apply[k] = el.value.trim();
    for (const [k, el] of Object.entries(e)) body.apply.eeo[k] = el.value.trim();
    for (const [k, el] of Object.entries(fx)) body.facts[k] = el.value.trim();
    try { await api('/api/autofill/profile', { method: 'PUT', body }); toast('Saved. The extension will use these on your next form.'); } catch (x) { toast(x.message, true); }
    btn.disabled = false;
  };
  const saveBtn = h('button', { class: 'btn primary sm', onclick: () => save(saveBtn) }, 'Save');
  return h('div', { class: 'card', id: 'application-details' },
    h('h2', null, 'Application details'),
    h('p', { class: 'muted small', style: 'margin:8px 0 14px' }, 'The Rolemate extension types these into application forms. Name, email and links come from your resume; add or change anything here. Rolemate never submits a form and never uploads a file: you attach your tailored resume and press apply yourself.'),
    missing.length > 0 && h('div', { class: 'notice', style: 'margin-bottom:14px' }, `Forms often ask for ${missing.map((m) => MISSING[m] || m).join(', ')}. Add ${missing.length === 1 ? 'it' : 'them'} once and every form can use ${missing.length === 1 ? 'it' : 'them'}.`),
    h('div', { class: 'grid3' }, inp(f, 'firstName', 'First name', 'From your resume', apply), inp(f, 'lastName', 'Last name', 'From your resume', apply), inp(f, 'preferredName', 'Preferred name', '', apply),
      inp(f, 'phoneCountryCode', 'Phone country code', '+91', apply), inp(f, 'phone', 'Phone', 'From your resume', apply), inp(f, 'postalCode', 'Postal code', '', apply),
      inp(f, 'city', 'City', 'e.g. Pune', apply), inp(f, 'state', 'State', '', apply), inp(f, 'country', 'Country', 'e.g. India', apply),
      inp(fx, 'noticePeriod', 'Notice period', 'e.g. 30 days', facts), inp(fx, 'currentCtc', 'Current CTC', 'e.g. 12 LPA', facts), inp(fx, 'expectedCtc', 'Expected CTC', 'e.g. 16 LPA', facts),
      inp(fx, 'relocation', 'Open to relocate?', 'Yes or No', facts), sel('requiresSponsorship', 'Need visa sponsorship?', ['', 'No', 'Yes']), inp(f, 'earliestStart', 'Earliest start date', 'e.g. 1 Jan 2027', apply),
      inp(f, 'linkedin', 'LinkedIn', 'From your resume', apply), inp(f, 'github', 'GitHub', 'From your resume', apply), inp(f, 'portfolio', 'Portfolio or website', '', apply),
      inp(f, 'workAuthorization', 'Work authorization', 'e.g. Citizen of India', apply), inp(f, 'dateOfBirth', 'Date of birth (only if you want it filled)', 'DD/MM/YYYY', apply), inp(f, 'pronouns', 'Pronouns', '', apply)),
    h('details', { style: 'margin-top:16px' }, h('summary', null, h('strong', null, 'Sensitive questions (gender, disability, veteran status, race)')),
      h('p', { class: 'muted small', style: 'margin:8px 0' }, 'By default the extension asks you every time and fills nothing. Turn this on only if you want it to fill the answers below for you.'),
      h('label', { class: 'row', style: 'gap:8px;font-weight:600' }, optIn, 'Fill these for me'), eeoBox),
    h('div', { style: 'margin-top:14px' }, saveBtn));
}

export async function savedAnswersCard() {
  let { answers } = await api('/api/autofill/answers');
  const list = h('div', { class: 'stack' });
  const draw = () => {
    clear(list);
    if (!answers.length) { list.append(h('p', { class: 'muted small' }, 'Nothing saved yet. When you answer a question in the extension, it is saved here and reused on your next applications.')); return; }
    for (const a of answers) {
      const q = h('input', { type: 'text', value: a.question, maxlength: 300, 'aria-label': 'Question' });
      const t = h('textarea', { rows: 3, maxlength: 3000, 'aria-label': 'Answer' }, a.answer);
      list.append(h('div', { class: 'card soft', style: 'padding:14px' }, q, h('div', { style: 'margin-top:8px' }, t),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn sm', onclick: async () => { try { ({ answers } = await api(`/api/autofill/answers/${a.id}`, { method: 'PUT', body: { question: q.value, answer: t.value } })); toast('Saved'); draw(); } catch (x) { toast(x.message, true); } } }, 'Save'),
          h('button', { class: 'btn sm ghost', onclick: async () => { if (!window.confirm('Delete this saved answer?')) return; ({ answers } = await api(`/api/autofill/answers/${a.id}`, { method: 'DELETE' })); draw(); } }, 'Delete'))));
    }
  };
  draw();
  const nq = h('input', { type: 'text', placeholder: 'Question, e.g. Why do you want to work here?', maxlength: 300, 'aria-label': 'New question' });
  const na = h('textarea', { rows: 3, placeholder: 'Your answer, in your own words', maxlength: 3000, 'aria-label': 'New answer' });
  return h('div', { class: 'card' },
    h('h2', null, 'Saved answers'),
    h('p', { class: 'muted small', style: 'margin:8px 0 14px' }, 'Answers you approved. The extension reuses them on matching questions and never edits them. Only write what is true.'),
    list,
    h('details', { style: 'margin-top:14px' }, h('summary', null, h('strong', null, 'Add an answer')), h('div', { style: 'margin-top:10px' }, nq, h('div', { style: 'margin-top:8px' }, na),
      h('button', { class: 'btn primary sm', style: 'margin-top:8px', onclick: async () => { try { ({ answers } = await api('/api/autofill/answers', { method: 'POST', body: { question: nq.value, answer: na.value } })); nq.value = ''; na.value = ''; toast('Saved'); draw(); } catch (x) { toast(x.message, true); } } }, 'Save answer'))));
}
