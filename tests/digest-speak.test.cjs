/**
 * Regression: the digest read-aloud must use a single direct OS-speech call,
 * not the general notification path (which validates/chunks and can silently
 * fall back to the unreliable sandboxed Web Speech API in packaged builds).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const REPO = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(REPO, 'src/renderer/services/sunnyBrain.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
});
const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'digest-speak-'));
const file = path.join(tmp, 'brain.cjs');
fs.writeFileSync(file, compiled.outputText);

test('speakDailyDigest calls speakText directly with the full text', async () => {
  const digest = {
    weather: { temperature: 7, condition: 'Clear sky', location: 'New York, NY' },
    news: [{ title: 'A headline' }],
    date: '2026-11-17',
  };
  const calls = { text: [], validate: 0 };
  global.window = {
    electronAPI: {
      getDailyDigest: async () => ({ success: true, data: digest }),
      speakText: async (text) => { calls.text.push(text); return { success: true }; },
      speakNotification: async () => { calls.validate++; return { success: true }; },
    },
  };
  const { SunnyBrain } = require(file);
  const brain = new SunnyBrain();
  await brain.speakDailyDigest();
  assert.equal(calls.text.length, 1, 'must make exactly one direct OS speech call');
  assert.match(calls.text[0], /Current weather in New York, NY/i);
  assert.match(calls.text[0], /A headline/);
  assert.equal(calls.validate, 0, 'must not use the notification validation path');
  fs.rmSync(tmp, { recursive: true, force: true });
});
