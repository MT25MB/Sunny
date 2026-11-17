/**
 * Regression tests for the full weather feature: the shared forecast pipeline,
 * geocoding, US-only alerts and radar support. These pin the main-process
 * wiring that the Weather screen and expanded digest card depend on.
 *
 * The repo's convention for main.cjs is string-level assertions (the file
 * cannot be required in plain Node because it boots Electron at import).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MAIN = read('src/electron/main.cjs');

// ---------------------------------------------------------------------------
// Shared forecast pipeline
// ---------------------------------------------------------------------------

test('the weather URL asks for 24h hourly and 7-day daily data', () => {
  for (const token of [
    'hourly=temperature_2m,weather_code,precipitation_probability',
    'forecast_days=${days}',
    'forecast_hours=24',
    'temperature_unit=${tempUnit}',
    'wind_speed_unit=${windUnit}',
  ]) {
    assert.ok(MAIN.includes(token), `weather URL must include ${token}`);
  }
});

test('the °F unit selection changes temperature and wind units', () => {
  assert.ok(MAIN.includes("unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'"));
  assert.ok(MAIN.includes("unit === 'fahrenheit' ? 'mph' : 'kmh'"));
});

test('the normalized weather carries hourly, forecast, unit and fetchedAt', () => {
  for (const field of ['weather.hourly =', 'weather.forecast =', 'unit,', 'fetchedAt:']) {
    assert.ok(MAIN.includes(field), `normalized weather must include ${field}`);
  }
});

test('hourly and daily arrays are capped at 24 and 7 points', () => {
  assert.ok(MAIN.includes('slice(0, 24)'), 'hourly must be capped at 24');
  assert.ok(MAIN.includes('slice(0, 7)'), 'forecast must be capped at 7 days');
});

test('forecasts are cached by coordinates and unit for 60 seconds', () => {
  assert.ok(MAIN.includes('forecastCache'), 'forecast cache must exist');
  assert.ok(MAIN.includes('FORECAST_CACHE_MS = 60 * 1000'));
  assert.ok(MAIN.includes('toFixed(3)'), 'cache key must include coordinates');
});

test('the legacy basic-shape fallback is preserved', () => {
  assert.ok(MAIN.includes('current_weather=true'), 'basic fallback must still exist');
  assert.ok(MAIN.includes('[Weather] Rich forecast failed'), 'fallback must be logged');
});

test('location resolution supports coordinates, named places and auto-detect', () => {
  assert.ok(MAIN.includes('async function resolveLocation'));
  assert.ok(MAIN.includes('ip-api.com/json/'), 'auto-detect must use ip-api');
  assert.ok(MAIN.includes('New York, NY'), 'auto-detect fallback must exist');
});

test('location search uses the free geocoding API with encoded input', () => {
  assert.ok(MAIN.includes('GEOCODING_API'));
  assert.ok(MAIN.includes('geocoding-api.open-meteo.com'));
  assert.ok(MAIN.includes('encodeURIComponent(name)'), 'geocoding query must be encoded');
  assert.ok(MAIN.includes('requireString(query'), 'geocoding query must be validated');
  assert.ok(MAIN.includes('countryCode:'), 'geocoding results must carry country code');
});

test('the digest uses the shared forecast instead of a second fetch', () => {
  assert.ok(MAIN.includes('const weather = await getForecast({ location, unit });'));
  // The old inline digest URL with forecast_days=1 must be gone.
  assert.ok(!MAIN.includes('forecast_days=1'), 'digest must not fetch its own 1-day forecast');
});
