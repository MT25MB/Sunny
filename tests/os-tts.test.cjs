/**
 * Regression tests for OS-level text-to-speech. The "Speak Digest Aloud"
 * button previously relied solely on the sandboxed renderer's Web Speech
 * API, which does not reliably produce audio in the packaged app. Speech must
 * go through the main process using the operating system's TTS.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(REPO, 'src', 'electron', 'preload.cjs'), 'utf8');
const BRAIN = fs.readFileSync(path.join(REPO, 'src', 'renderer', 'services', 'sunnyBrain.ts'), 'utf8');
const OS = require(path.join(REPO, 'src', 'electron', 'os-tts.cjs'));

test('Windows command encodes text (no shell injection surface)', () => {
  const cmd = OS.buildWindowsCommand('Take your medicine; say "hello" & exit', -1);
  assert.ok(cmd.script.includes('FromBase64String'), 'text must be base64-decoded in PowerShell');
  assert.ok(!cmd.script.includes('Take your medicine'), 'raw user text must not be embedded in the script');
  assert.ok(cmd.args.includes('-NoProfile'));
  assert.ok(cmd.args.includes('-Command'));
  assert.match(cmd.script, /Add-Type -AssemblyName System\.Speech/, 'must load the SAPI assembly');
  assert.match(cmd.script, /System\.Speech\.Synthesis\.SpeechSynthesizer/);
});

test('a nicer installed voice is preferred when available', () => {
  const cmd = OS.buildWindowsCommand('Hello', -1);
  assert.match(cmd.script, /GetInstalledVoices/);
  assert.match(cmd.script, /Zira/, 'prefer the clearer Zira voice when installed');
});

test('the main process exposes a validated speak-text IPC', () => {
  assert.ok(MAIN.includes("ipcMain.handle('sunny:speak-text'"), 'must register speak-text');
  const at = MAIN.indexOf("ipcMain.handle('sunny:speak-text'");
  const block = MAIN.slice(at, at + 900);
  assert.ok(block.includes('assertTrustedSender(event)'), 'must check sender');
  assert.ok(block.includes('rateLimit('), 'must rate limit');
  assert.ok(block.includes('requireString') || block.includes('text.length'), 'must validate text');
  assert.ok(MAIN.includes("require('./os-tts.cjs')"), 'main must use the OS TTS module');
});

test('preload exposes speakText to the renderer', () => {
  assert.ok(PRELOAD.includes('speakText:'), 'preload must expose speakText');
});

test('the renderer speaks through OS TTS with a Web Speech fallback', () => {
  assert.ok(BRAIN.includes('speakWithOS'), 'sunnyBrain must call OS TTS');
  assert.ok(BRAIN.includes('window.electronAPI.speakText'), 'must invoke the speakText IPC');
  const at = BRAIN.indexOf('speakLocally(message: string');
  assert.notStrictEqual(at, -1, 'speakLocally must exist');
  const block = BRAIN.slice(at, at + 1400);
  assert.ok(block.includes('speakWithOS'), 'OS TTS must be the primary path');
  assert.ok(block.includes('speechSynthesis'), 'Web Speech must remain a fallback');
});
