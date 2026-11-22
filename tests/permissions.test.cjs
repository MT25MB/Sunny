/**
 * Computer control is on by default, but risky categories ask first. The
 * renderer never holds the real action — only a token it sends back.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TIERS, DEFAULT_TIERS, normaliseTiers, decide,
} = require(path.join(__dirname, '..', 'src', 'electron', 'permissions.cjs'));
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');
const PREFS = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'local-preferences.ts'), 'utf8');

test('default posture is on with risky categories asking', () => {
  assert.equal(DEFAULT_TIERS.open, 'always');
  assert.equal(DEFAULT_TIERS.screen, 'always');
  assert.equal(DEFAULT_TIERS.mouse, 'ask');
  assert.equal(DEFAULT_TIERS.files, 'ask');
  assert.equal(DEFAULT_TIERS.system, 'ask');
  assert.equal(DEFAULT_TIERS.terminal, 'off');
  assert.ok(TIERS.includes('off') && TIERS.includes('ask') && TIERS.includes('always'));
});

test('decide respects tiers and the master switch', () => {
  assert.equal(decide({ type: 'open_app' }, DEFAULT_TIERS, true).verdict, 'allow');
  assert.equal(decide({ type: 'use_computer' }, DEFAULT_TIERS, true).verdict, 'ask');
  assert.equal(decide({ type: 'use_computer' }, { mouse: 'always' }, true).verdict, 'allow');
  assert.equal(decide({ type: 'use_computer' }, { mouse: 'off' }, true).verdict, 'deny');
  assert.equal(decide({ type: 'use_computer' }, DEFAULT_TIERS, false).verdict, 'deny');
});

test('tier patches are normalised, not trusted verbatim', () => {
  const tiers = normaliseTiers({ mouse: 'always', bogus: 'always', open: 'nonsense' });
  assert.equal(tiers.mouse, 'always');
  assert.equal(tiers.open, 'always');
  assert.equal(tiers.bogus, undefined);
});

test('main holds actions and only confirm_action can skip the check', () => {
  assert.match(MAIN, /heldActions\.set\(/);
  assert.match(MAIN, /if \(!options\.skipPermissionCheck\)/);
  assert.match(MAIN, /if \(toolName === 'confirm_action'\)/);
  assert.match(MAIN, /heldActions\.delete\(params\.token\)/);
  // The renderer path cannot smuggle skipPermissionCheck through the tool
  // validator: validateToolParams returns only { actions } for execute_actions.
  assert.match(MAIN, /return \{ actions \};\s*\}/);
});

test('the renderer shows a plain-language yes/no prompt', () => {
  const APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(APP, /pendingHold/);
  assert.match(APP, /handleHoldAnswer/);
  assert.match(APP, /confirm_action/);
  assert.match(APP, /Yes, go ahead/);
  assert.match(MAIN, /Say yes and I will/);
});

test('preferences expose the new switch with safe defaults', () => {
  assert.match(PREFS, /computer_control: boolean/);
  assert.match(PREFS, /computer_control: true/);
  assert.match(PREFS, /permission_tiers/);
});
