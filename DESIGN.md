---
name: Rolemate
description: Dense Module Mosaic. A white, hairline-ruled job-tracking dashboard where every part of a job is a module with a red header tab.
colors:
  utility-red: "#d0021b"
  utility-red-deep: "#a80016"
  ink: "#111111"
  ink-secondary: "#2b2f33"
  muted: "#555b61"
  faint: "#8a9096"
  white-ground: "#ffffff"
  sunken: "#f4f5f7"
  hairline: "#e9ecef"
  hairline-strong: "#c9ced3"
  match-green: "#0f8a5a"
  match-green-tint: "#e3f6ee"
  missing-tint: "#fde8ea"
  missing-ink: "#8a0013"
  partial-tint: "#fff6dd"
  partial-ink: "#7a5200"
  selection-tint: "#ffd9de"
typography:
  display:
    fontFamily: "Noto Sans JP, Inter, SF Pro Display, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Noto Sans JP, Inter, sans-serif"
    fontSize: "clamp(1.4rem, 2.4vw, 1.9rem)"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Noto Sans JP, Inter, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Noto Sans JP, Inter, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans JP, Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 900
    letterSpacing: "0.01em"
rounded:
  none: "0px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "18px"
  lg: "22px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white-ground}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#000000"
    textColor: "{colors.white-ground}"
  button-secondary:
    backgroundColor: "{colors.white-ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white-ground}"
  button-danger-hover:
    backgroundColor: "{colors.utility-red}"
    textColor: "{colors.white-ground}"
  module-tab:
    backgroundColor: "{colors.utility-red}"
    textColor: "{colors.white-ground}"
    typography: "{typography.label}"
    padding: "5px 14px"
  module:
    backgroundColor: "{colors.white-ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 20px 18px"
  input:
    backgroundColor: "{colors.white-ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
    height: "44px"
  chip-match:
    backgroundColor: "{colors.match-green-tint}"
    textColor: "{colors.match-green}"
    rounded: "{rounded.none}"
  chip-missing:
    backgroundColor: "{colors.missing-tint}"
    textColor: "{colors.missing-ink}"
    rounded: "{rounded.none}"
  chip-partial:
    backgroundColor: "{colors.partial-tint}"
    textColor: "{colors.partial-ink}"
    rounded: "{rounded.none}"
  job-row:
    backgroundColor: "{colors.white-ground}"
    textColor: "{colors.ink}"
    padding: "12px 0"
  job-row-hover:
    backgroundColor: "{colors.sunken}"
---

# Design System: Rolemate

## Overview

**Creative North Star: "The Ruled Ledger"**

Rolemate's dashboard is a working tool for freshers applying to many jobs, so it reads like a dense, well-ruled ledger: a white ground, near-black ink, cool grey hairlines around every module, and one utility red that marks tabs, ticks and anything that needs attention. The world is a Japanese high-density web catalog form. Twenty jobs should fit on a screen, and each row says what is missing rather than flattering the user.

Depth does not exist here. Structure comes from 1px hairlines, 2px black rules under tab strips, and square corners. Selection is a red underline or a red tab, never a glow or a fill. The mood is cold and exact by nature; warmth has to come from copy and spacing, which the brief left open.

**Key Characteristics:**
- Every part of a job is a ruled module with a red header tab.
- Square corners everywhere (0px), 1px hairlines, no shadows, no gradients in the shipped Jobs layer.
- Red is rare and meaningful: tabs, the 75% tick, needs-attention figures, the active nav underline.
- Noto Sans JP at Black (900) for tab labels and display numbers, Medium to Regular for body.
- The logo is the two-module R: a tall ink block, a red block, an open outlined block, plus the wordmark in Noto Sans JP Black.

## Colors

A white page with one red, one black, and cool grey rules. Green and amber-to-red tints exist only to say match, partial or missing.

