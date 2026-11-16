/**
 * Chatbot behaviour regressions.
 *
 * Both reported failures ("short reply from the user" + calculator) came from
 * the model copying the literal few-shot example in the action protocol. The
 * protocol must describe a shape with placeholders, never a copyable concrete
 * app name, and must be placed BEFORE the user's question so the question is
 * what the model answers. Conversational questions must be answered in prose.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const ROUTER = fs.readFileSync(path.join(REPO, 'src', 'electron', 'command-router.cjs'), 'utf8');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');

test('the action protocol does not contain a copyable calculator example', () => {
  const start = ROUTER.indexOf('const ACTION_PROTOCOL_SUFFIX');
  const end = ROUTER.indexOf('module.exports', start);
  const protocol = ROUTER.slice(start, end);
  assert.ok(!/short reply for the user/i.test(protocol), 'no canned response text in the protocol');
  assert.ok(!/"app":\s*"calculator"/i.test(protocol), 'no concrete app name in the protocol');
});

test('the protocol tells the model to answer questions in plain words', () => {
  const start = ROUTER.indexOf('const ACTION_PROTOCOL_SUFFIX');
  const end = ROUTER.indexOf('module.exports', start);
  const protocol = ROUTER.slice(start, end).toLowerCase();
  assert.ok(protocol.includes('plain words'), 'must instruct prose answers');
  assert.ok(protocol.includes('never copy'), 'must forbid copying example values');
  assert.ok(/what, when, where|ordinary questions/.test(protocol), 'must call out question-style prompts');
});

test('the user question is the last thing in the chat prompt', () => {
  // Instructions first, the user's text last — avoids recency priming.
  assert.ok(MAIN.includes('withChatProtocol'), 'main must build chat prompts with withChatProtocol');
  const start = MAIN.indexOf('function withChatProtocol');
  assert.notStrictEqual(start, -1);
  const fn = MAIN.slice(start, start + 600);
  const protocolAt = fn.indexOf('ACTION_PROTOCOL_SUFFIX');
  const userAt = fn.indexOf('User:');
  assert.notStrictEqual(protocolAt, -1);
  assert.notStrictEqual(userAt, -1);
  assert.ok(protocolAt < userAt, 'protocol must come before the user text');
});
