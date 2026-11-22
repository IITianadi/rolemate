// The Rolemate logo lockup: the two-module R (a tall ink block, a red block, an open outlined block) and the name.
// Plays once per page load: the first logo created animates, later ones (for example when the dashboard re-draws its
// top bar while you move between pages) are drawn still, in their final state. Hover/focus plays it again (see app.js).
// The wordmark is live text in Noto Sans JP Black (web/fonts), so the page must load that font (styles.css does).
const RED = '#D0021B', INK = '#111111';
const CSS = [
  '.rm-ink{transform-box:fill-box;transform-origin:50% 100%;animation:rm-grow .5s cubic-bezier(.16,1,.3,1) both}',
  '.rm-red{animation:rm-drop .45s .12s cubic-bezier(.16,1,.3,1) both}',
  '.rm-box{stroke-dasharray:1;animation:rm-draw .55s .3s cubic-bezier(.16,1,.3,1) both}',
  '.rm-name{animation:rm-wipe .6s .65s cubic-bezier(.16,1,.3,1) both}',
  '@keyframes rm-grow{from{transform:scaleY(0)}}',
  '@keyframes rm-drop{from{opacity:0;transform:translateY(-14px)}}',
  '@keyframes rm-draw{from{stroke-dashoffset:1}}',
  '@keyframes rm-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}',
  '@media (prefers-reduced-motion:reduce){[class*="rm-"]{animation:none!important}}',
].join('');
const BODY =
  `<rect class="rm-ink" x="0" y="4" width="22" height="48" fill="${INK}"/>` +
  `<rect class="rm-red" x="26" y="4" width="22" height="22" fill="${RED}"/>` +
  `<rect class="rm-box" pathLength="1" x="27.5" y="31.5" width="19" height="19" fill="none" stroke="${INK}" stroke-width="3"/>` +
  `<g class="rm-name"><text x="62" y="40" textLength="164" lengthAdjust="spacingAndGlyphs" font-family="'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="32" fill="${INK}">Rolemate</text></g>`;
const VIEW = '0 0 230 56';
const RATIO = 230 / 56;
let played = false;

export function brandLogo({ height = 30, animate = !played, label = 'Rolemate' } = {}) {
  played = true;
  const w = Math.round(height * RATIO);
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" width="${w}" height="${height}" role="img" aria-label="${label}">${animate ? `<style>${CSS}</style>` : ''}${BODY}</svg>`, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

// armLogo() makes the next logo animate, for a navigation that rebuilds the top bar while the animation is running;
// replayLogo(node) restarts the one already on screen; logoPlaying(node) tells whether it is mid-animation.
export const armLogo = () => { played = false; };
export function replayLogo(node) {
  const fresh = brandLogo({ height: Number(node.getAttribute('height')) || 30, animate: true, label: node.getAttribute('aria-label') || 'Rolemate' });
  node.replaceWith(fresh);
  return fresh;
}
export const logoPlaying = (node) => node.getAnimations({ subtree: true }).some((a) => a.playState === 'running');
