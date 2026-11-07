/**
 * UNIT TESTS: Provider inference (content-based)
 * Tests for src/electron/providers.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'providers.cjs'), 'utf8');

// ============================================================================
// ProviderError class
// ============================================================================

test('class: defines ProviderError', () => {
  assert.ok(SRC.includes('class ProviderError extends Error'));
});

test('class: ProviderError sets name', () => {
  assert.ok(SRC.includes("this.name = 'ProviderError';"));
});

test('class: ProviderError sets status', () => {
  assert.ok(SRC.includes('this.status = status || 0;'));
});

// ============================================================================
// URL validation
// ============================================================================

test('security: assertHttpUrl rejects non-HTTP(S) protocols', () => {
  assert.ok(SRC.includes("parsed.protocol !== 'http:' && parsed.protocol !== 'https:'"));
});

test('security: assertHttpUrl throws for invalid URLs', () => {
  assert.ok(SRC.includes('throw new ProviderError(\`${label} is not a valid URL.\`);'));
});

// ============================================================================
// postJson function
// ============================================================================

test('network: defines postJson function', () => {
  assert.ok(SRC.includes('async function postJson('));
});

test('network: postJson asserts HTTP URL', () => {
  assert.ok(SRC.includes('assertHttpUrl(url, \'Endpoint\');'));
});

test('network: postJson uses AbortController for timeout', () => {
  assert.ok(SRC.includes('const controller = new AbortController();'));
});

test('network: postJson sets timeout via setTimeout', () => {
  assert.ok(SRC.includes('const timer = setTimeout(() => controller.abort(), timeoutMs);'));
});

test('network: postJson sends JSON body', () => {
  assert.ok(SRC.includes('body: JSON.stringify(body)'));
});

test('network: postJson sets Content-Type header', () => {
  assert.ok(SRC.includes("'Content-Type': 'application/json'"));
});

test('network: postJson parses response JSON', () => {
  assert.ok(SRC.includes('parsed = text ? JSON.parse(text) : null;'));
});

test('network: postJson throws on non-ok response', () => {
  assert.ok(SRC.includes('if (!response.ok)'));
});

test('network: postJson handles AbortError', () => {
  assert.ok(SRC.includes("err.name === 'AbortError'"));
});

test('network: postJson clears timeout in finally', () => {
  assert.ok(SRC.includes('clearTimeout(timer);'));
});

// ============================================================================
// OpenAI-compatible provider
// ============================================================================

test('provider: defines runOpenAiCompatible', () => {
  assert.ok(SRC.includes('async function runOpenAiCompatible('));
});

test('provider: OpenAI-compatible uses /chat/completions endpoint', () => {
  assert.ok(SRC.includes("/chat/completions"));
});

test('provider: OpenAI-compatible sends Bearer authorization', () => {
  assert.ok(SRC.includes("Authorization: \`Bearer ${apiKey}\`"));
});

test('provider: OpenAI-compatible supports image content', () => {
  assert.ok(SRC.includes("image_url: { url: \`data:image/png;base64,${imageBase64}\` }"));
});

test('provider: OpenAI-compatible returns message content', () => {
  assert.ok(SRC.includes("payload?.choices?.[0]?.message?.content ?? ''"));
});

// ============================================================================
// Ollama provider
// ============================================================================

test('provider: defines runOllama', () => {
  assert.ok(SRC.includes('async function runOllama('));
});

test('provider: Ollama validates endpoint URL', () => {
  assert.ok(SRC.includes('const base = assertHttpUrl(endpoint, \'Ollama endpoint\');'));
});

test('provider: Ollama uses /api/chat endpoint', () => {
  assert.ok(SRC.includes("/api/chat"));
});

test('provider: Ollama sends stream: false', () => {
  assert.ok(SRC.includes('stream: false,'));
});

test('provider: Ollama supports images array', () => {
  assert.ok(SRC.includes('...(images ? { images } : {})'));
});

test('provider: Ollama returns message content', () => {
  assert.ok(SRC.includes("payload?.message?.content ?? ''"));
});

// ============================================================================
// Anthropic provider
// ============================================================================

test('provider: defines runAnthropic', () => {
  assert.ok(SRC.includes('async function runAnthropic('));
});

test('provider: Anthropic uses /v1/messages endpoint', () => {
  assert.ok(SRC.includes("'https://api.anthropic.com/v1/messages'"));
});

test('provider: Anthropic uses x-api-key header', () => {
  assert.ok(SRC.includes("'x-api-key': apiKey"));
});

test('provider: Anthropic uses anthropic-version header', () => {
  assert.ok(SRC.includes("'anthropic-version': '2023-06-01'"));
});

test('provider: Anthropic supports image content', () => {
  assert.ok(SRC.includes('source: { type: \'base64\', media_type: \'image/png\', data: imageBase64 }'));
});

test('provider: Anthropic returns joined content parts', () => {
  assert.ok(SRC.includes("(payload?.content || []).map((part) => part?.text || '').join('')"));
});

// ============================================================================
// Provider defaults
// ============================================================================

test('config: PROVIDER_DEFAULTS defines OpenAI URL', () => {
  assert.ok(SRC.includes("openai: { baseUrl: 'https://api.openai.com/v1' }"));
});

test('config: PROVIDER_DEFAULTS defines Groq URL', () => {
  assert.ok(SRC.includes("groq: { baseUrl: 'https://api.groq.com/openai/v1' }"));
});

test('config: PROVIDER_DEFAULTS defines Anthropic URL', () => {
  assert.ok(SRC.includes("anthropic: { baseUrl: 'https://api.anthropic.com/v1' }"));
});

test('config: PROVIDER_DEFAULTS defines Ollama URL', () => {
  assert.ok(SRC.includes("ollama: { baseUrl: 'http://localhost:11434' }"));
});

// ============================================================================
// runProviderInference dispatcher
// ============================================================================

test('dispatcher: defines runProviderInference', () => {
  assert.ok(SRC.includes('async function runProviderInference(options)'));
});

test('dispatcher: rejects embedded provider', () => {
  assert.ok(SRC.includes("if (provider === 'embedded')"));
  assert.ok(SRC.includes("throw new ProviderError('The local model does not go through this path.');"));
});

test('dispatcher: handles Ollama provider', () => {
  assert.ok(SRC.includes("if (provider === 'ollama')"));
});

test('dispatcher: handles Anthropic provider', () => {
  assert.ok(SRC.includes("if (provider === 'anthropic')"));
});

test('dispatcher: handles OpenAI and Groq providers', () => {
  assert.ok(SRC.includes("if (provider === 'openai' || provider === 'groq')"));
});

test('dispatcher: throws for unknown provider', () => {
  assert.ok(SRC.includes('throw new ProviderError(`Unknown provider "${provider}".`);'));
});

test('dispatcher: requires API key for hosted providers', () => {
  assert.ok(SRC.includes('if (!apiKey)'));
  assert.ok(SRC.includes("throw new ProviderError(`No API key is stored for ${provider}. Add one in Settings.`);"));
});

test('dispatcher: Ollama defaults to qwen3-vl:8b model', () => {
  assert.ok(SRC.includes("model: model || 'qwen3-vl:8b'"));
});

test('dispatcher: OpenAI defaults to gpt-4o', () => {
  assert.ok(SRC.includes("model || (provider === 'openai' ? 'gpt-4o' : 'llama-3.3-70b-versatile')"));
});

// ============================================================================
// Exports
// ============================================================================

test('exports: exports runProviderInference', () => {
  assert.ok(SRC.includes("module.exports = { runProviderInference, ProviderError, PROVIDER_DEFAULTS };"));
});
