// Captured page text -> just the job posting. When the extension can't find the description box it reads the whole
// page, so on LinkedIn the text also holds the search results list, buttons and "About the company" blocks.
// This keeps the posting itself and drops site furniture. If cleaning leaves too little, the original is kept.

// Where the posting itself starts (LinkedIn and many boards print one of these right above the description).
const START = /^(about the job|job description|about this job|job details|description)$/i;
// Where the posting ends on LinkedIn: everything after is LinkedIn's own panels.
const END = /^((…|\.\.\.)\s*(see )?more|show less|see less|set alert for similar jobs|benefits found in job post|about the company|meet the hiring team|people you can reach out to|more jobs|similar jobs|people also viewed|looking for talent\??|company photos|interested in working with us in the future\??|job search faster with premium|see how you compare to( over)? \d+.*|premium|activity on this job|trending employee content|explore premium.*|get notified about new .* jobs.*)$/i;
// Lines that are page chrome wherever they appear.
const JUNK = /^(\d[\d,]*\+? results?|how promoted jobs are ranked|how ai search works|promoted( by hirer)?|easy apply|apply( now)?|save|saved|share|show more options|show more|see more|show match details|use ai to assess how you fit|[·•.|\-–—]+|(re)?posted .*ago|\d+ (minute|hour|day|week|month)s? ago|over \d+ applicants|\d+ applicants|actively reviewing applicants|be an early applicant|responses managed off linkedin|with verification|verified job|viewed|applied|dismiss.*job|on-site|hybrid|remote|full-time|part-time|contract|internship|temporary|matches your job preferences.*|your profile is missing .*|\d+ (school )?alumni work here|\d+ connections? work here|save .* at .*|.* \(\d+ km\))$/i;

export function cleanJdText(raw, { source = '' } = {}) {
  const text = String(raw || '').replace(/\r/g, '');
  let lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));

  // Start at the posting if a start marker exists (the LAST one before real content: list cards come first).
  const starts = lines.map((l, i) => (START.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  const linkedin = /linkedin/i.test(source) || /how promoted jobs are ranked|about the job/i.test(text);
  if (starts.length) {
    const s = starts.find((i) => lines.slice(i + 1).some((l) => l.trim().length > 60)) ?? starts[0];
    lines = lines.slice(s + 1);
    if (linkedin) { const e = lines.findIndex((l) => END.test(l.trim())); if (e > 0) lines = lines.slice(0, e); }
  }

  const out = [];
  for (const l of lines) {
    const t = l.trim();
    if (t && JUNK.test(t)) continue;
    if (t && out.length && out[out.length - 1].trim() === t) continue; // the same line twice in a row
    if (!t && (!out.length || !out[out.length - 1].trim())) continue; // collapse blank runs
    out.push(l.trim());
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  const cleaned = out.join('\n');
  return cleaned.replace(/\s/g, '').length >= 80 ? cleaned : text.trim();
}
