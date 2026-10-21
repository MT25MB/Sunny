/**
 * The packaged-asset check has to work on Windows as well as Linux.
 *
 * asar.listPackage() returns paths with the host separator, so a package
 * built on a Windows runner lists "\dist\assets\index-XXX.js". The first
 * version of the check compared those against POSIX paths, found no renderer
 * bundle, and failed the Windows packaging job on a perfectly good package.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  normaliseAsarEntries,
  referencedAssetsFromBundle,
} = require('../scripts/verify-packaged-assets.cjs');

test('asar entries are normalised to POSIX paths on every platform', () => {
  const posix = normaliseAsarEntries([
    '/dist/assets/index-ABC123.js',
    '/dist/assets/sunny-mascot-chef.webp',
  ]);
  const windows = normaliseAsarEntries([
    '\\dist\\assets\\index-ABC123.js',
    '\\dist\\assets\\sunny-mascot-chef.webp',
  ]);

  assert.deepStrictEqual([...windows].sort(), [...posix].sort());
  assert.ok(posix.has('/dist/assets/index-ABC123.js'));
  assert.ok(windows.has('/dist/assets/index-ABC123.js'));
});

test('a Windows-style entry list still finds the renderer bundle', () => {
  // The exact shape a Windows runner produces.
  const entries = normaliseAsarEntries([
    '\\package.json',
    '\\dist\\app.html',
    '\\dist\\assets\\index-9Z8Y7X6W.js',
    '\\dist\\assets\\index-9Z8Y7X6W.css',
    '\\dist\\assets\\mascot-DlroT4s7.png',
  ]);

  const bundle = [...entries].find((e) => /^\/dist\/assets\/index-[^/]+\.js$/.test(e));
  assert.ok(bundle, 'the renderer bundle must be found in a Windows listing');
  assert.strictEqual(bundle, '/dist/assets/index-9Z8Y7X6W.js');
});

test('the asset references are read out of a built bundle', () => {
  const bundle = [
    'const a=(import.meta.url).href,',
    '_p=""+new URL("sunny-mascot-chef-BKIKopEG.webp",import.meta.url).href,',
    'x="/assets/fonts/atkinson.woff2"',
  ].join('');

  const refs = referencedAssetsFromBundle(bundle);
  assert.ok(refs.has('sunny-mascot-chef-BKIKopEG.webp'));
  assert.ok(refs.has('/assets/fonts/atkinson.woff2'));
});
