// ATS compatibility: is the resume built and worded in a way recruitment software reads reliably? Separate from job match.
// It is a readability check, not an official ATS pass probability: no ATS can be guaranteed.
// Parsing is checked on the real thing: the generated PDF is turned back into text and the facts are looked for in it.

import { classifyHeading, stripMd } from './resume-text.js';

const STANDARD = ['experience', 'education', 'skills'];
const OK_FONTS = new Set(['arimo', 'carlito', 'tinos']);
const norm = (s) => stripMd(String(s || '')).toLowerCase().replace(/[^a-z0-9@+.]+/g, ' ').trim();
const grade = (checks) => Math.round(checks.reduce((a, c) => a + (c.ok === true ? 1 : c.ok === 'warn' ? 0.5 : 0), 0) / Math.max(1, checks.length) * 100);
const check = (label, ok, detail, fix = '') => ({ label, ok, detail, fix: ok === true ? '' : fix });

const DATE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*['’]?\d{2,4}|\b(19|20)\d{2}\b|present|current)/i;

export function atsReport(resume, { text = null, pages = null, fit = null } = {}) {
  const st = resume.structure || {};
  const sections = resume.sections || [];

  // ---- Formatting: how the document is built.
  const formatting = [
    check('Single-column layout', true, 'The resume is one column, which every ATS reads in order.'),
    check('Standard font', OK_FONTS.has(st.fontFamily || 'arimo'), `Font: ${st.fontName || st.fontFamily || 'Arial'}.`, 'Use Arial, Calibri or Times New Roman.'),
    check('Readable size', (st.fontSize ?? 10) >= 9, `Body text is ${st.fontSize ?? 10}pt.`, 'Use at least 9pt for body text.'),
    check('Margins', Math.min(st.margins?.top ?? 14, st.margins?.left ?? 15, st.margins?.right ?? 15, st.margins?.bottom ?? 14) >= 8, 'Margins leave room for the text.', 'Keep margins at 8mm or more so nothing is cut off.'),
    check('No images, icons or tables', true, 'Nothing is drawn as a picture or a table, so all text can be read.'),
    check('Contact details in the body', !!(resume.header?.name && resume.header.lines?.length), 'Your name and contact details sit in the page body, not in a header or footer that some ATS skip.', 'Put your name, email and phone at the top of the page.'),
    check('Length', pages == null ? true : pages <= 2, pages == null ? 'Page count is checked when the PDF is made.' : `${pages} page${pages === 1 ? '' : 's'}.`, 'Keep it to two pages or fewer.'),
  ];
  // Education years ("2016 – 2020") are normally year-only, so only job and project dates are compared.
  const dates = sections.filter((s) => s.kind === 'experience' || s.kind === 'projects').flatMap((s) => (s.items || []).map((i) => i.date).filter(Boolean));
  const styles = new Set(dates.map((d) => (/[a-z]{3}/i.test(d) ? 'month-year' : 'year')));
  formatting.push(check('Consistent date format', styles.size <= 1, styles.size <= 1 ? 'Dates are written the same way throughout.' : 'Dates mix month-and-year with year-only.', 'Write every date as “Mon YYYY”.'));

  // ---- Sections: standard headings so the parser knows what each block is.
  const kinds = new Set(sections.map((s) => classifyHeading(s.heading)).filter(Boolean));
  const odd = sections.filter((s) => !classifyHeading(s.heading) && s.kind !== 'summary').map((s) => s.heading);
  const sectionChecks = [
    ...STANDARD.map((k) => check(`${{ experience: 'Work Experience', education: 'Education', skills: 'Skills' }[k]} section`, kinds.has(k) || sections.some((s) => s.kind === k && classifyHeading(s.heading)), kinds.has(k) ? 'Found with a standard heading.' : 'No standard heading found.', `Name the section “${{ experience: 'Work Experience', education: 'Education', skills: 'Skills' }[k]}”.`)),
    check('Summary section', sections.some((s) => s.kind === 'summary'), sections.some((s) => s.kind === 'summary') ? 'A professional summary opens the resume.' : 'No summary.', 'Add a 2–3 line Professional Summary.'),
    check('Heading names', odd.length === 0 ? true : 'warn', odd.length ? `Non-standard headings: ${odd.join(', ')}.` : 'All headings are ones ATS recognise.', 'Rename unusual headings to standard ones (Projects, Certifications, …).'),
  ];

  // ---- Parsing: read the PDF's own text back and look for the facts.
  let parsing = [];
  if (text != null) {
    const t = norm(text);
    const has = (v) => { const x = norm(v); return x.length > 1 && t.includes(x); };
    const emails = (resume.header.lines.join(' ').match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []);
    const phones = (resume.header.lines.join(' ').match(/\+?\d[\d\s().-]{8,}\d/g) || []);
    const exp = sections.filter((s) => s.kind === 'experience').flatMap((s) => s.items);
    const edu = sections.filter((s) => s.kind === 'education').flatMap((s) => s.items);
    const frac = (arr, f) => (arr.length ? arr.filter(f).length / arr.length : 1);
    const first = norm(text.slice(0, 300));
    parsing = [
      check('Name read first', norm(resume.header.name) && first.includes(norm(resume.header.name)), 'Your name is the first thing the parser reads.', 'Make sure your name is the first line.'),
      check('Email and phone readable', emails.every(has) && phones.every((p) => has(p.replace(/\s+/g, ' ')) || t.includes(p.replace(/\D/g, ''))) , `${emails.length ? 'Email found. ' : 'No email on the resume. '}${phones.length ? 'Phone found.' : 'No phone number.'}`, 'Add a plain-text email and phone number.'),
      check('Job titles readable', frac(exp, (i) => has(i.title)) === 1, `${exp.filter((i) => has(i.title)).length} of ${exp.length} job titles came back from the PDF.`, 'Put each job title on its own line.'),
      check('Company names readable', frac(exp, (i) => !i.subtitle || has(i.subtitle)) === 1, `${exp.filter((i) => !i.subtitle || has(i.subtitle)).length} of ${exp.length} companies came back.`, 'Write the company name next to the title.'),
      check('Employment dates readable', frac(exp, (i) => !i.date || has(i.date)) === 1, `${exp.filter((i) => !i.date || has(i.date)).length} of ${exp.length} date ranges came back.`, 'Write dates like “Jan 2022 – Present”.'),
      check('Education readable', frac(edu, (i) => has(i.title) || has(i.subtitle)) === 1, `${edu.filter((i) => has(i.title) || has(i.subtitle)).length} of ${edu.length} education lines came back.`, 'Write the degree and institution on one line.'),
      check('Skills readable', (() => { const sk = sections.filter((s) => s.kind === 'skills').flatMap((s) => s.items.flatMap((i) => i.skills || [])); return !sk.length || sk.filter(has).length / sk.length >= 0.9; })(), 'Skills listed on your resume are present in the PDF text.', 'List skills as plain text separated by commas.'),
      check('Experience text readable', frac(exp.flatMap((i) => i.bullets || []).slice(0, 12), (b) => has(b.text.slice(0, 40))) >= 0.9, 'Bullet text comes back intact and in order.', 'Avoid special characters at the start of bullets.'),
    ].map((c) => ({ ...c, ok: c.ok === true || c.ok === 1 ? true : c.ok === false || c.ok === 0 || !c.ok ? false : c.ok }));
  }

  // ---- Keyword coverage against the job, kept honest about what is supported.
  let keywords = null;
  if (fit?.length) {
    const kw = fit.filter((i) => i.kind !== 'responsibility' && !/years? of experience|educational qualification/i.test(i.requirement));
    const cnt = (f) => kw.filter(f).length;
    keywords = {
      supported: kw.filter((i) => i.status === 'strong').map((i) => i.requirement),
      weak: kw.filter((i) => i.status === 'partial' || i.status === 'weak').map((i) => i.requirement),
      missing: kw.filter((i) => i.status === 'missing').map((i) => i.requirement),
      notApplicable: fit.filter((i) => i.status === 'unverifiable').map((i) => i.requirement),
      score: kw.length ? Math.round((cnt((i) => i.status === 'strong') + 0.5 * cnt((i) => i.status === 'partial' || i.status === 'weak')) / kw.length * 100) : null,
    };
  }

  const scores = { formatting: grade(formatting), sections: grade(sectionChecks), parsing: parsing.length ? grade(parsing) : null, keywords: keywords?.score ?? null };
  const W = { formatting: 30, sections: 20, parsing: 30, keywords: 20 };
  const used = Object.keys(W).filter((k) => scores[k] != null);
  const score = Math.round(used.reduce((a, k) => a + W[k] * scores[k], 0) / used.reduce((a, k) => a + W[k], 0));
  const all = [...formatting, ...sectionChecks, ...parsing];
  return {
    score, label: 'ATS Compatibility Score', scores, formatting, sections: sectionChecks, parsing, keywords,
    parsed: text != null, pages,
    issues: all.filter((c) => c.ok !== true).map((c) => ({ label: c.label, detail: c.detail, fix: c.fix })),
    note: 'A readability check on how recruitment software is likely to read this resume. It is not an official ATS pass probability.',
  };
}
