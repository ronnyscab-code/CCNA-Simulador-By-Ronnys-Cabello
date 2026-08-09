/**
 * build-web.mjs
 *
 * The project has no build step for the browser — but Capacitor needs a
 * single folder holding exactly what ships inside the APK (and nothing else:
 * no tests, docs, node_modules, or tooling). This copies the runtime files
 * into `www/`, which `capacitor.config.json` points at as its `webDir`.
 *
 * Run it before `npx cap copy` (the `build:web` npm script chains both).
 */

import { rm, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

// Everything index.html loads, directly or through ES module imports.
const RUNTIME = [
  'index.html',
  'assets',
  'css',
  'js',
  'ui',
  'engine',
  'devices',
  'topology',
  'protocols',
  'cli',
  'scenarios',
  'labs',
  'trainer',
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of RUNTIME) {
  await cp(join(root, entry), join(out, entry), { recursive: true });
}

console.log(`Copied ${RUNTIME.length} runtime entries into www/`);
