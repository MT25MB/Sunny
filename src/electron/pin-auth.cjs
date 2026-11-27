'use strict';

/**
 * PIN authentication module for Sunny.
 *
 * Stores a salted SHA-256 hash of the user's PIN using Electron's safeStorage.
 * Provides verification, set, and remove operations.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { safeStorage } = require('electron');

const PIN_FILE = 'pin.enc';
const SALT_LENGTH = 16;
// A PIN has at most a million values. A single SHA-256 is milliseconds on a
// GPU, so stored PINs use scrypt (memory-hard) and a constant-time comparison.
const PIN_FORMAT_VERSION = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30 * 1000; // 30 seconds

let failedAttempts = 0;
let lockoutUntil = 0;

function getPinFilePath(userDataPath) {
  return path.join(userDataPath, PIN_FILE);
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), String(salt), SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH).toString('hex');
}

function writePinData(userDataPath, data) {
  const payload = JSON.stringify(data);
  const target = getPinFilePath(userDataPath);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(target, safeStorage.encryptString(payload));
  } else {
    fs.writeFileSync(target, payload, 'utf8');
  }
}

/** Constant-time check with support for the legacy single-SHA-256 format. */
function pinMatches(stored, pin) {
  if (!stored || typeof stored.hash !== 'string' || typeof stored.salt !== 'string') return false;

  if (stored.version === PIN_FORMAT_VERSION) {
    const expected = Buffer.from(stored.hash, 'hex');
    const actual = crypto.scryptSync(String(pin), stored.salt, expected.length, SCRYPT_OPTIONS);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  // Legacy records: still verify them so nobody is locked out, then migrate
  // to the hardened format on the next successful unlock.
  const legacy = crypto.createHash('sha256').update(stored.salt + String(pin)).digest('hex');
  const a = Buffer.from(legacy, 'utf8');
  const b = Buffer.from(stored.hash, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hasPin(userDataPath) {
  const filePath = getPinFilePath(userDataPath);
  return fs.existsSync(filePath);
}

function setPin(userDataPath, pin) {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN must be 4-6 digits.');
  }

  const salt = generateSalt();
  const hash = hashPin(pin, salt);
  writePinData(userDataPath, { version: PIN_FORMAT_VERSION, salt, hash });

  // Reset failed attempts on successful PIN change
  failedAttempts = 0;
  lockoutUntil = 0;

  return { success: true };
}

function verifyPin(userDataPath, pin) {
  // Check lockout
  const now = Date.now();
  if (now < lockoutUntil) {
    const remaining = Math.ceil((lockoutUntil - now) / 1000);
    return { success: false, locked: true, remainingSeconds: remaining };
  }

  if (!hasPin(userDataPath)) {
    return { success: false, error: 'No PIN configured.' };
  }

  // Read stored data
  let data;
  const filePath = getPinFilePath(userDataPath);
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(filePath);
      data = JSON.parse(safeStorage.decryptString(encrypted));
    } else {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    return { success: false, error: 'Failed to read PIN data.' };
  }

  if (typeof pin !== 'string') {
    return { success: false, error: 'Invalid PIN.' };
  }

  if (pinMatches(data, pin)) {
    // Migrate a legacy hash silently on first successful unlock.
    if (data.version !== PIN_FORMAT_VERSION) {
      try {
        writePinData(userDataPath, {
          version: PIN_FORMAT_VERSION,
          salt: data.salt,
          hash: hashPin(pin, data.salt),
        });
      } catch {
        // A failed migration must not lock the user out of their own app.
      }
    }
    // Reset failed attempts on success
    failedAttempts = 0;
    lockoutUntil = 0;
    return { success: true };
  }

  // Increment failed attempts
  failedAttempts++;
  if (failedAttempts >= MAX_ATTEMPTS) {
    lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    failedAttempts = 0;
    return { success: false, locked: true, remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
  }

  return { success: false, attemptsRemaining: MAX_ATTEMPTS - failedAttempts };
}

function removePin(userDataPath, currentPin) {
  const result = verifyPin(userDataPath, currentPin);
  if (!result.success) {
    return result;
  }

  const filePath = getPinFilePath(userDataPath);
  try {
    fs.unlinkSync(filePath);
    failedAttempts = 0;
    lockoutUntil = 0;
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to remove PIN.' };
  }
}

function getLockoutStatus() {
  const now = Date.now();
  if (now < lockoutUntil) {
    return { locked: true, remainingSeconds: Math.ceil((lockoutUntil - now) / 1000) };
  }
  return { locked: false, remainingSeconds: 0 };
}

module.exports = {
  hasPin,
  setPin,
  verifyPin,
  removePin,
  getLockoutStatus,
  MAX_ATTEMPTS,
  LOCKOUT_DURATION_MS,
};