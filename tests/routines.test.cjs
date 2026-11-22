/**
 * Routines: save a phrase for a repeating job, then list, forget or run it.
 * Steps are stored in the user's own words and never arbitrary code.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));
const REGISTRY = require(path.join(__dirname, '..', 'src', 'electron', 'tool-registry.cjs'));
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');
const INTERCEPTOR = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'security', 'interceptor.cjs'), 'utf8');

test('the routine tool is declared and offered to the model', () => {
  assert.ok(REGISTRY.SAFE_ACTION_TYPES.has('routine'));
  assert.match(REGISTRY.actionFields(), /routine \(action: save, list, forget, run/);
});

test('save requires a phrase and bounded steps', () => {
  assert.deepEqual(
    ROUTER.sanitiseModelAction({ type: 'routine', action: 'save', phrase: 'morning', steps: ['open notepad', 'type hi'] }),
    { type: 'routine', action: 'save', phrase: 'morning', steps: ['open notepad', 'type hi'] }
  );
  assert.equal(ROUTER.sanitiseModelAction({ type: 'routine', action: 'save', phrase: 'x', steps: [] }), null);
  assert.equal(
    ROUTER.sanitiseModelAction({ type: 'routine', action: 'save', phrase: 'x', steps: Array(20).fill('step') }),
    null
  );
  assert.equal(ROUTER.sanitiseModelAction({ type: 'routine', action: 'explode' }), null);
});

test('list, forget and run accept a phrase only', () => {
  for (const action of ['list', 'forget', 'run']) {
    assert.deepEqual(
      ROUTER.sanitiseModelAction({ type: 'routine', action, phrase: 'morning' }),
      { type: 'routine', action, phrase: 'morning' }
    );
  }
  // Listing everything needs no phrase; forget and run must name one.
  assert.deepEqual(ROUTER.sanitiseModelAction({ type: 'routine', action: 'list' }), { type: 'routine', action: 'list' });
  assert.equal(ROUTER.sanitiseModelAction({ type: 'routine', action: 'forget' }), null);
  assert.equal(ROUTER.sanitiseModelAction({ type: 'routine', action: 'run' }), null);
});

test('main stores routines locally and runs their steps', () => {
  assert.match(MAIN, /getRoutinesPath/);
  assert.match(MAIN, /routines\.json/);
  assert.match(MAIN, /async function runRoutineAction/);
  assert.match(MAIN, /action\.type === 'routine'/);
  assert.match(MAIN, /type: 'use_computer', task: step/);
  assert.match(INTERCEPTOR, /case 'routine'/);
});
