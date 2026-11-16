// Minimal, ATS-friendly Word export built without dependencies: one column, real paragraphs, standard fonts, no tables or images.
// A .docx is a zip of XML files; the zip is written "stored" (no compression) using Node's own crc32.

import { crc32 } from 'node:zlib';
import { stripMd } from './resume-text.js';

const esc = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mm = (v) => Math.round(v * 56.7);
const FONT = { arimo: 'Arial', carlito: 'Calibri', tinos: 'Times New Roman' };

// "**bold**" in the resume text becomes bold runs.
function runs(text, { bold = false, italic = false, size = null, caps = false } = {}) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    const b = bold || /^\*\*[^*]+\*\*$/.test(p);
    const t = stripMd(p);
    return `<w:r><w:rPr>${b ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${caps ? '<w:caps/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}
const para = (inner, { align = 'left', before = 0, after = 0, ind = '', tabs = '', border = false, keep = false } = {}) =>
  `<w:p><w:pPr>${keep ? '<w:keepNext/>' : ''}${border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr>' : ''}${tabs ? `<w:tabs>${tabs}</w:tabs>` : ''}<w:spacing w:before="${before}" w:after="${after}"/>${ind}<w:jc w:val="${align}"/></w:pPr>${inner}</w:p>`;

export function buildDocx(resume) {
  const st = resume.structure || {};
  const size = Math.round((st.fontSize || 10) * 2);
  const font = FONT[st.fontFamily] || 'Arial';
  const m = st.margins || {};
  const [pw, ph] = st.pageSize === 'Letter' ? [12240, 15840] : [11906, 16838];
  const L = mm(m.left ?? 15), R = mm(m.right ?? 15), T = mm(m.top ?? 14), B = mm(m.bottom ?? 14);
  const rightTab = `<w:tab w:val="right" w:pos="${pw - L - R}"/>`;
  const bullet = st.bulletChar || '•';
  const body = [];

  body.push(para(runs(resume.header.name, { bold: true, size: (st.nameSize || 19) * 2 }), { align: st.headerAlign === 'left' ? 'left' : 'center', after: 40 }));
  for (const l of resume.header.lines) body.push(para(runs(l, { size }), { align: st.headerAlign === 'left' ? 'left' : 'center' }));

  for (const s of resume.sections) {
    body.push(para(runs(s.heading, { bold: true, size, caps: st.headingCase === 'upper' }), { before: 200, after: 60, border: true, keep: true }));
    for (const it of s.items) {
      if (s.kind === 'summary') { body.push(para(runs(it.text, { size }), { after: 40 })); continue; }
      if (s.kind === 'skills') {
        if (it.skills?.length) body.push(para(runs(it.label ? `${it.label}: ` : '', { bold: true, size }) + runs(it.skills.join(', '), { size }), { after: 20 }));
        else if (it.text) body.push(para(`${it.style === 'bullet' ? runs(`${bullet}\t`, { size }) : ''}${runs(it.text, { size })}`, { ind: it.style === 'bullet' ? '<w:ind w:left="360" w:hanging="360"/>' : '', after: 20 }));
        continue;
      }
      const head = [it.title, it.subtitle].filter(Boolean).join(it.sep || ' | ');
      if (head || it.date) {
        body.push(para(`${runs(head, { bold: true, size })}${it.date ? `<w:r><w:tab/></w:r>${runs(it.dateBrackets ? `[${it.date}]` : it.date, { size })}` : ''}`, { tabs: rightTab, before: 80, keep: true }));
        if (it.location) body.push(para(runs(it.location, { italic: true, size })));
      }
      for (const b of it.bullets || []) {
        const sub = b.style === 'sub', text = b.style === 'text';
        body.push(para(`${text ? '' : runs(`${bullet}\t`, { size })}${runs(b.text, { size, bold: sub })}`, { ind: text ? '' : `<w:ind w:left="${360 + (b.indent || 0) * 8}" w:hanging="360"/>`, after: 20 }));
      }
    }
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/><w:pgMar w:top="${T}" w:right="${R}" w:bottom="${B}" w:left="${L}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${Math.round((st.lineHeight || 1.15) * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/document.xml': docXml,
    'word/styles.xml': styles,
  });
}

function zip(files) {
  const chunks = []; const central = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameB = Buffer.from(name); const data = Buffer.from(content, 'utf8'); const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0x21, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameB.length, 26);
    chunks.push(local, nameB, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(0x21, 12);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, end]);
}
