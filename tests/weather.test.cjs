/**
 * Regression tests for the weather section of the Morning Digest.
 *
 * The weather fetch used to request only `current_weather=true`, so every
 * detail the UI tried to show (feels like, humidity, wind, high/low,
 * sunrise/sunset) was permanently undefined and the section looked like a
 * bare "28° Clear sky". These tests pin the enriched fetch, the fallback,
 * and the rendered tiles so the section cannot silently starve again.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const MAIN = read('src/electron/main.cjs');
const APP = read('src/App.tsx');
const TYPES = read('src/types/electron.d.ts');
const CSS = read('src/index.css');
const MOCK = read('src/renderer/services/sunnyBrain.ts');

// ---------------------------------------------------------------------------
// The main process must request the fields the UI renders.
// ---------------------------------------------------------------------------

test('the weather API is asked for the fields the UI shows', () => {
  const required = [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'weather_code',
    'pressure_msl',
    'wind_speed_10m',
    'wind_direction_10m',
    'visibility',
    'is_day',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'uv_index_max',
    'wind_gusts_10m_max',
    'sunrise',
    'sunset',
  ];
  for (const param of required) {
    assert.ok(MAIN.includes(param), `weather fetch must request ${param}`);
  }
});

test('the weather fetch falls back to the basic shape if the rich fetch fails', () => {
  // A richer response is a bonus, never a reason to lose the weather.
  assert.ok(MAIN.includes('current_weather=true'), 'legacy fallback URL must exist');
});

test('the normalized weather object carries the new fields', () => {
  for (const field of [
    'windDirection',
    'windGust',
    'pressure',
    'visibility',
    'precipitationChance',
    'uvIndex',
    'isDay',
  ]) {
    assert.ok(
      MAIN.includes(`${field}:`),
      `the weather object must carry ${field}`
    );
  }
});

test('wind degrees are converted to compass directions', () => {
  assert.ok(MAIN.includes('compassFromDegrees'));
  // The mapping itself must be wired in (N, NNE, NE, ...).
  assert.ok(MAIN.includes("'N'") && MAIN.includes("'NNW'"));
});

// ---------------------------------------------------------------------------
// The renderer renders the tiles the user sees.
// ---------------------------------------------------------------------------

const TILE_LABELS = [
  'Feels Like',
  'Humidity',
  'Wind',
  'Gusts',
  'Chance of Rain',
  'UV Index',
  'High / Low',
  'Pressure',
  'Visibility',
  'Sunrise / Sunset',
];

test('every weather tile the user sees is rendered conditionally', () => {
  for (const label of TILE_LABELS) {
    assert.ok(APP.includes(label), `weather tile "${label}" must exist`);
  }
  // Count guarded tiles: one conditional render per field family.
  const guards = (APP.match(/weather\.(feelsLike|humidity|windSpeed|windGust|precipitationChance|uvIndex|high|pressure|visibility|sunrise) !== undefined/g) || []).length;
  assert.ok(guards >= 9, `at least 9 fields must be independently guarded (found ${guards})`);
});

test('the UV index descriptor helper exists and is used', () => {
  assert.ok(APP.includes('uvIndexLabel'));
  assert.ok(APP.includes('function uvIndexLabel'));
});

test('the h3 icon switches between sun and moon by day/night', () => {
  assert.ok(APP.includes('isDay === false'), 'night must switch the h3 icon');
  assert.ok(APP.includes('<Moon'), 'night must render the Moon icon');
});

// ---------------------------------------------------------------------------
// The mock web fallback mirrors the real shape so the browser preview shows
// the same thing the desktop app does.
// ---------------------------------------------------------------------------

test('the browser-preview mock weather carries the new fields', () => {
  for (const field of ['windGust', 'windDirection', 'pressure', 'visibility', 'precipitationChance', 'uvIndex', 'isDay']) {
    assert.ok(MOCK.includes(`${field}:`), `mock weather must carry ${field}`);
  }
  // The mock sunrise/sunset must be parseable ISO strings or the tile shows
  // "Invalid Date" in the preview.
  assert.ok(
    /sunrise: new Date\(/.test(MOCK),
    'mock sunrise must be a parseable date, not a bare "06:30"'
  );
});

// ---------------------------------------------------------------------------
// The Electron type surface matches what the renderer consumes.
// ---------------------------------------------------------------------------

test('the DailyDigest weather type carries the new fields', () => {
  for (const field of ['windGust', 'windDirection', 'pressure', 'visibility', 'precipitationChance', 'uvIndex', 'isDay']) {
    assert.ok(TYPES.includes(field), `DailyDigest.weather must declare ${field}`);
  }
});

// ---------------------------------------------------------------------------
// The tile styling the user sees.
// ---------------------------------------------------------------------------

test('the weather details render as wrapping tiles, not one flat row', () => {
  const i = CSS.indexOf('.weather-details {');
  assert.notStrictEqual(i, -1);
  const end = CSS.indexOf('}', i);
  const rule = CSS.slice(i, end).replace(/\s+/g, ' ');
  assert.match(rule, /grid-template-columns: repeat\(auto-fit/, 'tiles must flow into a responsive grid');
});
