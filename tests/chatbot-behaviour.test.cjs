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
  const nextDecl = ROUTER.indexOf('\n/**', start + 10);
  const protocol = ROUTER.slice(start, nextDecl === -1 ? start + 2000 : nextDecl);
  assert.ok(!/short reply for the user/i.test(protocol), 'no canned response text in the protocol');
  assert.ok(!/"app":\s*"calculator"/i.test(protocol), 'no concrete app name in the protocol');
});

test('the action protocol carries no copyable examples, questions use a clean prompt', () => {
  const start = ROUTER.indexOf('const ACTION_PROTOCOL_SUFFIX');
  const nextDecl = ROUTER.indexOf('\n/**', start + 10);
  const protocol = ROUTER.slice(start, nextDecl).toLowerCase();
  assert.ok(protocol.includes('plain words'), 'must instruct prose answers');
  assert.ok(protocol.includes('never copy'), 'must forbid copying instruction text');
  assert.ok(!protocol.includes('{"response"'), 'no copyable JSON example');
  const chatPrompt = require('../src/electron/command-router.cjs').buildChatPrompt('what is the weather?');
  assert.match(chatPrompt, /answer the user's question/i, 'questions get a direct conversational prompt');
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
