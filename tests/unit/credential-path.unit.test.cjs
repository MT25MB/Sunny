'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const credentialPathModule = require(path.join(
  process.cwd(),
  'src/electron/credential-path.cjs'
));

const CREDENTIALS_DIR = path.join(
  fs.realpathSync(os.tmpdir()),
  'sunny-credential-path-tests'
);

function getCredentialPath(key) {
  return credentialPathModule.getCredentialPath(CREDENTIALS_DIR, key);
}

describe('credential-path — valid credential keys', () => {
  it('accepts openai_api_key', () => {
    const result = getCredentialPath('openai_api_key');
    assert.strictEqual(result, path.join(CREDENTIALS_DIR, 'openai_api_key.enc'));
  });

  it('accepts anthropic_api_key', () => {
    const result = getCredentialPath('anthropic_api_key');
    assert.strictEqual(
      result,
      path.join(CREDENTIALS_DIR, 'anthropic_api_key.enc')
    );
  });

  it('accepts groq_api_key', () => {
    const result = getCredentialPath('groq_api_key');
    assert.strictEqual(result, path.join(CREDENTIALS_DIR, 'groq_api_key.enc'));
  });

  it('accepted keys land directly inside base dir (no traversal)', () => {
    for (const key of ['openai_api_key', 'anthropic_api_key', 'groq_api_key']) {
      const result = getCredentialPath(key);
      assert.ok(result.startsWith(CREDENTIALS_DIR + path.sep));
      assert.strictEqual(path.basename(result, '.enc'), key);
    }
  });
});

describe('credential-path — rejects path traversal attacks', () => {
  const attackKeys = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\win.ini',
    '../../secrets',
    '../openai_api_key',
    './../../../tmp/evil',
    '....//....//....//etc/passwd',
    'openai_api_key/../../../etc/passwd',
    '/etc/passwd',
    'C:\\Windows\\System32\\config\\SAM',
    '',
    '   ',
    null,
    undefined,
  ];

  for (const badKey of attackKeys) {
    it(`rejects key: ${JSON.stringify(badKey)}`, () => {
      assert.throws(() => getCredentialPath(badKey), /invalid credential key/i);
    });
  }
});

describe('credential-path — key format validation', () => {
  it('rejects keys longer than 64 chars', () => {
    const longKey = 'a'.repeat(65);
    assert.throws(() => getCredentialPath(longKey), /invalid credential key/i);
  });

  it('rejects keys with spaces', () => {
    assert.throws(() => getCredentialPath('openai api key'), /invalid credential key/i);
  });

  it('rejects keys with null bytes', () => {
    assert.throws(() => getCredentialPath('openai\0api_key'), /invalid credential key/i);
  });

  it('rejects keys with dots and dot-dot', () => {
    assert.throws(() => getCredentialPath('.openai'), /invalid credential key/i);
    assert.throws(() => getCredentialPath('..openai'), /invalid credential key/i);
  });

  it('rejects keys with special characters', () => {
    assert.throws(() => getCredentialPath('openai@key'), /invalid credential key/i);
    assert.throws(() => getCredentialPath('openai#key'), /invalid credential key/i);
    assert.throws(() => getCredentialPath('openai key!'), /invalid credential key/i);
  });

  it('rejects empty key', () => {
    assert.throws(() => getCredentialPath(''), /invalid credential key/i);
  });
});

describe('credential-path — valid key patterns', () => {
  const validKeys = [
    'openai_api_key',
    'anthropic_api_key',
    'groq_api_key',
    'my_key_123',
    'a',
    'key-with-dashes',
    'KEY_UPPERCASE',
    'key123',
  ];

  for (const validKey of validKeys) {
    it(`accepts valid key: ${validKey}`, () => {
      const result = getCredentialPath(validKey);
      assert.ok(result.startsWith(CREDENTIALS_DIR + path.sep));
      assert.strictEqual(path.basename(result, '.enc'), validKey);
    });
  }
});
