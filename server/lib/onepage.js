// A tailored resume is one page. If it runs over, the least relevant bullets are cut (never whole roles, education or skills)
// until it fits. Measured on the real PDF, so what is checked is what you download.

import { renderPdf } from './render.js';
import { relevance, jobKeywords } from './tailor-core.js';
import { stripMd } from './resume-text.js';

async function measure(resume) {
  const pdf = Buffer.from(await renderPdf(resume));
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const t = await parser.getText();
    const extra = (t.pages || []).slice(1).reduce((a, p) => a + p.text.split('\n').filter((l) => l.trim()).length, 0);
    return { pages: t.total || 1, overflowLines: extra };
  } finally { await parser.destroy?.(); }
}

const lineCost = (text) => Math.max(1, Math.ceil(stripMd(text).length / 100));

// Cut order: lowest relevance first; a bullet with a number is worth keeping; older roles lose bullets first.
function candidates(resume, keywords) {
  const out = [];
  for (const s of resume.sections) {
    if (s.kind !== 'experience' && s.kind !== 'projects') continue;
    s.items.forEach((it, idx) => {
      const bs = it.bullets || [];
      if (bs.some((b) => b.style !== 'bullet')) return; // grouped or mixed entries stay as written
      const keep = idx === 0 ? 3 : 2;
      bs.forEach((b, pos) => { if (pos >= keep) out.push({ it, b, pos, idx, score: relevance(b.text, keywords) * 10 + (/\d/.test(b.text) ? 4 : 0) - pos * 0.1 - idx * 0.05 }); });
    });
  }
  return out.sort((a, b) => a.score - b.score);
}

export async function fitOnePage(resume, job, { measureFn = measure, maxRounds = 6 } = {}) {
  const keywords = jobKeywords(job);
  let removed = 0; let pages = 1;
  try {
    for (let round = 0; round < maxRounds; round++) {
      const m = await measureFn(resume);
      pages = m.pages;
      if (m.pages <= 1) break;
      const list = candidates(resume, keywords);
      if (!list.length) break;
      let need = Math.max(1, m.overflowLines); let n = 0;
      for (const c of list) {
        if (need <= 0) break;
        c.it.bullets = c.it.bullets.filter((x) => x.id !== c.b.id);
        need -= lineCost(c.b.text); n += 1;
      }
      removed += n;
    }
  } catch (e) { console.warn('[onepage] could not measure the page count:', e.message); return { removed, pages: null }; }
  return { removed, pages };
}
