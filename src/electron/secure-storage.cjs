'use strict';

const { safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function encrypt(value) {
  if (typeof value !== 'string') value = String(value ?? '');
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(value);
      return 'enc:' + encrypted.toString('base64');
    } catch (err) {
      console.warn('[SecureStorage] Encryption failed, falling back to plaintext:', err.message);
    }
  } else {
    console.warn('[SecureStorage] Encryption not available, storing in plaintext.');
  }
  return 'plain:' + value;
}

function decrypt(value) {
  if (typeof value !== 'string') return '';
  if (value.startsWith('enc:')) {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[SecureStorage] Cannot decrypt: encryption not available.');
      return '';
    }
    try {
      const buf = Buffer.from(value.slice(4), 'base64');
      return safeStorage.decryptString(buf);
    } catch (err) {
      console.error('[SecureStorage] Decryption failed:', err.message);
      return '';
    }
  }
  if (value.startsWith('plain:')) {
    return value.slice(6);
  }
  return value;
}

function encryptJson(data) {
  return encrypt(JSON.stringify(data));
}

function decryptJson(data) {
  if (typeof data !== 'string' || !data) return null;
  try {
    const json = decrypt(data);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function writeFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, encryptJson(data), 'utf8');
}

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    return decryptJson(content);
  } catch (err) {
    console.error('[SecureStorage] Failed to read file:', err.message);
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  writeFile,
  readFile,
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
};
