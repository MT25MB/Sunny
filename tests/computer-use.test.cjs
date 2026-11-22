/**
 * Grounded computer use: a whole job runs one step at a time, and the runner —
 * not the model — decides when the job is finished.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  runComputerUseJob, parseDecision, buildPrompt, extractDecisionObject, HANDS_PROMPT, MAX_STEPS,
} = require(path.join(__dirname, '..', 'src', 'electron', 'computer-use.cjs'));
const REGISTRY = require(path.join(__dirname, '..', 'src', 'electron', 'tool-registry.cjs'));

function reply(obj) { return JSON.stringify(obj); }

test('the registry is the single source for tool types', () => {
  assert.ok(REGISTRY.SAFE_ACTION_TYPES.has('use_computer'));
  assert.ok(REGISTRY.SAFE_ACTION_TYPES.has('blender_scene'));
  assert.match(REGISTRY.actionFields(), /use_computer \(task\)/);
  assert.equal(REGISTRY.permissionFor({ type: 'use_computer' }), 'mouse');
  assert.equal(REGISTRY.permissionFor({ type: 'screenshot' }), 'screen');
  assert.equal(REGISTRY.permissionFor({ type: 'unknown' }), 'none');
});

test('decisions parse from plain JSON and fenced JSON', () => {
  assert.deepEqual(parseDecision(reply({ action: { type: 'click', x: 10, y: 20 } })), {
    kind: 'action', action: { type: 'click', x: 10, y: 20 },
  });
  assert.equal(parseDecision('```json\n' + reply({ done: 'Opened it.' }) + '\n```').kind, 'done');
  assert.equal(parseDecision(reply({ ask: 'Should I send it?' })).kind, 'ask');
  assert.equal(parseDecision(reply({ fail: 'Stuck.' })).kind, 'fail');
  assert.equal(parseDecision(reply({ note: 'password field' })).kind, 'note');
  assert.equal(parseDecision('not json at all').kind, 'unclear');
});

test('unknown or dangerous action types are discarded', () => {
  const decision = parseDecision(reply({ action: { type: 'run_terminal', command: 'rm -rf /' } }));
  assert.equal(decision.kind, 'unclear');
  const cleaned = parseDecision(reply({ action: { type: 'type', text: 'x'.repeat(900) } }));
  assert.equal(cleaned.action.text.length, 500);
});

test('the hands prompt forbids action claims without tools', () => {
  assert.match(HANDS_PROMPT, /never say you opened/i);
  assert.match(HANDS_PROMPT, /one tool per turn/i);
  assert.match(HANDS_PROMPT, /never type passwords/i);
  const prompt = buildPrompt('open notepad', [{ n: 1, label: 'click' }], { base64: 'x' }, true, ['note']);
  assert.match(prompt, /open notepad/);
  assert.match(prompt, /screen has not changed/);
  assert.match(prompt, /note/);
});

test('a multi-step job runs until the model calls done', async () => {
  const replies = [
    reply({ action: { type: 'click', x: 5, y: 6 } }),
    reply({ note: 'field found' }),
    reply({ action: { type: 'type', text: 'hello' } }),
    reply({ done: 'I typed hello.' }),
  ];
  let i = 0;
  const acted = [];
  const progress = [];
  const result = await runComputerUseJob('type hello in notepad', {
    infer: async () => replies[i++],
    capture: async () => ({ base64: 'screen-' + i }),
    act: async (actions) => { acted.push(...actions); },
    onProgress: (info) => progress.push(info),
  });
  assert.equal(result.completed, true);
  assert.equal(result.response, 'I typed hello.');
  assert.deepEqual(acted.map((a) => a.type), ['click', 'type']);
  assert.equal(progress.length, 2);
  assert.equal(result.steps.length, 3);
});

test('a job that needs the user stops with the question', async () => {
  const result = await runComputerUseJob('send 50 dollars', {
    infer: async () => reply({ ask: 'Do you want me to pay 50 dollars?' }),
    capture: async () => ({ base64: 'x' }),
    act: async () => {},
  });
  assert.equal(result.completed, false);
  assert.equal(result.needsUser, true);
  assert.match(result.question, /pay 50 dollars/);
});

test('cancellation and failure stop the job', async () => {
  let cancelled = false;
  const stopped = await runComputerUseJob('do something', {
    infer: async () => reply({ action: { type: 'click', x: 1, y: 1 } }),
    capture: async () => ({ base64: 'x' }),
    act: async () => {},
    isCancelled: () => cancelled,
  });
  assert.ok(!stopped.cancelled);

  const failed = await runComputerUseJob('do something', {
    infer: async () => reply({ fail: 'Screen is locked.' }),
    capture: async () => ({ base64: 'x' }),
    act: async () => {},
  });
  assert.equal(failed.completed, false);
  assert.match(failed.response, /Screen is locked/);

  cancelled = true;
  const cancelledResult = await runComputerUseJob('do something', {
    infer: async () => reply({ done: 'never' }),
    capture: async () => ({ base64: 'x' }),
    act: async () => {},
    isCancelled: () => cancelled,
  });
  assert.equal(cancelledResult.cancelled, true);
});

test('the runner has a hard step cap', () => {
  assert.ok(MAX_STEPS >= 8 && MAX_STEPS <= 30, 'step cap must be bounded');
});
