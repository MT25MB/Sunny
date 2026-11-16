/**
 * Regression tests for wiring the Weather screen into the app shell and the
 * compact forecast strip into the Morning Digest card.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const APP = read('src/App.tsx');
const SECTIONS = read('src/lib/section-state.ts');

test('the app shell has a weather toggle in the header', () => {
  assert.ok(APP.includes('import { WeatherPanel }'), 'must import WeatherPanel');
  assert.ok(APP.includes('showWeather'), 'must track weather visibility');
  assert.ok(APP.includes('CloudSun size={24}'), 'header must have a weather button');
  assert.ok(APP.includes('aria-label={showWeather ? "Hide weather" : "Show weather"}'), 'button must be accessible');
});

test('the weather section is rendered when toggled on', () => {
  assert.ok(APP.includes('{showWeather && ('), 'section must be conditional');
  assert.ok(APP.includes('id="weather"'), 'must use the weather section id');
  assert.ok(APP.includes('<WeatherPanel />'), 'must render WeatherPanel');
  assert.ok(APP.includes('expandSection("weather")'), 'opening must expand it');
});

test('weather is a persisted section id', () => {
  assert.ok(SECTIONS.includes("'weather'"), 'weather must be a section id');
  assert.ok(SECTIONS.includes('weather: false'), 'weather starts collapsed');
});

test('the Morning Digest card shows a compact 7-day strip', () => {
  assert.ok(APP.includes('digest-forecast-strip'), 'digest must render the strip');
  assert.ok(APP.includes('dailyDigest.weather.forecast.map'), 'must map the shared forecast');
  assert.ok(APP.includes('day.precipitationChance'), 'strip shows rain chance');
  assert.ok(APP.includes('day.high}° / {day.low}°'), 'strip shows high/low');
});

test('the digest strip is guarded when forecast data is missing', () => {
  const i = APP.indexOf('digest-forecast-strip');
  const before = APP.slice(Math.max(0, i - 200), i);
  assert.ok(before.includes('forecast.length > 0'), 'strip must be guarded');
});
