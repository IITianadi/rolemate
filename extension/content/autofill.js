// Rolemate autofill: runs inside the application form's page, only after the user opens Rolemate on that tab.
// It reads the form's fields and types the user's own details into them. By design it:
//   - never clicks Submit, Apply, Send or Next, and blocks form submission while it is filling
//   - never touches a file input (the user attaches their tailored resume themselves)
//   - never reads or fills password, captcha, one-time-code or hidden fields
//   - treats everything on the page as data: labels are read, never obeyed
//   - never overwrites something the user already typed
// Page text goes to the side panel only; nothing is sent anywhere from here.
(() => {
  'use strict';
  if (window.__rolemateAF?.version === 2) return;
  const els = new Map(); // field id -> element(s). Ids are per page load.
  let seq = 0;

  const vis = (e) => {
    if (!e || !e.isConnected) return false;
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && e.getAttribute('aria-hidden') !== 'true' && !e.closest('[hidden],[aria-hidden="true"]');
  };
  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  // Text of a label without the controls inside it (a wrapping <label> would otherwise include a select's options).
  const labelText = (l) => {
    if (!l) return '';
    const c = l.cloneNode(true);
    c.querySelectorAll('input, select, textarea, option, button, script, style').forEach((x) => x.remove());
    return txt(c);
  };
  const stripLabel = (s) => s.replace(/\s*[*✱]\s*/g, ' ').replace(/\(?\brequired\b\)?/gi, '').replace(/\s+/g, ' ').trim().slice(0, 300);

  // Hosts we know the structure of. Anything else uses the generic reader. `entry` wraps one question; `label` is its text.
  const ADAPTERS = [
    { name: 'Ashby', host: /ashbyhq\.com$/, entry: '.ashby-application-form-field-entry', label: 'label, legend' },
    { name: 'Lever', host: /lever\.co$/, entry: '.application-question, .custom-question', label: '.application-label, label' },
    { name: 'Greenhouse', host: /greenhouse\.io$/, entry: '.field, .select__container, [class*="field"]', label: 'label, legend' },
  ];
  const adapter = () => ADAPTERS.find((a) => a.host.test(location.hostname)) || null;

  const SKIP_TYPE = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'password', 'search', 'range', 'color']);
  const HONEYPOT = /honeypot|bot-?field|ohnohoney|trap|do-?not-?fill|nope/i;

  const root = () => {
    const forms = [...document.forms].map((f) => [f, [...f.elements].filter((e) => vis(e) && !SKIP_TYPE.has(e.type)).length]).sort((a, b) => b[1] - a[1]);
    return forms[0] && forms[0][1] >= 2 ? forms[0][0] : document.body;
  };

  function labelFor(e, entry) {
    const parts = [];
    const lb = e.getAttribute('aria-labelledby');
    if (lb) parts.push(lb.split(/\s+/).map((id) => txt(document.getElementById(id))).join(' '));
    if (e.id) { try { parts.push(labelText(document.querySelector(`label[for="${CSS.escape(e.id)}"]`))); } catch { /* odd id */ } }
    parts.push(labelText(e.closest('label')));
    if (entry) { const l = entry.querySelector(adapter()?.label || 'label, legend'); if (l && !l.contains(e)) parts.push(labelText(l)); else if (l) parts.push(labelText(l)); }
    parts.push(e.getAttribute('aria-label') || '');
    const fs = e.closest('fieldset'); if (fs) parts.push(txt(fs.querySelector('legend')));
    parts.push(e.getAttribute('placeholder') || '');
    parts.push((e.getAttribute('name') || '').replace(/[_\-[\]]+/g, ' '));
    return stripLabel(parts.find((p) => p && p.trim().length > 1) || '');
  }
  const optionLabel = (inp) => {
    const l = (inp.id && document.querySelector(`label[for="${CSS.escape(inp.id)}"]`)) || inp.closest('label');
    return stripLabel(labelText(l) || inp.value || '');
  };
  const entryOf = (e) => { const a = adapter(); return a ? e.closest(a.entry) : null; };
  const isRequired = (e, label, entry) => e.required || e.getAttribute('aria-required') === 'true' || /[*✱]/.test(txt(entry?.querySelector(adapter()?.label || 'label')) + (e.closest('label') ? labelText(e.closest('label')) : ''));

  // The question for a radio/checkbox group: a fieldset legend, a group label, or the nearest wrapper that has text beyond the options.
  function groupQuestion(group) {
    const first = group[0];
    const fs = first.closest('fieldset'); const lg = fs && fs.querySelector('legend'); if (lg && txt(lg)) return stripLabel(txt(lg));
    const rg = first.closest('[role=radiogroup], [role=group]');
    if (rg) { const lb = rg.getAttribute('aria-labelledby'); const t = lb ? lb.split(/\s+/).map((id) => txt(document.getElementById(id))).join(' ') : rg.getAttribute('aria-label'); if (t && t.trim()) return stripLabel(t); }
    let node = first.parentElement;
    for (let i = 0; node && i < 5; i++, node = node.parentElement) {
      if (!group.every((g) => node.contains(g))) continue;
      const c = node.cloneNode(true);
      c.querySelectorAll('input, select, textarea, option, button, script, style').forEach((x) => x.remove());
      // option labels are text too: drop the ones that belong to this group
      for (const g of group) { const l = (g.id && node.querySelector(`label[for="${CSS.escape(g.id)}"]`)) || g.closest('label'); if (l && l !== node) { const m = [...c.querySelectorAll('label')].find((x) => txt(x) === txt(l)); m?.remove(); } }
      const t = stripLabel(txt(c));
      const own = new Set(group.map(optionLabel));
      if (t.length >= 3 && !own.has(t)) return t.slice(0, 300);
    }
    return '';
  }

  function scan() {
    const a = adapter(); const r = root();
    const fields = []; const seen = new Set();
    const add = (f, nodes) => { const id = `rm${++seq}`; els.set(id, nodes); fields.push({ id, ...f }); };
    const nodes = [...r.querySelectorAll('input, textarea, select, [role=combobox]')];
    for (const e of nodes) {
      if (seen.has(e) || e.disabled || e.closest('[role=search], nav, header, footer')) continue;
      const type = (e.type || '').toLowerCase();
      if (e.tagName === 'INPUT' && SKIP_TYPE.has(type)) continue;
      if (HONEYPOT.test(`${e.name} ${e.id} ${e.className}`) || e.tabIndex === -1 && e.getAttribute('autocomplete') === 'off' && !vis(e)) continue;
      if (e.closest('iframe') || /captcha|recaptcha|turnstile/i.test(`${e.name} ${e.id} ${e.className}`)) continue;
      if (type !== 'file' && !vis(e) && !(type === 'radio' || type === 'checkbox')) continue;
      if (type === 'radio' || type === 'checkbox') {
        const group = e.name ? [...r.querySelectorAll(`input[type=${type}][name="${CSS.escape(e.name)}"]`)] : [e];
        if (group.some((g) => seen.has(g))) continue;
        group.forEach((g) => seen.add(g));
        if (!group.some(vis)) continue;
        const entry = entryOf(e);
        const opts = group.map(optionLabel).filter(Boolean);
        const label = (entry && stripLabel(txt(entry.querySelector(a?.label || 'legend, label')))) || groupQuestion(group) || labelFor(e, entry);
        const single = type === 'checkbox' && group.length === 1;
        add({ label: single ? optionLabel(e) || label : label, kind: single ? 'checkbox' : type === 'radio' ? 'radio' : 'checkbox_group', options: single ? [] : opts, required: group.some((g) => isRequired(g, label, entry)), hasValue: group.some((g) => g.checked) }, group);
        continue;
      }
      seen.add(e);
      const entry = entryOf(e);
      const label = labelFor(e, entry);
      if (type === 'file') { add({ label, kind: 'file', options: [], required: isRequired(e, label, entry), hasValue: !!e.files?.length }, [e]); continue; }
      if (NEVER.test(`${label} ${e.getAttribute('autocomplete') || ''} ${e.name}`)) continue;
      let kind = 'text'; let options = []; const f = {};
      if (e.tagName === 'SELECT') { if (e.multiple) continue; kind = 'select'; options = [...e.options].map((o) => stripLabel(o.text)).filter((o) => o && !/^(select|choose|--)/i.test(o)); }
      else if (e.tagName === 'TEXTAREA') { kind = 'textarea'; }
      else if (e.getAttribute('role') === 'combobox' || e.getAttribute('aria-autocomplete') || e.getAttribute('aria-haspopup') === 'listbox') kind = 'combobox';
      else kind = ({ email: 'email', tel: 'tel', url: 'url', number: 'number', date: 'unsupported', 'datetime-local': 'unsupported', month: 'unsupported', time: 'unsupported', week: 'unsupported' })[type] || 'text';
      if (e.maxLength > 0 && e.maxLength < 100000) f.maxLength = e.maxLength;
      add({ label, kind, options, required: isRequired(e, label, entry), hasValue: !!String(e.value || '').trim(), ...f }, [e]);
    }
    // Yes/No pairs rendered as buttons (Ashby and others): one boolean question each.
    if (a) for (const entry of r.querySelectorAll(a.entry)) {
      const yn = [...entry.querySelectorAll('button')].filter((b) => /^(yes|no)$/i.test(txt(b)) && b.type !== 'submit' && vis(b));
      if (yn.length >= 2 && !entry.querySelector('input[type=radio]')) {
        add({ label: stripLabel(txt(entry.querySelector(a.label))), kind: 'boolean', options: yn.map(txt), required: /[*✱]/.test(txt(entry)), hasValue: yn.some((b) => b.getAttribute('aria-pressed') === 'true' || /active|selected/.test(b.className)) }, yn);
      }
    }
    return fields.filter((f) => f.label);
  }
  const NEVER = /captcha|one[- ]time|\botp\b|verification code|security code|password|passcode|one-time-code/i;

  // What must pause for the user: a visible captcha or a code field. We never solve or read either.
  function pause() {
    const cap = [...document.querySelectorAll('iframe')].some((f) => /captcha|turnstile|hcaptcha/i.test(f.src || '') && vis(f) && f.offsetHeight > 60 && !f.closest('.grecaptcha-badge'));
    if (cap) return 'captcha';
    const otp = [...document.querySelectorAll('input')].some((i) => vis(i) && (i.autocomplete === 'one-time-code' || /otp|verification code|one[- ]time/i.test(`${i.name} ${i.id} ${i.getAttribute('aria-label') || ''}`)));
    return otp ? 'otp' : null;
  }

  function detect() {
    const r = root();
    const ctl = [...r.querySelectorAll('input, textarea, select')].filter((e) => vis(e) && !SKIP_TYPE.has(e.type) && !e.closest('[role=search], nav, header, footer'));
    const has = (re) => ctl.some((e) => re.test(`${e.name} ${e.id} ${e.type} ${e.getAttribute('autocomplete') || ''} ${e.getAttribute('aria-label') || ''} ${e.placeholder || ''} ${txt(e.closest('label'))}`));
    const file = [...r.querySelectorAll('input[type=file]')].some((e) => /resume|cv|pdf|doc/i.test(`${e.accept} ${e.name} ${e.id} ${txt(e.closest('label') || e.parentElement)}`));
    const signals = [has(/e-?mail/i), has(/first.?name|full.?name|\bname\b|given/i), has(/phone|mobile|tel/i), file, !!adapter(), /apply|application/i.test(location.pathname + document.title)].filter(Boolean).length;
    const og = document.querySelector('meta[property="og:site_name"]')?.content || '';
    return { isForm: ctl.length >= 3 && signals >= 3, fields: ctl.length, resumeUpload: file, pause: pause(), ats: adapter()?.name || '', host: location.hostname, title: document.title.slice(0, 200), heading: txt(document.querySelector('h1')).slice(0, 200), site: og.slice(0, 80), top: window === window.top };
  }

  // ---- filling. Values are set the way a user's typing would, so React/Vue forms notice them.
  const setNative = (e, v) => {
    const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v);
    for (const t of ['input', 'change']) e.dispatchEvent(new Event(t, { bubbles: true }));
    e.dispatchEvent(new Event('blur', { bubbles: true }));
  };
  const submitLike = (e) => { const b = e.closest('button, input[type=submit], [role=button]'); return !!b && (b.type === 'submit' || /\b(submit|apply|send|next|continue|finish)\b/i.test(txt(b) || b.value || '')); };
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const click = (e) => { if (submitLike(e)) return false; e.click(); return true; };
  const guard = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fillCombobox(e, value) {
    e.focus(); click(e);
    setNative(e, value);
    for (let i = 0; i < 10; i++) {
      await wait(150);
      const opt = [...document.querySelectorAll('[role=option]')].filter(vis).find((o) => norm(txt(o)) === norm(value)) || [...document.querySelectorAll('[role=option]')].filter(vis).find((o) => norm(txt(o)).includes(norm(value)));
      if (opt) { opt.click(); return true; }
    }
    setNative(e, ''); e.blur();
    return false;
  }

  async function fill(items) {
    const out = [];
    const forms = [...document.forms];
    forms.forEach((f) => f.addEventListener('submit', guard, true));
    try {
      for (const it of items) {
        const nodes = els.get(it.id);
        const value = String(it.value ?? '');
        if (!nodes || !value) { out.push({ id: it.id, ok: false, reason: 'gone' }); continue; }
        const first = nodes[0];
        if (first.type === 'file') { out.push({ id: it.id, ok: false, reason: 'file' }); continue; } // never
        let ok = false;
        try {
          if (it.kind === 'select') {
            const o = [...first.options].find((x) => norm(x.text) === norm(value));
            if (o) { setNative(first, o.value); ok = true; }
          } else if (it.kind === 'radio' || it.kind === 'checkbox_group') {
            const pick = nodes.find((n) => norm(optionLabel(n)) === norm(value));
            if (pick) { if (!pick.checked) click(pick); ok = pick.checked; }
          } else if (it.kind === 'boolean') {
            const b = nodes.find((n) => norm(txt(n)) === norm(value)); if (b) ok = click(b);
          } else if (it.kind === 'checkbox') {
            if (!first.checked) click(first); ok = first.checked;
          } else if (it.kind === 'combobox') {
            ok = await fillCombobox(first, value);
          } else if (it.kind === 'unsupported') {
            ok = false;
          } else {
            const max = first.maxLength > 0 ? first.maxLength : 100000;
            setNative(first, value.slice(0, max)); ok = true;
          }
        } catch { ok = false; }
        out.push({ id: it.id, ok, reason: ok ? '' : 'could not fill' });
      }
    } finally {
      await wait(50);
      forms.forEach((f) => f.removeEventListener('submit', guard, true));
    }
    return out;
  }

  // Outline each field by status so the user sees on the page what to check. Green: filled. Yellow: check. Red: needs you.
  const COLORS = { green: '#1a7f37', yellow: '#b7791f', red: '#d0021b', attach: '#111111' };
  function mark(statuses) {
    for (const [id, st] of Object.entries(statuses)) {
      const nodes = els.get(id); if (!nodes || !COLORS[st]) continue;
      for (const n of nodes) { if (n.dataset) n.dataset.rolemate = st; n.style.setProperty('outline', `2px solid ${COLORS[st]}`, 'important'); n.style.setProperty('outline-offset', '2px', 'important'); }
    }
  }
  function unmark() {
    for (const nodes of els.values()) for (const n of nodes) if (n.dataset?.rolemate) { delete n.dataset.rolemate; n.style.removeProperty('outline'); n.style.removeProperty('outline-offset'); }
  }
  function focusField(id) {
    const n = els.get(id)?.[0]; if (!n) return false;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    n.animate?.([{ outlineOffset: '2px' }, { outlineOffset: '8px' }, { outlineOffset: '2px' }], { duration: 700 });
    if (n.type !== 'file') n.focus?.({ preventScroll: true });
    return true;
  }

  // Tell the panel when the form changes (a next step, a field that appears) so it can offer to read it again.
  let last = 0; let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const n = [...document.querySelectorAll('input, textarea, select')].filter((e) => !SKIP_TYPE.has(e.type) && vis(e)).length;
      if (n !== last) { last = n; try { chrome.runtime.sendMessage({ type: 'rm:changed', fields: n }); } catch { /* panel closed */ } }
    }, 700);
  }).observe(document.body, { childList: true, subtree: true });
  last = [...document.querySelectorAll('input, textarea, select')].filter((e) => !SKIP_TYPE.has(e.type) && vis(e)).length;

  window.__rolemateAF = { version: 2, detect, scan, fill, mark, unmark, focus: focusField };
})();
