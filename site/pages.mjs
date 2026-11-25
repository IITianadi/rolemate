// Website content. Bodies are functions of the build context: { B (brand), u(slug) (link to a page), demo, shot(name) }.
// Rules for the copy: say only what the product does today, no invented numbers, no testimonials, no guarantees about ATS or hiring.

const check = '<span class="tick" aria-label="Included">✓</span>';
const dash = '<span class="dash" aria-label="Not included">–</span>';

const waitlist = (c, source) => `<form class="waitlist" data-endpoint="${c.waitlistUrl}" data-source="${source}" novalidate>
  <label class="hp" aria-hidden="true">Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
  <input type="email" name="email" placeholder="you@example.com" aria-label="Email address" autocomplete="email" required>
  <button class="btn primary" type="submit">Join the waitlist</button>
  <div class="msg" role="status" aria-live="polite" style="flex-basis:100%"></div>
</form>`;

const faqItems = (c) => [
  ['Does it fill in application forms? Does it apply for me?', 'It fills in the details on an application form from your Rolemate profile and the answers you have saved. It never uploads a file, never solves a captcha and never presses Apply. You attach your tailored resume and press apply yourself, so every application is one you chose.'],
  ['What does the extension do on an application form?', 'When you open it on a form and choose Fill the form, it reads that form\u2019s questions, shows what it can fill, and fills only when you press Fill. Questions it cannot answer, and sensitive ones such as gender, disability or race, are left for you. Anything you answer can be saved for your next applications.'],
  ['Will it change my resume layout?', 'It reads your own resume and rebuilds it with the same headings, order, bullets and date style. It then reorders bullets and skills so the most relevant ones come first. Colours and hyperlinks are not reproduced yet, so check the preview before you send.'],
  ['Does it invent experience or skills?', 'No. It only reorders, highlights numbers and adds a skill you have confirmed yourself. Nothing is written into your resume that you have not approved.'],
  ['Which job sites does the extension work on?', '50 of the job sites people in India use most: LinkedIn jobs and hiring posts, Naukri, Indeed, foundit, Instahyre, IIMJobs and others, plus company career pages on Greenhouse, Lever, Workday, Darwinbox, Keka and similar systems. On any other site, paste the description straight into the dashboard.'],
  ['Does it guarantee that I will pass an ATS or get shortlisted?', 'No tool can promise that. The match score compares your resume with the job description. It tells you which required skills your resume does and does not mention. How a recruiter or a company\'s system ranks you is outside our control.'],
  ['What does the AI do, and what happens without it?', 'AI reads the job posting, helps write your interview prep and answers your questions in Ask AI. The match score and tailoring follow fixed rules, so they never add anything to your resume that is not already there.'],
  ['What happens to my resume and data?', 'Your resume and jobs are stored against your account so the dashboard can show them. You can export everything or delete your account from Settings. See the privacy policy for details.'],
  ['What does it cost?', 'Every account starts with 50 free credits. One credit covers one job: saving it, tailoring your resume, interview prep and Ask AI for that job. When they run out you can buy more in packs, for example 100 credits for ₹499. It is a one-time payment, not a subscription, and credits do not expire.'],
];

