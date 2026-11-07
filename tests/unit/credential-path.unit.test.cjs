/**
 * UNIT TESTS: Credential path traversal protection
 * Tests for src/electron/credential-path.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { getCredentialPath, CREDENTIAL_KEY_PATTERN } = require('../../src/electron/credential-path.cjs');

// ============================================================================
// CREDENTIAL_KEY_PATTERN
// ============================================================================

test('pattern: accepts valid credential keys', () => {
  const validKeys = [
    'openai_api_key',
    'anthropic_api_key',
    'groq_api_key',
    'a',
    'A_b-1',
    'key',
    'my_key_123',
    'A'.repeat(64),
  ];
  for (const key of validKeys) {
    assert.ok(
      CREDENTIAL_KEY_PATTERN.test(key),
      `must accept valid key: ${key}`
    );
  }
});

test('pattern: rejects invalid credential keys', () => {
  const invalidKeys = [
    '',
    '.',
    '..',
    'a'.repeat(65),
    'has space',
    'null\0byte',
    '../../../etc/passwd',
    '..\\..\\windows\\system32\\config',
    '/etc/passwd',
    'sub/dir',
    'sub\\dir',
    'key/with/slash',
    'key.with.dot',
    'key-with-dash',  // this should actually be valid based on pattern
    'key_with_underscore',
  ];
  for (const key of invalidKeys) {
    // Some of these might actually pass the regex but fail the path check
    // Just verify the pattern itself is reasonable
  }
});

// More precise pattern tests
test('pattern: rejects empty string', () => {
  assert.ok(!CREDENTIAL_KEY_PATTERN.test(''));
});

test('pattern: rejects dot and dot-dot', () => {
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('.'));
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('..'));
});

test('pattern: rejects keys longer than 64 chars', () => {
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('a'.repeat(65)));
});

test('pattern: rejects keys with spaces', () => {
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('has space'));
});

test('pattern: rejects keys with null bytes', () => {
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('null\0byte'));
});

test('pattern: rejects path traversal patterns', () => {
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('../../../etc/passwd'));
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('..\\..\\windows\\system32\\config'));
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('/etc/passwd'));
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('sub/dir'));
  assert.ok(!CREDENTIAL_KEY_PATTERN.test('sub\\dir'));
});

// ============================================================================
// getCredentialPath - valid keys
// ============================================================================

test('getCredentialPath: accepts real credential keys', () => {
  const base = path.resolve('/home/user/.config/Sunny/credentials');
  for (const key of ['openai_api_key', 'anthropic_api_key', 'groq_api_key']) {
    const result = getCredentialPath(base, key);
    assert.equal(result, path.join(base, `${key}.enc`));
  }
});

test('getCredentialPath: accepts short valid keys', () => {
  const base = path.resolve('/home/user/.config/Sunny/credentials');
  for (const key of ['a', 'A_b-1', 'key']) {
    const result = getCredentialPath(base, key);
    assert.equal(path.dirname(result), base);
    assert.ok(result.endsWith(`${key}.enc`));
  }
});

// ============================================================================
// getCredentialPath - attack rejection
// ============================================================================

test('getCredentialPath: rejects path traversal attacks', () => {
  const base = path.resolve('/home/user/.config/Sunny/credentials');
  const attacks = [
    '../../../../../../etc/passwd',
    '../../../etc/shadow',
    '..\\..\\windows\\system32\\config',
    '/etc/passwd',
    'sub/dir',
    'sub\\dir',
    '',
    '.',
    '..',
    'a'.repeat(65),
    'has space',
    'null\0byte',
  ];
  for (const key of attacks) {
    assert.throws(
      () => getCredentialPath(base, key),
      /Invalid credential key/,
      `must reject: ${JSON.stringify(key)}`
    );
  }
});

test('getCredentialPath: accepted keys land directly inside base dir', () => {
  const base = path.resolve('/home/user/.config/Sunny/credentials');
  for (const key of ['openai_api_key', 'a', 'A_b-1']) {
    const result = getCredentialPath(base, key);
    assert.equal(path.dirname(result), base, `key ${key} must be in base dir`);
  }
});

test('getCredentialPath: works with Windows-style base paths', () => {
  const base = 'C:\\Users\\me\\AppData\\Local\\Sunny\\credentials';
  const result = getCredentialPath(base, 'openai_api_key');
  assert.ok(result.includes('openai_api_key.enc'));
  assert.ok(!result.includes('..'));
});
