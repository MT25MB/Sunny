/** Static tests: unit + integration + accessibility + performance. NO E2E. */
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
let pass = 0, fail = 0, failed = [];
for (const dir of ['tests/unit', 'tests/integration', 'tests/accessibility', 'tests/performance']) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs')).sort();
  if (!files.length) continue;
  for (const f of files) {
    console.log(`[static] ${dir}/${f}`);
    try { execSync(`node --test "${path.join(dir,f)}"`, { cwd: __dirname, stdio:'pipe', timeout:120000 }); pass++; console.log('  PASSED'); }
    catch { fail++; failed.push(`${dir}/${f}`); console.log('  FAILED'); }
  }
}
console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
if (failed.length) console.log('Failed:', failed.join(', '));
process.exit(fail ? 1 : 0);
