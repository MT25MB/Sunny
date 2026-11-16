/**
 * Regression tests for weather preferences and the renderer service methods
 * that feed the Weather screen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const PREFS = read('src/lib/weather-preferences.ts');
const BRAIN = read('src/renderer/services/sunnyBrain.ts');

test('weather preferences use their own localStorage key', () => {
  assert.ok(PREFS.includes("'sunny_weather_v1'"), 'must not reuse the core preferences key');
});

test('saved places are capped at five and deduplicated by coordinates', () => {
  assert.ok(PREFS.includes('MAX_SAVED_PLACES = 5'));
  assert.ok(PREFS.includes('slice(-MAX_SAVED_PLACES)'), 'must keep the most recent five');
  assert.ok(PREFS.includes('toFixed(3)'), 'must deduplicate by rounded coordinates');
});

test('preferences cover unit, active location and saved places', () => {
  for (const field of ['unit', 'activeLocation', 'savedPlaces']) {
    assert.ok(PREFS.includes(`${field}:`), `must persist ${field}`);
  }
  for (const helper of ['loadWeatherPreferences', 'saveWeatherPreferences', 'addSavedPlace', 'removeSavedPlace', 'setActiveLocation', 'setWeatherUnit']) {
    assert.ok(PREFS.includes(`function ${helper}`), `must export ${helper}`);
  }
});

test('preferences parsing is defensive about corrupt data', () => {
  assert.ok(PREFS.includes('try {') && PREFS.includes('catch'), 'must handle bad localStorage');
  assert.ok(PREFS.includes('Array.isArray(parsed.savedPlaces)'), 'must validate saved places shape');
});

test('sunnyBrain exposes all four weather methods', () => {
  for (const method of ['getWeatherForecast', 'searchLocations', 'getWeatherAlerts', 'getRadarFrames']) {
    assert.ok(BRAIN.includes(`async ${method}(`), `sunnyBrain must expose ${method}`);
  }
});

test('weather methods degrade gracefully outside Electron', () => {
  const start = BRAIN.indexOf('async getWeatherForecast(');
  const block = BRAIN.slice(start, start + 2200);
  assert.ok(block.includes('!window.electronAPI'), 'must check for Electron API');
  assert.ok(block.includes('return []'), 'alerts must return [] when offline/preview');
});
