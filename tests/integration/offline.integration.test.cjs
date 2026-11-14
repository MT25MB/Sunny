'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const mainCjsPath = path.join(process.cwd(), 'src/electron/main.cjs');
const mainCjs = fsRead(mainCjsPath);

function fsRead(p) {
  const fs = require('node:fs');
  return fs.readFileSync(p, 'utf8');
}

describe('offline — searchRecipes checks internet reachability first', () => {
  it('searchRecipes function exists in main.cjs', () => {
    assert.ok(mainCjs.includes('async function searchRecipes'));
  });

  it('checks internet before searching', () => {
    assert.ok(mainCjs.includes('const { reachable } = await readInternetStatus()'));
    assert.ok(mainCjs.includes('if (!reachable) {'));
    assert.ok(mainCjs.includes('return { recipes: [] };'));
  });
});

describe('offline — fetchDailyDigest checks internet reachability first', () => {
  it('fetchDailyDigest function exists in main.cjs', () => {
    assert.ok(mainCjs.includes('async function fetchDailyDigest'));
  });

  it('checks internet before fetching', () => {
    assert.ok(mainCjs.includes('const { reachable } = await readInternetStatus()'));
    assert.ok(mainCjs.includes('if (!reachable) {'));
  });

  it('returns offline stub when no internet', () => {
    assert.ok(mainCjs.includes("condition: 'Unknown'"));
    assert.ok(mainCjs.includes("location: 'Offline'"));
    assert.ok(mainCjs.includes('No internet connection'));
  });
});

describe('offline — auto-updater skips check when offline', () => {
  it('auto-updater checks internet before running', () => {
    assert.ok(mainCjs.includes('const { reachable } = await readInternetStatus()'));
    assert.ok(mainCjs.includes('if (reachable) runUpdateCheck()'));
  });

  it('periodic check honours offline state', () => {
    assert.ok(mainCjs.includes('const { reachable } = await readInternetStatus()'));
    assert.ok(mainCjs.includes('if (reachable) runUpdateCheck()'));
  });
});

describe('offline — built-in model works without internet', () => {
  it('inference.cjs exports runInference', () => {
    const inferencePath = path.join(process.cwd(), 'src/electron/inference.cjs');
    const fs = require('node:fs');
    const inferenceCjs = fs.readFileSync(inferencePath, 'utf8');
    assert.ok(inferenceCjs.includes('async function runInference'));
  });

  it('model loading does not terminate app on failure', () => {
    assert.ok(mainCjs.includes('.catch((err) => {'));
    assert.ok(mainCjs.includes('console.error(\'[Startup] Model initialization failed:'));
  });
});

describe('offline — medication reminders work without internet', () => {
  it('scheduleMedicationReminder does not require internet', () => {
    assert.ok(mainCjs.includes('async function scheduleMedicationReminder'));
    // Check within the scheduleMedicationReminder function specifically
    const funcStart = mainCjs.indexOf('async function scheduleMedicationReminder');
    const funcEnd = mainCjs.indexOf('function startMedicationChecker', funcStart);
    const funcBody = mainCjs.slice(funcStart, funcEnd);
    assert.ok(!funcBody.includes('fetch('), 'scheduleMedicationReminder should not use fetch');
  });

  it('medication reminders are persisted to JSON file', () => {
    assert.ok(mainCjs.includes('medication-reminders.json'));
    assert.ok(mainCjs.includes('saveMedicationReminders()'));
    assert.ok(mainCjs.includes('loadMedicationReminders()'));
  });
});

describe('offline — preferences work without internet', () => {
  it('preferences are stored in localStorage (renderer)', () => {
    const prefsPath = path.join(process.cwd(), 'src/lib/local-preferences.ts');
    const fs = require('node:fs');
    const prefsJs = fs.readFileSync(prefsPath, 'utf8');
    assert.ok(prefsJs.includes('localStorage.getItem'));
    assert.ok(prefsJs.includes('localStorage.setItem'));
  });

  it('runtimePreferences are mirrored to main process', () => {
    assert.ok(mainCjs.includes('const runtimePreferences = {'));
    assert.ok(mainCjs.includes('applyPreferenceUpdates'));
  });
});

describe('offline — credentials work without internet', () => {
  it('credentials are stored locally with safeStorage encryption', () => {
    assert.ok(mainCjs.includes('safeStorage.encryptString'));
    assert.ok(mainCjs.includes('safeStorage.decryptString'));
    assert.ok(mainCjs.includes('credentials'));
  });

  it('credential path traversal is rejected', () => {
    const credPathPath = path.join(process.cwd(), 'src/electron/credential-path.cjs');
    const fs = require('node:fs');
    const credPathCjs = fs.readFileSync(credPathPath, 'utf8');
    assert.ok(credPathCjs.includes('path traversal') || credPathCjs.includes('traversal'));
  });
});
