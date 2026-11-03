# Chrome Web Store submission

Build the upload file: `npm run ext:zip` (creates `rolemate-extension.zip`, not committed).
Developer account: https://chrome.google.com/webstore/devconsole (one-time $5 fee, sign in with the account that should own the listing).

## Listing
- **Name:** Rolemate
- **Summary (max 132 chars):** Capture a job page, see how well your resume matches, and get a tailored resume PDF.
- **Category:** Productivity
- **Language:** English
- **Privacy policy URL:** https://rolemate.in/privacy
- **Website:** https://rolemate.in
- **Support:** hello@rolemate.in

**Description:**
Rolemate helps you apply with a resume that fits each job.
Open a job on LinkedIn, Naukri or any company careers page, click the extension, and Rolemate saves the job to your dashboard, shows how well your resume matches, and prepares a tailored version of your resume in your own layout.
- Saves the job, company, logo and where it was posted
- Match score and the skills you are missing
- Tailored resume that keeps your layout and never adds experience you do not have
- Interview prep and questions you can ask about the job
You press apply yourself. Rolemate never submits anything for you.
Requires a free Rolemate account at app.rolemate.in.

## Single purpose (the form asks for this)
Save the job page the user is viewing to their Rolemate account so a tailored resume can be prepared for it.

## Permission justifications
- **activeTab:** reads the job page the user is looking at, only when they click the extension icon.
- **scripting:** runs the page reader on that tab at the moment of the click, to extract the job text, title, company and logo.
- **storage:** keeps the user's sign-in token on their device so they stay signed in.
- **Host permission https://app.rolemate.in/*:** sends the captured job to the user's own Rolemate account and signs them in.
- **Remote code:** none. All code ships inside the package.

## Privacy practices tab
- Data collected: authentication information (email, through sign-in), website content (the job page text the user captures).
- Not sold, not used for advertising or creditworthiness, not transferred beyond providing the service.
- Tick all three certifications (no sale, no unrelated use, no creditworthiness use).

## Assets you must supply
- At least one screenshot, 1280x800 (capture the popup on a job page and the dashboard job screen).
- Small promo tile 440x280 (optional but recommended).
- Icon 128x128: already in the package.

## Before you submit
1. Fill `legalName` and `address` in `web/brand.js` (the privacy page shows them), then deploy the site.
2. Open https://rolemate.in/privacy and confirm it loads.
3. Submit. First review usually takes a few days, sometimes longer.
