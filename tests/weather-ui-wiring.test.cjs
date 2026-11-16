/**
 * Regression tests for the full-weather overlay wiring in the app shell, and
 * the guarantee that the Morning Digest card stays basic (no forecast strip).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const APP = read('src/App.tsx');
const SECTIONS = read('src/lib/section-state.ts');

test('the header button opens a full-screen weather overlay', () => {
  assert.ok(APP.includes('import { WeatherPanel }'), 'must import WeatherPanel');
  assert.ok(APP.includes('showWeather'), 'must track overlay visibility');
  assert.ok(APP.includes('CloudSun size={24}'), 'header must have a weather button');
  assert.ok(APP.includes('aria-label={showWeather ? "Close weather" : "Open full weather"}'), 'button must be accessible');
});

test('the overlay covers everything and has a close control', () => {
  assert.ok(APP.includes('{showWeather && ('), 'overlay must be conditional');
  assert.ok(APP.includes('className="weather-overlay"'), 'must be the overlay container');
  assert.ok(APP.includes('role="dialog"') && APP.includes('aria-modal="true"'), 'must be a modal dialog');
  assert.ok(APP.includes('className="weather-overlay-close"'), 'must have a close button');
  assert.ok(APP.includes('<WeatherPanel />'), 'must render the weather sheet');
});

test('the Morning Digest card remains basic weather only', () => {
  assert.ok(!APP.includes('digest-forecast-strip'), 'digest must not have a 7-day strip');
  assert.ok(!APP.includes('dailyDigest.weather.forecast.map'), 'digest must not map forecast days');
  assert.ok(APP.includes('digest-weather'), 'basic digest weather card must remain');
  assert.ok(APP.includes('weather-details'), 'digest detail tiles must remain');
});

test('weather is no longer a collapsible section id', () => {
  assert.ok(!SECTIONS.includes("'weather'"), 'weather must not be a section id');
});
