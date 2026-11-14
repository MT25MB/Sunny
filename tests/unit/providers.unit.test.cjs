'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const providersModule = require(path.join(process.cwd(), 'src/electron/providers.cjs'));
const {
  ProviderError,
  runProviderInference,
  PROVIDER_DEFAULTS,
} = providersModule;

// Read providers.cjs as text for structural verification of internal functions
const providersPath = path.join(process.cwd(), 'src/electron/providers.cjs');
const fs = require('node:fs');
const providersCjs = fs.readFileSync(providersPath, 'utf8');

describe('providers — ProviderError class', () => {
  it('sets name and status', () => {
    const err = new ProviderError('Test error', 401);
    assert.strictEqual(err.name, 'ProviderError');
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.message, 'Test error');
  });

  it('is exported', () => {
    assert.strictEqual(typeof ProviderError, 'function');
  });
});

describe('providers — runProviderInference', () => {
  it('is exported', () => {
    assert.strictEqual(typeof runProviderInference, 'function');
  });

  it('rejects embedded provider', async () => {
    await assert.rejects(
      runProviderInference({ provider: 'embedded', prompt: 'test' }),
      /local model does not go through this path/
    );
  });

  it('throws for unknown provider', async () => {
    await assert.rejects(
      runProviderInference({ provider: 'unknown_provider', prompt: 'test' }),
      /Unknown provider/
    );
  });

  it('requires API key for hosted providers', async () => {
    const result = await runProviderInference({
      provider: 'openai',
      prompt: 'test',
    }).catch((err) => err);
    assert.ok(result instanceof ProviderError);
    assert.ok(result.message.includes('API key'));
  });

  it('Ollama defaults to qwen3-vl:8b model', () => {
    // Structural: the default is set in runProviderInference
    assert.ok(providersCjs.includes("model: model || 'qwen3-vl:8b'"));
  });

  it('OpenAI defaults to gpt-4o model', () => {
    assert.ok(providersCjs.includes("provider === 'openai' ? 'gpt-4o'"));
  });

  it('Groq defaults to llama-3.3-70b-versatile', () => {
    assert.ok(providersCjs.includes("'llama-3.3-70b-versatile'"));
  });

  it('exports runProviderInference', () => {
    assert.strictEqual(typeof runProviderInference, 'function');
  });
});

describe('providers — PROVIDER_DEFAULTS', () => {
  it('defines OpenAI URL', () => {
    assert.ok(PROVIDER_DEFAULTS.openai);
    assert.ok(PROVIDER_DEFAULTS.openai.baseUrl.includes('api.openai.com'));
  });

  it('defines Groq URL', () => {
    assert.ok(PROVIDER_DEFAULTS.groq);
    assert.ok(PROVIDER_DEFAULTS.groq.baseUrl.includes('api.groq.com'));
  });

  it('defines Anthropic URL', () => {
    assert.ok(PROVIDER_DEFAULTS.anthropic);
    assert.ok(PROVIDER_DEFAULTS.anthropic.baseUrl.includes('api.anthropic.com'));
  });

  it('defines Ollama URL', () => {
    assert.ok(PROVIDER_DEFAULTS.ollama);
    assert.ok(PROVIDER_DEFAULTS.ollama.baseUrl.includes('localhost:11434'));
  });
});

describe('providers — internal functions (structural)', () => {
  it('assertHttpUrl function exists', () => {
    assert.ok(providersCjs.includes('function assertHttpUrl'));
  });

  it('postJson function exists', () => {
    assert.ok(providersCjs.includes('async function postJson'));
  });

  it('runOpenAiCompatible function exists', () => {
    assert.ok(providersCjs.includes('async function runOpenAiCompatible'));
  });

  it('runOllama function exists', () => {
    assert.ok(providersCjs.includes('async function runOllama'));
  });

  it('runAnthropic function exists', () => {
    assert.ok(providersCjs.includes('async function runAnthropic'));
  });

  it('assertHttpUrl rejects non-HTTP(S) protocols', () => {
    assert.ok(providersCjs.includes("parsed.protocol !== 'http:'"));
    assert.ok(providersCjs.includes("parsed.protocol !== 'https:'"));
  });

  it('postJson uses AbortController for timeout', () => {
    assert.ok(providersCjs.includes('AbortController'));
  });

  it('postJson sets Content-Type header', () => {
    assert.ok(providersCjs.includes("'Content-Type': 'application/json'"));
  });

  it('postJson throws on non-ok response', () => {
    assert.ok(providersCjs.includes('!response.ok'));
  });

  it('runOpenAiCompatible uses /chat/completions endpoint', () => {
    assert.ok(providersCjs.includes('/chat/completions'));
  });

  it('runOpenAiCompatible sends Bearer authorization', () => {
    assert.ok(providersCjs.includes('Authorization: `Bearer ${apiKey}`'));
  });

  it('runOllama uses /api/chat endpoint', () => {
    assert.ok(providersCjs.includes('/api/chat'));
  });

  it('runOllama sends stream: false', () => {
    assert.ok(providersCjs.includes('stream: false'));
  });

  it('runAnthropic uses /v1/messages endpoint', () => {
    assert.ok(providersCjs.includes('/v1/messages'));
  });

  it('runAnthropic uses x-api-key header', () => {
    assert.ok(providersCjs.includes("'x-api-key': apiKey"));
  });

  it('runAnthropic uses anthropic-version header', () => {
    assert.ok(providersCjs.includes("'anthropic-version': '2023-06-01'"));
  });
});
