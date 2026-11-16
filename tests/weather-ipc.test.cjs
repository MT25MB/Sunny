/**
 * Regression tests for the weather IPC surface: forecast, geocoding,
 * US-only alerts and radar. Pins the security checks and the US-only gating.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MAIN = read('src/electron/main.cjs');
const PRELOAD = read('src/electron/preload.cjs');
const TYPES = read('src/types/electron.d.ts');

test('all four weather IPC handlers are registered', () => {
  for (const channel of [
    'sunny:get-weather-forecast',
    'sunny:search-locations',
    'sunny:get-weather-alerts',
    'sunny:get-radar-frames',
  ]) {
    assert.ok(MAIN.includes(`ipcMain.handle('${channel}'`), `main must register ${channel}`);
  }
});

test('each weather IPC handler checks sender trust and rate limits', () => {
  for (const channel of [
    'sunny:get-weather-forecast',
    'sunny:search-locations',
    'sunny:get-weather-alerts',
    'sunny:get-radar-frames',
  ]) {
    const start = MAIN.indexOf(`ipcMain.handle('${channel}'`);
    assert.notStrictEqual(start, -1, `${channel} must exist`);
    const block = MAIN.slice(start, start + 700);
    assert.ok(block.includes('assertTrustedSender(event)'), `${channel} must assert trusted sender`);
    assert.ok(block.includes('rateLimit('), `${channel} must be rate limited`);
  }
});

test('forecast IPC validates the unit and coordinates', () => {
  const start = MAIN.indexOf("ipcMain.handle('sunny:get-weather-forecast'");
  const block = MAIN.slice(start, start + 1600);
  assert.ok(block.includes("box.unit === 'fahrenheit'"), 'unit must be restricted');
  assert.ok(block.includes('Math.abs(latitude) > 90'), 'latitude must be bounded');
  assert.ok(block.includes('Math.abs(longitude) > 180'), 'longitude must be bounded');
  assert.ok(block.includes('assertPayloadSize'), 'payload size must be checked');
});

test('weather alerts are US-only and carry a contact User-Agent', () => {
  const start = MAIN.indexOf('async function getWeatherAlerts');
  const block = MAIN.slice(start, start + 1400);
  assert.ok(block.includes("!== 'US') return []"), 'non-US must return no alerts');
  assert.ok(MAIN.includes('api.weather.gov'), 'must use weather.gov');
  assert.ok(block.includes('User-Agent'), 'weather.gov requires a User-Agent');
  assert.ok(block.includes('Accept'), 'weather.gov requires geo+json Accept');
});

test('radar uses RainViewer and returns host + frames', () => {
  assert.ok(MAIN.includes('api.rainviewer.com'), 'must use RainViewer');
  const start = MAIN.indexOf('async function getRadarFrames');
  const block = MAIN.slice(start, start + 500);
  assert.ok(block.includes('RADAR_API'), 'must fetch the radar API');
  assert.ok(block.includes('host:') && block.includes('frames'), 'must return host + frames');
});

test('preload exposes the weather methods with input validation', () => {
  for (const method of ['getWeatherForecast', 'searchLocations', 'getWeatherAlerts', 'getRadarFrames']) {
    assert.ok(PRELOAD.includes(`${method}:`), `preload must expose ${method}`);
  }
  assert.ok(PRELOAD.includes('searchLocations requires a non-empty string'));
  assert.ok(PRELOAD.includes('getWeatherForecast requires an object'));
});

test('the Electron type surface declares the weather methods and models', () => {
  for (const decl of [
    'getWeatherForecast(', 'searchLocations(', 'getWeatherAlerts(', 'getRadarFrames(',
    'interface WeatherHour', 'interface WeatherDay', 'interface WeatherLocation',
    'interface WeatherAlert', 'interface RadarData', 'interface WeatherForecast',
  ]) {
    assert.ok(TYPES.includes(decl), `types must declare ${decl}`);
  }
});

test('fetch failures surface HTTP status instead of parsing error bodies', () => {
  const start = MAIN.indexOf('async function fetchWithTimeout');
  const block = MAIN.slice(start, start + 700);
  assert.ok(block.includes('!response.ok'), 'must check response status');
  assert.ok(block.includes('headers'), 'must allow custom headers (weather.gov User-Agent)');
});
