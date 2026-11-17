/**
 * Regression: getDailyDigest must unwrap the main process's
 * { success, data } envelope before returning the digest. speakDailyDigest
 * reads digest.weather.location, so returning the envelope produced
 * "Cannot read properties of undefined (reading 'location')" in the UI.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const REPO = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(REPO, 'src/renderer/services/sunnyBrain.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-envelope-'));
const compiledPath = path.join(tmp, 'sunnyBrain.cjs');
fs.writeFileSync(compiledPath, compiled.outputText);

const digest = {
  weather: { temperature: 21, condition: 'Clear', location: 'New York, NY' },
  news: [],
  date: '2026-11-17',
};

test('getDailyDigest unwraps the success/data envelope', async () => {
  global.window = {
    electronAPI: {
      getDailyDigest: async () => ({ success: true, data: digest }),
      speakNotification: async () => ({ success: true }),
    },
  };
  let brain;
  try {
    brain = new (require(compiledPath).SunnyBrain)();
  } finally {
    // module stays cached; fine for this single test process
  }
  const result = await brain.getDailyDigest();
  assert.ok(result, 'must return a digest');
  assert.ok(result.weather, 'digest must carry weather');
  assert.equal(result.weather.location, 'New York, NY');
  fs.rmSync(tmp, { recursive: true, force: true });
});
