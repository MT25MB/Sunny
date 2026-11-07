/**
 * UNIT TESTS: Credential store (content-based)
 * Tests for src/lib/credential-store.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'credential-store.ts'), 'utf8');

// ============================================================================
// CredentialKey type
// ============================================================================

test('types: defines CredentialKey union', () => {
  assert.ok(SRC.includes("export type CredentialKey ="));
});

test('types: includes openai_api_key', () => {
  assert.ok(SRC.includes("| 'openai_api_key'"));
});

test('types: includes anthropic_api_key', () => {
  assert.ok(SRC.includes("| 'anthropic_api_key'"));
});

test('types: includes groq_api_key', () => {
  assert.ok(SRC.includes("| 'groq_api_key'"));
});

test('types: defines CredentialStore interface', () => {
  assert.ok(SRC.includes('export type CredentialStore = {'));
});

test('types: CredentialStore has getCredential', () => {
  assert.ok(SRC.includes('getCredential(key: CredentialKey): Promise<string>;'));
});

test('types: CredentialStore has setCredential', () => {
  assert.ok(SRC.includes('setCredential(key: CredentialKey, value: string): Promise<void>;'));
});

test('types: CredentialStore has deleteCredential', () => {
  assert.ok(SRC.includes('deleteCredential(key: CredentialKey): Promise<void>;'));
});

test('types: CredentialStore has hasCredential', () => {
  assert.ok(SRC.includes('hasCredential(key: CredentialKey): Promise<boolean>;'));
});

// ============================================================================
// Functions
// ============================================================================

test('functions: defines getCredential', () => {
  assert.ok(SRC.includes('export async function getCredential('));
});

test('functions: defines setCredential', () => {
  assert.ok(SRC.includes('export async function setCredential('));
});

test('functions: defines deleteCredential', () => {
  assert.ok(SRC.includes('export async function deleteCredential('));
});

test('functions: defines hasCredential', () => {
  assert.ok(SRC.includes('export async function hasCredential('));
});

test('functions: defines testProviderConnection', () => {
  assert.ok(SRC.includes('export async function testProviderConnection('));
});

// ============================================================================
// Electron store integration
// ============================================================================

test('electron: checks for window.sunnyDesktop', () => {
  assert.ok(SRC.includes('typeof window !== \'undefined\' && !!window.sunnyDesktop'));
});

test('electron: checks for saveCredential/loadCredential/deleteCredential', () => {
  assert.ok(SRC.includes('!desktop.saveCredential || !desktop.loadCredential || !desktop.deleteCredential'));
});

test('electron: falls back to memory store', () => {
  assert.ok(SRC.includes('const memoryStore = new Map<string, string>();'));
});

test('electron: getStore prefers Electron, falls back to memory', () => {
  assert.ok(SRC.includes('return getElectronStore() ?? getMemoryStore();'));
});

// ============================================================================
// setCredential safety
// ============================================================================

test('safety: setCredential deletes when value is empty', () => {
  assert.ok(SRC.includes('if (!value.trim())'));
  assert.ok(SRC.includes('await getStore().deleteCredential(key);'));
});

test('safety: setCredential trims whitespace before checking', () => {
  assert.ok(SRC.includes('!value.trim()'));
});

// ============================================================================
// testProviderConnection - OpenAI
// ============================================================================

test('connection: OpenAI checks for API key first', () => {
  assert.ok(SRC.includes("case 'openai':"));
  assert.ok(SRC.includes("if (!options.apiKey?.trim()) return { success: false, message: 'Enter an API key first.' };"));
});

test('connection: OpenAI calls /v1/models', () => {
  assert.ok(SRC.includes("https://api.openai.com/v1/models"));
});

test('connection: OpenAI uses Bearer authorization', () => {
  assert.ok(SRC.includes("Authorization: \`Bearer ${options.apiKey}\`"));
});

test('connection: OpenAI 401 means key rejected', () => {
  assert.ok(SRC.includes("if (res.status === 401) return { success: false, message: 'Your API key was rejected by OpenAI.' };"));
});

// ============================================================================
// testProviderConnection - Anthropic
// ============================================================================

test('connection: Anthropic checks for API key first', () => {
  assert.ok(SRC.includes("case 'anthropic':"));
});

test('connection: Anthropic calls /v1/messages', () => {
  assert.ok(SRC.includes("https://api.anthropic.com/v1/messages"));
});

test('connection: Anthropic uses x-api-key header', () => {
  assert.ok(SRC.includes("'x-api-key': options.apiKey"));
});

test('connection: Anthropic 401 means key rejected', () => {
  assert.ok(SRC.includes("if (res.status === 401) return { success: false, message: 'Your API key was rejected by Anthropic.' };"));
});

// ============================================================================
// testProviderConnection - Groq
// ============================================================================

test('connection: Groq checks for API key first', () => {
  assert.ok(SRC.includes("case 'groq':"));
});

test('connection: Groq calls /openai/v1/models', () => {
  assert.ok(SRC.includes("https://api.groq.com/openai/v1/models"));
});

test('connection: Groq 401 means key rejected', () => {
  assert.ok(SRC.includes("if (res.status === 401) return { success: false, message: 'Your API key was rejected by Groq.' };"));
});

// ============================================================================
// testProviderConnection - Ollama
// ============================================================================

test('connection: Ollama defaults to localhost:11434', () => {
  assert.ok(SRC.includes("const endpoint = options.endpoint?.trim() || 'http://localhost:11434';"));
});

test('connection: Ollama calls /api/tags', () => {
  assert.ok(SRC.includes('\${endpoint}/api/tags'));
});

test('connection: Ollama uses 5 second timeout', () => {
  assert.ok(SRC.includes('AbortSignal.timeout(5000)'));
});

test('connection: Ollama checks model availability', () => {
  assert.ok(SRC.includes('!models.some((m) => m.name.startsWith(options.model!))'));
});

test('connection: Ollama not running returns error', () => {
  assert.ok(SRC.includes("message: 'Ollama is not running. Start Ollama and try again.'"));
});

test('connection: Ollama success reports model count', () => {
  assert.ok(SRC.includes('Ollama is running with'));
});

// ============================================================================
// Error handling
// ============================================================================

test('safety: unknown provider returns error', () => {
  assert.ok(SRC.includes("message: 'Unknown provider.'"));
});

test('safety: catch block returns error message', () => {
  assert.ok(SRC.includes("return { success: false, message: err instanceof Error ? err.message : 'Connection failed.' };"));
});
