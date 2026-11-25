// Builds extension-dev/: the extension pointed at a local server (default http://localhost:3000), to load unpacked in Chrome.
// The real extension/ is untouched. Usage: npm run ext:dev [-- http://localhost:3000]
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const out = join(root, 'extension-dev');
rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'extension'), out, { recursive: true });

const popup = join(out, 'popup.js');
const src = readFileSync(popup, 'utf8');
if (!src.includes("const SERVER = 'https://app.rolemate.in';")) throw new Error('popup.js SERVER line not found');
writeFileSync(popup, src.replace("const SERVER = 'https://app.rolemate.in';", `const SERVER = '${server}';`));

const mfPath = join(out, 'manifest.json');
const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
mf.name = 'Rolemate (dev)';
mf.host_permissions = [`${server}/*`];
writeFileSync(mfPath, JSON.stringify(mf, null, 2));
// The side panel reads the server from storage; point it here too.
writeFileSync(join(out, 'lib', 'api.js'), readFileSync(join(out, 'lib', 'api.js'), 'utf8').replace("export const DEFAULT_SERVER = 'https://app.rolemate.in';", `export const DEFAULT_SERVER = '${server}';`));
console.log(`Built extension-dev/ for ${server}\nChrome: chrome://extensions > Developer mode > Load unpacked > ${out}`);
