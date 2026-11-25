// Finds a Chromium that can load an unpacked extension. Branded Chrome 137+ ignores --load-extension, so prefer
// CHROMIUM_PATH, then Playwright's own browser (any installed version), then well-known system paths.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export function findExtensionBrowser() {
  const found = [];
  for (const base of [join(homedir(), 'Library', 'Caches', 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright'), '/opt/pw-browsers']) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
      found.push(join(base, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(base, d, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'), join(base, d, 'chrome-linux', 'chrome'), join(base, d, 'chrome-linux64', 'chrome'));
    }
  }
  return [process.env.CHROMIUM_PATH, chromium.executablePath(), ...found, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
}
