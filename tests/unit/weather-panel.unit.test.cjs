/**
 * Regression tests for the Weather panel UI: all the parts of a normal weather
 * app (current, hourly, 7-day, alerts, radar, locations, units) and its
 * offline/stale behavior.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const PANEL = read('src/components/WeatherPanel.tsx');
const CSS = read('src/index.css');

test('the panel renders current conditions with high/low', () => {
  for (const token of ['weather-current-temp', 'weather-current-condition', 'weather-current-place', 'weather-current-highlow']) {
    assert.ok(PANEL.includes(token), `must render ${token}`);
  }
});

test('the panel renders a 24-hour hourly strip', () => {
  assert.ok(PANEL.includes('Next 24 hours'), 'hourly section must have a heading');
  assert.ok(PANEL.includes('weather-hourly-track'), 'hourly track must exist');
  assert.ok(PANEL.includes('forecast.hourly.map'), 'must map hourly data');
  assert.ok(PANEL.includes('formatHour'), 'must format hourly times');
});

test('the panel renders the 7-day forecast', () => {
  assert.ok(PANEL.includes('7-day forecast'), 'daily section must have a heading');
  assert.ok(PANEL.includes('forecast.forecast.map'), 'must map daily data');
  assert.ok(PANEL.includes('dayName'), 'must show weekday names');
  assert.ok(PANEL.includes('weather-day-bar-fill'), 'must show high/low temperature bars');
});

test('the panel supports location search and saved places', () => {
  for (const token of ['handleSearch', 'searchLocations', 'handleSelectPlace', 'addSavedPlace', 'removeSavedPlace', 'setActiveLocation']) {
    assert.ok(PANEL.includes(token), `must wire ${token}`);
  }
  assert.ok(PANEL.includes('maxLength={100}'), 'search input must be bounded');
});

test('the panel supports the °C / °F unit toggle', () => {
  assert.ok(PANEL.includes('setWeatherUnit'), 'must persist unit changes');
  assert.ok(PANEL.includes('°C') && PANEL.includes('°F'), 'must offer both units');
  assert.ok(PANEL.includes("aria-pressed={unit === 'celsius'}"), 'unit buttons must expose pressed state');
});

test('the panel shows US alerts and hides them elsewhere', () => {
  assert.ok(PANEL.includes('getWeatherAlerts'), 'must fetch alerts');
  assert.ok(PANEL.includes("countryCode.toUpperCase() !== 'US'"), 'must skip alerts outside the US');
  assert.ok(PANEL.includes('weather-alert'), 'must render alert cards');
});

test('the radar is lazy-loaded with a time slider', () => {
  assert.ok(PANEL.includes('showRadar'), 'radar must be toggled by the user');
  assert.ok(PANEL.includes('getRadarFrames'), 'radar frames must load on demand');
  assert.ok(PANEL.includes('type="range"'), 'radar must have a time slider');
  assert.ok(PANEL.includes('latLonToTile'), 'must position tiles from coordinates');
  assert.ok(PANEL.includes('tile.openstreetmap.org') && PANEL.includes('radar.host'), 'must overlay radar on map tiles');
});

test('offline and stale states are explicit and recoverable', () => {
  assert.ok(PANEL.includes('No internet connection'), 'must explain offline state');
  assert.ok(PANEL.includes('Retry'), 'must offer retry');
  assert.ok(PANEL.includes('weather-stale'), 'must have a stale-data banner');
  assert.ok(PANEL.includes('could not refresh'), 'stale banner must say it could not refresh');
});

test('the stylesheet covers the whole panel and the compact digest strip', () => {
  for (const cls of [
    '.weather-panel', '.weather-current', '.weather-stats', '.weather-hourly-track',
    '.weather-day-list', '.weather-alerts', '.weather-radar-map', '.weather-error',
    '.weather-stale', '.digest-forecast-strip',
  ]) {
    assert.ok(CSS.includes(cls), `stylesheet must define ${cls}`);
  }
});

test('wide forecast tracks are contained inside the narrow window', () => {
  assert.ok(CSS.includes('.weather-panel') && CSS.includes('min-width: 0'), 'panel must allow shrinking');
  assert.ok(CSS.includes('.collapsible-panel { min-width: 0; }'), 'section wrapper must allow shrinking');
  assert.ok(CSS.includes('max-width: 100%'), 'track must be capped to its parent');
});

test('weather icons cover the full WMO code range', () => {
  assert.ok(PANEL.includes('code >= 95'), 'thunderstorms');
  assert.ok(PANEL.includes('code >= 71 && code <= 86'), 'snow');
  assert.ok(PANEL.includes('code >= 51 && code <= 67'), 'rain/drizzle');
  assert.ok(PANEL.includes('code === 45'), 'fog');
  assert.ok(PANEL.includes('code === 0'), 'clear');
});
