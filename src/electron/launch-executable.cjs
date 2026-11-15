/**
 * Launching desktop applications from the main process.
 *
 * Two rules, learned from shipping the calculator that never opened:
 *
 * 1. Never wait for the program to exit. GUI apps (Calculator, Notepad,
 *    Explorer…) stay running for as long as the user keeps them open, so
 *    awaiting them blocks the action forever.
 *
 * 2. A missing or unlaunchable program must be reported, not swallowed.
 *    Launching an app that is not installed used to report "Done." and do
 *    nothing. Resolution happens on the process 'spawn' event, not on
 *    exit, and spawn errors resolve to a readable message.
 *
 * Defence in depth: no shell is involved, so arguments can never be
 * reinterpreted by a shell.
 *
 * Kept deliberately free of Electron imports so it can be unit tested in
 * plain Node.
 */

'use strict';

/**
 * @param {string} exe executable to launch, resolved against PATH
 * @param {string[]} [args] arguments, passed verbatim to the process
 * @returns {Promise<{launched: true} | {launched: false, error: string}>}
 */
function launchExecutable(exe, args) {
  const { spawn } = require('node:child_process');
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args || [], { windowsHide: false, detached: true, stdio: 'ignore' });
    } catch (err) {
      resolve(mapError(exe, err));
      return;
    }
    child.on('error', (err) => resolve(mapError(exe, err)));
    child.on('spawn', () => {
      // The process is up. Detach and unref so the app outlives this one.
      child.unref();
      resolve({ launched: true });
    });
  });
}

/** Map a spawn failure to a readable message for the caller to surface. */
function mapError(exe, err) {
  const code = err && err.code;
  if (code === 'ENOENT' || code === 127) {
    return { launched: false, error: `"${exe}" was not found on this computer.` };
  }
  if (code === 'ETIMEDOUT') {
    return { launched: false, error: `"${exe}" took too long to start.` };
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return { launched: false, error: `Sunny does not have permission to start "${exe}".` };
  }
  return { launched: false, error: (err && err.message) || 'Unknown error while launching the application.' };
}

module.exports = { launchExecutable, mapError };
