// Talks to the user's Rolemate account. The sign-in token is the one the popup stores; it never leaves chrome.storage.local
// except as the Authorization header to Rolemate's own server. No model key lives in the extension: drafting goes through the server.
export const DEFAULT_SERVER = 'https://app.rolemate.in';
export const store = {
  get: () => chrome.storage.local.get({ token: '', email: '', server: DEFAULT_SERVER }),
  set: (v) => chrome.storage.local.set(v),
};

export async function callApi(path, { method = 'GET', body } = {}) {
  const { token, server } = await store.get();
  let res;
  try {
    res = await fetch((server || DEFAULT_SERVER) + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error('Can’t reach Rolemate. Check your internet connection and try again.'), { network: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}). Try again.`), { status: res.status, data });
  return data;
}

export async function downloadResume(id) {
  const { token, server } = await store.get();
  let res;
  try { res = await fetch(`${server || DEFAULT_SERVER}/api/resumes/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }); } catch { throw new Error('Can’t reach Rolemate. Check your connection and try again.'); }
  if (!res.ok) throw new Error('Couldn’t make the PDF. Try again, or download it from your dashboard.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'resume.pdf';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
