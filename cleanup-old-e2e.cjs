const fs = require('fs');
const path = require('path');
const dir = 'tests/e2e';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs') && f !== 'sequential.test.cjs');
for (const f of files) {
  try { fs.unlinkSync(path.join(dir, f)); console.log('Deleted:', f); } catch {}
}
console.log('Cleanup done - kept sequential.test.cjs');
