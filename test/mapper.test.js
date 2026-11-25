// The extension's field mapper: pure functions, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerFor, matchBank, pickOption, convertUnits, sameCity, e164, similarity, isLongText } from '../extension/lib/mapper.js';

const profile = {
  personal: { first_name: 'Rahul', last_name: 'Sharma', email: 'rahul@example.com', phone: '9876543210', phone_country_code: '+91', date_of_birth: null },
  location: { current_city: 'Gurugram', current_state: 'Haryana', country: 'India', postal_code: '122001', willing_to_relocate: null },
  links: { linkedin: 'https://linkedin.com/in/rahul', github: '', portfolio: '' },
  work_authorization: { requires_sponsorship: 'No', notes: '' },
  employment: { current_company: 'PayNest', current_title: 'Software Engineer', total_experience_years: 4, notice_period: '2 months', current_ctc: '12 LPA', expected_ctc: '18 LPA' },
  education: [{ institution: 'Visvesvaraya Technological University', degree: 'B.Tech in Computer Science' }],
  eeo_and_sensitive: { auto_fill: false, gender: 'Male' },
};
const bank = [
  { question: 'Are you willing to relocate?', answer: 'Yes, within India' },
  { question: 'How did you hear about this job?', answer: 'LinkedIn' },
  { question: 'Expected CTC (ranges)', answer: '15-20 LPA' },
  { question: 'Expected CTC', answer: '18 LPA' },
];
const f = (label, kind = 'text', extra = {}) => ({ label, kind, options: [], ...extra });
const A = (field, b = bank) => answerFor(field, profile, b);

test('identity and contact fields come from the profile', () => {
  assert.equal(A(f('First name *')).value, 'Rahul');
  assert.equal(A(f('Last Name')).value, 'Sharma');
  assert.equal(A(f('Full name')).value, 'Rahul Sharma');
  assert.equal(A(f('Email address', 'email')).value, 'rahul@example.com');
  assert.equal(A(f('Phone', 'tel')).value, '+919876543210');
  assert.equal(A(f('LinkedIn profile', 'url')).value, 'https://linkedin.com/in/rahul');
});

test('unknown data is never made up: empty profile fields give no value', () => {
  assert.equal(A(f('GitHub')).value, null);
  assert.equal(A(f('Date of birth', 'text')).value, null);
});

test('notice period converts to the unit the label asks for', () => {
  assert.equal(A(f('Notice period')).value, '2 months');
  assert.equal(A(f('Notice period (in days)', 'number')).value, '60');
  assert.equal(convertUnits('Notice (in months)', '60 days'), '2');
});

test('saved answers are used, and a ranges variant is chosen only for fields with options', () => {
  assert.equal(A(f('How did you hear about us?')).value, 'LinkedIn');
  assert.equal(A(f('Expected CTC')).value, '18 LPA');
  assert.equal(A(f('Expected CTC', 'select', { options: ['10-15 LPA', '15-20 LPA'] })).value, '15-20 LPA');
  assert.equal(A(f('Expected CTC', 'select', { options: ['10-15 LPA', '20-25 LPA'] })).check?.startsWith('No option'), true);
});

test('yes/no and option picking', () => {
  assert.equal(A(f('Are you willing to relocate?', 'boolean', { options: ['Yes', 'No'] })).value, 'Yes');
  assert.equal(A(f('Do you require visa sponsorship?', 'radio', { options: ['Yes', 'No'] })).value, 'No');
  assert.equal(A(f('Are you based in Gurgaon?', 'boolean')).value, 'Yes');
  assert.equal(A(f('Are you based in Chennai?', 'boolean')).value, 'No');
  assert.equal(pickOption('Yes, within India', ['Yes', 'No']), 'Yes');
  assert.equal(pickOption('Maybe', ['Yes', 'No']), null);
});

test('sensitive questions are always handed to the user unless they opted in', () => {
  for (const l of ['Gender', 'Race / ethnicity', 'Do you have a disability?', 'Veteran status', 'Your pronouns']) {
    const r = A(f(l, 'select', { options: ['Male', 'Female', 'Prefer not to say'] }));
    assert.equal(r.sensitive, true, l);
    assert.equal(r.value, undefined, l);
  }
  const opted = answerFor(f('Gender', 'select', { options: ['Male', 'Female'] }), { ...profile, eeo_and_sensitive: { auto_fill: true, gender: 'Male' } }, bank);
  assert.equal(opted.value, 'Male');
  const nothing = answerFor(f('Veteran status', 'select', { options: ['Yes', 'No'] }), { ...profile, eeo_and_sensitive: { auto_fill: true } }, bank);
  assert.equal(nothing.sensitive, true);
});

test('files are never touched: the user attaches the tailored resume', () => {
  const r = A(f('Resume/CV', 'file'));
  assert.equal(r.attach, true);
  assert.equal(r.value, undefined);
});

test('experience for one skill is only a guess, so it is marked for checking', () => {
  assert.equal(A(f('Total years of experience', 'number')).soft, undefined);
  assert.equal(A(f('Years of experience with Kubernetes', 'number')).soft, true);
});

test('single checkboxes, unknown questions and unclear options need the user', () => {
  assert.ok(A(f('I agree to the privacy policy', 'checkbox')).check || A(f('I agree to the privacy policy', 'checkbox')).value === null);
  assert.equal(A(f('What is your favourite database?')).value, null);
});

test('helpers', () => {
  assert.ok(sameCity('Gurgaon', 'Noida') && !sameCity('Pune', 'Mumbai'));
  assert.equal(e164({ phone: '9876543210', phone_country_code: '+91' }), '+919876543210');
  assert.equal(e164({ phone: '919876543210', phone_country_code: '+91' }), '+919876543210');
  assert.ok(similarity('Notice period', 'What is your notice period?') > 0.9);
  assert.equal(matchBank('Why do you want to work here?', bank), null);
  assert.ok(isLongText(f('Why do you want to join us?')) && isLongText(f('Anything', 'textarea')) && !isLongText(f('City')));
});
