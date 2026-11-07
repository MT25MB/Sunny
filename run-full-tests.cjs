/** Full test runner: static + sequential E2E. */
const { execSync } = require('node:child_process');
const path = require('node:path');
let pass = 0, fail = 0;

// Static tests
for (const dir of ['tests/unit', 'tests/integration', 'tests/accessibility', 'tests/performance']) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs')).sort();
  if (!files.length) continue;
  console.log(`[static] ${dir}`);
  for (const f of files) {
    try { execSync(`node --test "${path.join(dir,f)}"`, { cwd: __dirname, stdio:'pipe', timeout:120000 }); pass++; console.log(`  ${f}: PASSED`); }
    catch { fail++; console.log(`  ${f}: FAILED`); }
  }
}

// E2E sequential
console.log('[e2e] sequential.test.cjs');
try { execSync('node --test tests/e2e/sequential.test.cjs', { cwd: __dirname, stdio:'pipe', timeout:300000 }); pass++; console.log('  sequential: PASSED'); }
catch { fail++; console.log('  sequential: FAILED'); }

console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
