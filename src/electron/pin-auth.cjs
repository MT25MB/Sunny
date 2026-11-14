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
const HASH_ALGORITHM = 'sha256';
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30 * 1000; // 30 seconds

let failedAttempts = 0;
let lockoutUntil = 0;

function getPinFilePath(userDataPath) {
  return path.join(userDataPath, PIN_FILE);
}

function hashPin(pin, salt) {
  return crypto
    .createHash(HASH_ALGORITHM)
    .update(salt + pin)
    .digest('hex');
}

function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH).toString('hex');
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
  const data = JSON.stringify({ salt, hash });

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(data);
    fs.writeFileSync(getPinFilePath(userDataPath), encrypted);
  } else {
    fs.writeFileSync(getPinFilePath(userDataPath), data, 'utf8');
  }

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

  const { salt, hash } = data;
  const computedHash = hashPin(pin, salt);

  if (computedHash === hash) {
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