/**
 * Regression test for the stretched mascot in the empty-state hints.
 *
 * The recipes/medication/digest empty states rendered their mascots in a
 * fixed 28×28 square while the assets are portrait (chef 181×240, pills
 * 218×240, newspaper 240×231), squishing them flat. The fix keeps the
 * asset's natural aspect ratio at a fixed height.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const APP = read('src/App.tsx');
const CSS = read('src/index.css');

function ruleBody(selector) {
  const i = CSS.indexOf(selector + ' {');
  assert.notStrictEqual(i, -1, `${selector} rule must exist`);
  const end = CSS.indexOf('}', i);
  return CSS.slice(i + selector.length + 2, end).replace(/\s+/g, ' ').trim();
}

test('section mascots keep their natural aspect ratio', () => {
  const body = ruleBody('.section-mascot');
  assert.match(body, /width:\s*auto/, 'the mascot width must follow the asset aspect ratio');
  // A fixed width + height pair would squish the portrait assets.
  assert.ok(!/width:\s*\d+px/.test(body), 'the mascot must not set a fixed width');
});

test('App.tsx does not force a square size on section mascots', () => {
  const imgs = [...APP.matchAll(/<img[^>]*className="section-mascot"[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 3, 'expected at least three section-mascot images');
  for (const img of imgs) {
    assert.ok(!/width=\{?\d+/.test(img), `section mascot img must not force a width: ${img}`);
    assert.ok(!/height=\{?\d+/.test(img), `section mascot img must not force a height: ${img}`);
  }
});
