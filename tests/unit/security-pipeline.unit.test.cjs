/**
 * UNIT TESTS: Security pipeline (content-based)
 * Tests for src/electron/main.cjs security architecture
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.cjs'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'preload.cjs'), 'utf8');

// ============================================================================
// Global error guards
// ============================================================================

test('security: main process has uncaughtException handler', () => {
  assert.ok(MAIN.includes("process.on('uncaughtException'"));
});

test('security: main process has unhandledRejection handler', () => {
  assert.ok(MAIN.includes("process.on('unhandledRejection'"));
});

test('security: error handlers signal via model-progress channel', () => {
  assert.ok(MAIN.includes("sunny:model-progress"));
});

test('security: error handlers do not call app.exit', () => {
  const uncaughtSection = MAIN.slice(MAIN.indexOf("process.on('uncaughtException'"), MAIN.indexOf("process.on('unhandledRejection'"));
  assert.ok(!uncaughtSection.includes('app.exit('), 'uncaughtException must not call app.exit');
});

test('security: error handlers do not use showErrorBox', () => {
  const uncaughtSection = MAIN.slice(MAIN.indexOf("process.on('uncaughtException'"), MAIN.indexOf("process.on('unhandledRejection'"));
  assert.ok(!uncaughtSection.includes('showErrorBox'), 'uncaughtException must not use showErrorBox');
});

// ============================================================================
// CSP
// ============================================================================

test('security: CSP is imported from csp.cjs', () => {
  assert.ok(MAIN.includes("const { withCsp } = require('./csp.cjs');"));
});

test('security: CSP applied on headers-received', () => {
  assert.ok(MAIN.includes('session.defaultSession.webRequest.onHeadersReceived'));
});

test('security: CSP callback is wrapped in try/catch', () => {
  assert.ok(MAIN.includes('try {'));
  assert.ok(MAIN.includes('callback({ responseHeaders: withCsp(details.responseHeaders) });'));
  assert.ok(MAIN.includes('callback({ responseHeaders: details.responseHeaders });'));
});

// ============================================================================
// Media permissions
// ============================================================================

test('security: media permission request handler', () => {
  assert.ok(MAIN.includes('setPermissionRequestHandler'));
});

test('security: media permission check handler', () => {
  assert.ok(MAIN.includes('setPermissionCheckHandler'));
});

test('security: only media permission is granted', () => {
  assert.ok(MAIN.includes("permission === 'media'"));
});

// ============================================================================
// Single instance
// ============================================================================

test('security: app takes single instance lock', () => {
  assert.ok(MAIN.includes('app.requestSingleInstanceLock()'));
});

test('security: second copy exits', () => {
  assert.ok(MAIN.includes('app.exit(0)'));
});

test('security: second instance brings window forward', () => {
  assert.ok(MAIN.includes("app.on('second-instance'"));
});

test('security: showMainWindow shows and focuses', () => {
  assert.ok(MAIN.includes('mainWindow.show()'));
  assert.ok(MAIN.includes('mainWindow.focus()'));
});

// ============================================================================
// Auto-updater
// ============================================================================

test('security: updater gated on app.isPackaged not NODE_ENV', () => {
  assert.ok(MAIN.includes('if (app.isPackaged)'));
  assert.ok(!MAIN.includes("process.env.NODE_ENV === 'production'"), 'updater must not be gated on NODE_ENV');
});

test('security: updater uses electron-updater', () => {
  assert.ok(MAIN.includes("const { autoUpdater } = require('electron-updater');"));
});

test('security: updater uses electron-log', () => {
  assert.ok(MAIN.includes("const log = require('electron-log');"));
});

test('security: autoDownload is false (opt-in)', () => {
  assert.ok(MAIN.includes("autoUpdater.autoDownload = false;"));
});

test('security: autoInstallOnAppQuit is true', () => {
  assert.ok(MAIN.includes("autoUpdater.autoInstallOnAppQuit = true;"));
});

test('security: updater uses GitHub provider', () => {
  assert.ok(MAIN.includes("provider: 'github'"));
  assert.ok(MAIN.includes("owner: 'MT25MB'"));
  assert.ok(MAIN.includes("repo: 'Sunny'"));
});

// ============================================================================
// Window security
// ============================================================================

test('security: setWindowOpenHandler denies non-HTTP navigation', () => {
  assert.ok(MAIN.includes('setWindowOpenHandler'));
  assert.ok(MAIN.includes("action: 'deny'"));
});

test('security: will-navigate prevents in-page navigation', () => {
  assert.ok(MAIN.includes('will-navigate'));
});

test('security: external links open in browser via shell.openExternal', () => {
  assert.ok(MAIN.includes('shell.openExternal(url)'));
});

// ============================================================================
// Preload security
// ============================================================================

test('preload: uses contextBridge.exposeInMainWorld', () => {
  assert.ok(PRELOAD.includes('contextBridge.exposeInMainWorld'));
});

test('preload: exposes electronAPI', () => {
  assert.ok(PRELOAD.includes("contextBridge.exposeInMainWorld('electronAPI', electronAPI);"));
});

test('preload: exposes windowControls', () => {
  assert.ok(PRELOAD.includes("contextBridge.exposeInMainWorld('windowControls', windowControls);"));
});

test('preload: exposes sunnyDesktop legacy surface', () => {
  assert.ok(PRELOAD.includes("contextBridge.exposeInMainWorld('sunnyDesktop',"));
});

test('preload: sanitizes input with deepSanitize', () => {
  assert.ok(PRELOAD.includes('function deepSanitize(value)'));
});

test('preload: DANGEROUS_CHARS_REGEX blocks command substitution', () => {
  assert.ok(PRELOAD.includes('const DANGEROUS_CHARS_REGEX = /`|\\$\\{|\\$\\(|;|&&|\\|\\||\\|/g;'));
});

// ============================================================================
// Interceptor integration
// ============================================================================

test('security: main.cjs imports interceptor functions', () => {
  assert.ok(MAIN.includes("const { interceptAction, sanitizeUntrustedContent, checkParameterAmbiguity, DESTRUCTIVE_TEXT_PATTERN } = require('../main/security/interceptor.cjs');"));
});

test('security: execute-actions handler uses interceptAction', () => {
  assert.ok(MAIN.includes('const result = interceptAction(action);'));
});

test('security: execute-actions handler checks block verdict', () => {
  assert.ok(MAIN.includes("result.verdict === 'block'"));
});

test('security: execute-actions handler checks confirm verdict', () => {
  assert.ok(MAIN.includes("result.verdict === 'confirm'"));
});

test('security: execute-actions handler calls confirmSensitiveOperation', () => {
  assert.ok(MAIN.includes('confirmSensitiveOperation'));
});

// ============================================================================
// Credential security
// ============================================================================

test('security: credentials stored in userData/credentials directory', () => {
  assert.ok(MAIN.includes("path.join(app.getPath('userData'), 'credentials');"));
});

test('security: credential path uses safeStorage encryption', () => {
  assert.ok(MAIN.includes('safeStorage.encryptString(value);'));
  assert.ok(MAIN.includes('safeStorage.decryptString(encrypted);'));
});

test('security: credential key validated via getCredentialPath', () => {
  assert.ok(MAIN.includes('const filePath = getCredentialPath(key);'));
});

test('security: checks safeStorage.isEncryptionAvailable()', () => {
  assert.ok(MAIN.includes('!safeStorage.isEncryptionAvailable()'));
});

test('security: credential files written with mode 0o600', () => {
  assert.ok(MAIN.includes('{ mode: 0o600 }'));
});

// ============================================================================
// Model security
// ============================================================================

test('security: model cache redirected out of node_modules', () => {
  // Check inference.cjs
  const INFERENCE = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'inference.cjs'), 'utf8');
  assert.ok(INFERENCE.includes('env.cacheDir = cacheDir;'));
  assert.ok(INFERENCE.includes('userData'));
});

test('security: model loading does not call app.exit on failure', () => {
  const startupSection = MAIN.slice(MAIN.indexOf('inference.initModel((status)'), MAIN.indexOf('app.on(\'window-all-closed\''));
  assert.ok(!startupSection.includes('app.exit('), 'model init failure must not call app.exit');
});

test('security: model loading does not use showErrorBox', () => {
  const startupSection = MAIN.slice(MAIN.indexOf('inference.initModel((status)'), MAIN.indexOf('app.on(\'window-all-closed\''));
  assert.ok(!startupSection.includes('showErrorBox'), 'model init failure must not use showErrorBox');
});

// ============================================================================
// executeActions security
// ============================================================================

test('security: executeActions uses execFile not shell', () => {
  assert.ok(MAIN.includes("const { execFile } = require('node:child_process');"));
});

test('security: executeActions uses promisified execFile', () => {
  assert.ok(MAIN.includes('const execFileAsync = promisify(execFile);'));
});

test('security: executeActions has launch timeout', () => {
  assert.ok(MAIN.includes('{ timeout: APP_LAUNCH_TIMEOUT_MS, windowsHide: true }'));
});

test('security: executeActions limits actions per batch', () => {
  assert.ok(MAIN.includes('MAX_ACTIONS_PER_BATCH'));
});

test('security: executeActions limits typed chars', () => {
  assert.ok(MAIN.includes('MAX_TYPED_CHARS'));
});

// ============================================================================
// Window security
// ============================================================================

test('security: window is frameless', () => {
  assert.ok(MAIN.includes('frame: false'));
});

test('security: window has contextIsolation', () => {
  assert.ok(MAIN.includes('contextIsolation: true'));
});

test('security: window has nodeIntegration false', () => {
  assert.ok(MAIN.includes('nodeIntegration: false'));
});

test('security: window has sandbox true', () => {
  assert.ok(MAIN.includes('sandbox: true'));
});

test('security: webPreferences does not allow nodeIntegration', () => {
  // Verify nodeIntegration is explicitly false
  const webPrefsSection = MAIN.slice(MAIN.indexOf('webPreferences: {'), MAIN.indexOf('});', MAIN.indexOf('webPreferences: {')));
  assert.ok(!webPrefsSection.includes('nodeIntegration: true'), 'nodeIntegration must not be true');
});
