/**
 * The model decides chat vs command in one call. The regex that used to guess
 * from the first word is no longer the authority.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));

const { extractBrainDecision, BRAIN_PROTOCOL } = ROUTER;

test('a chat envelope becomes a chat answer', () => {
  const decision = extractBrainDecision('{"kind":"chat","response":"Thanksgiving is in November."}');
  assert.equal(decision.kind, 'chat');
  assert.equal(decision.response, 'Thanksgiving is in November.');
});

test('a command envelope becomes executable, sanitised actions', () => {
  const decision = extractBrainDecision(
    JSON.stringify({
      kind: 'command',
      response: 'Opening it.',
      actions: [{ type: 'open_app', app: 'notepad' }, { type: 'run_terminal', command: 'rm -rf /' }],
    })
  );
  assert.equal(decision.kind, 'command');
  assert.deepEqual(decision.actions, [{ type: 'open_app', app: 'notepad' }]);
});

test('plain prose is accepted as a chat answer', () => {
  const decision = extractBrainDecision('I am Sunny, your desktop companion.');
  assert.equal(decision.kind, 'chat');
  assert.equal(decision.response, 'I am Sunny, your desktop companion.');
});

test('fenced JSON still parses', () => {
  const decision = extractBrainDecision('```json\n{"kind":"chat","response":"Hello"}\n```');
  assert.equal(decision.kind, 'chat');
  assert.equal(decision.response, 'Hello');
});

test('an envelope with no kind but with actions still runs them', () => {
  const decision = extractBrainDecision('{"response":"Done.","actions":[{"type":"screenshot"}]}');
  assert.equal(decision.kind, 'command');
  assert.deepEqual(decision.actions, [{ type: 'screenshot' }]);
});

test('the brain protocol asks for one decision and forbids empty promises', () => {
  assert.match(BRAIN_PROTOCOL, /Decide for yourself/);
  assert.match(BRAIN_PROTOCOL, /"kind":"chat"/);
  assert.match(BRAIN_PROTOCOL, /"kind":"command"/);
  assert.match(BRAIN_PROTOCOL, /use_computer/);
  assert.match(BRAIN_PROTOCOL, /Never say you opened/);
});
