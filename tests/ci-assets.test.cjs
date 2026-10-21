/**
 * Packaging regression test: the images the renderer uses must ship.
 *
 * Run with:  node --test tests/
 *
 * forge.config.js once excluded "/dist/assets/sunny-mascot-" from the
 * package. The renderer imports the chef, pills and newspaper mascots, and
 * Vite emits their hashed copies into dist/assets -- which that rule also
 * matched. The packaged app therefore had no images for those three sections
 * and showed broken-image icons, while the build stayed green.
 *
 * This test fails if an ignore rule would ever exclude an asset the renderer
 * imports, and it proves itself by running the same check against the rule
 * that caused the bug.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const FORGE_CONFIG = path.join(REPO, 'forge.config.js');
const RENDERER_SOURCES = [
  path.join(REPO, 'src', 'App.tsx'),
  path.join(REPO, 'src', 'components'),
];

/** Collects "/assets/whatever.png" imports from the renderer source. */
function collectImportedAssets() {
  const found = new Map();
  const seen = new Set();

  const visit = (file) => {
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).isDirectory()) {
      for (const entry of fs.readdirSync(file)) visit(path.join(file, entry));
      return;
    }
    if (!/\.(tsx?|jsx?)$/.test(file) || seen.has(file)) return;
    seen.add(file);

    const text = fs.readFileSync(file, 'utf8');
    const re = /from\s+["'](\/assets\/[^"']+)["']/g;
    let m;
    while ((m = re.exec(text)) !== null) found.set(m[1], path.relative(REPO, file));
  };

  for (const target of RENDERER_SOURCES) visit(target);
  return found;
}

/**
 * The name the built bundle will point at for an import.
 *
 * Vite resolves an absolute import against the project root first and falls
 * back to public/. A root file is bundled, so the bundle points at a hashed
 * name; a public file is served as-is and keeps its plain name.
 */
function referencedName(importPath) {
  const relative = importPath.replace(/^\//, '');
  const inRoot = fs.existsSync(path.join(REPO, relative));
  const inPublic = fs.existsSync(path.join(REPO, 'public', relative));

  if (!inRoot && !inPublic) return { missing: true };

  const name = path.basename(importPath);
  const stem = name.replace(/\.[^.]+$/, '');
  const ext = path.extname(name);
  return {
    missing: false,
    name: inRoot ? '/dist/assets/' + stem + '-ABCDEFGH' + ext : '/dist/assets/' + name,
  };
}

function excludedBy(rules, name) {
  return rules.filter((rule) => rule.test(name));
}

async function loadIgnoreRules() {
  const url = 'file://' + FORGE_CONFIG.split(path.sep).join('/');
  const mod = await import(url);
  return (mod.default.packagerConfig.ignore || []).filter((r) => r instanceof RegExp);
}

test('no forge ignore rule excludes an asset the renderer imports', async () => {
  const rules = await loadIgnoreRules();
  const imports = collectImportedAssets();

  assert.ok(imports.size > 0, 'the renderer should import some assets');

  const problems = [];
  for (const [importPath, sourceFile] of imports) {
    const target = referencedName(importPath);
    if (target.missing) {
      problems.push(importPath + ' does not exist (imported by ' + sourceFile + ')');
      continue;
    }
    for (const rule of excludedBy(rules, target.name)) {
      problems.push(
        'rule ' + rule.source + ' would exclude ' + target.name +
        ' -- imported by ' + sourceFile + ' as ' + importPath
      );
    }
  }

  assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('the check catches the rule that caused the broken images', () => {
  // A guard that cannot fail is not a guard. Run the same logic against the
  // original broad rule and confirm it reports the three mascots.
  const bugRule = /^\/dist\/assets\/sunny-mascot-/;
  const imports = collectImportedAssets();

  const caught = [];
  for (const [importPath] of imports) {
    const target = referencedName(importPath);
    if (target.missing) continue;
    if (bugRule.test(target.name)) caught.push(target.name);
  }

  assert.ok(
    caught.length >= 3,
    'the original rule must be detected as breaking ' + caught.length + ' asset(s)'
  );
  for (const name of caught) {
    assert.ok(
      /sunny-mascot-(chef|pills|newspaper)/.test(name),
      'the caught asset should be one of the three section mascots: ' + name
    );
  }
});

test('the three section mascots are imported by the renderer', () => {
  const imports = collectImportedAssets();
  for (const name of [
    '/assets/sunny-mascot-chef.webp',
    '/assets/sunny-mascot-pills.webp',
    '/assets/sunny-mascot-newspaper.webp',
  ]) {
    assert.ok(
      imports.has(name),
      name + ' must be imported, or the section shows a broken image'
    );
  }
});
