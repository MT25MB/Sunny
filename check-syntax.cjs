const fs = require('fs');
const path = require('path');
const dirs = ['tests/e2e', 'tests/integration', 'tests/accessibility', 'tests/performance'];
for (const d of dirs) {
  const fullDir = path.join(__dirname, d);
  const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.test.cjs'));
  for (const f of files) {
    try {
      require('vm').compileFunction(fs.readFileSync(path.join(fullDir, f), 'utf8'));
      console.log('OK:', d + '/' + f);
    } catch (e) {
      console.log('ERROR:', d + '/' + f, e.message);
    }
  }
}
