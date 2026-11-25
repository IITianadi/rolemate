import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, destroySession, rateLimiter } from './auth.js';
import { parseResumeFile, parseWarnings } from './lib/resume-parse.js';
import { sanitizeResume, httpError } from './lib/model.js';
import { cleanJdText } from './lib/jd-clean.js';
import { analyzeFit } from './lib/fit.js';
import { extractJob, extractBasic, pickTitle, cleanTitle, pickCompany } from './lib/jd.js';
import { scoreMatch, estimateYears } from './lib/match.js';
import { tailorResume, tailorSummary, rewordForJob, highlightKeywords } from './lib/tailor.js';
import { fitOnePage } from './lib/onepage.js';
import { renderHtml, renderPdf } from './lib/render.js';
import { aiEnabled, aiLastError, aiModel, streamChat } from './lib/ai.js';
import { deriveProfile } from './lib/derive.js';
import { getCompanyResearch } from './lib/research.js';
import { buildPrep, chatSystem } from './lib/prep.js';
import { PACKS, packById, publicPacks, billingConfig, billingEnabled, verifySignature, createPaymentLink } from './lib/billing.js';
import { findCompanyLogo } from './lib/logo.js';
import { createMailer } from './lib/mail.js';
import { welcomeEmail, guideEmail, resetEmail } from './lib/mail-templates.js';
import { verifyGoogleToken } from './lib/google.js';
import { buildApplyProfile, missingDetails, sanitizeApply, sanitizeAnswer, qkey, draftAnswers } from './lib/autofill.js';
import { createHash, randomBytes, randomInt } from 'node:crypto';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
export const STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'];
const j = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const month = () => new Date().toISOString().slice(0, 7);

