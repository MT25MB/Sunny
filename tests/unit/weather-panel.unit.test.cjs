/**
 * Regression tests for the vertical, Dark Sky-inspired full-weather sheet:
 * each section of a normal weather app must be present in a single column.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const PANEL = read('src/components/WeatherPanel.tsx');
const CSS = read('src/index.css');

test('the sheet is a vertical, scrollable column', () => {
  assert.ok(PANEL.includes('className="weather-sheet"'), 'must be a sheet');
  assert.ok(CSS.includes('.weather-sheet') && CSS.includes('overflow-y: auto'), 'must scroll vertically');
  assert.ok(CSS.includes('flex-direction: column'), 'must be a column');
});

test('the header shows location and the unit toggle', () => {
  for (const token of ['weather-sheet-title', 'Switch to', 'setWeatherUnit']) {
    assert.ok(PANEL.includes(token), `header must wire ${token}`);
  }
});

test('the hero shows a big current temperature and feels-like', () => {
  for (const token of ['weather-hero', 'weather-hero-temp', 'weather-hero-feels', 'weather-hero-range']) {
    assert.ok(PANEL.includes(token), `hero must render ${token}`);
  }
  assert.ok(CSS.includes('5rem'), 'temperature must be large');
});

test('alerts appear as a compact banner', () => {
  assert.ok(PANEL.includes('getWeatherAlerts'), 'must fetch alerts');
  assert.ok(PANEL.includes('weather-alert-banner'), 'must render a banner');
  assert.ok(PANEL.includes("countryCode.toUpperCase() !== 'US'"), 'non-US must be skipped');
});

test('the radar strip is near the top with a time slider', () => {
  assert.ok(PANEL.includes('weather-sheet-radar'), 'must have a radar section');
  assert.ok(PANEL.includes('getRadarFrames'), 'must load radar frames');
  assert.ok(PANEL.includes('type="range"'), 'must have a time slider');
  assert.ok(PANEL.includes('tile.openstreetmap.org') && PANEL.includes('radar.host'), 'must overlay radar on a map');
});

test('the precipitation section summarizes rain and shows mini bars', () => {
  assert.ok(PANEL.includes('weather-precip'), 'must have precipitation section');
  assert.ok(PANEL.includes('weather-precip-label'), 'must have a plain-language summary');
  assert.ok(PANEL.includes('weather-precip-bar'), 'must render mini bars');
});

test('hourly and daily are vertical lists in Dark Sky order', () => {
  assert.ok(PANEL.includes('weather-hour-list') && PANEL.includes('weather-hour-row'), 'hourly list');
  assert.ok(PANEL.includes('weather-day-list') && PANEL.includes('weather-day-row'), 'daily list');
  assert.ok(PANEL.includes('weather-hour-mini-bar'), 'hourly precipitation bar');
  assert.ok(PANEL.includes('weather-day-range-fill'), 'daily temperature range bar');
});

test('details, sun times and refresh are present', () => {
  assert.ok(PANEL.includes('weather-detail-grid'), 'must show detail tiles');
  assert.ok(PANEL.includes('weather-sun-times'), 'must show sunrise/sunset');
  assert.ok(PANEL.includes('weather-updated'), 'must show last updated');
});

test('offline and stale states are explicit and recoverable', () => {
  assert.ok(PANEL.includes('No internet connection'), 'must explain offline state');
  assert.ok(PANEL.includes('Retry'), 'must offer retry');
  assert.ok(PANEL.includes('weather-stale'), 'must have a stale-data banner');
  assert.ok(PANEL.includes('could not refresh'), 'stale banner must say it could not refresh');
});

test('location search and saved places remain available', () => {
  assert.ok(PANEL.includes('searchLocations'), 'must geocode');
  assert.ok(PANEL.includes('addSavedPlace') && PANEL.includes('removeSavedPlace'), 'must manage saved places');
  assert.ok(PANEL.includes('maxLength={100}'), 'search input must be bounded');
});

test('the stylesheet covers every sheet section', () => {
  for (const cls of [
    '.weather-overlay', '.weather-sheet', '.weather-hero', '.weather-alert-banner',
    '.weather-sheet-radar', '.weather-precip', '.weather-hour-list', '.weather-day-list',
    '.weather-detail-grid', '.weather-error', '.weather-stale',
  ]) {
    assert.ok(CSS.includes(cls), `stylesheet must define ${cls}`);
  }
  assert.ok(!CSS.includes('digest-forecast-strip'), 'old digest strip styles must be gone');
});

test('weather icons cover the full WMO code range', () => {
  assert.ok(PANEL.includes('code >= 95'), 'thunderstorms');
  assert.ok(PANEL.includes('code >= 71 && code <= 86'), 'snow');
  assert.ok(PANEL.includes('code >= 51 && code <= 67'), 'rain/drizzle');
  assert.ok(PANEL.includes('code === 45'), 'fog');
  assert.ok(PANEL.includes('code === 0'), 'clear');
});
