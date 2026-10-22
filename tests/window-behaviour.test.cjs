/**
 * How the window behaves when the app is started again.
 *
 * Run with:  node --test tests/
 *
 * Closing the window hides it to the tray rather than quitting, which is
 * deliberate: an app for older adults must not vanish when someone
 * presses the X. But that leaves the app with no window, and the only way
 * back was to find the tray icon.
 *
 * Starting the app again is the obvious way back in, and it did not work:
 * there was no single-instance lock, so the second launch started a second
 * copy with a second window. The person clicking the icon saw a new
 * window in the wrong place, or nothing at all, while the window they
 * wanted belonged to the copy already sitting in the tray.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');

test('only one copy of the app may run', () => {
  assert.ok(
    /app\.requestSingleInstanceLock\(\)/.test(MAIN),
    'the app must take the single instance lock'
  );
  assert.ok(
    /app\.exit\(0\)/.test(MAIN),
    'a second copy must give up rather than open a window of its own'
  );
});

test('starting the app again brings the window back', () => {
  assert.ok(
    /app\.on\('second-instance'/.test(MAIN),
    "the app must react to a second launch"
  );
  // The window has to be shown and focused, not just created: the copy
  // that is already running has its window hidden in the tray.
  const handler = MAIN.slice(
    MAIN.indexOf("app.on('second-instance'"),
    MAIN.indexOf('});', MAIN.indexOf("app.on('second-instance'"))
  );
  assert.ok(
    /showMainWindow\(\)/.test(handler),
    'a second launch must show the window that is already running'
  );
});

test('the window is shown and focused, not merely created', () => {
  const start = MAIN.indexOf('function showMainWindow');
  assert.ok(start !== -1, 'showMainWindow must exist');
  const body = MAIN.slice(start, MAIN.indexOf('\n}', start));
  assert.ok(
    /mainWindow\.show\(\)/.test(body),
    'the window must be shown'
  );
  assert.ok(
    /mainWindow\.focus\(\)/.test(body),
    'the window must take the focus, or it stays behind whatever is open'
  );
  assert.ok(
    /isMinimized\(\)/.test(body),
    'a minimised window must be restored, or showing it does nothing'
  );
});

test('closing the window hides it to the tray rather than quitting', () => {
  // This is the behaviour that makes the single instance lock matter: the
  // app is still running with no window on screen.
  assert.ok(
    /mainWindow\.on\('close'[\s\S]{0,300}mainWindow\.hide\(\)/.test(MAIN),
    'closing the window must hide it to the tray'
  );
});
