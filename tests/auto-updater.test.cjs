/**
 * Regression tests for the auto-update chain.
 *
 * Recurring class of bug: the app shipped builds that never reached users -
 * the updater was gated on a NODE_ENV check that never fires in a packaged
 * build, and then the user had no idea a fix existed. Every link of the
 * chain is pinned here; if any link breaks, the app silently stays old.
 *
 * These tests read the shipped source and assert the wiring is present.
 * They are intentionally precise about the event payload keys, because the
 * renderer subscribes with those exact names.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const MAIN = read('src/electron/main.cjs');
const PRELOAD = read('src/electron/preload.cjs');
const APP = read('src/App.tsx');
const TOAST = read('src/components/UpdateToast.tsx');
const PACKAGE = JSON.parse(read('package.json'));

test('electron-updater is wired up, feed points at the release repository', () => {
  assert.ok(MAIN.includes("require('electron-updater')"), 'main.cjs must require electron-updater');
  assert.ok(MAIN.includes('provider:'), 'feed must name a provider');
  assert.ok(MAIN.includes("owner: 'MT25MB'"), 'feed must name the owner');
  assert.ok(MAIN.includes("repo: 'Sunny'"), 'feed must name the repo');
  // app.isPackaged, not NODE_ENV as gate: NODE_ENV is never set by a packaged build.
  assert.ok(MAIN.includes('app.isPackaged'), 'updater must be gated on the packaged build');
});

test('updates are opt-in, never downloaded silently', () => {
  // A compromised repo account must not be able to ship ~200 MB of code to
  // every user unnoticed. The toast asks first.
  assert.ok(MAIN.includes('autoUpdater.autoDownload = false'), 'updates must not download silently');
  assert.ok(MAIN.includes('autoUpdater.autoInstallOnAppQuit = true'), 'a confirmed update installs on quit');
});

test('the packaged app checks for updates on startup', () => {
  assert.ok(MAIN.includes('checkForUpdatesAndNotify'), 'startup must check for updates');
  // No silent failure: update errors are logged and forwarded to the renderer.
  assert.ok(MAIN.includes("autoUpdater.on('error'"), 'updater errors must be handled');
  assert.ok(MAIN.includes("'sunny:update-error'"), 'updater errors must reach the renderer');
});

test('update events reach the renderer with the names it subscribes to', () => {
  for (const channel of ['sunny:update-available', 'sunny:update-downloaded', 'sunny:update-error']) {
    assert.ok(MAIN.includes(`'${channel}'`), `main must forward ${channel}`);
  }
  for (const binding of ['onUpdateAvailable', 'onUpdateDownloaded', 'onUpdateError']) {
    assert.ok(PRELOAD.includes(binding), `preload must expose ${binding}`);
  }
});

test('the renderer mounts the update prompt', () => {
  assert.ok(APP.includes('UpdateToast'), 'App.tsx must render the update toast');
  assert.ok(APP.includes('quitAndInstall'), 'App.tsx must offer restart-to-update');
  assert.ok(TOAST.includes('onUpdateAvailable'), 'toast subscribes to the available event');
  assert.ok(TOAST.includes('onUpdateDownloaded'), 'toast subscribes to the downloaded event');
  // Two rapid taps must not fire the download twice.
  assert.ok(TOAST.includes("phase === 'downloading'"), 'toast guards against double-click downloads');
});

test('the manual update path exists and is rate-limited', () => {
  assert.ok(MAIN.includes("ipcMain.handle('sunny:check-for-updates'"), 'manual update check handler exists');
  assert.ok(MAIN.includes("ipcMain.handle('sunny:download-update'"), 'manual download handler exists');
  assert.ok(MAIN.includes("rateLimit('sunny:check-for-updates')"), 'manual check must be rate-limited');
  assert.ok(MAIN.includes("rateLimit('sunny:download-update')"), 'download must be rate-limited');
});

test('Squirrel installers carry the app icon end to end', () => {
  const forge = read('forge.config.js');
  assert.ok(forge.includes('setupIcon'), 'Squirrel maker must brand the installer icon');
  // Both platform icons must actually exist - the maker fails late and opaquely otherwise.
  for (const icon of ['public/assets/mascot.ico', 'public/assets/mascot.icns']) {
    assert.ok(fs.existsSync(path.join(REPO, icon)), `${icon} must exist`);
  }
  // electron-squirrel-startup must run before the app takes the lock, or
  // installs exit without creating shortcuts.
  const { execFileSync } = require('node:child_process');
  const startupIdx = MAIN.indexOf('electron-squirrel-startup');
  assert.ok(startupIdx !== -1, 'main.cjs must require electron-squirrel-startup');
  const firstLockIdx = MAIN.indexOf('requestSingleInstanceLock');
  if (firstLockIdx !== -1) {
    assert.ok(startupIdx < firstLockIdx, 'squirrel startup must be handled before the single-instance lock');
  }
});

test('the packaged app registers a desktop icon and start menu shortcut', () => {
  // electron-squirrel-startup creates these on install/update. Without this
  // the app installs and is invisible to Windows Search.
  assert.ok(PACKAGE.main, 'package.json must point at the main entry');
  const startupAt = MAIN.indexOf('electron-squirrel-startup');
  const windowCreateAt = MAIN.indexOf('new BrowserWindow');
  assert.ok(
    startupAt !== -1 && (windowCreateAt === -1 || startupAt < windowCreateAt),
    'squirrel events must be handled before any window is created'
  );
});
