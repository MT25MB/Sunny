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
