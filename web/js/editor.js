// Resume editor: edit text, remove/reorder bullets, accept AI rewrites, live preview.
// Used for tailored resumes and for the master resume on the Profile page.
import { h, append, clear, debounce, toast } from './dom.js';
import { apiText } from './api.js';
import { icon } from './icons.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (x) => JSON.parse(JSON.stringify(x));

// autosave: save a moment after each edit (tailored resumes). back: a link shown before the title. intro: shown above the suggestions.
export function resumeEditor({ resume, suggestions = [], onSave, onDownload, aiEnabled = false, title = '', autosave = false, back = null, intro = null }) {
  let state = clone(resume);
  let sugs = clone(suggestions);
  const history = [];
  // Bullet text as it was when the editor opened: anything different, or any accepted rewording, is highlighted in the preview.
  const original = new Map();
  for (const s of state.sections) for (const it of s.items) for (const b of it.bullets || []) original.set(b.id, b.text);
  let flashId = null;
  let dirty = false;

  const root = h('div');
  const formHost = h('div');
  const sugHost = h('div');
  const frame = h('iframe', { title: 'Resume preview', sandbox: 'allow-same-origin' });
  const pane = h('div', { class: 'pagepane' }, frame);
  // The resume is laid out at real page width, then scaled to fit the pane, so nothing is cropped.
  const PAGE_W = 794;
  const fit = () => {
    const w = pane.clientWidth; if (!w) return;
    const k = Math.min(1, w / PAGE_W);
    let hgt = 1123; try { hgt = Math.max(1123, frame.contentDocument.documentElement.scrollHeight); } catch { /* keep default */ }
    frame.style.width = `${PAGE_W}px`; frame.style.height = `${hgt}px`; frame.style.transform = `scale(${k})`;
    pane.style.height = `${Math.round(hgt * k)}px`;
  };
  frame.addEventListener('load', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(pane);
  const status = h('span', { class: 'savestate muted small' }, 'Saved');
  const undoBtn = h('button', { class: 'btn sm ghost', disabled: true, onclick: undo }, '↶ Undo');

  const legend = h('span', { class: 'legend', hidden: true });
  function changedIds() {
    const ids = new Set(sugs.filter((x) => x.status === 'accepted').map((x) => x.bulletId));
    for (const s of state.sections) for (const it of s.items) for (const b of it.bullets || []) if (!original.has(b.id) || original.get(b.id) !== b.text) ids.add(b.id);
    const live = new Set(); for (const s of state.sections) for (const it of s.items) for (const b of it.bullets || []) if (ids.has(b.id)) live.add(b.id);
    return live;
  }
  const refreshPreview = debounce(async () => {
    const marks = [...changedIds()];
    legend.hidden = !marks.length;
    legend.replaceChildren(h('i'), `${marks.length} line${marks.length === 1 ? '' : 's'} changed${autosave ? ' for this job' : ''}`);
    try { frame.srcdoc = await apiText('/api/preview', { method: 'POST', body: { resume: state, marks } }); } catch { /* keep the last preview */ }
  }, 300);
  // After the preview reloads: scroll to the line that just changed and flash it, so it is obvious what moved.
  frame.addEventListener('load', () => {
    if (!flashId) return;
    const id = flashId; flashId = null;
    try {
      const el = frame.contentDocument.querySelector(`[data-b="${CSS.escape(id)}"]`); if (!el) return;
      el.classList.add('flash');
      const k = pane.getBoundingClientRect().width / PAGE_W;
      const box = pane.parentElement;
      box.scrollTo({ top: Math.max(0, pane.offsetTop + el.offsetTop * k - box.clientHeight / 3), behavior: 'smooth' });
    } catch { /* preview not readable */ }
  });
  const showInPreview = (id) => { flashId = id; refreshPreview(); };

  const autoSave = debounce(() => { if (dirty) save(true); }, 1200);
  function touch(structural) {
    dirty = true; status.textContent = autosave ? 'Saving…' : 'Unsaved changes'; status.classList.add('busy');
    if (structural) { undoBtn.disabled = false; }
    refreshPreview();
    if (autosave) autoSave();
  }
  function snapshot() { history.push(clone(state)); if (history.length > 40) history.shift(); undoBtn.disabled = false; }
  function undo() { const prev = history.pop(); if (!prev) return; state = prev; undoBtn.disabled = !history.length; renderForm(); renderSugs(); touch(false); }

  const input = (value, onInput, attrs = {}) => h('input', { type: 'text', value, oninput: (e) => { onInput(e.target.value); touch(false); }, ...attrs });
  function area(value, onInput, attrs = {}) {
    const t = h('textarea', { rows: 2, oninput: (e) => { onInput(e.target.value); touch(false); grow(t); }, ...attrs });
    t.value = value; requestAnimationFrame(() => grow(t));
    return t;
  }
  const grow = (t) => { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight + 2, 260)}px`; };
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; snapshot(); [arr[i], arr[j]] = [arr[j], arr[i]]; renderForm(); touch(true); };
  const remove = (arr, i) => { snapshot(); arr.splice(i, 1); renderForm(); touch(true); };

  const iconBtn = (label, text, fn, cls = '') => h('button', { class: `ib ${cls}`, title: label, 'aria-label': label, onclick: fn }, text);
  // Everything starts closed. What the user opens stays open when the form redraws (after adding or moving things).
  const opened = new Set();
  const collapsible = (key, head, body, cls = '') => {
    const d = h('details', { class: cls }); if (opened.has(key)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) opened.add(key); else opened.delete(key); });
    d.append(h('summary', null, head), h('div', { class: 'dbody' }, body));
    d.addEventListener('toggle', () => d.querySelectorAll('textarea').forEach(grow));
    return d;
  };

  const KIND_ICON = { summary: 'file', experience: 'building', projects: 'board', skills: 'target', education: 'list' };
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const nice = (t) => (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : t);
  const plain = (t) => String(t || '').replace(/\*+/g, '');
  function preview(sec) {
    if (sec.kind === 'summary') return plain(sec.items[0]?.text).slice(0, 90) + (plain(sec.items[0]?.text).length > 90 ? '…' : '');
    if (sec.kind === 'skills') { const n = sec.items.reduce((a, it) => a + (it.skills?.length || (it.text ? 1 : 0)), 0); return plural(n, 'skill'); }
    const names = sec.items.map((it) => it.title || it.subtitle).filter(Boolean);
    return [plural(sec.items.length, 'entry', 'entries'), names.slice(0, 2).join(', ') + (names.length > 2 ? '…' : '')].filter(Boolean).join(' · ');
  }
  // Card header: icon, title (rename in place with the pencil), a one-line preview, tools on hover, chevron.
  function cardHead(ic, title, sub, tools = [], onRename = null) {
    const t = h('span', { class: 'ctitle' }, title);
    const rename = onRename && iconBtn('Rename section', icon('pencil', 15), (e) => {
      e.preventDefault(); e.stopPropagation();
      const inp = h('input', { type: 'text', class: 'renamer', value: t.textContent, onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); }, onkeydown: (ev) => { if (ev.key === ' ') ev.stopPropagation(); if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); inp.blur(); } },
        onblur: () => { const v = inp.value.trim(); if (v) { onRename(v); t.textContent = nice(v); touch(false); } inp.replaceWith(t); } });
      t.replaceWith(inp); inp.focus(); inp.select();
    });
    return h('span', { class: 'shead' }, h('span', { class: 'cicon' }, icon(ic, 18)),
      h('span', { class: 'ctext' }, t, sub && h('span', { class: 'csub' }, sub)),
      h('span', { class: 'etools' }, rename, ...tools), h('span', { class: 'chev', 'aria-hidden': 'true' }));
  }

  function renderForm() {
    clear(formHost);
    const hdr = h('div', { class: 'cbody' },
      h('label', { class: 'field' }, 'Name', input(state.header.name, (v) => { state.header.name = v; })),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Contact lines (one per line)',
        area(state.header.lines.join('\n'), (v) => { state.header.lines = v.split('\n').map((x) => x.trim()).filter(Boolean); }, { rows: 3 })));
    formHost.append(collapsible('contact', cardHead('user', 'Contact information', [state.header.name, state.header.lines[0]].filter(Boolean).join(' · ')), hdr, 'csec'));

    state.sections.forEach((sec, si) => {
      const body = h('div', { class: 'cbody' });

      sec.items.forEach((it, ii) => {
        if (sec.kind === 'summary') { body.append(area(it.text || '', (v) => { it.text = v; }, { 'aria-label': 'Summary', class: 'prose', rows: 2 })); return; }
        if (sec.kind === 'skills') {
          body.append(h('div', { class: 'bul' },
            input(it.label || '', (v) => { it.label = v; }, { placeholder: 'Group (optional)', style: 'width:32%', 'aria-label': 'Skill group' }),
            input((it.skills || []).join(', '), (v) => { it.skills = v.split(',').map((x) => x.trim()).filter(Boolean); }, { placeholder: 'Comma-separated skills', style: 'flex:1', 'aria-label': 'Skills' }),
            iconBtn('Remove skill row', '✕', () => remove(sec.items, ii), 'danger')));
          return;
        }
        const ebody = h('div', { class: 'ebody' });
        ebody.append(h('div', { class: 'grid2' },
          h('label', { class: 'field' }, 'Title', input(it.title || '', (v) => { it.title = v; })),
          h('label', { class: 'field' }, 'Organisation / detail', input(it.subtitle || '', (v) => { it.subtitle = v; }))));
        ebody.append(h('label', { class: 'field', style: 'margin-top:8px' }, 'Dates', input(it.date || '', (v) => { it.date = v; })));
        (it.bullets || []).forEach((b, bi) => {
          ebody.append(h('div', { class: 'bline' },
            h('span', { class: 'dot', 'aria-hidden': 'true' }, '•'),
            area(b.text, (v) => { b.text = v; }, { 'aria-label': 'Bullet', class: 'prose', rows: 1 }),
            h('div', { class: 'tools' },
              iconBtn('Move bullet up', '↑', () => move(it.bullets, bi, -1)),
              iconBtn('Move bullet down', '↓', () => move(it.bullets, bi, 1)),
              iconBtn('Remove bullet', icon('trash', 15), () => remove(it.bullets, bi), 'danger'))));
        });
        ebody.append(h('button', { class: 'btn sm ghost', style: 'margin-top:8px', onclick: () => { snapshot(); (it.bullets ||= []).push({ id: uid(), text: '' }); renderForm(); touch(true); } }, '+ Add bullet'));
        const head = h('span', { class: 'ehead' },
          it.title ? h('b', null, it.title) : h('b', { class: 'faint' }, 'Untitled entry'), it.subtitle ? h('span', { class: 'muted' }, ` · ${it.subtitle}`) : null, it.date ? h('span', { class: 'edate' }, it.date) : null,
          h('span', { class: 'etools' },
            iconBtn('Move entry up', '↑', (e) => { e.preventDefault(); move(sec.items, ii, -1); }),
            iconBtn('Move entry down', '↓', (e) => { e.preventDefault(); move(sec.items, ii, 1); }),
            iconBtn('Remove entry', icon('trash', 15), (e) => { e.preventDefault(); remove(sec.items, ii); }, 'danger')));
        body.append(collapsible(`i:${it.id}`, head, ebody, 'ent2'));
      });

      const addLabel = sec.kind === 'skills' ? '+ Add skill row' : sec.kind === 'summary' ? null : '+ Add entry';
      if (addLabel) body.append(h('button', { class: 'btn sm ghost', style: 'margin-top:10px', onclick: () => {
        snapshot();
        sec.items.push(sec.kind === 'skills' ? { id: uid(), label: '', skills: [] } : { id: uid(), title: '', subtitle: '', date: '', location: '', bullets: [] });
        renderForm(); touch(true);
      } }, addLabel));

      const head = cardHead(KIND_ICON[sec.kind] || 'list', nice(sec.heading || 'Section'), preview(sec), [
        iconBtn('Move section up', '↑', (e) => { e.preventDefault(); e.stopPropagation(); move(state.sections, si, -1); }),
        iconBtn('Move section down', '↓', (e) => { e.preventDefault(); e.stopPropagation(); move(state.sections, si, 1); }),
        iconBtn('Remove section', icon('trash', 15), (e) => { e.preventDefault(); e.stopPropagation(); if (confirm(`Remove the "${sec.heading}" section from this resume?`)) remove(state.sections, si); }, 'danger')],
      (v) => { sec.heading = sec.heading === sec.heading.toUpperCase() ? v.toUpperCase() : v; });
      formHost.append(collapsible(`s:${sec.id}`, head, body, 'csec'));
    });
  }

  function findBullet(itemId, bulletId) {
    for (const s of state.sections) for (const it of s.items) if (it.id === itemId) return (it.bullets || []).find((b) => b.id === bulletId);
    for (const s of state.sections) for (const it of s.items) { const b = (it.bullets || []).find((x) => x.id === bulletId); if (b) return b; }
    return null;
  }

  function accept(sg) {
    const b = findBullet(sg.itemId, sg.bulletId);
    if (!b) { sg.status = 'rejected'; return false; }
    b.text = sg.proposed; sg.status = 'accepted'; return true;
  }
  function renderSugs() {
    clear(sugHost);
    const pending = sugs.filter((x) => x.status === 'pending');
    sugHost.parentElement?.toggleAttribute('hidden', !sugs.length && !autosave);
    if (!sugs.length) {
      sugHost.append(h('p', { class: 'muted small', style: 'margin:0 0 6px' }, 'No rewording suggestions for this job. Your bullets were reordered by relevance.'));
      return;
    }
    if (!pending.length) {
      const acc = sugs.filter((x) => x.status === 'accepted' && findBullet(x.itemId, x.bulletId));
      sugHost.append(h('div', { class: 'sugdone' }, `✓ All suggestions reviewed. ${acc.length ? `${acc.length} accepted, highlighted in green on the right.` : 'You kept your original wording.'}`));
      if (acc.length) sugHost.append(h('div', { class: 'acclist' }, acc.map((x) => h('button', { class: 'accrow', title: 'Show in preview', onclick: () => showInPreview(x.bulletId) },
        h('span', { class: 'accnew' }, x.proposed), h('span', { class: 'accwas' }, 'Was: ', h('del', null, x.original)), h('span', { class: 'accgo' }, 'Show →')))));
      return;
    }
    sugHost.append(h('div', { class: 'row between', style: 'margin-bottom:4px' },
      h('div', null, h('h3', { style: 'margin:0' }, 'Suggested rewordings'), h('div', { class: 'muted small' }, `${pending.length} to review. Same facts and numbers, closer to the job’s wording. Accept only what’s true.`)),
      pending.length > 1 && h('button', { class: 'btn sm', onclick: () => { snapshot(); const miss = pending.filter((x) => !accept(x)).length; flashId = (pending.find((x) => x.status === 'accepted') || {}).bulletId || null; if (miss) toast(`${miss} bullet${miss === 1 ? '' : 's'} no longer exist${miss === 1 ? 's' : ''}, skipped.`, true); renderForm(); renderSugs(); touch(true); } }, 'Accept all')));
    for (const sg of pending) {
      sugHost.append(h('div', { class: 'sug' },
        h('ins', null, sg.proposed),
        h('div', { class: 'was' }, h('span', null, 'Was: '), h('del', null, sg.original)),
        sg.reason && h('div', { class: 'muted small', style: 'margin-top:6px' }, sg.reason),
        h('div', { class: 'row', style: 'margin-top:10px;gap:6px' },
          h('button', { class: 'btn sm primary', onclick: () => {
            snapshot();
            if (!accept(sg)) toast('That bullet no longer exists.', true); else flashId = sg.bulletId;
            renderForm(); renderSugs(); touch(true);
          } }, 'Accept'),
          h('button', { class: 'btn sm ghost', onclick: () => { sg.status = 'rejected'; renderSugs(); touch(false); } }, 'Keep mine'))));
    }
  }

  async function save(quiet) {
    status.textContent = 'Saving…';
    try { await onSave(state, sugs); dirty = false; status.textContent = autosave ? 'All changes saved' : 'Saved'; status.classList.remove('busy'); status.classList.add('ok'); setTimeout(() => status.classList.remove('ok'), 1200); if (!quiet) toast('Saved'); return true; }
    catch (e) { status.textContent = 'Not saved'; toast(e.message, true); return false; }
  }

  root.append(
    h('div', { class: 'sticky-actions row between' },
      h('div', { class: 'edtitle' }, back, title && h('strong', null, title), status),
      h('div', { class: 'row' }, undoBtn,
        !autosave && h('button', { class: 'btn', onclick: () => save() }, 'Save'),
        onDownload && h('button', { class: 'btn primary', onclick: async () => { if (dirty && !(await save(true))) return; await onDownload(); } }, 'Download PDF'))),
    h('div', { class: 'editor' },
      h('div', null, intro, h('div', { class: 'card sugcard' }, sugHost), formHost),
      h('div', { class: 'preview' }, h('div', { class: 'phead' }, h('b', null, h('span', { class: 'livedot' }), 'Live preview'), legend, h('span', { class: 'muted small' }, 'Green highlights are preview only, not in the PDF')), pane)));

  renderForm(); renderSugs(); refreshPreview(); queueMicrotask(fit);
  sugHost.parentElement.hidden = !sugs.length && !autosave;
  if (autosave) {
    // Leaving the page before the autosave fires: save right away so the last edit is not lost.
    const flush = () => { if (dirty) save(true); };
    window.addEventListener('hashchange', flush, { once: true });
    window.addEventListener('beforeunload', (e) => { if (dirty) { flush(); e.preventDefault(); } });
  }
  return { el: root, isDirty: () => dirty };
}
