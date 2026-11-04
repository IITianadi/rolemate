import { h } from './dom.js';
import { api, setToken } from './api.js';
import { brandLogo } from './logo.js';
import { BRAND } from '../brand.js';

let gsiLoad;
const loadGoogle = () => gsiLoad || (gsiLoad = new Promise((res, rej) => {
  const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  sc.onload = res; sc.onerror = () => rej(new Error('blocked')); document.head.append(sc);
}));

export function authView(onDone, { mode: startMode = 'signup', resetToken = '' } = {}) {
  let mode = startMode; // signup | login | forgot | reset
  const host = h('div', { class: 'authwrap' });
  const finish = (r) => { setToken(r.token); if (resetToken) history.replaceState(null, '', location.pathname); onDone(); };
  const googleButton = () => {
    const slot = h('div', { class: 'gslot' });
    (async () => {
      try {
        const { googleClientId } = await api('/api/config');
        if (!googleClientId) return;
        await loadGoogle();
        window.google.accounts.id.initialize({ client_id: googleClientId, callback: async (resp) => {
          try { finish(await api('/api/auth/google', { method: 'POST', body: { credential: resp.credential } })); }
          catch (x) { slot.after(h('div', { class: 'error', role: 'alert' }, x.message)); }
        } });
        window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 340 });
        slot.after(h('div', { class: 'or' }, 'or'));
      } catch { /* Google blocked or offline: email sign-in still works */ }
    })();
    return slot;
  };
  const render = () => {
    host.replaceChildren();
    const err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const note = h('div', { class: 'info', hidden: true });
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com' });
    const pass = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'login' ? 'current-password' : 'new-password', placeholder: mode === 'login' ? 'Your password' : 'At least 8 characters' });
    const label = { signup: 'Create account', login: 'Sign in', forgot: 'Email me a reset link', reset: 'Save new password' }[mode];
    const btn = h('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%' }, label);
    const go = (m) => (e) => { e.preventDefault(); mode = m; render(); };
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.hidden = true; note.hidden = true;
      try {
        if (mode === 'forgot') { await api('/api/auth/forgot', { method: 'POST', body: { email: email.value } }); note.textContent = 'If that email has an account, a reset link is on its way. It works for 1 hour.'; note.hidden = false; btn.disabled = false; return; }
        if (mode === 'reset') { finish(await api('/api/auth/reset', { method: 'POST', body: { token: resetToken, password: pass.value } })); return; }
        finish(await api(`/api/auth/${mode}`, { method: 'POST', body: { email: email.value, password: pass.value } }));
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } }, mode !== 'reset' && h('label', { class: 'field' }, 'Email', email), mode !== 'forgot' && h('label', { class: 'field' }, mode === 'reset' ? 'New password' : 'Password', pass), err, note, btn,
    mode === 'login' && h('a', { href: '#', class: 'small', style: 'text-align:center', onclick: go('forgot') }, 'Forgot password?'));
    const title = { signup: 'Create your account', login: 'Welcome back', forgot: 'Reset your password', reset: 'Choose a new password' }[mode];
    const sub = { signup: 'Free. No card needed.', login: 'Sign in to continue.', forgot: 'Enter your email and we will send you a link.', reset: 'Use at least 8 characters.' }[mode];
    const footer = mode === 'forgot' || mode === 'reset'
      ? h('a', { href: '#', onclick: go('login') }, 'Back to sign in')
      : [mode === 'signup' ? 'Already have an account? ' : 'New here? ', h('a', { href: '#', onclick: go(mode === 'signup' ? 'login' : 'signup') }, mode === 'signup' ? 'Sign in' : 'Create an account')];
    const left = h('div', { class: 'authform' }, h('div', { class: 'auth' },
      h('div', { class: 'logo', style: 'padding-bottom:36px' }, brandLogo({ height: 38, label: BRAND.name })),
      h('h1', null, title), h('p', { class: 'sub' }, sub),
      (mode === 'signup' || mode === 'login') && googleButton(),
      form,
      h('p', { class: 'small muted', style: 'text-align:center;margin-top:22px' }, footer)));
    const card = h('div', { class: 'tag' },
      h('div', { class: 'row between', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('div', null, h('b', null, 'Product Manager'), h('div', { class: 'muted small' }, 'Acme · Bengaluru')), h('span', { class: 'pill strong' }, '87% match')),
      h('div', { class: 'row tight', style: 'margin-top:16px' }, h('span', { class: 'chip good' }, 'Analytics'), h('span', { class: 'chip good' }, 'Roadmaps'), h('span', { class: 'chip warn' }, 'SQL')));
    const right = h('div', { class: 'authpanel' }, h('h2', null, 'Apply smarter. ', h('em', null, 'Not more.')), card);
    host.append(left, right);
  };
  render();
  return host;
}
