const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'tests', 'e2e');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs'));
for (const f of files) {
  const fullPath = path.join(dir, f);
  let content = fs.readFileSync(fullPath, 'utf8');
  // Remove --no-sandbox flag (not needed on Windows, can cause issues)
  content = content.replace(/'--no-sandbox',/, "");
  // Remove DISPLAY env setup (Windows doesn't use DISPLAY)
  content = content.replace(/\s*env: \{ \.\.\.process\.env, DISPLAY: process\.env\.DISPLAY \|\| ':99'\},/g, "env: { ...process.env },");
  if (content !== fs.readFileSync(fullPath, 'utf8')) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Updated:', f);
  } else {
    console.log('No change:', f);
  }
}
console.log('Done!');
