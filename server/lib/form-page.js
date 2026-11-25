// Tells an application form page from a job posting. A form page (a resume-upload step, "My Information", "Voluntary
// Disclosures", "Back to Job Posting") has a job title in its heading but no description, so capturing it saves an empty
// job with a meaningless score. Capture refuses such text; a posting that also carries a form keeps its long description.

const FORM = [
  /indicates a required field/i, /\*\s*required\b/i, /autofill with (my )?resume/i, /upload either/i, /drop (a )?files? here/i, /\bselect files?\b/i,
  /\bmy information\b/i, /\bmy experience\b/i, /voluntary (self[- ]identification|disclosures?)/i, /self[- ]identify/i, /back to (the )?job (posting|search|details)/i,
  /application questions/i, /save (and|&) continue/i, /attach your (resume|cv)/i, /apply manually/i, /use my last application/i,
  /sign in to (apply|continue)|create (an )?account to apply/i, /by (clicking|selecting) (submit|apply)/i, /\bi (agree|acknowledge|certify) (that|to)\b/i,
];
const POSTING = [
  /responsibilit/i, /\brequirements\b/i, /qualifications?\b/i, /what you.?ll (do|bring|need)/i, /who you are/i, /about (the|this) (role|job|position|team)/i,
  /job description/i, /we.?re looking for|we are looking for/i, /\byou will\b/i, /\d+\+?\s*years/i, /benefits|perks/i, /nice to have|preferred skills|must[- ]have/i,
];
const FORM_URL = /\/(apply|application|applyflow)\b|autofillwithresume|\/candidate\/|\/apply\//i;

export function looksLikeApplicationForm(text, url = '') {
  const t = String(text || '').slice(0, 12000);
  const form = FORM.filter((r) => r.test(t)).length;
  const posting = POSTING.filter((r) => r.test(t)).length;
  if (posting >= 3 || t.length > 6000 && posting >= 2) return false; // a real description, even with a form beside it
  if (form >= 2 && posting <= 1) return true;
  return FORM_URL.test(String(url)) && form >= 1 && posting === 0;
}
