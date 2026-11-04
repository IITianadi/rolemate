// Plain, table-free HTML with inline styles so it renders in every mail app. Each builder returns { subject, html, text }.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const shell = (title, bodyHtml, cta) => `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1b19">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-size:20px;font-weight:700;margin-bottom:20px">Rolemate</div>
<div style="background:#fff;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 14px">${esc(title)}</h1>
${bodyHtml}
${cta ? `<p style="margin:24px 0 4px"><a href="${esc(cta.url)}" style="background:#1c1b19;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${esc(cta.label)}</a></p>` : ''}
</div>
<p style="font-size:12px;color:#77746d;margin:16px 4px">Rolemate · rolemate.in · Questions? Just reply to this email.</p>
</div></body></html>`;

const p = (t) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${t}</p>`;

export function welcomeEmail({ appUrl, freeCredits = 50 }) {
  const subject = 'You’re signed up to Rolemate';
  return {
    subject,
    html: shell('You’re signed up', p('Welcome to Rolemate. Your account is ready.') + p(`You have <b>${freeCredits} free credits</b>. One credit covers one job, from saving it to tailoring your resume, interview prep and chat.`) + p('A short guide on how to use the dashboard for your job hunt follows in a few minutes.'), { label: 'Open your dashboard', url: appUrl }),
    text: `You're signed up to Rolemate.\n\nYou have ${freeCredits} free credits. One credit covers one job.\nA short guide follows in a few minutes.\n\nOpen your dashboard: ${appUrl}\n`,
  };
}

export function guideEmail({ appUrl, siteUrl }) {
  const steps = [
    ['Upload your resume once', 'Rolemate reads it and keeps your layout. Check the details it found, then confirm.'],
    ['Install the Chrome extension', `Get it from ${siteUrl}. Pin it so it is one click away.`],
    ['Open a job and click the extension', 'LinkedIn, Naukri or any careers page. The job, company and logo are saved to your tracker.'],
    ['See your match and gaps', 'Required skills you are missing are listed. Confirm the ones you really have and the score updates.'],
    ['Download the tailored resume', 'Same layout, wording adjusted to the job. Nothing you have not done is ever added.'],
    ['Track, prepare, apply', 'Move the job through stages, read the interview prep, and press apply yourself.'],
  ];
  const subject = 'Quick guide: using Rolemate for your job hunt';
  return {
    subject,
    html: shell('Quick guide to Rolemate', p('Six steps, about five minutes the first time.') + `<ol style="padding-left:20px;margin:0">${steps.map(([a, b]) => `<li style="font-size:15px;line-height:1.5;margin:0 0 10px"><b>${esc(a)}.</b> ${esc(b)}</li>`).join('')}</ol>`, { label: 'Start with your resume', url: appUrl }),
    text: `Quick guide to Rolemate\n\n${steps.map(([a, b], i) => `${i + 1}. ${a}. ${b}`).join('\n')}\n\nStart: ${appUrl}\n`,
  };
}

export function resetEmail({ url }) {
  const subject = 'Reset your Rolemate password';
  return {
    subject,
    html: shell('Reset your password', p('We got a request to reset the password for your Rolemate account. The link works once and expires in 1 hour.') + p('If you did not ask for this, ignore this email. Your password stays the same.'), { label: 'Choose a new password', url }),
    text: `Reset your Rolemate password.\n\nOpen this link (works once, expires in 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email.\n`,
  };
}
