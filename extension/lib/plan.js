// Turns the fields read from a form into a plan the panel shows: what Rolemate will fill, what to check, what is left to the user.
//   green   filled from your profile or a saved answer
//   yellow  filled, but worth a look (a guess such as years of experience in one skill)
//   red     not filled: Rolemate has no answer, or it is a sensitive question that is yours to answer
//   attach  a file field: you attach your tailored resume, Rolemate never uploads
//   kept    you had already typed something there; it is left as it is
import { answerFor, isLongText } from './mapper.js';

export function planFields(fields, profile, bank = []) {
  return fields.map((f) => {
    if (f.kind === 'file') return { ...f, status: 'attach', reason: 'Attach your tailored resume here yourself.' };
    if (f.hasValue) return { ...f, status: 'kept', reason: 'Already filled in. Left as it is.' };
    if (f.kind === 'unsupported') return { ...f, status: 'red', reason: 'Rolemate does not fill this type of field.' };
    const a = answerFor(f, profile, bank);
    if (a.value) return { ...f, status: a.soft ? 'yellow' : 'green', value: a.value, source: a.source, reason: a.soft ? 'A best match. Check it before you apply.' : `From your ${a.source}.` };
    if (a.sensitive) return { ...f, status: 'red', sensitive: true, reason: a.check };
    if (a.check) return { ...f, status: 'red', reason: a.check, canAsk: true };
    if (isLongText(f)) return { ...f, status: 'red', needsDraft: true, canAsk: true, reason: 'No saved answer. Rolemate can draft one for you to approve.' };
    return { ...f, status: 'red', canAsk: true, reason: 'Rolemate does not have this yet.' };
  });
}

export const summarize = (plan) => {
  const n = (s) => plan.filter((p) => p.status === s).length;
  return { green: n('green'), yellow: n('yellow'), red: n('red'), attach: n('attach'), kept: n('kept'), total: plan.length };
};
