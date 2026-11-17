/**
 * Cooking mode was rendered with browser-default white buttons because an old
 * cleanup deleted every overlay rule except .cooking-btn. Pin the full set.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

const CLASSES = [
  '.cooking-mode-overlay', '.cooking-mode-content', '.cooking-header', '.cooking-title',
  '.cooking-close-btn', '.cooking-progress', '.cooking-step', '.step-instruction',
  '.cooking-controls', '.cooking-btn', '.cooking-btn-primary', '.cooking-btn-secondary',
  '.cooking-tts', '.tts-btn', '.tts-btn-secondary',
];

test('every cooking-mode class used in the markup is styled', () => {
  for (const cls of CLASSES) {
    assert.ok(APP.includes(cls.slice(1)) || cls === '.tts-btn-secondary', `${cls} must be used in App.tsx`);
    assert.ok(CSS.includes(`${cls} {`) || CSS.includes(`${cls},`) || CSS.includes(`${cls}:`), `${cls} must have a CSS rule`);
  }
});

test('the overlay is fixed, full-screen and above the app', () => {
  const i = CSS.indexOf('.cooking-mode-overlay {');
  const rule = CSS.slice(i, CSS.indexOf('}', i)).replace(/\s+/g, ' ');
  assert.match(rule, /position:\s*fixed/);
  assert.match(rule, /inset:\s*0/);
  assert.match(rule, /z-index:\s*\d{3,}/);
});

test('controls are large, tappable and opt out of window dragging', () => {
  assert.match(CSS, /\.cooking-btn \{\s*[^}]*min-height:\s*(?:5[6-9]|[6-9]\d)px/s);
  assert.match(CSS, /\.cooking-btn \{[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(CSS, /\.tts-btn \{[^}]*min-height:\s*56px/s);
  assert.match(CSS, /\.tts-btn \{[^}]*-webkit-app-region:\s*no-drag/s);
});

test('the step text scrolls while controls stay in the column', () => {
  const step = CSS.slice(CSS.indexOf('.cooking-step {'), CSS.indexOf('.cooking-step {') + 400);
  assert.match(step, /overflow-y:\s*auto/);
  assert.match(step, /flex:\s*1/);
  const content = CSS.slice(CSS.indexOf('.cooking-mode-content {'), CSS.indexOf('.cooking-mode-content {') + 600);
  assert.match(content, /flex-direction:\s*column/);
  assert.match(content, /max-width:\s*680px/);
});

test('narrow window stacks the read-aloud buttons', () => {
  assert.match(CSS, /@container app-shell \(max-width: 560px\)[\s\S]{0,500}\.cooking-tts \{ flex-direction: column/);
});
