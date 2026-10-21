#!/usr/bin/env node
/**
 * Verifies that every image the renderer references actually ships.
 *
 * Two failures motivated this:
 *
 *  1. forge.config.js excluded "/dist/assets/sunny-mascot-" from the package.
 *     The renderer imports the chef, pills and newspaper mascots, and Vite
 *     emits their hashed copies into dist/assets -- which the rule also
 *     matched. The packaged app therefore had no images for those three
 *     sections and showed broken-image icons.
 *
 *  2. Nothing checked that. A green build says the bundler succeeded; it
 *     says nothing about what survived packaging.
 *
 * Usage:
 *   node scripts/verify-packaged-assets.cjs            # source-level checks
 *   node scripts/verify-packaged-assets.cjs <appDir>  # also check a packaged app
 *
 * The source-level check runs first and needs nothing but the repository, so
 * it can run in CI before packaging. The packaged check reads app.asar.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const FORGE_CONFIG = path.join(REPO, 'forge.config.js');
const RENDERER_SOURCES = [
  path.join(REPO, 'src', 'App.tsx'),
  path.join(REPO, 'src', 'components'),
];

const problems = [];
const notes = [];

// ---------------------------------------------------------------------------
// The asset the renderer imports
// ---------------------------------------------------------------------------

/**
 * Collects "/assets/whatever.png" imports from the renderer source.
 *
 * A leading slash makes Vite resolve the path against the project root
 * first, so "/assets/x.webp" means <repo>/assets/x.webp and is emitted into
 * dist/assets under a hashed name. A public/ file of the same name is
 * ignored for imports and only serves the website.
 */
function collectImportedAssets() {
  const found = new Map();
  const seen = new Set();

  const visit = (file) => {
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file)) visit(path.join(file, entry));
      return;
    }
    if (!/\.(tsx?|jsx?)$/.test(file)) return;
    if (seen.has(file)) return;
    seen.add(file);

    const text = fs.readFileSync(file, 'utf8');
    const re = /from\s+["'](\/assets\/[^"']+)["']/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      found.set(m[1], path.relative(REPO, file));
    }
  };

  for (const target of RENDERER_SOURCES) visit(target);
  return found;
}

// ---------------------------------------------------------------------------
// The forge ignore rules
// ---------------------------------------------------------------------------

