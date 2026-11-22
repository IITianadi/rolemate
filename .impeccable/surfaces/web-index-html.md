---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Dashboard (every screen): Dense Module Mosaic

Scope and mode: Operate. Every dashboard screen (Jobs, job page, resume editor, skills, profile, sign-in, settings) plus the shared top bar and controls. Desktop-first, mobile works. Audience: freshers and early-career job seekers in India applying to many jobs. Constraints: WCAG AA, body text 16px or more, no invented claims, standard web controls, the product's true-claims list.

## Direction contract

THESIS: Every part of a job is a ruled module with a red header tab, packed tight enough that twenty jobs fit on a screen, instead of the spacious white-card dashboard every tracker ships.

OWN-WORLD: Bright white ground, near-black text (#111), one utility red (#D0021B) for tabs and the numbers that matter, cool grey (#E9ECEF) hairlines around every module. Noto Sans JP, Black for tab labels and display numbers, Medium for body, 16px minimum. Square corners, 1px hairline borders, no shadows, no gradients, no rounded cards. A selected thing gets a red underline or a red tab, never a fill glow. The logo is the two-module R.

STORY: A fresher opens Rolemate and sees in one glance the next action, how many jobs are at each stage, and which jobs are worth applying to (fit at or above the 75% tick). They believe the list is honest because each row says what is missing. They act: open prep, mark applied, or tailor a resume.

FIRST VIEWPORT: Standard top bar (logo, Jobs, Resume, Settings, credits). Below it a full-width Next module with a red tab, one sentence, one black button. Under that two columns: a narrow This week module (applications sent, one line of advice) and a wide Jobs module holding the stage filter, search, sort and the job table with Role / Fit bar with 75% tick / Stage. Primary action: the Next module's button.

FORM: Japanese high-density web (catalog challenger, competitive), chosen by the user from the roll; seed: seed:1150743dfb0dec09.

SIGNATURE: Red-tabbed modules with hairline borders as the one building block on every screen. Motion is minimal and functional: the logo assembles once, module tabs switch in place, reduced-motion keeps instant swaps.

OPEN DECISIONS: warmth for freshers (copy and spacing, since the form is cold by nature); what replaces the Board view (kept out for now); website and extension carry the same world in later passes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
