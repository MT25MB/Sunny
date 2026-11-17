/**
 * The chat must behave like an LLM chat window. Plain questions must go to
 * the model with a clean conversational prompt — no JSON envelope, no
 * examples, no placeholder strings for a small model to echo. Three previous
 * fixes copied a different example string because the same prompt was used
 * for questions and actions.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');

test('questions are detected as conversational', () => {
  assert.equal(ROUTER.isConversationalPrompt('when is thanksgiving this year?'), true);
  assert.equal(ROUTER.isConversationalPrompt('what is the weather like tomorrow'), true);
  assert.equal(ROUTER.isConversationalPrompt('tell me about the history of Rome'), true);
  assert.equal(ROUTER.isConversationalPrompt('open calculator'), false);
  assert.equal(ROUTER.isConversationalPrompt('search for pizza recipes'), false);
});

test('the conversational prompt contains no action envelope or placeholders', () => {
  const prompt = ROUTER.buildChatPrompt('when is thanksgiving this year?');
  assert.match(prompt, /when is thanksgiving this year\?/);
  assert.ok(!prompt.includes('{"response"'), 'no JSON example');
  assert.ok(!prompt.includes('<your own short answer>'), 'no placeholder');
  assert.ok(!prompt.includes('<action type>'), 'no action placeholder');
  assert.ok(!prompt.includes('Allowed action types'), 'no action protocol');
  assert.ok(!prompt.toLowerCase().includes('do not output json'), 'no format chatter');
});

test('placeholder-parroted answers are stripped', () => {
  assert.equal(ROUTER.sanitizeChatAnswer('<your own short answer>'), '');
  assert.equal(ROUTER.sanitizeChatAnswer('short reply for the user'), '');
  assert.equal(ROUTER.sanitizeChatAnswer('{"response":"hi"}'), '');
  assert.equal(ROUTER.sanitizeChatAnswer('Thanksgiving 2026 falls on November 26.'), 'Thanksgiving 2026 falls on November 26.');
});

test('decideAction uses a separate conversational path before the action protocol', () => {
  assert.match(MAIN, /isConversationalPrompt\(prompt\)/, 'must detect conversational prompts');
  assert.match(MAIN, /withChatProtocol\(prompt\)/, 'conversational path must use the clean prompt');
  assert.match(MAIN, /withActionProtocol\(prompt\)/, 'action path must keep the protocol');
  const conv = MAIN.indexOf('isConversationalPrompt(prompt)');
  const action = MAIN.indexOf('withActionProtocol(prompt)');
  assert.ok(conv !== -1 && action !== -1 && conv < action, 'conversational branch must come first');
});
