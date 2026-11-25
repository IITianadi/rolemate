# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Freshers and early-career job seekers in India (confirmed by the owner). They apply to many roles across LinkedIn, Naukri and company career pages, and use the dashboard after capturing jobs with the Chrome extension. Desktop-first: mainly used on a laptop beside job sites; mobile works but is secondary.

## Product Purpose
Rolemate helps a candidate apply with a resume that fits each job. The candidate uploads a resume once, captures a job with the extension (or pastes the description), sees a match score and what is missing, downloads a tailored PDF, tracks the application and prepares for the interview. Success: the candidate applies to better-fitting jobs with less effort and goes into interviews prepared.

## Positioning
The whole job pipeline in one place: capture, match score, tailored resume, application tracker, interview prep and Ask AI per job (confirmed by the owner as the differentiator).

## Operating Context
- Dashboard (app.rolemate.in) plus a Chrome extension; one login for both. Marketing site at rolemate.in.
- Pipeline stages: Saved, Applied, Screening call, Interview, Offer, Rejected.
- Match score 0-100 with required skills covered and missing; 75% is shown as a good target to apply.
- Pricing is credits: 50 free on signup, one credit per job, packs of 30, 100 and 300, no subscription.
- Sign up with email or Google.

## Capabilities and Constraints
- Rolemate never applies for the user; they press apply themselves.
- Autofill (extension side panel): works only for a job the user saved in Rolemate that has a credit, and only on that job's own application form: the page must be the saved posting, or name the same company and role (the server enforces all of it, and each job unlocks at most 3 form pages; capturing a job is what spends the credit, and autofill is included with it, within a fair-use limit on AI drafting). On that job's application form one click fills the whole form from the profile and resume, and answers every other question with the most reasonable assumption from the resume and profile. The panel shows only what needs attention: red (needs the user), yellow (assumed or couldn't fill), and the file to attach; filled fields are folded away. It never uploads a file (the user attaches the tailored resume it names), never clicks Apply/Submit/Next, never solves a captcha or reads a code, and always asks sensitive questions (gender, disability, veteran status, race) unless the user opted in. Assumed answers are marked yellow for the user to check. Call it "fill the form" or "autofill", never "auto-apply".
- Tailoring keeps the user's own layout and never adds a skill the user has not confirmed ("I have this"). Rewording suggestions keep the same facts and numbers.
- The extension captures only on supported job sites and single job posts; elsewhere the user pastes the description in the dashboard.
- Not yet true, do not claim: extension on the Chrome Web Store, auto-apply (applying or submitting for the user), a score that rises after tailoring alone.
- Existing frontend: vanilla JS modules in `web/`, no build step; user text is never put in innerHTML.

## Brand Commitments
Wordmark "rolemate"; tagline "Apply with a resume that fits every job." Existing visual identity is blue and white (to be reviewed in the redesign).

## Evidence on Hand
No customer testimonials, case studies or benchmarks exist. Do not fabricate them.

## Product Principles
- Show the next action first; the dashboard is a working tool, not a showcase.
- Be honest about fit: say what is missing rather than inflate the score.
- Keep the user in control: nothing is added to a resume or applied to without their confirmation.
- Serve people new to job hunting: plain words, clear next steps, no jargon.

## Accessibility & Inclusion
Meet WCAG AA contrast. Audience is early-career, so avoid assumed professional jargon.