async function loadIgnoreRules() {
  // forge.config.js is an ES module; import it by absolute URL so the
  // resolution does not depend on where this script is run from.
  const url = 'file://' + FORGE_CONFIG.split(path.sep).join('/');
  const mod = await import(url);
  const rules = mod.default.packagerConfig.ignore || [];
  return rules.filter((r) => r instanceof RegExp);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Every imported asset must exist, and no ignore rule may exclude it.
 *
 * The rule is matched against the path the packager sees, which is
 * "/dist/assets/<name>-<hash>.<ext>" for a bundled asset. A rule is
 * considered to have caught it if it matches the name with or without a
 * content hash, because the hash is not known until the file is built.
 */
async function checkImportsAreNotIgnored() {
  const imports = collectImportedAssets();
  notes.push('renderer imports ' + imports.size + ' asset(s)');

  if (imports.size === 0) {
    problems.push('no asset imports found in the renderer - the scan is broken');
    return;
  }

  const rules = await loadIgnoreRules();

  for (const [importPath, sourceFile] of imports) {
    const name = path.basename(importPath);

    // Vite resolves an absolute import against the project root first and
    // falls back to public/. Which one it picks decides what filename the
    // built bundle points at, and therefore what the packager has to keep.
    const relative = importPath.replace(/^\//, '');
    const inRoot = fs.existsSync(path.join(REPO, relative));
    const inPublic = fs.existsSync(path.join(REPO, 'public', relative));

    if (!inRoot && !inPublic) {
      problems.push(
        'imported asset does not exist: ' + importPath + ' (from ' + sourceFile + ')'
      );
      continue;
    }

    const stem = name.replace(/\.[^.]+$/, '');
    const ext = path.extname(name);

    // A root file is bundled, so the bundle points at a hashed name. A public
    // file is served as-is, so it keeps its plain name. Only the name the
    // bundle actually points at has to survive packaging.
    const referenced = inRoot
      ? '/dist/assets/' + stem + '-ABCDEFGH' + ext
      : '/dist/assets/' + name;

    for (const rule of rules) {
      if (rule.test(referenced)) {
        problems.push(
          'forge ignore rule ' + rule.source + ' would exclude ' + referenced +
          ' -- imported by ' + sourceFile + ' as ' + importPath
        );
      }
    }
  }
}

/**
 * Reads the built renderer's asset references out of a packaged app.
 */
function referencedAssetsFromBundle(bundleSource) {
  const refs = new Set();
  for (const m of bundleSource.matchAll(/new URL\("([^"]+)",\s*import\.meta\.url\)/g)) {
    refs.add(m[1]);
  }
  for (const m of bundleSource.matchAll(/"(\/assets\/[A-Za-z0-9._/-]+)"/g)) {
    refs.add(m[1]);
  }
  return refs;
}

/**
 * Normalises the paths asar.listPackage() returns.
 *
 * listPackage() uses the host separator, so on Windows the entries come back
 * as "\dist\assets\index-XXX.js". Comparing those against POSIX paths fails
 * silently -- the check then reports "no renderer bundle found" about a
 * perfectly good package.
 */
function normaliseAsarEntries(entries) {
  return new Set(
    entries.map((entry) => '/' + entry.replace(/\\/g, '/').replace(/^\/+/, ''))
  );
}

/**
 * Every asset the built renderer references must be inside the packaged asar.
 */
function checkPackagedApp(appDir) {
  const resources = path.join(appDir, 'resources');
  if (!fs.existsSync(resources)) {
    problems.push('no resources directory in ' + appDir);
    return;
  }

  const asarPath = path.join(resources, 'app.asar');
  if (!fs.existsSync(asarPath)) {
    problems.push('no app.asar in ' + resources);
    return;
  }

  const asar = require('@electron/asar');
  const entries = normaliseAsarEntries(asar.listPackage(asarPath));

  // Find the renderer's JS chunk inside the asar and read it.
  const bundleEntry = [...entries].find(
    (e) => /^\/dist\/assets\/index-[^/]+\.js$/.test(e)
  );
  if (!bundleEntry) {
    problems.push('no renderer bundle found inside app.asar');
    return;
  }

  const bundle = asar.extractFile(
    asarPath,
    bundleEntry.replace(/^\//, '').split('/').join(path.sep)
  );
  const refs = referencedAssetsFromBundle(bundle.toString('utf8'));
  notes.push('packaged renderer references ' + refs.size + ' asset(s)');

  for (const ref of refs) {
    const clean = ref.replace(/^\/+/, '');
    const candidates = [
      '/dist/' + clean,
      '/dist/assets/' + clean.replace(/^assets\//, ''),
      '/' + clean,
    ];
    if (!candidates.some((c) => entries.has(c))) {
      problems.push('asset missing from the packaged app: ' + ref);
    }
  }
}

/**
 * Finds the packaged app when no path is given, so the same command works
 * on a developer machine and on every platform in CI.
 */
function findPackagedApp() {
  const outDir = path.join(REPO, 'out');
  if (!fs.existsSync(outDir)) return null;

  const candidates = fs
    .readdirSync(outDir)
    .map((entry) => path.join(outDir, entry))
    .filter((dir) => fs.existsSync(path.join(dir, 'resources', 'app.asar')));

  if (!candidates.length) return null;
  // Prefer an unpacked directory over a .zip / .exe artefact.
  candidates.sort((a, b) => {
    const aDir = fs.statSync(a).isDirectory() ? 0 : 1;
    const bDir = fs.statSync(b).isDirectory() ? 0 : 1;
    return aDir - bDir;
  });
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await checkImportsAreNotIgnored();

  let appDir = process.argv[2];
  if (!appDir) {
    appDir = findPackagedApp();
    if (appDir) notes.push('found a packaged app at ' + path.relative(REPO, appDir));
  }

  if (appDir) {
    checkPackagedApp(path.resolve(appDir));
  } else {
    notes.push('no packaged app found; only the source-level checks ran');
  }

  for (const n of notes) console.log('  . ' + n);
  if (problems.length) {
    console.error('\nFAILED:');
    for (const p of problems) console.error('  x ' + p);
    process.exit(1);
  }
  console.log('\nAll referenced assets are present and not excluded from the package.');
}

module.exports = { normaliseAsarEntries, referencedAssetsFromBundle };

if (require.main === module) {
  main().catch((err) => {
    console.error('verify-packaged-assets failed:', err && err.message);
    process.exit(1);
  });
}