### Primary
- **Utility Red** (#d0021b): module tabs, the active nav and tab-strip underline, the 75% fit tick, "needs attention" numbers and the big week figure, danger text. Hover-deep variant #a80016 is defined but only lightly used.

### Neutral
- **Ink** (#111111): all body text, display numbers, primary button fill, the 2px rules under the top bar and tab strips.
- **Ink Secondary** (#2b2f33): secondary body text, nav items, legends.
- **Muted** (#555b61): meta lines, off-state text. **Faint** (#8a9096): placeholders and disabled fit bars.
- **White Ground** (#ffffff): page, modules, inputs. **Sunken** (#f4f5f7): hover rows, soft cards, selected todo.
- **Hairline** (#e9ecef): module and row borders. **Hairline Strong** (#c9ced3): input and chip borders.

### Status tints
- **Match Green** (#0f8a5a on #e3f6ee): matched skills, strong fit pill.
- **Missing** (#8a0013 on #fde8ea) and **Partial** (#7a5200 on #fff6dd): weak or partial fit pills and chips.

### Named Rules
**The One Red Rule.** Red marks a tab, a tick or a thing that needs action. It is never a background wash, a hover glow or decoration.

**The Hairline Rule.** Every module is bordered by a 1px #e9ecef line. Separation is a rule, never a shadow or a tint panel.

## Typography

**Display, headline and body font:** Noto Sans JP (Latin subsets self-hosted, with Inter, SF Pro Display and system sans fallbacks)
**Mono:** system monospace, only for code and job-description text

**Character:** One family, contrasted by weight. Black (900) carries tabs, numbers and headings; Medium to Bold carries controls; Regular carries reading text. Tabular numerals are on for the whole body.

### Hierarchy
- **Display** (900, 2rem, 1.05): the page title on Jobs; the week figure is 2.6rem, 900, red.
- **Headline** (900, clamp 1.4rem to 1.9rem, 1.2): the Next module sentence.
- **Title** (800, 1.05rem, 1.3): job role names in rows; h1 to h3 default to weight 800 with -0.01em tracking.
- **Body** (400, 15.5px, 1.5): running text. Legends cap at 72ch.
- **Label** (900, 15px, +0.01em, sentence case): module tabs, table header cells (14px), stage counts (1.1rem).

### Named Rules
**The Black Numbers Rule.** Figures that matter (fit percentage, stage counts, week count) are Black weight; supporting words are Medium or lighter.

## Layout

A single 1180px centered column with 28px side padding (16px on mobile). Below the sticky top bar, the Jobs screen is: a full-width Next module, then two columns, a 300px This week module and a flexible Jobs module. On screens 980px and narrower the columns stack and This week moves below. Job rows are a three-column grid: role (flexible), fit meter (130px), stage (160px), with an 18px gap and 12px vertical padding; on mobile the header hides and the fit and stage sit side by side under the role.

Spacing rhythm is 6, 12, 18, 22, 28px; module inner padding is 20 to 22px. Touch targets are 40 to 44px minimum (buttons and inputs 44px, small buttons 40px). The resume editor widens to 1440px.

## Elevation & Depth

Flat. Depth is conveyed by rules: a 2px ink border under the top bar and tab strips, 1px hairlines around modules, a 1px ink border on menus. In the Jobs layer there are no shadows and no gradients; the sticky bar and menu have no blur or shadow.

### Named Rules
**The Flat Rule.** No shadow at rest or on hover. Hover is a fill change (to Sunken, or to Ink for outline buttons) or a colour change to red on links.

## Shapes

Square. Every radius is 0px: buttons, inputs, modules, chips, pills, avatar and company logo marks. The one recurring silhouette is the rectangle with a red tab hanging off its top-left corner (tab margin -1px to overlap the border). Meters are 8px tall flat bars with a 3px red tick at 75%.

## Components

### Buttons
- **Shape:** square (0px), 44px tall, 1px ink border, weight 700, 15px.
- **Primary:** Ink fill, white text; hover is pure black with a 2px red outline.
- **Secondary:** white fill, ink text and border; hover inverts to ink fill and white text.
- **Ghost:** transparent, underlined; hover Sunken fill. **Danger:** red text, red fill on hover. **Small:** 40px, 14.5px.

### Module and tab
- **Module:** white, 1px hairline border, 0 20px 18px padding, red tab at top-left (900, 15px, white on #d0021b, 5px 14px padding).
- **Next module:** same shape with a 52px top pad so the tab sits above one headline sentence and one black button.

### Inputs / Fields
- White fill, 1px hairline-strong border, 0 radius, 44px tall, weight 500. Focus: ink border plus a 2px ink ring. Search inputs carry a 40px left inset for the icon.

### Chips and pills
- Square, 1px hairline-strong border, weight 700. Match, missing and partial variants swap in the status tints and drop the border.

### Navigation and tab strips
- Top bar: white, 2px ink bottom rule, 60px tall; items weight 700 with a 4px transparent bottom border that turns red when active. In-page tab strips and the stage filter use the same ink rule and red underline. Selected stage is aria-pressed with a red underline; counts are Black weight.

### Job row (signature)
- Grid of role, fit and stage. Role title is 800 weight, linked with a full-row hit area. A hint line says what is missing, with the key figure in red. Fit shows the percentage in Black over an 8px ink meter, red when weak or missing, faint when off; the red 75% tick is the apply target. One or two small actions sit under the role.

### Logo
- Two-module R built from SVG rects (ink 22x48, red 22x22, outlined 19x19 box) plus live wordmark text. It assembles once per page load (ink grows, red drops, outline draws, name wipes); reduced motion turns it off.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the red-tabbed hairline module.
- **Do** use #d0021b only for tabs, active underlines, the 75% tick and needs-attention figures.
- **Do** keep corners at 0px and borders at 1px hairline (#e9ecef) with 2px ink rules under strips.
- **Do** set important numbers in Noto Sans JP Black and keep body at or above 15.5px.
- **Do** keep hover as a fill or colour swap, and keep the 44px touch height on controls.
- **Do** honour `prefers-reduced-motion`; motion is functional (logo assembly once, bars filling, rows entering).

### Don't:
- **Don't** add shadows, blur, glow or gradients to modules, menus or buttons.
- **Don't** round corners or use pill or circular shapes for new elements.
- **Don't** fill a selected item with colour; use the red underline or red tab.
- **Don't** introduce a second accent colour; green and amber tints mean match and missing only.
- **Don't** use emoji or decorative pulses.

## Not canonized

These exist in the build and are carried as defects or leftovers from the earlier look, not as rules for new surfaces: the `.next .k` label is a red tab (kept as the module tab, not a kicker style to reuse above headings); `--shadow-lg` is still applied to the drag-drop target, editor preview and iframes, composer, and the tilted resume "paper" thumbnail; circular avatars-in-chat, steps, send button, fit dots and todo markers; `.shimmer` loading gradient; the `.logomark` company-logo fallback uses a 22% radius (overridden to 0 only inside job rows); a `--serif` token that actually points to Noto Sans JP; body text at 15.5px against the brief's 16px minimum; legacy 12 to 13.5px small text; blue-era translucent rgba(251,251,253) on the editor sticky bar; and a green livedot and keyframe `pulse`.
