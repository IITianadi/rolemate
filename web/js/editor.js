// Resume editor: edit text, remove/reorder bullets, accept AI rewrites, live preview.
// Used for tailored resumes and for the master resume on the Profile page.
import { h, append, clear, debounce, toast } from './dom.js';
import { apiText } from './api.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (x) => JSON.parse(JSON.stringify(x));

export function resumeEditor({ resume, suggestions = [], onSave, onDownload, aiEnabled = false, title = '' }) {
  let state = clone(resume);
  let sugs = clone(suggestions);
  const history = [];
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
  const status = h('span', { class: 'muted small' }, 'Saved');
  const undoBtn = h('button', { class: 'btn sm ghost', disabled: true, onclick: undo }, '↶ Undo');

  const refreshPreview = debounce(async () => {
    try { frame.srcdoc = await apiText('/api/preview', { method: 'POST', body: { resume: state } }); } catch { /* keep the last preview */ }
  }, 450);

  function touch(structural) {
    dirty = true; status.textContent = 'Unsaved changes';
    if (structural) { undoBtn.disabled = false; }
    refreshPreview();
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
  const collapsible = (open, head, body, cls = '') => {
    const d = h('details', { class: cls }); if (open) d.open = true;
    d.append(h('summary', null, head), body);
    d.addEventListener('toggle', () => d.querySelectorAll('textarea').forEach(grow));
    return d;
  };

  function renderForm() {
    clear(formHost);
    const hdr = h('div', { class: 'cbody' },
      h('label', { class: 'field' }, 'Name', input(state.header.name, (v) => { state.header.name = v; })),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Contact lines (one per line)',
        area(state.header.lines.join('\n'), (v) => { state.header.lines = v.split('\n').map((x) => x.trim()).filter(Boolean); }, { rows: 3 })));
    formHost.append(collapsible(false, h('span', { class: 'ctitle' }, 'Contact information'), hdr, 'csec'));

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
              iconBtn('Remove bullet', '🗑', () => remove(it.bullets, bi), 'danger'))));
        });
        ebody.append(h('button', { class: 'btn sm ghost', style: 'margin-top:8px', onclick: () => { snapshot(); (it.bullets ||= []).push({ id: uid(), text: '' }); renderForm(); touch(true); } }, '+ Add bullet'));
        const head = h('span', { class: 'ehead' },
          h('b', null, it.title || 'Untitled'), it.subtitle ? h('span', { class: 'muted' }, ` · ${it.subtitle}`) : null,
          h('span', { class: 'etools' },
            iconBtn('Move entry up', '↑', (e) => { e.preventDefault(); move(sec.items, ii, -1); }),
            iconBtn('Move entry down', '↓', (e) => { e.preventDefault(); move(sec.items, ii, 1); }),
            iconBtn('Remove entry', '🗑', (e) => { e.preventDefault(); remove(sec.items, ii); }, 'danger')));
        body.append(collapsible(ii === 0, head, ebody, 'ent2'));
      });

      const addLabel = sec.kind === 'skills' ? '+ Add skill row' : sec.kind === 'summary' ? null : '+ Add entry';
      if (addLabel) body.append(h('button', { class: 'btn sm ghost', style: 'margin-top:10px', onclick: () => {
        snapshot();
        sec.items.push(sec.kind === 'skills' ? { id: uid(), label: '', skills: [] } : { id: uid(), title: '', subtitle: '', date: '', location: '', bullets: [] });
        renderForm(); touch(true);
      } }, addLabel));

      const head = h('span', { class: 'shead' },
        h('span', { class: 'ctitle' }, sec.heading || 'Section'),
        h('span', { class: 'etools' },
          iconBtn('Move section up', '↑', (e) => { e.preventDefault(); move(state.sections, si, -1); }),
          iconBtn('Move section down', '↓', (e) => { e.preventDefault(); move(state.sections, si, 1); }),
          iconBtn('Remove section', '🗑', (e) => { e.preventDefault(); if (confirm(`Remove the "${sec.heading}" section from this resume?`)) remove(state.sections, si); }, 'danger')));
      const headingEdit = h('label', { class: 'field small', style: 'margin-top:14px' }, 'Rename this section', input(sec.heading, (v) => { sec.heading = v; }, { 'aria-label': 'Section heading' }));
      body.append(headingEdit);
      formHost.append(collapsible(si < 2, head, body, 'csec'));
    });
  }

  function findBullet(itemId, bulletId) {
    for (const s of state.sections) for (const it of s.items) if (it.id === itemId) return (it.bullets || []).find((b) => b.id === bulletId);
    for (const s of state.sections) for (const it of s.items) { const b = (it.bullets || []).find((x) => x.id === bulletId); if (b) return b; }
    return null;
  }

  function renderSugs() {
    clear(sugHost);
    const pending = sugs.filter((s) => s.status === 'pending');
    if (!suggestions.length && !sugs.length) {
      sugHost.append(h('p', { class: 'muted small' }, aiEnabled ? 'No rewording suggestions for this job.' : 'AI rewording suggestions are off on this server. Your bullets were reordered by relevance instead.'));
      return;
    }
    sugHost.append(h('h3', null, `Suggested rewordings (${pending.length})`));
    sugHost.append(h('p', { class: 'muted small' }, 'These reuse the job’s wording for work you already described. Numbers are never changed. Accept only what is true.'));
    for (const s of pending) {
      sugHost.append(h('div', { class: 'sug' },
        h('del', null, s.original), h('ins', null, s.proposed),
        s.reason && h('div', { class: 'muted small', style: 'margin-top:4px' }, s.reason),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn sm primary', onclick: () => {
            const b = findBullet(s.itemId, s.bulletId);
            if (!b) { toast('That bullet no longer exists.', true); s.status = 'rejected'; renderSugs(); return; }
            snapshot(); b.text = s.proposed; s.status = 'accepted'; renderForm(); renderSugs(); touch(true);
          } }, 'Accept'),
          h('button', { class: 'btn sm', onclick: () => { s.status = 'rejected'; renderSugs(); touch(false); } }, 'Reject'))));
    }
  }

  async function save() {
    status.textContent = 'Saving…';
    try { await onSave(state, sugs); dirty = false; status.textContent = 'Saved'; toast('Saved'); return true; }
    catch (e) { status.textContent = 'Not saved'; toast(e.message, true); return false; }
  }

  root.append(
    h('div', { class: 'sticky-actions row between' },
      h('div', { class: 'row' }, title && h('strong', null, title), status),
      h('div', { class: 'row' }, undoBtn,
        h('button', { class: 'btn', onclick: save }, 'Save'),
        onDownload && h('button', { class: 'btn primary', onclick: async () => { if (dirty && !(await save())) return; await onDownload(); } }, 'Download PDF'))),
    h('div', { class: 'editor' },
      h('div', null, sugHost, formHost),
      h('div', { class: 'preview' }, h('div', { class: 'phead' }, h('b', null, 'Live preview'), h('span', { class: 'muted small' }, 'Exactly what the PDF will look like')), pane)));

  renderForm(); renderSugs(); refreshPreview(); queueMicrotask(fit);
  return { el: root, isDirty: () => dirty };
}
