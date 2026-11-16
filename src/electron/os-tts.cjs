/**
 * Operating-system text-to-speech, run from the main process.
 *
 * The renderer's Web Speech API is unreliable in a sandboxed packaged Electron
 * window (voices load asynchronously and there is no failure signal). This
 * module uses the OS speech engine directly: SAPI via PowerShell on Windows,
 * `say` on macOS, `spd-say`/`espeak` on Linux. All free and built in.
 */

'use strict';

const { execFile } = require('node:child_process');

let currentChild = null;

/** Stop any speech currently playing. Safe to call repeatedly. */
function cancelSpeech() {
  if (currentChild) {
    try { currentChild.kill(); } catch { /* already gone */ }
    currentChild = null;
  }
}

/**
 * Build the PowerShell invocation for Windows SAPI. The text is never placed
 * in the script: it is passed as base64 (UTF-16LE) and decoded at runtime, so
 * quotes, semicolons or `&` in a headline cannot become shell commands.
 * @param {string} text
 * @param {number} rate SAPI rate, -10 (slowest) .. 10 (fastest)
 */
function buildWindowsCommand(text, rate = -1) {
  const encoded = Buffer.from(String(text), 'utf16le').toString('base64');
  const sapiRate = Number.isFinite(rate) ? Math.max(-10, Math.min(10, Math.trunc(rate))) : -1;
  const script = [
    '$ErrorActionPreference="Stop";',
    'Add-Type -AssemblyName System.Speech;',
    `$txt=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));`,
    '$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer;',
    'try {',
    '  $voice=$synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like "*Zira*" } | Select-Object -First 1;',
    '  if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }',
    `  $synth.Rate=${sapiRate};`,
    '  $synth.Speak($txt)',
    '} finally { $synth.Dispose() }',
  ].join('');
  return { script, args: ['-NoProfile', '-NonInteractive', '-Command', script] };
}

/**
 * Speak text using the OS engine. Resolves when playback finishes, rejects on
 * failure so the caller can fall back to the Web Speech API.
 * @param {string} text
 * @param {{ rate?: number }} [options]
 * @returns {Promise<void>}
 */
function speak(text, { rate = -1 } = {}) {
  cancelSpeech();
  const message = String(text ?? '').trim();
  if (!message) return Promise.resolve();

  let command;
  let args;
  if (process.platform === 'win32') {
    const built = buildWindowsCommand(message, rate);
    command = 'powershell.exe';
    args = built.args;
  } else if (process.platform === 'darwin') {
    command = 'say';
    args = ['-r', String(Math.round(150 + (rate || 0) * 20)), message];
  } else {
    command = 'spd-say';
    args = ['-r', String(Math.round(160 + (rate || 0) * 20)), message];
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = execFile(command, args, { windowsHide: true, timeout: 120000 }, (error) => {
        if (currentChild === child) currentChild = null;
        if (error) reject(new Error(`OS speech failed: ${error.message}`));
        else resolve();
      });
    } catch (err) {
      reject(err);
      return;
    }
    currentChild = child;
  });
}

module.exports = { speak, cancelSpeech, buildWindowsCommand };