export const PAGES = [
  {
    slug: 'index', nav: false, title: (B) => `${B.name}: tailor your resume to every job`, desc: 'A Chrome extension and dashboard that tailors your resume to each job in your own layout, shows missing skills and prepares you for the interview.',
    schema: (c) => [{ '@type': 'SoftwareApplication', name: c.B.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Chrome', description: c.B.description, offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'INR', name: '50 free credits' }, { '@type': 'Offer', price: '199', priceCurrency: 'INR', name: '30 credits' }, { '@type': 'Offer', price: '499', priceCurrency: 'INR', name: '100 credits' }, { '@type': 'Offer', price: '1299', priceCurrency: 'INR', name: '300 credits' }] }],
    body: (c) => `
<div class="wrap hero">
  <div class="copy">
    <h1>Apply with a resume that fits every&nbsp;job.</h1>
    <p class="lead">Open a job. ${c.B.name} measures it against your resume, shows what is missing, and cuts a tailored copy in your own layout, with an interview brief for that company. You stay in control and press apply yourself.</p>
    <div class="row"><a class="btn primary lg" href="#waitlist">Join the waitlist</a>${c.demo ? `<a class="btn lg" href="${c.demo}" target="_blank" rel="noopener">Try the live demo</a>` : `<a class="btn lg" href="${c.u('how-it-works')}">See how it works</a>`}</div>
    <p class="fine-line"><b>50 free credits</b> to start. No card needed.</p>
  </div>
  <div class="mod proof" role="group" aria-label="A sample job: 79 percent fit, one missing skill, and six pipeline stages.">
    <span class="tab">Fit</span>
    <div class="role"><b>Senior Backend Engineer</b><span>Acme Payments · Sample job</span></div>
    <span class="fitnum">79<small>%</small></span>
    <div class="meter" aria-hidden="true"><i style="width:79%"></i></div>
    <div class="meter-key"><span>0</span><span><b>75%</b> is a good score to apply at</span><span>100</span></div>
    <p class="missing"><b>Missing:</b> Kubernetes</p>
    <div class="pipe" aria-label="Pipeline stages">
      <div>Saved<b>2</b></div><div>Applied<b>1</b></div><div>Screening call<b>1</b></div><div>Interview<b>1</b></div><div class="dim">Offer<b>0</b></div><div>Rejected<b>1</b></div>
    </div>
    <p class="sample">Sample data from the live dashboard demo.</p>
  </div>
</div>
<section class="block top"><div class="wrap">
  <p class="statement">A job description is a checklist. <span>Most people send the same resume to every one of them.</span></p>
  <div class="grid3" style="margin-top:36px">
    <div class="mod"><span class="tab">Gap</span><h3>You can't see the gap</h3><p>Is Kubernetes a must-have or a nice-to-have? Do you mention it at all? Reading ten descriptions closely takes an evening.</p></div>
    <div class="mod"><span class="tab">Layout</span><h3>Templates rebuild your look</h3><p>Generic resume builders swap your layout for theirs. Then you re-do the formatting you already trust.</p></div>
    <div class="mod"><span class="tab">Tracking</span><h3>Applications go quiet</h3><p>A spreadsheet of links will not tell you what you sent where, or what to prepare before the call.</p></div>
  </div>
</div></section>
<section class="block"><div class="wrap">
  <div class="sechead"><h2>From job post to ready in four steps</h2><p>Each step is something you can see and change.</p></div>
  <div class="grid4">
    <div class="mod step"><span class="tab">Capture</span><span class="no">1</span><p>Capture a job page or a LinkedIn hiring post. We read what it asks for and split must-haves from nice-to-haves.</p></div>
    <div class="mod step"><span class="tab">Tailor</span><span class="no">2</span><p>Your resume is read once, layout and all. Relevant bullets come forward and your numbers are highlighted. Nothing is invented.</p></div>
    <div class="mod step"><span class="tab">Confirm</span><span class="no">3</span><p>Confirm a skill you really have and it is added to your profile and every future resume. Edit anything in the live preview.</p></div>
    <div class="mod step"><span class="tab">Prepare</span><span class="no">4</span><p>Download a clean PDF, then walk in prepared: likely questions with answers drafted from your own resume.</p></div>
  </div>
</div></section>
<section class="block"><div class="wrap">
  <div class="sechead"><h2>Every job in one place, every score explained</h2><p>A tracker with a fit score you can read, the exact gaps, and the tailored resume attached to each role.</p></div>
  <div class="shots">
    <figure class="frame"><img src="${c.asset('shot-job.jpg')}" width="1280" height="820" alt="The job page: a 79 percent fit in red with a bar and a 75 percent tick, the reasons behind the score, and a tailored resume ready to download."><figcaption>One job: fit, what is missing, tailored resume</figcaption></figure>
    <figure class="frame"><img src="${c.asset('shot-board.jpg')}" width="1280" height="820" alt="The Jobs screen: the next action, applications this week, stage counts and a table of jobs with fit bars and what is missing."><figcaption>All jobs: next action, stages, fit at a glance</figcaption></figure>
  </div>
  <p class="cap">Screens from the live demo with sample data.</p>
</div></section>
<section class="block"><div class="wrap">
  <div class="sechead"><h2>Three things ${c.B.name} will never do</h2><p>A tool that touches your job search should be clear about its limits.</p></div>
  <div class="grid3">
    <div class="mod ink"><span class="tab">Never</span><h3>Press apply for you</h3><p>It can fill in your details on an application form. It never uploads a file or submits anything: you attach your tailored resume and press apply, so every application is one you chose.</p></div>
    <div class="mod ink"><span class="tab">Never</span><h3>Invent a skill</h3><p>Tailoring reorders and highlights what is true. A skill is added only after you confirm it.</p></div>
    <div class="mod ink"><span class="tab">Never</span><h3>Promise a job</h3><p>The score compares your resume with the description. It cannot predict what a recruiter will do, and we will not pretend it can.</p></div>
  </div>
</div></section>
<section class="block"><div class="wrap">
  <div class="sechead"><h2>Start free. Pay when your search gets busy.</h2><p>One credit is one job. One-time payment, no subscription, credits never expire.</p></div>
  <div class="grid4">
    <div class="mod plan"><span class="tab">Free</span><div class="price">₹0</div><p>50 credits when you sign up. No card needed.</p></div>
    <div class="mod plan"><span class="tab">30 credits</span><div class="price">₹199</div><p>₹6.6 per job.</p></div>
    <div class="mod plan ink"><span class="tab">100 credits</span><div class="price">₹499</div><p>₹5 per job.</p></div>
    <div class="mod plan"><span class="tab">300 credits</span><div class="price">₹1,299</div><p>₹4.3 per job.</p></div>
  </div>
  <p style="margin-top:18px"><a href="${c.u('pricing')}">See pricing in full</a></p>
</div></section>
<section class="block"><div class="wrap">
  <div class="mod ink" style="display:grid;gap:14px;max-width:820px"><span class="tab">Free tool</span><h2>Check your resume against a job right now</h2><p>Paste both and see which required skills your resume mentions. It runs in your browser: nothing you paste is uploaded.</p><div><a class="btn primary" href="${c.u('tools/resume-keyword-checker')}">Open the keyword checker</a></div></div>
</div></section>
<section class="block" id="waitlist"><div class="wrap">
  <div class="band">
    <span class="tab">Early access</span>
    <h2>Be first through the door.</h2>
    <p>We are letting people in gradually. Leave your email and we will write when your spot is ready. One email, no spam, and you can leave any time.</p>
    ${waitlist(c, 'home')}
  </div>
</div></section>`,
  },
  {
    slug: 'how-it-works', nav: 'How it works', title: () => 'How it works: capture a job, tailor your resume', desc: 'Upload your resume once, capture any job with the extension, review the score and gaps, download a tailored PDF, fill in the application form and prepare for the interview.',
    body: (c) => `
<div class="wrap narrow"><div class="pagehead"><h1>How it works</h1><p class="lead">Seven small steps. The first takes a minute, the rest repeat for every job.</p></div><div class="prose" style="padding-bottom:100px">
  <h2>1. Upload your resume</h2><p>Upload a PDF, DOCX or text file. We read the layout: headings, bullet style, date format, fonts and spacing. Your profile (name, contact details, experience, skills) is built from it, so there is no long form to fill. You confirm what we found and fix anything that is off.</p>
  <h2>2. Capture a job</h2><p>Open a job page or a LinkedIn hiring post and click the extension. It reads the visible text, finds the title and company, and sends it to your dashboard. You can also paste a description directly into the dashboard. Capturing the same job twice updates it rather than adding a duplicate.</p>
  <h2>3. See the match and the gaps</h2><p>The score is built from four checks with fixed weights: required skills, nice-to-have skills, years of experience and role similarity. Each missing skill is listed. If you do have one, confirm it and it is saved to your profile, the score updates, and the skill is added to future tailored resumes.</p>
  <div class="callout">We never add a skill you have not confirmed. The tailoring step only reorders, highlights and uses what is already true.</div>
  <h2>4. Tailor and download</h2><p>A tailored copy keeps your layout and puts the most relevant bullets first, highlights your numbers and moves matching skills forward. Edit anything in the dashboard, see the live preview and download the PDF. The PDF is plain, selectable text, which is what applicant tracking systems read best.</p>
  <h2>5. Fill in the application form</h2><p>Open the company\u2019s application form, click the extension and choose Fill the form. A side panel lists every question on the form in three colours: green is filled from your profile, yellow is worth a check, red needs you. Nothing is typed until you press Fill, and you can see each field on the page. Questions with no saved answer can be answered in the panel and saved for next time, and a free-text question can be drafted from your resume and the job for you to edit and approve. Sensitive questions are always yours to answer, unless you turn on filling them in your profile.</p>
  <div class="callout">The extension never uploads your resume, never solves a captcha or reads a verification code, and never presses Apply. It shows which tailored resume to attach, and you attach it and press apply yourself. Then you tell Rolemate, and it tracks the application and reminds you to follow up a week later.</div>
  <h2>6. Prepare for the interview</h2><p>Each job gets a brief: what they are looking for, where you are strong, gaps and how to frame them honestly, and likely questions with answers drafted from your resume. With AI on, it also researches the company and cites its sources. These are predictions, not what you will definitely be asked.</p>
  <h2>7. Track it</h2><p>Move the job through Saved, Applied, Screening call, Interview and Offer. Notes and the tailored resume stay with the job, so you know exactly what you sent.</p>
  <p><a class="btn primary" href="${c.u('index')}#waitlist">Join the waitlist</a></p>
</div></div>`,
  },
  {
    slug: 'pricing', nav: 'Pricing', title: () => 'Pricing: 50 free credits, then pay as you go', desc: 'Start with 50 free credits. One credit covers one job. Buy more in packs from ₹199. One-time payment, no subscription.',
    body: (c) => `
<div class="wrap" style="padding-bottom:100px">
  <div class="pagehead"><h1>Simple pricing</h1><p class="lead">Start free with 50 credits. One credit covers one job. Pay only when you need more. Prices are in rupees and include GST.</p></div>
  <div class="grid">
    <div class="mod plan"><span class="tab">Free</span><h3>Free</h3><div class="price">₹0</div><p class="muted">50 credits when you sign up.</p><ul class="prose"><li>Match score and skill gaps</li><li>Tailored resume in your own layout</li><li>Interview prep and Ask AI for each job</li><li>Job board, notes, resume editor and PDF</li></ul><a class="btn primary" href="${c.u('index')}#waitlist">Get started</a></div>
    <div class="mod plan ink"><span class="tab">Best value</span><h3>100 credits</h3><div class="price">₹499</div><p class="muted">₹5 per job. One-time payment.</p><ul class="prose"><li>Everything in Free</li><li>Credits never expire</li><li>No subscription, nothing to cancel</li></ul></div>
    <div class="mod plan"><span class="tab">Short search</span><h3>30 credits</h3><div class="price">₹199</div><p class="muted">₹6.6 per job. For a short search.</p></div>
    <div class="mod plan"><span class="tab">Busy search</span><h3>300 credits</h3><div class="price">₹1,299</div><p class="muted">₹4.3 per job. For a long, busy search.</p></div>
  </div>
  <h2 style="margin-top:56px;margin-bottom:8px">Questions about pricing</h2>
  <details><summary>What is a credit?</summary><p>One credit is one job. It covers saving the job, the match score, your tailored resume, interview prep and Ask AI for that job. Tailoring the same job again does not use another credit.</p></details>
  <details><summary>Do I need a card for the free credits?</summary><p>No.</p></details>
  <details><summary>Do credits expire?</summary><p>No. Buy a pack once and use it at your own pace.</p></details>
  <details><summary>Is it a subscription?</summary><p>No. Each pack is a single payment. Nothing renews. See the <a href="${c.u('refund')}">refund policy</a>.</p></details>
</div>`,
  },
  {
    slug: 'faq', nav: 'FAQ', title: () => 'FAQ: privacy, AI, supported sites and limits', desc: 'Answers about what the extension does, what it never does, which sites it supports, how AI is used, pricing and your data.',
    schema: (c) => [{ '@type': 'FAQPage', mainEntity: faqItems(c).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
    body: (c) => `<div class="wrap narrow" style="padding-bottom:100px"><div class="pagehead"><h1>Frequently asked questions</h1></div>${faqItems(c).map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
  <p style="margin-top:32px" class="muted">Something missing? Email <a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a>.</p></div>`,
  },
  {
    slug: 'tools/resume-keyword-checker', nav: 'Free checker', title: () => 'Free resume keyword checker for any job description', desc: 'Paste your resume and a job description to see which required skills your resume mentions and which are missing. Runs in your browser; nothing is uploaded.',
    schema: (c) => [{ '@type': 'WebApplication', name: 'Resume keyword checker', applicationCategory: 'BusinessApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' }, url: c.abs('tools/resume-keyword-checker') }],
    extraHead: (c) => '', script: 'checker',
    body: (c) => `
<div class="wrap narrow" style="padding-bottom:100px">
  <div class="pagehead"><div class="crumbs"><a href="${c.u('index')}">Home</a> / Tools</div><h1>Resume keyword checker</h1><p class="lead">See which skills a job asks for that your resume does not mention yet. Paste your resume text and the job description. Everything runs in your browser, so nothing is uploaded or stored.</p></div>
  <div class="cols2">
    <label><strong>Your resume (text)</strong><textarea id="resume" placeholder="Paste your resume text here"></textarea></label>
    <label><strong>Job description</strong><textarea id="jd" placeholder="Paste the full job description, including the requirements"></textarea></label>
  </div>
  <div class="row" style="margin-top:16px"><button class="btn primary" id="check" type="button">Check keywords</button></div>
  <div id="result" hidden class="mod" style="margin-top:24px" aria-live="polite">
    <h2 id="score"></h2><p id="summary" class="muted"></p>
    <h3>Required skills you already mention</h3><div class="chips" id="have"></div>
    <h3>Required skills missing from your resume</h3><div class="chips" id="missing"></div>
    <h3>Nice-to-have skills missing</h3><div class="chips" id="niceMissing"></div>
  </div>
  <div class="callout warn" style="margin-top:24px"><strong>What this is, and is not.</strong> It counts keywords from a built-in list of common skills. It is not an ATS score and does not predict whether you will be shortlisted. Add a skill only if you really have it.</div>
  <div class="prose" style="margin-top:40px"><h2>Want this done for every job?</h2><p>${c.B.name} captures a job from any page, runs this check automatically, and gives you a tailored resume in your own layout. <a href="${c.u('index')}#waitlist">Join the waitlist</a>.</p></div>
</div>`,
  },
  {
    slug: 'guides', nav: 'Guides', title: () => 'Guides: resumes, applications and interviews for Indian job seekers', desc: 'Practical, honest guides on tailoring a resume, tracking applications and preparing for interviews.',
    body: (c) => `<div class="wrap" style="padding-bottom:100px"><div class="pagehead"><h1>The guides</h1><p class="lead">Practical advice for people looking for work in India. No tricks and no invented statistics.</p></div>
  <div class="grid">${c.guides.map((g) => `<a class="mod guidecard" href="${c.u(g.slug)}"><span class="tab">${g.tag}</span><h3>${g.h1}</h3><p class="muted">${g.desc}</p><span class="go">Read the guide →</span></a>`).join('')}</div></div>`,
  },
  {
    slug: 'about', nav: false, title: (B) => `About ${B.name}`, desc: 'Why we are building a job-search tool around tailoring, tracking and interview prep, and what we will not do.',
    body: (c) => `<div class="wrap narrow"><div class="pagehead"><h1>About ${c.B.name}</h1></div><div class="prose" style="padding-bottom:100px">
  <p>Job hunting in India means many applications, many tabs and very little feedback. We are building one place to keep it organised and to make each application a better fit than the last.</p>
  <h2>What we believe</h2><ul><li>A good tool does not apply for you. It can save you the typing, but you choose where to apply, you attach your resume and you press the button.</li><li>It should never invent experience. Tailoring is about emphasis, not fiction.</li><li>Scores must be explainable. If we say 70%, you can see why.</li><li>Your data is yours. You can export it or delete it at any time.</li></ul>
  <h2>Who is behind it</h2><p>${c.B.legalName}. ${c.B.address}. Contact: <a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a>.</p></div></div>`,
  },
  {
    slug: 'contact', nav: false, title: (B) => `Contact ${B.name}`, desc: 'Support, feedback and the grievance officer contact details.',
    body: (c) => `<div class="wrap narrow"><div class="pagehead"><h1>Contact</h1></div><div class="prose" style="padding-bottom:100px">
  <h2>Support and feedback</h2><p>Email <a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a>. Please include the browser you use and, for problems with a job page, its address.</p>
  <h2>Grievance officer</h2><p>For privacy or data complaints: <a href="mailto:${c.B.grievanceEmail}">${c.B.grievanceEmail}</a>. Registered address: ${c.B.address}.</p></div></div>`,
  },
  {
    slug: 'privacy', nav: false, legal: true, title: (B) => `Privacy policy | ${B.name}`, desc: 'What data Rolemate collects, why, who processes it, how long we keep it and how to export or delete it.',
    body: (c) => `<div class="wrap narrow"><div class="pagehead"><h1>Privacy policy</h1></div><div class="prose" style="padding-bottom:100px">
  <p class="muted">Last updated: 25 November 2026. Operator: ${c.B.legalName}, ${c.B.address}.</p>
  <h2>What we collect</h2><ul><li><strong>Account:</strong> your email address and a hashed password.</li><li><strong>Your resume and profile:</strong> the file you upload and the details read from it.</li><li><strong>Application details:</strong> details you add for forms (such as phone, city, notice period, expected pay and links), answers you choose to save, and, only if you turn it on, your answers to sensitive questions such as gender or disability. We also keep the wording of questions that forms asked you, without your answers, so we can improve which questions Rolemate can fill.</li><li><strong>Jobs you capture:</strong> the text, address, title, company and logo of the page you chose to capture, plus your notes and status.</li><li><strong>Payments:</strong> the payment reference, pack and amount. We never see or store your card, UPI or bank details. Razorpay handles those.</li><li><strong>Usage:</strong> counts needed to apply credit limits, and basic error logs.</li></ul>
  <h2>Why we use it</h2><p>To provide the service you asked for: matching, tailoring, tracking, interview prep and payments. We do not sell your data and we do not show advertising.</p>
  <h2>The Chrome extension</h2><p>The extension reads a page only when you click it, using Chrome's activeTab permission. When you capture a job, it sends the text, address, title and company logo of that page to your Rolemate account, and nothing else. When you choose Fill the form, it reads the questions and options on that form in that tab and types your details into them. It never reads or fills password, captcha or verification-code fields, never uploads a file and never presses Apply. For a free-text question you ask it to draft, the question, the job and the relevant parts of your resume are sent to our AI provider to write the draft you then approve. It does not read your browsing history, run in the background or track you. It stores only your sign-in token on your device.</p>
  <h2>Who processes your data</h2><p>We use these service providers to run Rolemate. They process data only to provide their service to us.</p><ul><li><strong>Anthropic</strong> (AI provider): receives the job text, and the parts of your resume needed for matching help, interview prep, Ask AI and drafting answers to application questions, to produce your results.</li><li><strong>Razorpay</strong>: processes payments.</li><li><strong>Brandfetch</strong>: receives only a company name, to find its logo.</li><li><strong>Google</strong>: if you choose "Continue with Google", Google confirms your email address to us. We receive only your email.</li><li><strong>Resend</strong>: delivers our emails to you (welcome, guide, password reset). It receives your email address and the message.</li><li><strong>Railway and Cloudflare</strong>: host the application and the website.</li></ul>
  <h2>Retention, export and deletion</h2><p>You can export everything and delete your account from Settings. Deletion removes your profile, resumes and jobs from our systems. Payment records may be kept as long as the law requires for tax and accounting.</p>
  <h2>Your rights and complaints</h2><p>You can ask us to access, correct or erase your data, or to withdraw consent. Write to <a href="mailto:${c.B.grievanceEmail}">${c.B.grievanceEmail}</a>. We will respond within 30 days. If you are not satisfied, you may complain to the Data Protection Board of India.</p></div></div>`,
  },
  {
    slug: 'terms', nav: false, legal: true, title: (B) => `Terms of service | ${B.name}`, desc: 'The terms for using the service. Draft pending legal review.',
    body: (c) => `<div class="wrap narrow"><div class="pagehead"><h1>Terms of service</h1></div><div class="prose" style="padding-bottom:100px">
  <h2>The service</h2><p>${c.B.name} helps you tailor resumes, track applications and prepare for interviews. It can fill in application forms from your profile, but never uploads files or submits them for you, and does not guarantee interviews, offers or any outcome.</p>
  <h2>Your content</h2><p>You own your resume and data. You confirm that everything in your resume is true and that you have the right to upload it. You are responsible for what you send to employers.</p>
  <h2>Acceptable use</h2><p>No automated bulk use, no attempts to bypass limits, and no use against the terms of the job sites you visit.</p>
  <h2>Credits and payment</h2><p>Each account starts with free credits. One credit covers one job. You can buy more credits in packs, as a one-time payment. Credits do not expire and nothing renews automatically. Prices include GST. See the <a href="${c.u('refund')}">refund policy</a>.</p>
  <h2>Liability</h2><p>[Limitation of liability, governing law and jurisdiction to be completed by counsel.]</p></div></div>`,
  },
  {
    slug: 'refund', nav: false, legal: true, title: (B) => `Refund policy | ${B.name}`, desc: 'Credit packs are one-time payments with nothing to cancel. Here is when a pack can be refunded and how long it takes.',
    body: (c) => `<div class="wrap narrow"><div class="pagehead"><h1>Refund policy</h1></div><div class="prose" style="padding-bottom:100px">
  <h2>No subscription to cancel</h2><p>Credit packs are one-time payments. Nothing renews, so there is nothing to cancel.</p>
  <h2>Refunds</h2><p>If you have not used any credits from a pack, you can ask for a full refund within 7 days of paying. Credits that have been used are not refundable. If you were charged but did not receive your credits, write to us and we will fix it or refund you. Refunds go back to the original payment method, usually within 5 to 7 working days.</p>
  <h2>Contact</h2><p><a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a></p></div></div>`,
  },
];

export const GUIDES = [
  {
    slug: 'guides/tailor-resume-to-job-description', tag: 'Resumes', h1: 'How to tailor your resume to a job description without lying', date: '2026-10-20',
    title: () => 'How to tailor your resume to a job description (honestly)', desc: 'A step-by-step method to match your resume to a job description: read the requirements, mirror real skills, reorder bullets and keep it truthful.',
    body: (c) => `
<p>Tailoring does not mean rewriting your history. It means choosing which true things come first. Recruiters skim a resume in seconds, so the first third of page one decides whether they keep reading. Here is a method that takes about ten minutes per job.</p>
<h2>1. Split the job description into must-have and nice-to-have</h2>
<p>Read the requirements and mark each line. Words like “required”, “must”, “strong” and a stated number of years usually mean must-have. “Good to have”, “plus” and “preferred” mean nice-to-have. Ignore generic lines such as “team player”.</p>
<h2>2. Check each must-have against your resume</h2>
<p>For every must-have, find a bullet that shows it. Three outcomes are possible: you already show it, you have the skill but never wrote it down, or you do not have it. Be honest about the third group. Do not add a tool you cannot discuss in an interview.</p>
<h2>3. Use the job's words for skills you really have</h2>
<p>If the posting says “CI/CD pipelines” and your resume says “Jenkins jobs”, say both: “Built CI/CD pipelines in Jenkins”. Matching the wording helps both people and keyword-based search in recruiter tools.</p>
<h2>4. Reorder, do not rewrite</h2>
<ul><li>Within each role, put the bullets most relevant to this job first.</li><li>In your skills section, put the skills this job asks for at the front of each row.</li><li>If you have several projects, lead with the one closest to the role.</li></ul>
<h2>5. Lead with numbers</h2>
<p>“Reduced API latency by 38%” beats “improved performance”. If a bullet has a number, make sure it is easy to see. Never change a number to look better.</p>
<h2>6. Keep the format simple</h2>
<p>Use real text, standard headings (Experience, Education, Skills) and one column. Avoid text inside images, tables for layout and unusual fonts. Save as PDF unless the application asks for a Word file.</p>
<h2>7. Re-read it as the recruiter</h2>
<p>Look at the top third of page one. Could someone tell in ten seconds why you fit this role? If not, move something up.</p>
<div class="callout"><strong>Shortcut.</strong> Our <a href="${c.u('tools/resume-keyword-checker')}">free keyword checker</a> does steps 1 and 2 for any job description in your browser.</div>`,
  },
  {
    slug: 'guides/track-job-applications', tag: 'Applications', h1: 'What to track when you apply to many jobs', date: '2026-10-22',
    title: () => 'Job application tracker: what to record and why', desc: 'What to keep for every application so you never lose track: the posting, the resume you sent, dates, contacts and next steps.',
    body: (c) => `
<p>After about ten applications, memory stops being reliable. Which version of your resume did you send to which company? Who spoke to you on Tuesday? A tracker answers these in seconds. A spreadsheet is enough if you keep these columns.</p>
<h2>The columns that matter</h2>
<ul><li><strong>Company and role</strong>, spelled the way the posting spells them.</li><li><strong>Link</strong> to the posting, because postings are often taken down. Paste the description text too.</li><li><strong>Stage:</strong> saved, applied, screening call, interview, offer, rejected.</li><li><strong>Date applied</strong> and the date of the last contact.</li><li><strong>Resume version sent.</strong> Save the exact file.</li><li><strong>Contact:</strong> recruiter or referrer name and how to reach them.</li><li><strong>Notes:</strong> salary range if stated, questions you were asked, what to follow up on.</li></ul>
<h2>Why keep the job text</h2>
<p>When a recruiter calls three weeks later, you need to remember what the role actually asked for. Saving the text of the posting makes preparation possible even if the page is gone.</p>
<h2>A weekly routine</h2>
<ol><li>Update every stage.</li><li>List who you should follow up with, and send those messages.</li><li>Pick the three most promising roles and prepare for them.</li></ol>
<h2>Follow-up timing</h2><p>There is no rule that works everywhere. A short, polite follow-up after about a week with no reply is common. If the posting names a timeline, wait for it.</p>
<div class="callout">${c.B.name} keeps all of this automatically: capture a job and it records the text, the score, the tailored resume you generated and the stage you move it to.</div>`,
  },
  {
    slug: 'guides/prepare-for-an-interview', tag: 'Interviews', h1: 'How to prepare for a job interview in one evening', date: '2026-10-25',
    title: () => 'How to prepare for a job interview in one evening', desc: 'A focused one-evening plan: understand the role, know the company, prepare five stories from your resume, and plan what to ask.',
    body: (c) => `
<p>You rarely have a week. Most calls are arranged with a day or two of notice. This plan fits one evening and covers what interviewers actually probe.</p>
<h2>1. Re-read the job description (15 minutes)</h2><p>Write the three things this role most needs. Everything you prepare should connect back to these.</p>
<h2>2. Learn the company (30 minutes)</h2><p>Know what it sells, who its customers are and one recent development. The company's own site and recent press are the safest sources. Treat anonymous review sites as individual opinions, not facts.</p>
<h2>3. Prepare five stories from your resume (60 minutes)</h2><p>Pick five things you have done: a result with a number, a problem you solved, a time something went wrong, a time you worked with a difficult person, and something you learned. For each, write the situation, what you did and the result in plain sentences. Say them out loud once.</p>
<h2>4. Plan answers to the standard questions (30 minutes)</h2>
<ul><li>“Tell me about yourself”: 60 to 90 seconds covering your present role, relevant past and why this job.</li><li>“Why this company?”: one specific reason, from step 2.</li><li>“What are your gaps?”: be honest, then say how you would close them.</li><li>Notice period and expected CTC: decide your answers in advance. State your real notice period. For pay, give a range based on market data and the role.</li></ul>
<h2>5. Prepare questions to ask (15 minutes)</h2><p>Ask about the first three months, how success is measured, and the team. Avoid questions the job page already answers.</p>
<h2>6. Logistics</h2><p>Test your camera and connection, keep your resume in front of you and have water nearby.</p>
<div class="callout">${c.B.name} builds the first draft of steps 3 and 4 for each job from your resume and the job description, so you start by editing instead of writing from scratch.</div>`,
  },
];
export { faqItems };
