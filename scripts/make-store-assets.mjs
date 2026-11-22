// Chrome Web Store images from the demo build. Run: npm run demo:build && node scripts/make-store-assets.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'demo', 'dist'), out = join(root, 'store-assets');
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
const clean = () => page.evaluate(() => { document.querySelector('.demo-pill')?.remove(); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
const shot = async (route, wait, name) => {
  await page.goto(`${base}${route}`); await page.reload(); await page.waitForSelector(wait); await page.waitForTimeout(900); await clean();
  await page.screenshot({ path: join(out, name) });
};
await shot('#d-tracking', '.djob', '1-jobs-1280x800.png');
await shot('#d-job-1', '.bigfit', '2-match-1280x800.png');
await shot('#d-gaps', '.gapgrid, .dmod', '3-skills-1280x800.png');

// promo tile 440x280 (flat, one red)
const tile = await browser.newPage({ viewport: { width: 440, height: 280 } });
const font = readFileSync(join(root, 'web', 'fonts', 'noto-sans-jp-latin.woff2')).toString('base64');
await tile.setContent(`<style>@font-face{font-family:N;font-weight:900;src:url(data:font/woff2;base64,${font})}
*{box-sizing:border-box;margin:0}body{width:440px;height:280px;background:#fff;font-family:N,sans-serif;color:#111;border:2px solid #111;position:relative;overflow:hidden}
.tab{position:absolute;top:0;left:0;background:#d0021b;color:#fff;font-weight:900;font-size:15px;padding:7px 14px}
h1{position:absolute;left:28px;top:70px;font-size:40px;line-height:1.12;font-weight:900;letter-spacing:-.5px}
.bar{position:absolute;left:28px;right:28px;bottom:48px;height:16px;border:2px solid #111}.bar i{display:block;height:100%;width:86%;background:#111}.bar b{position:absolute;left:75%;top:-8px;bottom:-8px;width:3px;background:#d0021b}
.n{position:absolute;right:28px;bottom:70px;font-size:44px;font-weight:900;color:#d0021b}
.f{position:absolute;left:28px;bottom:16px;font-size:13px;font-weight:700}</style>
<div class="tab">Rolemate</div><h1>A resume that<br>fits every job.</h1><div class="n">86%</div><div class="bar"><i></i><b></b></div><div class="f">Capture a job. See the gaps. Tailor in one click.</div>`);
await tile.evaluate(() => document.fonts.ready); await tile.screenshot({ path: join(out, 'promo-tile-440x280.png') });
await browser.close(); server.close(); console.log('Saved to store-assets/');
