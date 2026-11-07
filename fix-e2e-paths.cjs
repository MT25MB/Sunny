const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'tests', 'e2e');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs'));
for (const f of files) {
  const fullPath = path.join(dir, f);
  let content = fs.readFileSync(fullPath, 'utf8');
  const newContent = content.replace(
    "'out', 'Sunny-linux-x64', 'sunny-desktop'",
    "'out', 'Sunny-win32-x64', 'sunny-desktop.exe'"
  );
  if (content !== newContent) {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log('Updated:', f);
  } else {
    console.log('No change:', f);
  }
}
