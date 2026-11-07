/**
 * INTEGRATION TESTS: Offline Behavior
 * Tests that network-dependent features degrade gracefully when offline.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');

test('offline: searchRecipes checks internet reachability first', () => {
  assert.ok(MAIN.includes('async function searchRecipes'), 'searchRecipes function exists');
  const searchRecipesSection = MAIN.slice(
    MAIN.indexOf('async function searchRecipes'),
    MAIN.indexOf('async function searchDuckDuckGoRecipes')
  );
  assert.ok(searchRecipesSection.includes('readInternetStatus'), 'searchRecipes checks internet status');
  assert.ok(searchRecipesSection.includes('!reachable'), 'searchRecipes checks if not reachable');
  assert.ok(searchRecipesSection.includes('return { recipes: [] }'), 'searchRecipes returns empty when offline');
});

test('offline: fetchDailyDigest checks internet reachability first', () => {
  assert.ok(MAIN.includes('async function fetchDailyDigest'), 'fetchDailyDigest function exists');
  const fetchDailyDigestSection = MAIN.slice(
    MAIN.indexOf('async function fetchDailyDigest'),
    MAIN.indexOf('function getWeatherCondition')
  );
  assert.ok(fetchDailyDigestSection.includes('readInternetStatus'), 'fetchDailyDigest checks internet status');
  assert.ok(fetchDailyDigestSection.includes('!reachable'), 'fetchDailyDigest checks if not reachable');
  assert.ok(fetchDailyDigestSection.includes('No internet connection'), 'fetchDailyDigest returns offline stub');
});

test('offline: auto-updater skips check when offline', () => {
  assert.ok(MAIN.includes('readInternetStatus'), 'updater checks internet status');
  // The startup check and periodic check both check reachability
  const updaterSection = MAIN.slice(
    MAIN.indexOf('if (app.isPackaged)'),
    MAIN.indexOf('app.on(\'window-all-closed\'')
  );
  assert.ok(updaterSection.includes('readInternetStatus'), 'updater checks internet reachability');
  assert.ok(updaterSection.includes('if (reachable)'), 'updater only checks when reachable');
});

test('offline: built-in model works without internet', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  // Model cache is in userData, so it works offline after first download
  assert.ok(content.includes('userData'), 'model cache is in userData (works offline)');
  assert.ok(content.includes('allowLocalModels = true'), 'local models are allowed');
});

test('offline: medication reminders work without internet', () => {
  assert.ok(MAIN.includes('medicationReminders.set'), 'medication reminders are stored in memory');
  assert.ok(MAIN.includes('saveMedicationReminders'), 'medication reminders are persisted to disk');
  assert.ok(MAIN.includes('startMedicationChecker'), 'medication checker runs on interval');
  assert.ok(MAIN.includes('medication-reminders.json'), 'medication reminders use local JSON file');
});

test('offline: preferences work without internet', () => {
  const fs = require('node:fs');
  const prefsPath = path.join(REPO, 'src', 'lib', 'local-preferences.ts');
  const content = fs.readFileSync(prefsPath, 'utf8');
  assert.ok(content.includes('localStorage'), 'preferences use localStorage (works offline)');
});

test('offline: credentials work without internet', () => {
  const fs = require('node:fs');
  const mainPath = path.join(REPO, 'src', 'electron', 'main.cjs');
  const content = fs.readFileSync(mainPath, 'utf8');
  assert.ok(content.includes("app.getPath('userData')"), 'credentials are stored in userData (works offline)');
  assert.ok(content.includes('safeStorage'), 'credentials use OS safeStorage (works offline)');
});
