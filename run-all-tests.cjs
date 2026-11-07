/**
 * Sequential test runner for all non-E2E tests.
 * Runs each category one at a time to ensure stability.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const dirs = [
  'tests/unit',
  'tests/integration',
  'tests/accessibility',
  'tests/performance',
];

let totalPass = 0;
let totalFail = 0;

function runDir(dir, label) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs')).sort();
  if (files.length === 0) { console.log(`${label}: no test files`); return; }
  for (const f of files) {
    console.log(`\n=== ${label}/${f} ===`);
    try {
      execSync(`node --test "${path.join(dir, f)}"`, { cwd: __dirname, stdio: 'pipe', timeout: 120000 });
      totalPass++;
      console.log(`  PASSED`);
    } catch (e) {
      totalFail++;
      const stderr = e.stderr ? e.stderr.toString() : '';
      const lines = stderr.split('\n').filter(l => /^\s*\d+ .* (pass|fail)/.test(l));
      for (const line of lines) {
        if (/fail\b/i.test(line)) console.log(`  FAIL: ${line.trim()}`);
      }
      console.log(`  FAILED`);
    }
  }
}

for (const d of dirs) runDir(d, d);
console.log(`\n=== Total: ${totalPass} passed, ${totalFail} failed ===`);
process.exit(totalFail > 0 ? 1 : 0);
