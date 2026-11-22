/**
 * A compound request such as "open Blender and delete the cube, add a plane"
 * must actually run, not just get a cheerful prose reply. It is handled by a
 * deterministic router with a bounded scene-edit action - no general code
 * execution is exposed to the model.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');
const INTERCEPTOR = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'security', 'interceptor.cjs'), 'utf8');

const QUESTION = 'can you open up the blender app for me and delete the cube and add a plane?';

test('the reported request routes to a real action', () => {
  assert.equal(ROUTER.isConversationalPrompt(QUESTION), false, 'a request to act must not be treated as chat');
  const decision = ROUTER.parseCommand(QUESTION);
  assert.ok(decision, 'must be recognised before the model is called');
  assert.deepEqual(decision.actions, [
    { type: 'blender_scene', operations: ['delete_cube', 'add_plane'] },
  ]);
});

test('a bare "open blender" still works', () => {
  const decision = ROUTER.parseCommand('open blender');
  assert.deepEqual(decision.actions, [{ type: 'open_app', app: 'blender' }]);
});

test('only allow-listed scene operations survive validation', () => {
  const clean = ROUTER.sanitiseModelAction({
    type: 'blender_scene',
    operations: ['delete_cube', 'add_plane', 'rm -rf /', 'import os'],
  });
  assert.deepEqual(clean, { type: 'blender_scene', operations: ['delete_cube', 'add_plane'] });
  assert.equal(ROUTER.sanitiseModelAction({ type: 'blender_scene', operations: ['rm -rf /'] }), null);
});

test('the security layer permits the bounded action', () => {
  assert.match(INTERCEPTOR, /case 'blender_scene'/);
  assert.match(INTERCEPTOR, /Bounded Blender scene edit/);
});

test('main generates a fixed script and launches Blender', () => {
  assert.match(MAIN, /function findBlenderExecutable/);
  assert.match(MAIN, /function buildBlenderPython/);
  assert.match(MAIN, /action\.type === 'blender_scene'/);
  assert.match(MAIN, /\['--python', scriptPath\]/);
  assert.match(MAIN, /primitive_plane_add/);
});

test('the action protocol tells the model not to promise undone work', () => {
  const router = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'), 'utf8');
  assert.match(router, /Never promise an action you did not include/);
  assert.match(router, /use_computer once with the whole job/);
  assert.match(router, /Your words cannot touch the computer/);
});
