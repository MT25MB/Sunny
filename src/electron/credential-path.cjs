/**
 * Where a credential lives on disk.
 *
 * Split out from main.cjs so the traversal guard is a function that can be
 * executed by the test suite, rather than a security control that is only ever
 * checked by reading the source of a module that requires Electron.
 */

'use strict';

const path = require('node:path');

/**
 * Only the characters the real keys use are accepted
 * (openai_api_key, anthropic_api_key, groq_api_key). Nothing legitimate needs
 * a separator, a dot, or more than 64 characters, so rejecting them costs
 * nothing and closes `../../../../etc/passwd` outright.
 */
const CREDENTIAL_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Builds the file path for `key` inside `baseDir`.
 *
 * `path.join` resolves `..` segments, so an unvalidated key escapes the
 * directory — the caller would then read, overwrite, or unlink a file
 * somewhere else on the disk. Validation happens here, and the result is
 * re-checked, so no caller can skip it.
 *
 * @param {string} baseDir Directory that must contain the credential.
 * @param {string} key Credential name.
 * @returns {string} Absolute path to the `.enc` file.
 * @throws {Error} If the key is not a safe credential name.
 */
function getCredentialPath(baseDir, key) {
  if (typeof key !== 'string' || !CREDENTIAL_KEY_PATTERN.test(key)) {
    throw new Error('Invalid credential key.');
  }

  const dir = path.resolve(baseDir);
  const resolved = path.join(dir, `${key}.enc`);

  // Belt and braces: confirm the result really is a direct child of the
  // credentials directory before any caller touches the filesystem.
  if (path.dirname(path.resolve(resolved)) !== dir) {
    throw new Error('Invalid credential key.');
  }

  return resolved;
}

module.exports = { getCredentialPath, CREDENTIAL_KEY_PATTERN };