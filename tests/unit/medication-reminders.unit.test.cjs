/**
 * Regression tests for the medication reminder flow.
 *
 * Reminders already fired and spoke in the renderer, but they did nothing
 * to reach the user's attention when they were working in another app: no
 * toast, no window raise, no visible overlay. These tests pin the main
 * process behaviour (announce in both the scheduled and the catch-up path)
 * and the renderer overlay.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const MAIN = read('src/electron/main.cjs');
const APP = read('src/App.tsx');
const CSS = read('src/index.css');

test('the scheduled reminder path brings the window forward and shows a toast', () => {
  assert.ok(MAIN.includes('announceMedicationReminder'), 'main must define announceMedicationReminder');
  assert.ok(MAIN.includes('setAlwaysOnTop'), 'the reminder must raise the window above other apps');
  assert.ok(MAIN.includes('show()'), 'the reminder must show a hidden window');
  assert.ok(MAIN.includes('focus()'), 'the reminder must focus the window');
  assert.ok(MAIN.includes('urgency') || MAIN.includes('Notification'), 'the reminder must show a system toast');
});

test('the catch-up (missed while closed) path also announces', () => {
  // Both the periodic check and the startup catch-up must call announce.
  const announceCount = (MAIN.match(/announceMedicationReminder\(/g) || []).length;
  assert.ok(announceCount >= 3, `announceMedicationReminder must be called from both paths (found ${announceCount})`);
});

test('the renderer subscribes and shows the big popup', () => {
  assert.ok(APP.includes('medicationPopup'), 'App.tsx must track the medication popup state');
  assert.ok(APP.includes('className="medication-popup-overlay"'), 'App.tsx must render the popup overlay');
  assert.ok(APP.includes('Time to take'), 'the popup must tell the user it is time');
  assert.ok(APP.includes("I've taken it") || APP.includes("I&rsquo;ve taken it"), 'the popup must offer an acknowledge action');
});

test('the popup card has proper dialog semantics', () => {
  assert.ok(APP.includes('role="alertdialog"'), 'the popup must use alertdialog semantics');
  assert.ok(APP.includes('aria-modal="true"'), 'the popup must be modal');
  assert.ok(APP.includes('medication-popup-title'), 'the popup must have an id-linked title');
});

test('the popup stylesheet exists and is a full-screen overlay', () => {
  assert.ok(CSS.includes('.medication-popup-overlay'), 'popup overlay styles must exist');
  assert.ok(CSS.includes('position: fixed'), 'the overlay must be fixed');
  assert.ok(CSS.includes('z-index: 9999') || CSS.includes('z-index:9999'), 'the overlay must sit above everything');
  assert.ok(CSS.includes('.medication-popup-card'), 'popup card styles must exist');
  assert.ok(CSS.includes('.medication-popup-name'), 'popup name styles must exist');
});
