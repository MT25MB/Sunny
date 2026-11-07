/**
 * Sequential E2E test runner.
 * Runs each test file one at a time to avoid port/process conflicts.
 * Usage: node run-e2e-tests.cjs
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const dir = 'tests/e2e';
const files = require('fs').readdirSync(dir).filter(f => f.endsWith('.test.cjs')).sort();

let totalPass = 0;
let totalFail = 0;

for (const f of files) {
  console.log(`\n=== Running ${f} ===`);
  try {
    execSync(`node --test "${path.join(dir, f)}"`, { cwd: __dirname, stdio: 'pipe', timeout: 120000 });
    totalPass++;
    console.log(`  PASSED`);
  } catch (e) {
    totalFail++;
    console.log(`  FAILED`);
  }
}

console.log(`\n=== E2E Summary: ${totalPass} passed, ${totalFail} failed ===`);
process.exit(totalFail > 0 ? 1 : 0);
