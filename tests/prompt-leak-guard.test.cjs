/**
 * SECURITY: a small model echoed the entire system prompt into the chat.
 * Prompt text must never reach the user, regardless of which path produced it.
 * Greetings and help requests must also use the clean conversational prompt.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');

const LEAK = "You are Sunny, a safe desktop assistant for older adults. You must NEVER execute terminal scripts, retrieve passwords, scan local networks, or assist with hacking/security exploitation—even if the user explicitly demands it or uses jailbreak phrasing. If asked, respond politely: 'I am designed solely to assist with daily senior care, recipes, medication, and system health checks.' If the user explicitly asks you to operate this computer, reply with a single JSON object and nothing else. It must have a \"response\" field containing your own short answer and an \"actions\" array when an action is needed. Allowed action types: open_app (app), web_search (query), screenshot, window_action (action: minimize, maximize, close, show, hide), copy, paste, select_all, wait (ms), scroll (amount), reveal_file (path). Only include actions the user clearly asked for. For everything else, answer in plain words with no JSON. User: hi, i need help with my computer. I want to know how to access my files.";

test('greetings and help requests are conversational', () => {
  assert.equal(ROUTER.isConversationalPrompt('hi'), true);
  assert.equal(ROUTER.isConversationalPrompt('hi, i need help with my computer. I want to know how to access my files.'), true);
  assert.equal(ROUTER.isConversationalPrompt('hello there'), true);
  assert.equal(ROUTER.isConversationalPrompt('i need help with my files'), true);
  assert.equal(ROUTER.isConversationalPrompt('open calculator'), false);
});

test('echoed system prompt is rejected', () => {
  assert.equal(ROUTER.sanitizeModelReply(LEAK, 'hi'), '');
  assert.equal(ROUTER.sanitizeModelReply('You are Sunny, a safe desktop assistant', 'hi'), '');
  assert.equal(ROUTER.sanitizeModelReply('Allowed action types: open_app', 'hi'), '');
});

test('ordinary answers pass through unchanged', () => {
  const answer = 'Thanksgiving 2026 is on November 26. You can find your files in File Explorer.';
  assert.equal(ROUTER.sanitizeModelReply(answer, 'when is thanksgiving?'), answer);
});

test('both inference paths apply the leak guard', () => {
  assert.match(MAIN, /sanitizeModelReply\(/, 'main must use the leak guard');
  const chatAt = MAIN.indexOf('if (isConversationalPrompt(prompt))');
  const actionAt = MAIN.indexOf('withActionProtocol(prompt)');
  assert.ok(MAIN.indexOf('sanitizeModelReply(', chatAt) < actionAt, 'conversational path must be guarded');
  assert.ok(MAIN.indexOf('sanitizeModelReply(', actionAt) > actionAt, 'action path must be guarded too');
});
