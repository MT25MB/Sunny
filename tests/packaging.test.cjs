/**
 * Packaging regression tests.
 *
 * Real failure that shipped: the chat could not perform ANY desktop action -
 * "open calculator" failed with "Cannot find package '@nut-tree-fork/nut-js'
 * imported from app.asar". The package was in devDependencies, so electron
 * packaging pruned it out of the app while the code that imports it shipped.
 *
 * These tests pin the three conditions that make the automation module
 * usable in the packaged app, and require failing loudly when they drift.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const MAIN = read('src/electron/main.cjs');
const FORGE = read('forge.config.js');
const PACKAGE = JSON.parse(read('package.json'));
const LOCK = JSON.parse(read('package-lock.json'));

test('the automation module is a production dependency', () => {
  // electron-packager prunes devDependencies from the packaged app, so a
  // module the packaged code imports must never be declared there.
  assert.ok(
    PACKAGE.dependencies && PACKAGE.dependencies['@nut-tree-fork/nut-js'],
    '@nut-tree-fork/nut-js must be in dependencies (the packaged code imports it)'
  );
  assert.ok(
    !(PACKAGE.devDependencies || {})['@nut-tree-fork/nut-js'],
    '@nut-tree-fork/nut-js must not be in devDependencies'
  );
});

test('the lockfile does not mark the automation module as dev-only', () => {
  const entry = LOCK.packages && LOCK.packages['node_modules/@nut-tree-fork/nut-js'];
  assert.ok(entry, 'package-lock must have the @nut-tree-fork/nut-js entry');
  assert.notEqual(entry.dev, true, 'the lockfile entry must not be marked dev');
});

test('the packaged app unpacks the automation module from the ASAR', () => {
  // A native .node beside an ASAR path fails dlopen; the forge config must
  // unpack @nut-tree-fork from the archive.
  assert.ok(
    FORGE.includes('**/node_modules/@nut-tree-fork/**'),
    'forge config must unpack @nut-tree-fork from the ASAR'
  );
});

test('the chat does not load the automation module for actions that do not need it', () => {
  // open_app / wait / screenshot / window_action need no OS automation, so
  // a broken automation module cannot block them.
  assert.ok(
    MAIN.includes('AUTOMATION_TYPES'),
    'main.cjs must declare which action types need the automation module'
  );
  assert.ok(
    MAIN.includes('AUTOMATION_TYPES.has(a.type)'),
    'automation must be resolved lazily, only when the batch uses automation-driven actions'
  );
});

test('a missing automation module produces a readable error, not a stack trace', () => {
  assert.ok(
    MAIN.includes('could not be loaded'),
    'getAutomation must wrap the import failure in a readable message'
  );
});

test('checkRuntimeModules flags a missing automation module', () => {
  const { checkRuntimeModules } = require('../scripts/verify-packaged-assets.cjs');
  const entries = new Set(['/node_modules/electron-updater/package.json']);
  const problems = checkRuntimeModules('/nonexistent-resources', entries);
  assert.ok(
    problems.some((p) => p.includes('@nut-tree-fork/nut-js')),
    'a missing nut-js module must be reported'
  );
});

test('checkRuntimeModules accepts a complete package', () => {
  const { checkRuntimeModules } = require('../scripts/verify-packaged-assets.cjs');
  const entries = new Set([
    '/node_modules/@nut-tree-fork/nut-js/package.json',
    '/node_modules/electron-squirrel-startup/package.json',
    '/node_modules/electron-updater/package.json',
    '/node_modules/electron-log/package.json',
  ]);
  const problems = checkRuntimeModules('/nonexistent-resources', entries);
  assert.equal(problems.length, 0);
});
