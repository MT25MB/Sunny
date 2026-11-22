/**
 * Chat must use a real LLM when one is already running locally. The embedded
 * Moondream model is a vision model: asking it to chat produced the generic
 * fallback. A local Ollama model is free, private, and needs no API key.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');
const PROVIDERS = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'providers.cjs'), 'utf8');
const DETECTOR = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'local-llm.cjs'), 'utf8');
const ROUTER = require(path.join(__dirname, '..', 'src', 'electron', 'command-router.cjs'));

test('a local chat model is discovered automatically', () => {
  assert.match(MAIN, /require\('\.\/local-llm\.cjs'\)/);
  assert.match(MAIN, /if \(provider === 'embedded'\) \{[\s\S]*?detectLocalChatModel/);
  assert.match(MAIN, /if \(localModel\) \{[\s\S]*?provider = 'ollama'/);
});

test('screenshots still go to the embedded vision encoder', () => {
  assert.match(
    MAIN,
    /selectedProvider === 'embedded' && imageBase64[\s\S]{0,200}inference\.runInference/
  );
});

test('discovery rejects oversized models that cannot load', () => {
  assert.match(DETECTOR, /MAX_MODEL_BYTES/);
  assert.match(DETECTOR, /size <= MAX_MODEL_BYTES/);
  assert.match(DETECTOR, /instruct\|chat/i);
  assert.match(DETECTOR, /AbortController/);
});

test('the local model is given a small context and no thinking', () => {
  assert.match(PROVIDERS, /think: false/);
  assert.match(PROVIDERS, /num_ctx: 2048/);
  assert.match(PROVIDERS, /timeoutMs: 120_000/);
});

test('computer use refuses a text-only local model', () => {
  const LOCAL = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'local-llm.cjs'), 'utf8');
  const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');
  assert.match(LOCAL, /async function modelCapabilities/);
  assert.match(MAIN, /assertVisionCapableBrain/);
  assert.match(MAIN, /capabilities\.includes\('vision'\)/);
  assert.match(MAIN, /will not click blindly/);
});

test('the security guards still apply to local LLM answers', () => {
  const leak = 'You are Sunny, a safe desktop assistant for older adults.';
  assert.equal(ROUTER.sanitizeModelReply(leak, 'what are you?'), '');
  assert.equal(
    ROUTER.sanitizeModelReply('Thanksgiving is on Thursday, November 26.', 'when is thanksgiving?'),
    'Thanksgiving is on Thursday, November 26.'
  );
});
