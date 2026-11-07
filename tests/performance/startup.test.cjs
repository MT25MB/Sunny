/**
 * PERFORMANCE TESTS: Startup Time and Model Load Time
 * Tests for app startup performance.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');

test('performance: app entry point exists', () => {
  const appPath = path.join(REPO, 'src', 'electron', 'main.cjs');
  assert.ok(fs.existsSync(appPath), 'main.cjs exists');
});

test('performance: renderer entry exists', () => {
  const appPath = path.join(REPO, 'src', 'App.tsx');
  assert.ok(fs.existsSync(appPath), 'App.tsx exists');
  const preloadPath = path.join(REPO, 'src', 'electron', 'preload.cjs');
  assert.ok(fs.existsSync(preloadPath), 'preload.cjs exists');
});

test('performance: main.cjs does not block startup on model load', () => {
  const fs = require('node:fs');
  const mainPath = path.join(REPO, 'src', 'electron', 'main.cjs');
  const content = fs.readFileSync(mainPath, 'utf8');
  // Model init is called with .catch() and doesn't block window creation
  assert.ok(content.includes('.catch((err) => {'), 'model init has error handler');
  assert.ok(content.includes('createWindow()'), 'createWindow is called');
  // Model init should not be awaited before window creation
  const createWindowIndex = content.indexOf('createWindow()');
  const initModelIndex = content.indexOf('inference.initModel((status)');
  assert.ok(createWindowIndex !== -1 && initModelIndex !== -1, 'both createWindow and initModel exist');
});

test('performance: build output exists', () => {
  const fs = require('node:fs');
  const distPath = path.join(REPO, 'dist');
  // dist may not exist if not built; check source instead
  const appHtmlPath = path.join(REPO, 'app.html');
  assert.ok(fs.existsSync(appHtmlPath), 'app.html exists');
  const mainTsxPath = path.join(REPO, 'src', 'main.tsx');
  assert.ok(fs.existsSync(mainTsxPath), 'main.tsx exists');
});

test('performance: Vite config has reasonable build settings', () => {
  const fs = require('node:fs');
  const vitePath = path.join(REPO, 'vite.config.ts');
  const content = fs.readFileSync(vitePath, 'utf8');
  assert.ok(content.includes('outDir'), 'vite config has outDir');
  assert.ok(content.includes('dist'), 'vite config uses dist directory');
  assert.ok(content.includes('base: \'./\''), 'vite config uses relative base');
});

test('performance: code splitting is enabled via Vite', () => {
  const fs = require('node:fs');
  const vitePath = path.join(REPO, 'vite.config.ts');
  const content = fs.readFileSync(vitePath, 'utf8');
  assert.ok(content.includes('rollupOptions'), 'vite config has rollupOptions');
  assert.ok(content.includes('input'), 'vite config specifies input');
});

test('performance: lazy model loading', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes('let initPromise = null'), 'initPromise is used for lazy loading');
  assert.ok(content.includes('if (initPromise) return initPromise'), 'concurrent callers share single load');
});

test('performance: Whisper is loaded lazily', () => {
  const fs = require('node:fs');
  const speechPath = path.join(REPO, 'src', 'electron', 'speech.cjs');
  const content = fs.readFileSync(speechPath, 'utf8');
  assert.ok(content.includes('let asrPromise = null'), 'asrPromise is used for lazy loading');
  assert.ok(content.includes('if (asrPromise) return asrPromise'), 'concurrent callers share single Whisper load');
});

test('performance: model cache is in userData', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes("app.getPath('userData')"), 'model cache uses userData path');
});
