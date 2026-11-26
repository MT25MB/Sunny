/**
 * The landing page hero and link-preview image are a hand-authored infographic,
 * not the old decorative hero photo. Keep both references in sync.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SVG = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'assets', 'sunny-feature-infographic.svg'), 'utf8'
);

test('the hero uses the feature infographic', () => {
  assert.match(HTML, /class="hero-art"[\s\S]{0,200}sunny-feature-infographic\.svg/);
  assert.doesNotMatch(HTML.slice(HTML.indexOf('class="hero-art"')), /sunny-hero/);
});

test('the infographic has accessible text and shows real features', () => {
  assert.match(SVG, /<title id="title">How Sunny works<\/title>/);
  assert.match(SVG, /<desc id="desc">/);
  assert.match(SVG, /SYSTEM HEALTH/);
  assert.match(SVG, /runs on your computer/);
  for (const label of ['BATTERY', 'WI-FI', 'CPU', 'MEMORY', 'Connected', '92%']) {
    assert.ok(SVG.includes(label), `the infographic must show ${label}`);
  }
});

test('the infographic labels each have their own line and do not overlap', () => {
  const you = SVG.match(/<text[^>]*>YOU<\/text>/);
  const speak = SVG.match(/<text[^>]*>speak or type<\/text>/);
  const answers = SVG.match(/<text[^>]*>ANSWERS<\/text>/);
  const actions = SVG.match(/<text[^>]*>&amp; actions<\/text>/);
  for (const label of [you, speak, answers, actions]) assert.ok(label, 'all stage labels must exist');
  const yOf = (tag) => Number(tag[0].match(/ y="(\d+)"/)[1]);
  assert.ok(yOf(speak) - yOf(you) >= 30, 'caption needs its own line below YOU');
  assert.ok(yOf(actions) - yOf(answers) >= 30, 'caption needs its own line below ANSWERS');
  // The memory bar must sit below the value, never beside it.
  assert.doesNotMatch(SVG, /4\.1 GB · Low<\/text>\s*<rect x="186"/);
});

test('the microphone mascot is not shown on the landing page', () => {
  assert.doesNotMatch(HTML, /sunny-mascot-microphone/, 'the microphone mascot should not be on the site');
});

test('link previews point at the rendered PNG version', () => {
  assert.match(HTML, /property="og:image" content="[^"]*sunny-feature-infographic\.png"/);
  assert.match(HTML, /name="twitter:image" content="[^"]*sunny-feature-infographic\.png"/);
  assert.match(HTML, /og:image:width" content="1376"/);
  assert.match(HTML, /og:image:height" content="768"/);
  assert.ok(
    fs.existsSync(path.join(__dirname, '..', 'public', 'assets', 'sunny-feature-infographic.png')),
    'the PNG used by link previews must exist'
  );
});
