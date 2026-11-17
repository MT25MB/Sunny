/** OS speech hardening: cancellation must be silent, errors must be informative. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'os-tts.cjs'), 'utf8');

test('intentional cancellation resolves quietly', () => {
  assert.match(SRC, /cancelledChildren/, 'must track intentional cancellations');
  assert.match(SRC, /if \(cancelledChildren\.has\(child\)\) return resolve\(\)/, 'cancelled child must resolve');
});

test('real failures include stderr for diagnosis', () => {
  assert.match(SRC, /\(error, stdout, stderr\)/, 'execFile callback must capture stderr');
  assert.match(SRC, /detail.*stderr|stderr.*detail/, 'stderr must be included in the error');
});

test('voice selection cannot abort speech', () => {
  assert.match(SRC, /ErrorActionPreference="Continue"/, 'warnings must not be fatal');
  assert.match(SRC, /catch \{ \}[\s\S]{0,120}\$synth\.Rate/, 'voice failure must fall through to speaking');
});

test('PowerShell path does not rely on packaged PATH', () => {
  assert.match(SRC, /function powerShellPath/, 'must resolve the binary explicitly');
  assert.match(SRC, /WindowsPowerShell/, 'must know the standard install path');
  assert.match(SRC, /command = powerShellPath\(\)/, 'must use the resolved path');
});

test('the UI does not show raw IPC errors to the user', () => {
  const APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  const at = APP.indexOf('const handleSpeakDailyDigest');
  const block = APP.slice(at, at + 700);
  assert.match(block, /Speak Digest Aloud|friendly|could not|Sorry|try again/i, 'must give a readable failure message');
  assert.ok(!block.includes('describeError(e)'), 'raw error text must not be shown for speech');
});
