/**
 * Weather overlay dismissal regressions.
 *
 * The corner X sits in the frameless window's title-bar area, where Electron's
 * -webkit-app-region: drag can swallow clicks that work fine in a plain browser.
 * Dismissal must therefore work through several independent paths.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const APP = read('src/App.tsx');
const PANEL = read('src/components/WeatherPanel.tsx');
const CSS = read('src/index.css');

test('the corner close button opts out of window dragging', () => {
  const i = CSS.indexOf('.weather-overlay-close {');
  assert.notStrictEqual(i, -1);
  const rule = CSS.slice(i, CSS.indexOf('}', i));
  assert.match(rule, /-webkit-app-region:\s*no-drag/, 'corner X must not be inside a drag region');
  assert.match(rule, /z-index:\s*(?:[3-9]|\d{2,})/, 'corner X must sit above the sheet');
});

test('clicking the backdrop closes the overlay', () => {
  const i = APP.indexOf('className="weather-overlay"');
  assert.notStrictEqual(i, -1);
  const block = APP.slice(i, i + 900);
  assert.match(block, /onClick=\{/, 'overlay must handle clicks');
  assert.match(block, /e\.target === e\.currentTarget/, 'only the backdrop itself closes it');
  assert.match(block, /setShowWeather\(false\)/, 'backdrop click must close');
});

test('Escape closes the overlay', () => {
  assert.match(APP, /Escape/, 'an Escape key handler must exist');
  assert.match(APP, /setShowWeather\(false\)/, 'Escape must close weather');
});

test('the sheet has its own close control away from the window edge', () => {
  assert.match(PANEL, /onClose/, 'WeatherPanel must accept a close callback');
  assert.match(PANEL, /weather-sheet-icon-btn[\s\S]{0,200}X size/, 'header must include an X close button');
  assert.match(APP, /<WeatherPanel onClose=/, 'app must wire the callback');
});
