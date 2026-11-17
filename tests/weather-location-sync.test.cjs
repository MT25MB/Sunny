/**
 * Saved weather preferences must drive the main-screen Morning Digest too:
 * location AND unit. The overlay saved Nashua/°F while the digest still
 * auto-detected New York and showed °C because it passed no params.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const REPO = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(REPO, 'src/App.tsx'), 'utf8');
const BRAIN = fs.readFileSync(path.join(REPO, 'src/renderer/services/sunnyBrain.ts'), 'utf8');
const MAIN = fs.readFileSync(path.join(REPO, 'src/electron/main.cjs'), 'utf8');

test('the main screen reads saved weather preferences', () => {
  assert.match(APP, /loadWeatherPreferences/, 'App must read weather prefs');
  const at = APP.indexOf('const handleFetchDailyDigest');
  const block = APP.slice(at, at + 900);
  assert.match(block, /getDigestWeatherParams\(\)/, 'digest fetch must use saved prefs');
  const helper = APP.slice(APP.indexOf('const getDigestWeatherParams'), APP.indexOf('const getDigestWeatherParams') + 700);
  assert.match(helper, /loadWeatherPreferences\(\)/, 'helper must load saved prefs');
  assert.match(helper, /activeLocation/, 'must use the saved active location');
  assert.match(block, /triggerQuickAction\('news',/, 'must pass params to the digest tool');
});

test('the digest payload carries coordinates, name and unit', () => {
  const at = APP.indexOf('const getDigestWeatherParams');
  const block = APP.slice(at, at + 700);
  assert.match(block, /latitude/, 'must pass latitude');
  assert.match(block, /longitude/, 'must pass longitude');
  assert.match(block, /unit/, 'must pass the unit preference');
});

test('read-aloud uses the same saved location', () => {
  const at = APP.indexOf('const handleSpeakDailyDigest');
  const block = APP.slice(at, at + 600);
  assert.match(block, /getDigestWeatherParams\(\)/, 'read-aloud must use saved weather prefs');
  assert.match(BRAIN, /speakDailyDigest\(\s*location/, 'must accept a location argument');
});

test('the main process accepts and applies a digest unit', () => {
  const at = MAIN.indexOf("if (toolName === 'get_daily_digest')");
  const validation = MAIN.slice(at, at + 500);
  assert.match(validation, /box\.unit/, 'validation must accept unit');
  assert.match(MAIN, /getDailyDigest\(params\.location, params\.newsCount, params\.unit\)/, 'runTool must pass unit through');
  assert.match(MAIN, /getForecast\(\{ location, unit \}|getForecast\(\{ location: location, unit \}/, 'digest must use the unit in the forecast');
});

test('the digest cache distinguishes different locations and units', () => {
  const at = MAIN.indexOf('async function getDailyDigest');
  const block = MAIN.slice(at, at + 500);
  assert.match(block, /cached?\w*\.key|digestCache\.key/, 'cache must track which location/unit it holds');
});

test('saving weather prefs notifies the main screen to refresh', () => {
  const PREFS = fs.readFileSync(path.join(REPO, 'src/lib/weather-preferences.ts'), 'utf8');
  assert.match(PREFS, /WEATHER_PREFS_CHANGED_EVENT/, 'must define the change event');
  assert.match(PREFS, /dispatchEvent\(new CustomEvent\(WEATHER_PREFS_CHANGED_EVENT\)\)/, 'must broadcast the change');
  assert.match(APP, /addEventListener\(WEATHER_PREFS_CHANGED_EVENT/, 'main screen must listen');
  assert.match(APP, /handleFetchDailyDigest\(\)/, 'main screen must refetch on change');
});
