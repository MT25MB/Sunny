/**
 * Syntax gate for the Electron main process.
 *
 * `tsconfig.app.json` excludes `src/electron` and `src/main`, and ESLint only
 * lints TypeScript/TSX files — so nothing in CI currently parses the `.cjs`
 * files that actually run in production. A syntax error there only surfaces at
 * runtime, as a blank window.
 *
 * `node --check` parses the file without executing it.
 *
 * Usage: node scripts/check-syntax.mjs
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['src/electron', 'src/main', 'scripts'];

function collectCjsFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectCjsFiles(full, acc);
    } else if (/\.(cjs|mjs)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = SCAN_DIRS.flatMap((dir) => collectCjsFiles(join(ROOT, dir)));
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failures.push({ file: relative(ROOT, file), output: String(err.stderr || err.message) });
  }
}

if (failures.length > 0) {
  console.error(`✗ Syntax check failed for ${failures.length} file(s):\n`);
  for (const { file, output } of failures) {
    console.error(`--- ${file} ---`);
    console.error(output.trim());
    console.error('');
  }
  process.exit(1);
}

console.log(`✓ Syntax check passed for ${files.length} file(s)`);
for (const file of files) {
  console.log(`  ${relative(ROOT, file)}`);
}