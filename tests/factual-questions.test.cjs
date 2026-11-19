/**
 * The embedded moondream2 is a vision model with no world-knowledge QA. Basic
 * factual questions (e.g. "When is thanksgiving this year?") must be answered
 * deterministically so they are always correct and can never echo the prompt.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');

test('US Thanksgiving is the fourth Thursday of November', () => {
  const r = ROUTER.parseFactualQuestion('When is Thanksgiving 2026?');
  assert.ok(r, 'must produce a deterministic answer');
  assert.match(r.response, /Thursday, November 26, 2026/);
  const r2 = ROUTER.parseFactualQuestion('When is Thanksgiving 2027?');
  assert.match(r2.response, /Thursday, November 25, 2027/);
});

test('thanksgiving "this year" uses the current year', () => {
  const thisYear = new Date().getFullYear();
  const r = ROUTER.parseFactualQuestion('When is thanksgiving this year?');
  assert.ok(r, 'must answer the exact reported question');
  assert.match(r.response, new RegExp(String(thisYear)));
  assert.match(r.response, /thanksgiving/i);
  assert.match(r.response, /November/);
});

test('relative and bare forms are handled', () => {
  assert.ok(ROUTER.parseFactualQuestion('when is thanksgiving'));
  assert.ok(ROUTER.parseFactualQuestion('Thanksgiving this year'));
  assert.ok(ROUTER.parseFactualQuestion('what date is thanksgiving next year?'));
});

test('deterministic answers contain no prompt text or JSON', () => {
  const r = ROUTER.parseFactualQuestion('When is thanksgiving this year?');
  const answer = r.response;
  assert.ok(!/you are sunny|allowed action types|User:|Assistant:/i.test(answer));
  assert.equal(ROUTER.sanitizeModelReply(answer, 'When is thanksgiving this year?'), answer,
    'the answer must itself pass the security guard');
});

test('unrelated questions are left to the model', () => {
  assert.equal(ROUTER.parseFactualQuestion('What is the weather like?'), null);
  assert.equal(ROUTER.parseFactualQuestion('Open calculator'), null);
});

test('the deterministic router runs before model inference', () => {
  const at = MAIN.indexOf('parseFactualQuestion(');
  const chatAt = MAIN.indexOf('runConfiguredInference(withChatProtocol');
  const actionAt = MAIN.indexOf('runConfiguredInference(withActionProtocol');
  assert.ok(at > 0, 'main must call the factual router');
  assert.ok(at < chatAt && at < actionAt, 'it must run before any model inference');
});
