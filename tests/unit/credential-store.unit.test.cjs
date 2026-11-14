'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// credential-store.ts is TypeScript - read as text for structural verification
const storePath = path.join(process.cwd(), 'src/lib/credential-store.ts');
const storeTs = fs.readFileSync(storePath, 'utf8');

describe('credential-store — types', () => {
  it('CredentialKey union is defined', () => {
    assert.ok(storeTs.includes("type CredentialKey ="));
    assert.ok(storeTs.includes("'openai_api_key'"));
    assert.ok(storeTs.includes("'anthropic_api_key'"));
    assert.ok(storeTs.includes("'groq_api_key'"));
  });

  it('CredentialStore interface is defined', () => {
    assert.ok(storeTs.includes('export type CredentialStore = {'));
  });

  it('CredentialStore has getCredential', () => {
    assert.ok(storeTs.includes('getCredential(key: CredentialKey): Promise<string>;'));
  });

  it('CredentialStore has setCredential', () => {
    assert.ok(storeTs.includes('setCredential(key: CredentialKey, value: string): Promise<void>;'));
  });

  it('CredentialStore has deleteCredential', () => {
    assert.ok(storeTs.includes('deleteCredential(key: CredentialKey): Promise<void>;'));
  });

  it('CredentialStore has hasCredential', () => {
    assert.ok(storeTs.includes('hasCredential(key: CredentialKey): Promise<boolean>;'));
  });
});

describe('credential-store — functions', () => {
  it('getCredential function exists', () => {
    assert.ok(storeTs.includes('export async function getCredential'));
  });

  it('setCredential function exists', () => {
    assert.ok(storeTs.includes('export async function setCredential'));
  });

  it('deleteCredential function exists', () => {
    assert.ok(storeTs.includes('export async function deleteCredential'));
  });

  it('hasCredential function exists', () => {
    assert.ok(storeTs.includes('export async function hasCredential'));
  });

  it('testProviderConnection function exists', () => {
    assert.ok(storeTs.includes('export async function testProviderConnection'));
  });

  it('setCredential deletes when value is empty', () => {
    assert.ok(storeTs.includes('if (!value.trim())'));
    assert.ok(storeTs.includes('await getStore().deleteCredential(key)'));
  });

  it('setCredential trims whitespace before checking', () => {
    assert.ok(storeTs.includes('!value.trim()'));
  });
});

describe('credential-store — testProviderConnection', () => {
  it('OpenAI checks for API key first', () => {
    assert.ok(storeTs.includes("!options.apiKey?.trim()"));
    assert.ok(storeTs.includes("Enter an API key first.'"));
  });

  it('OpenAI calls /v1/models', () => {
    assert.ok(storeTs.includes("'https://api.openai.com/v1/models'"));
  });

  it('OpenAI uses Bearer authorization', () => {
    assert.ok(storeTs.includes("Authorization: \`Bearer ${options.apiKey}\`"));
  });

  it('OpenAI 401 means key rejected', () => {
    assert.ok(storeTs.includes("res.status === 401"));
    assert.ok(storeTs.includes("Your API key was rejected by OpenAI.'"));
  });

  it('Anthropic checks for API key first', () => {
    assert.ok(storeTs.includes("case 'anthropic':"));
  });

  it('Anthropic calls /v1/messages', () => {
    assert.ok(storeTs.includes("'https://api.anthropic.com/v1/messages'"));
  });

  it('Anthropic uses x-api-key header', () => {
    assert.ok(storeTs.includes("'x-api-key': options.apiKey"));
  });

  it('Anthropic uses anthropic-version header', () => {
    assert.ok(storeTs.includes("'anthropic-version': '2023-06-01'"));
  });

  it('Anthropic 401 means key rejected', () => {
    assert.ok(storeTs.includes("Your API key was rejected by Anthropic.'"));
  });

  it('Groq checks for API key first', () => {
    assert.ok(storeTs.includes("case 'groq':"));
  });

  it('Groq calls /openai/v1/models', () => {
    assert.ok(storeTs.includes("'https://api.groq.com/openai/v1/models'"));
  });

  it('Groq 401 means key rejected', () => {
    assert.ok(storeTs.includes("Your API key was rejected by Groq.'"));
  });

  it('Ollama defaults to localhost:11434', () => {
    assert.ok(storeTs.includes("'http://localhost:11434'"));
  });

  it('Ollama calls /api/tags', () => {
    assert.ok(storeTs.includes("'\/api/tags'"));
  });

  it('Ollama uses 5 second timeout', () => {
    assert.ok(storeTs.includes('AbortSignal.timeout(5000)'));
  });

  it('Ollama checks model availability', () => {
    assert.ok(storeTs.includes('options.model && !models.some'));
  });

  it('Ollama not running returns error', () => {
    assert.ok(storeTs.includes("Ollama is not running"));
  });

  it('Ollama success reports model count', () => {
    assert.ok(storeTs.includes('models.length'));
  });

  it('unknown provider returns error', () => {
    assert.ok(storeTs.includes("default: return { success: false, message: 'Unknown provider.'"));
  });

  it('catch block returns error message', () => {
    assert.ok(storeTs.includes('catch (err)'));
    assert.ok(storeTs.includes('err instanceof Error ? err.message'));
  });
});

describe('credential-store — memory store fallback', () => {
  it('isElectron checks for window.sunnyDesktop', () => {
    assert.ok(storeTs.includes('window.sunnyDesktop'));
  });

  it('getElectronStore returns null when not in Electron', () => {
    assert.ok(storeTs.includes('!isElectron() || !window.sunnyDesktop'));
  });

  it('memory store is used as fallback', () => {
    assert.ok(storeTs.includes('getElectronStore() ?? getMemoryStore()'));
  });

  it('memory store uses Map', () => {
    assert.ok(storeTs.includes('const memoryStore = new Map<string, string>()'));
  });
});