// ---- job identity: the same posting captured twice is one job; a different posting is never merged into it.
const TRACKING = /^(utm_|trk|trackingid|refid|ref$|referrer|fbclid|gclid|li_fat_id|lipi|ebp|midtoken|midsig|recommendedflavor|originalsubdomain)/i;
export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch { return String(raw || '').trim(); }
}
const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 400));
export function similarText(a, b) {
  const x = words(String(a).slice(0, 2500)); const y = words(String(b).slice(0, 2500));
  if (!x.size || !y.size) return 0;
  let inter = 0; for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function sameJob(existing, reqs, text) {
  if (existing.title && reqs.title && norm(existing.title) === norm(reqs.title)) return true;
  return similarText(existing.jd_text, text) >= 0.6;
}
const shortHash = (t) => createHash('sha1').update(String(t)).digest('hex').slice(0, 8);

function sseStart(res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  return (obj) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
}

export function createApp({ dbPath = process.env.DB_PATH || 'data/tailorkit.db', freeLimit = Number(process.env.FREE_LIMIT || 50), billing = {}, mailer = createMailer(), googleVerify = verifyGoogleToken, codeMax = 8 } = {}) {
  const bill = billingConfig(billing);
  const appUrl = bill.publicUrl;
  const siteUrl = (process.env.SITE_URL || 'https://rolemate.in').replace(/\/$/, '');
  const db = openDb(dbPath);
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { if (req.originalUrl === '/api/billing/webhook') req.rawBody = buf; } }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const authLimit = rateLimiter({ max: 15 });
  const codeLimit = rateLimiter({ max: codeMax }); // reset requests and connect-code guesses

  // --- CORS: the dashboard is same-origin; the Chrome extension calls with a bearer token (no cookies).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    if (origin && (origin.startsWith('chrome-extension://') || allowed.includes(origin))) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', Vary: 'Origin' });
    }
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const auth = (req, res, next) => {
    const h = req.headers.authorization || '';
    const user = userFromToken(db, h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    req.user = user; req.token = h.slice(7);
    next();
  };

  // ---------- helpers
  const getProfile = (userId) => {
    const r = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    if (!r) return null;
    return { resume: j(r.resume, null), originalText: r.original_text, format: r.source_format, facts: j(r.facts, {}), confirmedSkills: j(r.confirmed_skills, []), apply: j(r.apply_data, {}) };
  };
  const needProfile = (userId) => {
    const p = getProfile(userId);
    if (!p) throw httpError(409, 'Upload your resume first (Profile → Upload resume).');
    return p;
  };
  const quota = (user) => {
    // Free plan: one credit per job, counted over the account's lifetime (a credit covers capture, tailoring, prep and chat for that job).
    const used = db.prepare('SELECT COUNT(*) c FROM usage WHERE user_id = ?').get(user.id).c;
    const bought = db.prepare('SELECT COALESCE(SUM(credits), 0) c FROM purchases WHERE user_id = ?').get(user.id).c;
    const limit = user.plan === 'free' ? freeLimit + bought : null;
    return { plan: user.plan, used, limit, bought, remaining: limit == null ? null : Math.max(0, limit - used), packs: billingEnabled(bill) ? publicPacks() : [] };
  };
  const OUT_OF_CREDITS = (limit) => `You\u2019ve used your ${limit} free resumes. Pay now to keep going.`;
  const hasCredit = (user, jobId) => user.plan !== 'free' || !!db.prepare('SELECT 1 FROM usage WHERE user_id = ? AND job_key = ?').get(user.id, `job:${jobId}`);
  const jobRow = (userId, id) => {
    const r = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (!r) throw httpError(404, 'Job not found.');
    return r;
  };
  const jobOut = (r) => {
    const resumes = db.prepare('SELECT id, label, changes, created_at, updated_at, downloaded_at FROM resumes WHERE job_id = ? ORDER BY id DESC').all(r.id)
      .map(({ changes, downloaded_at: dl, ...x }) => ({ ...x, changes: j(changes, []), downloaded: !!dl }));
    return { id: r.id, title: r.title, company: r.company, location: r.location, url: r.url, source: r.source, logo: r.logo || '', status: r.status, notes: r.notes, followUpDue: r.follow_up_due || null,
      credit: (db.prepare('SELECT plan FROM users WHERE id = ?').get(r.user_id)?.plan !== 'free') || !!db.prepare('SELECT 1 FROM usage WHERE user_id = ? AND job_key = ?').get(r.user_id, `job:${r.id}`),
      requirements: j(r.requirements, {}), match: j(r.match, {}), resumes, createdAt: r.created_at, updatedAt: r.updated_at, appliedAt: r.applied_at };
  };
  // firstScore: the score when the job was first saved, kept through rescoring so the page can show progress honestly.
  // fit: the AI's requirement-by-requirement reading (kept on the job); anything it judged "have" counts as covered.
  const rescore = (profile, req, prev, fit) => {
    const conf = new Set((profile.confirmedSkills || []).map((x) => x.toLowerCase()));
    const f = (fit ?? prev?.fit ?? null)?.map((i) => (conf.has(i.requirement.toLowerCase()) && i.status !== 'have' ? { ...i, status: 'have', evidence: 'You confirmed you have this.', where: '', advice: '' } : i)) ?? null;
    const aiCovered = (f || []).filter((i) => i.status === 'have').map((i) => i.requirement);
    const m = scoreMatch({ resume: profile.resume, confirmedSkills: profile.confirmedSkills, yearsExperience: profile.facts.yearsExperience ?? null, aiCovered }, req);
    return { ...m, ...(f ? { fit: f } : {}), firstScore: prev && prev.firstScore !== undefined ? prev.firstScore : prev ? (prev.score ?? null) : m.score };
  };

  async function tailorJob(user, profile, jobR, { force } = {}) {
    const req = j(jobR.requirements, {});
    const key = `job:${jobR.id}`;
    const already = db.prepare('SELECT 1 FROM usage WHERE user_id = ? AND job_key = ?').get(user.id, key);
    if (!already) {
      const q = quota(user);
      if (q.limit != null && q.remaining <= 0) return { quotaExceeded: true, quota: q };
    }
    const { resume, changes } = tailorResume(profile.resume, req, { confirmedSkills: profile.confirmedSkills });
    // Finished resume: the job's own words (only where the resume already says it), a summary aimed at the job,
    // key terms in bold, and one page. Nothing here adds a skill or a number the resume doesn't already have.
    const [summary, suggestions] = await Promise.all([tailorSummary(resume, req), rewordForJob(resume, req)]);
    if (summary) changes.push('Rewrote the summary toward this job, using only what is already in your resume.');
    if (suggestions.length) changes.push(`Used the job’s wording in ${suggestions.length} bullet${suggestions.length === 1 ? '' : 's'} (same facts, same numbers).`);
    const marked = highlightKeywords(resume, req);
    if (marked.length) changes.push(`Highlighted ${marked.length} key term${marked.length === 1 ? '' : 's'} from the job: ${marked.join(', ')}.`);
    const fitted = await fitOnePage(resume, req);
    if (fitted.removed) changes.push(`Left out ${fitted.removed} of your least relevant bullet${fitted.removed === 1 ? '' : 's'} to keep it to one page. They are still in your master resume.`);
    const label = [jobR.company, jobR.title].filter(Boolean).join(' – ') || 'Tailored resume';
    const info = db.prepare('INSERT INTO resumes (user_id, job_id, label, data, changes, suggestions) VALUES (?,?,?,?,?,?)')
      .run(user.id, jobR.id, label, JSON.stringify(resume), JSON.stringify(changes), JSON.stringify(suggestions));
    db.prepare('INSERT OR IGNORE INTO usage (user_id, month, job_key) VALUES (?,?,?)').run(user.id, month(), key);
    return { resumeId: Number(info.lastInsertRowid), changes, suggestions, quota: quota(user) };
  }

  // Owner-only check of what the AI layer is doing. Send the header x-admin-key (the ADMIN_KEY variable). Not part of the app UI.
  app.get('/api/admin/ai-status', (req, res) => {
    const key = process.env.ADMIN_KEY || '';
    if (!key || req.get('x-admin-key') !== key) return res.status(404).json({ error: 'Not found' });
    res.json({ aiEnabled: aiEnabled(), model: aiEnabled() ? aiModel() : null, researchModel: process.env.TAILORKIT_RESEARCH_MODEL || null, lastError: aiLastError() });
  });

  // ---------- billing (Razorpay Payment Links). The webhook, not the browser, is what adds credits.
  app.post('/api/billing/checkout', auth, async (req, res) => {
    if (!billingEnabled(bill)) throw httpError(503, 'Payments are not open yet.');
    const pack = packById(String(req.body?.packId || ''));
    if (!pack) throw httpError(400, 'Choose a credit pack.');
    try { res.json({ url: await createPaymentLink(bill, { userId: req.user.id, email: req.user.email, pack }) }); }
    catch (e) { console.error('[billing]', e.message); throw httpError(502, 'Could not start the payment. Please try again.'); }
  });

  app.post('/api/billing/webhook', (req, res) => {
    if (!verifySignature(req.rawBody, req.get('x-razorpay-signature'), bill.webhookSecret)) return res.status(400).json({ error: 'Bad signature.' });
    const ev = req.body || {};
    if (ev.event === 'payment_link.paid' || ev.event === 'payment.captured') {
      const pay = ev.payload?.payment?.entity || {};
      const notes = ev.payload?.payment_link?.entity?.notes || pay.notes || {};
      const pack = packById(String(notes.pack_id || ''));
      const userId = Number(notes.user_id);
      // Credit only what was really paid: the amount must match the pack's price.
      if (pack && userId && pay.id && pay.status !== 'failed' && Number(pay.amount) === pack.amount && db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
        db.prepare('INSERT OR IGNORE INTO purchases (user_id, payment_id, pack_id, credits, amount) VALUES (?,?,?,?,?)').run(userId, String(pay.id), pack.id, pack.credits, pack.amount);
      }
    }
    res.json({ ok: true });
  });

  // ---------- auth
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  // One-time tokens (password reset, extension connect code): only a hash is stored, each works once, each expires.
  const issueToken = (userId, kind, ttlMs, make) => {
    const raw = make();
    db.prepare('DELETE FROM one_time_tokens WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO one_time_tokens (token_hash, user_id, kind, expires_at) VALUES (?,?,?,?)').run(sha(raw), userId, kind, Date.now() + ttlMs);
    return raw;
  };
  const useToken = (raw, kind) => {
    const row = db.prepare('SELECT * FROM one_time_tokens WHERE token_hash = ? AND kind = ?').get(sha(String(raw || '')), kind);
    if (!row) return null;
    db.prepare('DELETE FROM one_time_tokens WHERE token_hash = ?').run(row.token_hash);
    return row.expires_at < Date.now() ? null : row.user_id;
  };
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const makeCode = () => Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
  const sendWelcome = (to) => {
    mailer.send({ to, ...welcomeEmail({ appUrl }) });
    mailer.send({ to, ...guideEmail({ appUrl, siteUrl }), sendAt: Date.now() + 5 * 60_000 });
  };

  app.get('/api/config', (_req, res) => res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));

  app.post('/api/auth/signup', authLimit, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'An account with this email already exists. Sign in instead.');
    const { salt, hash } = hashPassword(password);
    const info = db.prepare('INSERT INTO users (email, salt, pass_hash) VALUES (?,?,?)').run(email, salt, hash);
    sendWelcome(email);
    res.status(201).json({ token: createSession(db, Number(info.lastInsertRowid)), user: { email, plan: 'free' } });
  });

  app.post('/api/auth/login', authLimit, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (u && !u.pass_hash) throw httpError(401, 'This account signs in with Google. Use “Continue with Google”, or “Forgot password” to set a password.');
    if (!u || !verifyPassword(String(req.body?.password || ''), u.salt, u.pass_hash)) throw httpError(401, 'Wrong email or password.');
    res.json({ token: createSession(db, u.id), user: { email: u.email, plan: u.plan } });
  });

  // Google Sign-In: the browser sends Google's signed ID token; we verify it ourselves.
  app.post('/api/auth/google', authLimit, async (req, res) => {
    let g;
    try { g = await googleVerify(String(req.body?.credential || '')); } catch (e) { console.error('[google]', e.message); throw httpError(401, 'Google sign-in did not work. Please try again.'); }
    let u = db.prepare('SELECT * FROM users WHERE google_id = ?').get(g.sub) || db.prepare('SELECT * FROM users WHERE email = ?').get(g.email);
    if (u && u.google_id && u.google_id !== g.sub) throw httpError(401, 'This email is linked to a different Google account.');
    let isNew = false;
    if (!u) {
      const info = db.prepare("INSERT INTO users (email, salt, pass_hash, google_id) VALUES (?, '', '', ?)").run(g.email, g.sub);
      u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
      isNew = true; sendWelcome(g.email);
    } else if (!u.google_id) {
      // First time this existing account meets Google. Google has verified the mailbox but password sign-ups never were,
      // so someone else may have registered this address with their own password. Drop that password and any open sessions.
      db.prepare("UPDATE users SET google_id = ?, salt = '', pass_hash = '' WHERE id = ?").run(g.sub, u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    }
    res.json({ token: createSession(db, u.id), user: { email: u.email, plan: u.plan }, isNew });
  });

  // Forgot password. The answer is the same whether or not the address has an account.
  app.post('/api/auth/forgot', codeLimit, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? db.prepare('SELECT id FROM users WHERE email = ?').get(email) : null;
    if (u) {
      const open = db.prepare("SELECT COUNT(*) n FROM one_time_tokens WHERE user_id = ? AND kind = 'reset' AND expires_at > ?").get(u.id, Date.now()).n;
      if (open < 3) {
        const token = issueToken(u.id, 'reset', 3600_000, () => randomBytes(32).toString('hex'));
        mailer.send({ to: email, ...resetEmail({ url: `${appUrl}/#/reset/${token}` }) });
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/reset', codeLimit, (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
    const userId = useToken(req.body?.token, 'reset');
    if (!userId) throw httpError(400, 'This reset link has expired or was already used. Ask for a new one.');
    const { salt, hash } = hashPassword(password);
    db.prepare('UPDATE users SET salt = ?, pass_hash = ? WHERE id = ?').run(salt, hash, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); // anyone signed in with the old password is signed out
    db.prepare("DELETE FROM one_time_tokens WHERE user_id = ? AND kind = 'reset'").run(userId);
    const u = db.prepare('SELECT email, plan FROM users WHERE id = ?').get(userId);
    res.json({ token: createSession(db, userId), user: { email: u.email, plan: u.plan } });
  });

  // Connect code: a signed-in dashboard user gets a short one-time code and types it into the extension.
  app.post('/api/auth/connect-code', auth, codeLimit, (req, res) => {
    db.prepare("DELETE FROM one_time_tokens WHERE user_id = ? AND kind = 'connect'").run(req.user.id);
    const code = issueToken(req.user.id, 'connect', 10 * 60_000, makeCode);
    res.json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresInMinutes: 10 });
  });

  app.post('/api/auth/connect', codeLimit, (req, res) => {
    const code = String(req.body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const userId = code.length === 8 ? useToken(code, 'connect') : null;
    if (!userId) throw httpError(400, 'That code is wrong or has expired. Get a new one from the dashboard.');
    const u = db.prepare('SELECT email, plan FROM users WHERE id = ?').get(userId);
    res.json({ token: createSession(db, userId), user: { email: u.email, plan: u.plan } });
  });

  app.post('/api/auth/logout', auth, (req, res) => { destroySession(db, req.token); res.json({ ok: true }); });

  app.get('/api/me', auth, (req, res) => {
    const p = getProfile(req.user.id);
    res.json({ user: { email: req.user.email, plan: req.user.plan }, quota: quota(req.user), hasResume: !!p, aiEnabled: aiEnabled() });
  });

  // ---------- waitlist (used by the marketing website; set ALLOWED_ORIGINS to the site's origin)
  app.post('/api/waitlist', authLimit, (req, res) => {
    if (req.body?.website) return res.status(201).json({ ok: true }); // honeypot: bots fill hidden fields; pretend success
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw httpError(400, 'Enter a valid email address.');
    db.prepare('INSERT OR IGNORE INTO waitlist (email, source) VALUES (?, ?)').run(email, String(req.body?.source || '').slice(0, 40));
    res.status(201).json({ ok: true });
  });

  // ---------- profile
  app.post('/api/profile/resume', auth, upload.single('file'), async (req, res) => {
    if (!req.file) throw httpError(400, 'Choose a resume file (PDF, DOCX or TXT).');
    let parsed;
    try { parsed = await parseResumeFile(req.file.buffer, req.file.originalname); }
    catch (e) { console.warn('[resume]', e.message); throw e.status ? e : httpError(422, 'We could not read that file. Try a different PDF/DOCX, or paste it as .txt.'); }
    if (parsed.text.replace(/\s/g, '').length < 80) throw httpError(422, 'That file has almost no readable text (is it a scanned image?). Upload a text-based PDF or a DOCX.');
    const resume = parsed.resume;
    const extracted = { text: parsed.text, format: parsed.format };
    const prev = getProfile(req.user.id);
    // reset=1: the old resume was the wrong one, so also drop the skills and details confirmed against it.
    const fresh = req.body?.reset === '1';
    db.prepare(`INSERT INTO profiles (user_id, resume, original_text, source_format, facts, confirmed_skills) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET resume = excluded.resume, original_text = excluded.original_text, source_format = excluded.source_format, facts = excluded.facts, confirmed_skills = excluded.confirmed_skills, updated_at = datetime('now')`)
      .run(req.user.id, JSON.stringify(resume), extracted.text.slice(0, 60000), extracted.format, JSON.stringify(fresh ? {} : prev?.facts || {}), JSON.stringify(fresh ? [] : prev?.confirmedSkills || []));
    res.status(201).json({ resume, derived: deriveProfile(resume), warnings: parseWarnings(resume), format: extracted.format, originalText: extracted.text.slice(0, 20000) });
  });

  app.get('/api/profile', auth, (req, res) => {
    const p = getProfile(req.user.id);
    if (!p) return res.json({ profile: null });
    res.json({ profile: { ...p, derived: deriveProfile(p.resume), warnings: parseWarnings(p.resume), yearsEstimate: estimateYears(p.resume) } });
  });

  app.put('/api/profile', auth, (req, res) => {
    const p = needProfile(req.user.id);
    const resume = req.body.resume ? sanitizeResume(req.body.resume) : p.resume;
    const f = req.body.facts || p.facts;
    const facts = {};
    for (const k of ['noticePeriod', 'currentCtc', 'expectedCtc', 'location', 'relocation', 'yearsExperience']) {
      if (f[k] === undefined || f[k] === null || f[k] === '') continue;
      facts[k] = k === 'yearsExperience' ? Math.max(0, Math.min(60, Number(f[k]) || 0)) : String(f[k]).slice(0, 120);
    }
    const confirmed = Array.isArray(req.body.confirmedSkills) ? req.body.confirmedSkills.map((s) => String(s).slice(0, 60)).slice(0, 200) : p.confirmedSkills;
    db.prepare("UPDATE profiles SET resume = ?, facts = ?, confirmed_skills = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(resume), JSON.stringify(facts), JSON.stringify(confirmed), req.user.id);
    res.json({ ok: true });
  });

  app.get('/api/profile/html', auth, (req, res) => {
    const p = needProfile(req.user.id);
    sendResumeHtml(res, p.resume);
  });

  // ---------- capture (called by the extension)
  app.post('/api/capture', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    // text: everything captured (the job's header with title/company sits above the description, so it is used to verify
    // them). posting: just the job post, without search results, buttons and company panels; requirements come from it.
    const text = String(req.body?.text || '').trim().slice(0, 60000);
    const posting = cleanJdText(text, { source: req.body?.source });
    if (text.length < 80) throw httpError(422, 'Not enough text on this page. Select the job description and try again.');
    const url = String(req.body?.url || '').slice(0, 1000);
    const source = String(req.body?.source || '').slice(0, 60);
    // Hints come from scraping the page, which can grab the wrong element. Structured data is trusted; anything else
    // must be about the text we captured, otherwise we work the title out from the text (or the AI does).
    const hin = req.body?.hints || {};
    const trusted = hin.titleTrusted === true && !!clean(hin.title);
    const title = trusted ? clean(hin.title) : pickTitle([hin.title, ...(Array.isArray(hin.titleCandidates) ? hin.titleCandidates.slice(0, 12) : [])], text);
    const lowText = text.toLowerCase();
    const mentioned = (v) => !!clean(v) && lowText.includes(clean(v).toLowerCase());
    const finalTitle = cleanTitle(title);
    const company = (hin.companyTrusted === true && clean(hin.company)) || pickCompany(hin.companyCandidates, { title: finalTitle, text }) || (trusted || title || mentioned(hin.company) ? clean(hin.company) : '');
    const weakCompany = () => pickCompany(hin.companyCandidates, { title: finalTitle, text, allowUnverified: true });
    const believe = (v) => (trusted || title || mentioned(v)) ? clean(v) : '';
    const hints = { title: finalTitle, company, location: believe(hin.location) };
    // The title usually sits in the page header above the description: read it from the full text before cleaning.
    if (!hints.title && posting !== text) hints.title = cleanTitle(extractBasic(text, hints).title || '');
    const reqs = await extractJob(posting, hints, { context: text });
    // Sizes only (no job text) so a bad capture can be diagnosed from the logs.
    console.log(`[capture] source=${String(req.body?.source || '').slice(0, 40)} text=${text.length} posting=${posting.length} skills=${reqs.mustHave.length} title=${reqs.title ? 'yes' : 'no'} company=${reqs.company ? 'yes' : 'no'}`);
    if (!reqs.company) reqs.company = weakCompany(); // last resort: site name / page title / URL slug
    const externalId = String(req.body?.externalId || '').slice(0, 80);
    // Logo: only an https image address the page itself showed; otherwise the company website's icon. Stored as a plain
    // string and shown by the browser (the server never fetches it).
    const logo = (() => {
      let u = String(hin.logo || '').slice(0, 600);
      // An image found by scanning the page is kept only when its own label names this company; otherwise it may belong
      // to another card on the page. A wrong logo is worse than none.
      if (hin.logoHow === 'scan') {
        const norm = (x) => String(x || '').toLowerCase().replace(/\b(logo|pvt|private|ltd|limited|inc|llc|llp|corp|india|technologies|technology|solutions)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
        const alt = norm(hin.logoAlt), co = norm(reqs.company);
        if (!alt || !co || !(alt.includes(co) || co.includes(alt))) u = '';
      }
      try { if (u && new URL(u).protocol === 'https:') return u; } catch { /* not a URL */ }
      const d = String(hin.companyDomain || '').toLowerCase().slice(0, 120);
      return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(d) ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128` : '';
    })();
    let host = ''; try { host = new URL(url).host.toLowerCase(); } catch { /* not a URL */ }
    const baseKey = externalId ? `${host}:${externalId}` : canonicalUrl(url);
    let jobKey = baseKey;
    let existing = null;
    if (baseKey) {
      // Candidates: the plain key, keys disambiguated with "#hash" (several postings on one address), and pre-upgrade rows.
      const prefix = `${baseKey}#`;
      const rows = db.prepare("SELECT * FROM jobs WHERE user_id = ? AND (job_key = ? OR substr(job_key, 1, ?) = ? OR (job_key = '' AND url = ?)) ORDER BY id DESC").all(req.user.id, baseKey, prefix.length, prefix, url);
      existing = rows.find((row) => sameJob(row, reqs, text)) || null;
      // Same address but a different posting (single-page sites, stale pages): keep it as its own job.
      if (!existing && rows.length) jobKey = `${prefix}${shortHash(text)}`;
    }
    const base = scoreMatch({ resume: profile.resume, confirmedSkills: profile.confirmedSkills, yearsExperience: profile.facts.yearsExperience ?? null }, reqs);
    const fit = await analyzeFit(profile.resume, reqs, base, profile.confirmedSkills);
    const match = rescore(profile, reqs, existing ? j(existing.match, {}) : null, fit);
    let jobId;
    if (existing) {
      jobId = existing.id;
      db.prepare("UPDATE jobs SET title=?, company=?, location=?, jd_text=?, requirements=?, match=?, job_key=?, logo=CASE WHEN ? != '' THEN ? ELSE logo END, updated_at=datetime('now') WHERE id=?")
        .run(reqs.title.slice(0, 200), reqs.company.slice(0, 120), reqs.location.slice(0, 120), text, JSON.stringify(reqs), JSON.stringify(match), existing.job_key || baseKey, logo, logo, jobId);
    } else {
      const info = db.prepare('INSERT INTO jobs (user_id, title, company, location, url, source, jd_text, requirements, match, job_key, logo) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(req.user.id, reqs.title.slice(0, 200), reqs.company.slice(0, 120), reqs.location.slice(0, 120), url, source, text, JSON.stringify(reqs), JSON.stringify(match), jobKey, logo);
      jobId = Number(info.lastInsertRowid);
    }
    // No logo from the page: look the company up by name in the background so the capture itself stays fast.
    if (!jobRow(req.user.id, jobId).logo && reqs.company) {
      const uid = req.user.id;
      findCompanyLogo(reqs.company).then((u) => { if (u) db.prepare("UPDATE jobs SET logo = ? WHERE id = ? AND user_id = ? AND logo = ''").run(u, jobId, uid); }).catch(() => {});
    }
    const jobR = jobRow(req.user.id, jobId);
    const t = await tailorJob(req.user, profile, jobR);
    res.status(existing ? 200 : 201).json({ job: jobOut(jobRow(req.user.id, jobId)), resumeId: t.resumeId ?? null, quotaExceeded: !!t.quotaExceeded, quota: t.quota ?? quota(req.user), existing: !!existing });
  });

  // ---------- jobs / tracking
  app.get('/api/jobs', auth, (req, res) => {
    const rows = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 500').all(req.user.id);
    res.json({ jobs: rows.map(jobOut), statuses: STATUSES });
  });

  app.get('/api/jobs/:id', auth, (req, res) => {
    const r = jobRow(req.user.id, req.params.id);
    res.json({ job: { ...jobOut(r), jdText: cleanJdText(r.jd_text, { source: r.source }), jdRaw: r.jd_text } });
  });

  app.patch('/api/jobs/:id', auth, (req, res) => {
    const r = jobRow(req.user.id, req.params.id);
    const b = req.body || {};
    const status = b.status === undefined ? r.status : b.status;
    if (!STATUSES.includes(status)) throw httpError(400, 'Unknown status.');
    const appliedAt = status !== 'saved' && !r.applied_at ? new Date().toISOString() : r.applied_at;
    // Marking a job applied sets a follow-up 7 days out (only the first time; later stage moves keep it).
    const followUp = r.follow_up_due || (status === 'applied' && !r.applied_at ? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10) : null);
    db.prepare("UPDATE jobs SET status=?, notes=?, title=?, company=?, location=?, applied_at=?, follow_up_due=?, updated_at=datetime('now') WHERE id=?")
      .run(status, b.notes === undefined ? r.notes : String(b.notes).slice(0, 4000), b.title === undefined ? r.title : String(b.title).slice(0, 200), b.company === undefined ? r.company : String(b.company).slice(0, 120), b.location === undefined ? r.location : String(b.location).slice(0, 120), appliedAt, followUp, r.id);
    res.json({ job: jobOut(jobRow(req.user.id, r.id)) });
  });

  app.delete('/api/jobs/:id', auth, (req, res) => {
    const r = jobRow(req.user.id, req.params.id);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(r.id);
    res.json({ ok: true });
  });

  // Confirm (or deny) a missing skill. Confirmed skills go into the profile and are used for every future job.
  app.post('/api/jobs/:id/gaps', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const skill = String(req.body?.skill || '').trim().slice(0, 60);
    const reqs = j(r.requirements, {});
    const known = [...(reqs.mustHave || []), ...(reqs.niceToHave || [])];
    if (!known.includes(skill)) throw httpError(400, 'That skill is not part of this job.');
    if (req.body?.has === true && !profile.confirmedSkills.includes(skill)) {
      profile.confirmedSkills.push(skill);
      db.prepare("UPDATE profiles SET confirmed_skills = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(profile.confirmedSkills), req.user.id);
    }
    const match = rescore(profile, reqs, j(r.match, {}));
    db.prepare("UPDATE jobs SET match = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(match), r.id);
    res.json({ job: jobOut(jobRow(req.user.id, r.id)) });
  });

  // Re-read the requirements against the current resume (after editing it).
  app.post('/api/jobs/:id/fit', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const reqs = j(r.requirements, {});
    const prev = j(r.match, {});
    const base = scoreMatch({ resume: profile.resume, confirmedSkills: profile.confirmedSkills, yearsExperience: profile.facts.yearsExperience ?? null }, reqs);
    const fit = await analyzeFit(profile.resume, reqs, base, profile.confirmedSkills);
    db.prepare("UPDATE jobs SET match = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(rescore(profile, reqs, prev, fit)), r.id);
    res.json({ job: jobOut(jobRow(req.user.id, r.id)) });
  });

  app.post('/api/jobs/:id/tailor', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const t = await tailorJob(req.user, profile, r);
    res.status(t.quotaExceeded ? 402 : 201).json(t.quotaExceeded ? { error: 'You\u2019ve used all your free resumes. Pay now to keep going.', ...t } : t);
  });

  // ---------- interview prep (company research + brief + questions), cached per job
  const prepContextFor = (user, profile, r) => {
    const job = jobOut(r);
    const best = db.prepare('SELECT data FROM resumes WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
    return {
      resume: best ? j(best.data, profile.resume) : profile.resume,
      derived: deriveProfile(profile.resume), jdText: cleanJdText(r.jd_text, { source: r.source }), match: job.match,
      job: { ...job.requirements, title: job.title || job.requirements.title, company: job.company || job.requirements.company, location: job.location },
    };
  };

  app.get('/api/jobs/:id/prep', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const row = db.prepare('SELECT data, created_at FROM job_prep WHERE job_id = ?').get(r.id);
    if (!row) return res.json({ prep: null, aiEnabled: aiEnabled() });
    const stored = j(row.data, null);
    const profAt = db.prepare('SELECT updated_at FROM profiles WHERE user_id = ?').get(req.user.id)?.updated_at || '';
    const stale = profAt > row.created_at || (stored?.prep?.mode === 'basic' && aiEnabled());
    res.json({ prep: stored.prep, research: stored.research, createdAt: row.created_at, stale, aiEnabled: aiEnabled() });
  });

  app.post('/api/jobs/:id/prep', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    if (!hasCredit(req.user, r.id)) throw httpError(402, OUT_OF_CREDITS(freeLimit));
    const send = sseStart(res);
    try {
      const ctx = prepContextFor(req.user, profile, r);
      send({ type: 'step', label: 'Reading the job description…' });
      let research = null;
      if (ctx.job.company) research = await getCompanyResearch(db, { company: ctx.job.company, role: ctx.job.title, location: ctx.job.location, refresh: !!req.body?.refresh, onStep: (label) => send({ type: 'step', label }) });
      send({ type: 'step', label: aiEnabled() ? 'Writing your personalised prep…' : 'Building your prep…' });
      const prep = await buildPrep({ ...ctx, research });
      db.prepare("INSERT INTO job_prep (job_id, data, created_at) VALUES (?,?,datetime('now')) ON CONFLICT(job_id) DO UPDATE SET data=excluded.data, created_at=excluded.created_at").run(r.id, JSON.stringify({ prep, research }));
      send({ type: 'result', prep, research, stale: false });
    } catch (e) {
      console.error('[prep]', e);
      send({ type: 'error', message: 'Could not build your prep. Please try again.' });
    }
    res.end();
  });

  app.post('/api/jobs/:id/chat', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    if (!hasCredit(req.user, r.id)) throw httpError(402, OUT_OF_CREDITS(freeLimit));
    if (!aiEnabled()) throw httpError(503, 'Ask is unavailable right now. Please try again later.');
    // Safety cap so one job cannot run up the AI bill: at most 60 questions per job.
    const asked = db.prepare('INSERT INTO job_chat (job_id, n) VALUES (?, 1) ON CONFLICT(job_id) DO UPDATE SET n = n + 1 RETURNING n').get(r.id).n;
    if (asked > 60) throw httpError(429, 'You have reached the question limit for this job.');
    // Keep a valid alternating history that starts and ends with the user.
    const cleaned = [];
    for (const m of (Array.isArray(req.body?.messages) ? req.body.messages : []).slice(-14)) {
      if (!['user', 'assistant'].includes(m?.role)) continue;
      const content = String(m.content || '').slice(0, 4000).trim();
      if (!content) continue;
      if (cleaned.length && cleaned.at(-1).role === m.role) cleaned.at(-1).content += `\n${content}`; else cleaned.push({ role: m.role, content });
    }
    while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
    if (!cleaned.length || cleaned.at(-1).role !== 'user') throw httpError(400, 'Ask a question first.');
    const ctx = prepContextFor(req.user, profile, r);
    const stored = j(db.prepare('SELECT data FROM job_prep WHERE job_id = ?').get(r.id)?.data, null);
    const send = sseStart(res);
    try {
      await streamChat({ system: chatSystem({ ...ctx, research: stored?.research || null }), messages: cleaned, onText: (text) => send({ type: 'text', text }) });
      send({ type: 'done' });
    } catch (e) {
      console.warn('[chat]', e.message);
      send({ type: 'error', message: 'Ask is unavailable right now. Please try again in a moment.' });
    }
    res.end();
  });

  app.get('/api/skill-gaps', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const rows = db.prepare('SELECT * FROM jobs WHERE user_id = ?').all(req.user.id);
    const map = new Map();
    for (const r of rows) {
      const reqs = j(r.requirements, {});
      const m = rescore(profile, reqs);
      for (const [list, kind] of [[m.missingMust, 'must'], [m.missingNice, 'nice']]) for (const skill of list) {
        const e = map.get(skill) || { skill, jobs: 0, must: 0, nice: 0, examples: [] };
        e.jobs += 1; e[kind] += 1; if (e.examples.length < 3) e.examples.push(`${r.title}${r.company ? ' @ ' + r.company : ''}`);
        map.set(skill, e);
      }
    }
    res.json({ totalJobs: rows.length, gaps: [...map.values()].sort((a, b) => b.must - a.must || b.jobs - a.jobs) });
  });

  // ---------- resumes
  const resumeRow = (userId, id) => {
    const r = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (!r) throw httpError(404, 'Resume not found.');
    return r;
  };
  const resumeOut = (r) => ({ id: r.id, jobId: r.job_id, label: r.label, resume: j(r.data, null), changes: j(r.changes, []), suggestions: j(r.suggestions, []), createdAt: r.created_at, updatedAt: r.updated_at });

  app.get('/api/resumes', auth, (req, res) => {
    const rows = db.prepare('SELECT r.id, r.job_id, r.label, r.created_at, r.updated_at, j.title, j.company FROM resumes r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 500').all(req.user.id);
    res.json({ resumes: rows.map((r) => ({ id: r.id, jobId: r.job_id, label: r.label, title: r.title, company: r.company, createdAt: r.created_at, updatedAt: r.updated_at })) });
  });

  app.get('/api/resumes/:id', auth, (req, res) => res.json(resumeOut(resumeRow(req.user.id, req.params.id))));

  app.put('/api/resumes/:id', auth, (req, res) => {
    const r = resumeRow(req.user.id, req.params.id);
    const data = sanitizeResume(req.body?.resume);
    const suggestions = Array.isArray(req.body?.suggestions) ? req.body.suggestions.slice(0, 30).map((s) => ({ itemId: String(s.itemId || ''), bulletId: String(s.bulletId || ''), original: String(s.original || '').slice(0, 1500), proposed: String(s.proposed || '').slice(0, 1500), reason: String(s.reason || '').slice(0, 200), status: ['pending', 'accepted', 'rejected'].includes(s.status) ? s.status : 'pending' })) : j(r.suggestions, []);
    db.prepare("UPDATE resumes SET data = ?, suggestions = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(data), JSON.stringify(suggestions), r.id);
    res.json({ ok: true });
  });

  app.delete('/api/resumes/:id', auth, (req, res) => {
    const r = resumeRow(req.user.id, req.params.id);
    db.prepare('DELETE FROM resumes WHERE id = ?').run(r.id);
    res.json({ ok: true });
  });

  // Preview of unsaved edits: the editor posts its current model and gets HTML back.
  app.post('/api/preview', auth, (req, res) => sendResumeHtml(res, sanitizeResume(req.body?.resume), Array.isArray(req.body?.marks) ? new Set(req.body.marks.slice(0, 200).map(String)) : null));
  app.get('/api/resumes/:id/html', auth, (req, res) => sendResumeHtml(res, j(resumeRow(req.user.id, req.params.id).data, null)));

  app.get('/api/resumes/:id/pdf', auth, async (req, res) => {
    const r = resumeRow(req.user.id, req.params.id);
    const data = j(r.data, null);
    let pdf;
    try { pdf = await renderPdf(data); } catch (e) { console.error('[pdf]', e.message); throw httpError(500, 'Could not generate the PDF. Please try again.'); }
    db.prepare("UPDATE resumes SET downloaded_at = datetime('now') WHERE id = ? AND downloaded_at IS NULL").run(r.id);
    // "Aditya_Sharma_Resume_NxtPe.pdf": candidate name, then the company it was tailored for.
    const company = r.job_id ? db.prepare('SELECT company FROM jobs WHERE id = ?').get(r.job_id)?.company : '';
    const part = (x) => String(x || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const name = [part(data.header?.name), 'Resume', part(company)].filter(Boolean).join('_').slice(0, 80) || 'Resume';
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` }).send(Buffer.from(pdf));
  });

  // ---------- autofill (used by the extension's side panel and the dashboard's "Application details")
  // Rolemate fills the details on an application form from the user's profile. It never submits and never uploads a file:
  // the user attaches the tailored resume themselves and presses apply.
  const draftLimit = rateLimiter({ max: 20 });
  const bankRows = (userId) => db.prepare('SELECT id, question, tags, answer, updated_at FROM qa_bank WHERE user_id = ? ORDER BY updated_at DESC LIMIT 300').all(userId)
    .map((r) => ({ id: r.id, question: r.question, tags: r.tags, answer: r.answer, updatedAt: r.updated_at }));
  const applyProfileFor = (user) => {
    const p = getProfile(user.id);
    return { p, profile: buildApplyProfile({ resume: p?.resume, facts: p?.facts || {}, apply: p?.apply || {}, accountEmail: user.email, confirmedSkills: p?.confirmedSkills || [] }) };
  };

  // Autofill is part of a job's credit: it works only for a job the user saved and that has a credit (capturing a job
  // is what spends it). The server enforces this, so the extension cannot skip it: the fill data and AI drafting are only
  // handed out for such a job.
  const AUTOFILL_DRAFTS_PER_JOB = 40;
  const creditedJob = (user, id) => {
    const r = jobRow(user.id, id);
    if (!hasCredit(user, r.id)) throw httpError(402, 'Autofill is included once a job has a credit. Buy credits to unlock this job.');
    return r;
  };

  // The user's open jobs, newest first, because the form is usually on a different site from the page the job was captured on.
  // No profile data here: that is only given for a specific, credited job (see below).
  app.get('/api/autofill/context', auth, (req, res) => {
    const rows = db.prepare("SELECT * FROM jobs WHERE user_id = ? AND status IN ('saved','applied') ORDER BY (status = 'saved') DESC, id DESC LIMIT 25").all(req.user.id);
    const pageUrl = canonicalUrl(String(req.query.url || ''));
    const jobs = rows.map((r) => {
      const latest = db.prepare('SELECT id, label, downloaded_at FROM resumes WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
      return { id: r.id, title: r.title, company: r.company, location: r.location, status: r.status, url: r.url, logo: r.logo || '', fit: j(r.match, {}).score ?? null, credit: hasCredit(req.user, r.id),
        sameUrl: !!pageUrl && canonicalUrl(r.url) === pageUrl, resume: latest ? { id: latest.id, label: latest.label, downloaded: !!latest.downloaded_at } : null };
    });
    res.json({ hasResume: !!getProfile(req.user.id), jobs, aiEnabled: aiEnabled() });
  });

  // The details and saved answers the extension fills the form with, for one saved job that has a credit.
  app.get('/api/autofill/jobs/:id/data', auth, (req, res) => {
    const r = creditedJob(req.user, req.params.id);
    const { profile } = applyProfileFor(req.user);
    res.json({ job: { id: r.id, title: r.title, company: r.company }, profile, missing: missingDetails(profile), bank: bankRows(req.user.id) });
  });

  app.get('/api/autofill/profile', auth, (req, res) => {
    const { p, profile } = applyProfileFor(req.user);
    res.json({ hasResume: !!p, apply: sanitizeApply(p?.apply || {}), facts: p?.facts || {}, profile, missing: missingDetails(profile) });
  });

  // Details the user confirms for forms. Notice period, CTC and relocation live in `facts` (already used by tailoring).
  app.put('/api/autofill/profile', auth, (req, res) => {
    const p = needProfile(req.user.id);
    const apply = sanitizeApply(req.body?.apply || {});
    const f = req.body?.facts || {};
    const facts = { ...p.facts };
    for (const k of ['noticePeriod', 'currentCtc', 'expectedCtc', 'relocation']) if (f[k] !== undefined) { const v = String(f[k] ?? '').trim().slice(0, 120); if (v) facts[k] = v; else delete facts[k]; }
    db.prepare("UPDATE profiles SET apply_data = ?, facts = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(apply), JSON.stringify(facts), req.user.id);
    res.json({ ok: true, ...(({ profile }) => ({ profile, missing: missingDetails(profile) }))(applyProfileFor(req.user)) });
  });

  app.get('/api/autofill/answers', auth, (req, res) => res.json({ answers: bankRows(req.user.id) }));

  // Save an approved answer. The same question (ignoring case and punctuation) is updated, never duplicated.
  app.post('/api/autofill/answers', auth, (req, res) => {
    const a = sanitizeAnswer(req.body);
    if (!a.question || !a.answer) throw httpError(400, 'A question and an answer are both needed.');
    const n = db.prepare('SELECT COUNT(*) c FROM qa_bank WHERE user_id = ?').get(req.user.id).c;
    const exists = db.prepare('SELECT id FROM qa_bank WHERE user_id = ? AND qkey = ?').get(req.user.id, qkey(a.question));
    if (!exists && n >= 300) throw httpError(409, 'You have 300 saved answers. Delete some in your dashboard first.');
    db.prepare(`INSERT INTO qa_bank (user_id, question, qkey, tags, answer) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, qkey) DO UPDATE SET answer = excluded.answer, tags = excluded.tags, question = excluded.question, updated_at = datetime('now')`)
      .run(req.user.id, a.question, qkey(a.question), a.tags, a.answer);
    res.status(exists ? 200 : 201).json({ answers: bankRows(req.user.id) });
  });

  app.put('/api/autofill/answers/:id', auth, (req, res) => {
    const a = sanitizeAnswer(req.body);
    const row = db.prepare('SELECT id FROM qa_bank WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!row) throw httpError(404, 'Answer not found.');
    if (!a.question || !a.answer) throw httpError(400, 'A question and an answer are both needed.');
    const clash = db.prepare('SELECT id FROM qa_bank WHERE user_id = ? AND qkey = ? AND id <> ?').get(req.user.id, qkey(a.question), row.id);
    if (clash) throw httpError(409, 'You already have an answer for that question.');
    db.prepare("UPDATE qa_bank SET question = ?, qkey = ?, tags = ?, answer = ?, updated_at = datetime('now') WHERE id = ?").run(a.question, qkey(a.question), a.tags, a.answer, row.id);
    res.json({ answers: bankRows(req.user.id) });
  });

  app.delete('/api/autofill/answers/:id', auth, (req, res) => {
    db.prepare('DELETE FROM qa_bank WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ answers: bankRows(req.user.id) });
  });

  // Answers for the questions the profile can't answer, drafted from the resume, profile and job in one call. Needs a saved job
  // with a credit; each job has a fair-use limit on drafting calls.
  app.post('/api/autofill/draft', auth, draftLimit, async (req, res) => {
    if (!req.body?.jobId) throw httpError(400, 'Save the job first: autofill works for jobs saved in Rolemate.');
    const job = creditedJob(req.user, req.body.jobId);
    const qs = (Array.isArray(req.body?.questions) ? req.body.questions : []).slice(0, 20)
      .map((q, i) => ({ id: String(q?.id ?? i).slice(0, 40), label: String(q?.label || '').slice(0, 400), options: (Array.isArray(q?.options) ? q.options : []).slice(0, 40).map((o) => String(o).slice(0, 120)), maxLength: Math.min(Number(q?.maxLength) || 0, 4000) || 0 }))
      .filter((q) => q.label);
    if (!qs.length) return res.json({ drafts: [] });
    const used = db.prepare('SELECT drafts FROM job_autofill WHERE job_id = ?').get(job.id)?.drafts || 0;
    if (used >= AUTOFILL_DRAFTS_PER_JOB) throw httpError(429, 'You have used the drafting limit for this job. You can still fill the form from your profile.');
    db.prepare('INSERT INTO job_autofill (job_id, drafts) VALUES (?, 1) ON CONFLICT(job_id) DO UPDATE SET drafts = drafts + 1').run(job.id);
    const { p, profile } = applyProfileFor(req.user);
    const page = { title: String(req.body?.page?.title || '').slice(0, 200), company: String(req.body?.page?.company || '').slice(0, 120) };
    res.json({ drafts: await draftAnswers({ questions: qs, resume: p?.resume, profile, bank: bankRows(req.user.id), job, page }) });
  });

  // Questions a form asked and what happened to each (filled, drafted, asked, skipped). Labels only, never the answers.
  app.post('/api/autofill/log', auth, (req, res) => {
    const rows = (Array.isArray(req.body?.questions) ? req.body.questions : []).slice(0, 100);
    const jobId = req.body?.jobId ? jobRow(req.user.id, req.body.jobId).id : null;
    const host = String(req.body?.host || '').slice(0, 100);
    const ins = db.prepare('INSERT INTO question_log (user_id, job_id, label, kind, outcome, host) VALUES (?,?,?,?,?,?)');
    for (const q of rows) { const label = String(q?.label || '').trim().slice(0, 300); if (label) ins.run(req.user.id, jobId, label, String(q?.kind || '').slice(0, 20), String(q?.outcome || '').slice(0, 20), host); }
    res.json({ ok: true });
  });

  // ---------- account
  app.get('/api/export', auth, (req, res) => {
    const id = req.user.id;
    res.set('Content-Disposition', 'attachment; filename="tailorkit-export.json"').json({
      user: { email: req.user.email, plan: req.user.plan }, profile: getProfile(id),
      jobs: db.prepare('SELECT * FROM jobs WHERE user_id = ?').all(id), resumes: db.prepare('SELECT * FROM resumes WHERE user_id = ?').all(id),
      savedAnswers: db.prepare('SELECT question, tags, answer, created_at FROM qa_bank WHERE user_id = ?').all(id), questionLog: db.prepare('SELECT label, kind, outcome, host, created_at FROM question_log WHERE user_id = ?').all(id),
    });
  });

  app.delete('/api/account', auth, (req, res) => {
    if (req.body?.confirm !== req.user.email) throw httpError(400, 'Type your email address to confirm deleting your account.');
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  // ---------- dashboard (static)
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use(express.static(WEB_DIR, { extensions: ['html'] }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : err.message });
  });

  app.locals.db = db;
  return app;
}

function sendResumeHtml(res, resume, marks = null) {
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" }).send(renderHtml(resume, { marks }));
}

const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
