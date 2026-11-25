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
Open a job on LinkedIn, Naukri, Indeed or one of 50 supported job sites and company career pages (Greenhouse, Lever, Workday, Darwinbox, Keka and more), click the extension, and Rolemate saves the job to your dashboard, shows how well your resume matches, and prepares a tailored version of your resume in your own layout.
- Saves the job, company, logo and where it was posted
- Match score and the skills you are missing
- Tailored resume that keeps your layout and never adds experience you do not have
- Interview prep and questions you can ask about the job
- Fills in the application form: open the company's form, click Rolemate, and your details are typed in. One click fills the whole form from your profile and resume, and the panel shows only what needs your attention. Works for jobs you have saved in Rolemate. Sensitive questions are always yours to answer.
Rolemate never uploads files, solves captchas or presses Apply. You attach your tailored resume and press apply yourself.
Requires a free Rolemate account at app.rolemate.in.

## Single purpose (the form asks for this)
Help the user apply to a job with a resume that fits it: save the job page they are viewing to their Rolemate account for a tailored resume, and fill in the details on that job's application form from their Rolemate profile, leaving the final submit to the user.

## Permission justifications
- **activeTab:** reads the page the user is looking at (a job page, or an application form), only when they click the extension icon.
- **scripting:** runs the page reader on that tab at the moment of the click: to extract the job text, title, company and logo, or to read the form's questions and type the user's own details into them. It never clicks Submit, Apply or Next, never uploads a file and never touches password, captcha or code fields.
- **sidePanel:** shows the application form's questions and what was filled (green, yellow, red) beside the page, so the user can review, answer and approve.
- **storage:** keeps the user's sign-in token on their device so they stay signed in.
- **Host permission https://app.rolemate.in/*:** sends the captured job to the user's own Rolemate account and signs them in.
- **Remote code:** none. All code ships inside the package.

## Privacy practices tab
- Data collected: authentication information (email, through sign-in), website content (the job page text the user captures, and the questions on an application form the user opens the extension on), personally identifiable information (the details the user adds to their profile for forms, such as phone, city, notice period, expected pay and, only if they opt in, answers to sensitive questions).
- Not sold, not used for advertising or creditworthiness, not transferred beyond providing the service.
- Tick all three certifications (no sale, no unrelated use, no creditworthiness use).

## Assets you must supply
- At least one screenshot, 1280x800 (capture the popup on a job page and the dashboard job screen).
- Small promo tile 440x280 (optional but recommended).
- Icon 128x128: already in the package.

## Review risk to prepare for
Autofill is the most scrutinised thing the extension does. Be ready to explain: it runs only after the user clicks (activeTab), it fills the user's own data, it never submits or uploads, and it does not run in the background. The Web Store may ask for a short video of the flow. A privacy policy that names application details and form questions (already in rolemate.in/privacy) is required.

## Before you submit
1. Fill `legalName` and `address` in `web/brand.js` (the privacy page shows them), then deploy the site.
2. Open https://rolemate.in/privacy and confirm it loads.
3. Submit. First review usually takes a few days, sometimes longer.
