/**
 * Confinement guard for the `reveal_file` action.
 *
 * Model output and chat text can name a path, but only files the user would
 * reasonably call "their documents" may be revealed in the OS file manager.
 * The home directory is deliberately NOT a root: it contains ~/.ssh, ~/.aws,
 * browser profiles and other secrets that must never be surfaced by an AI.
 *
 * Pure module (no Electron import) so the guard is executable by the test
 * suite rather than only readable in main.cjs.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} targetPath path supplied by the model / chat
 * @param {string[]} roots directories the user may reveal files from
 * @param {{ fakeFs?: object }} [opts] injectable fs for tests
 * @returns {boolean} true only for a real file inside an allowed root
 */
function isSafeRevealPath(targetPath, roots, opts = {}) {
  if (typeof targetPath !== 'string') return false;
  const candidate = targetPath.trim();
  if (!candidate || candidate.length > 500 || candidate.includes('\0')) return false;

  const io = opts.fakeFs || fs;
  const safeRoots = (Array.isArray(roots) ? roots : [])
    .filter((root) => typeof root === 'string' && root.trim())
    .map((root) => path.resolve(root));
  if (safeRoots.length === 0) return false;

  const resolved = path.resolve(candidate);
  const containingRoot = safeRoots.find((root) =>
    resolved.length > root.length && resolved.startsWith(root + path.sep)
  );
  if (!containingRoot) return false;

  // Hidden files and hidden directories (.ssh, .env, .aws, ...) are never
  // part of a senior user's "my documents" request.
  const relative = path.relative(containingRoot, resolved);
  if (relative.split(/[\\/]/).some((segment) => segment.startsWith('.'))) return false;

  // Resolve links before the final check: a symlink inside Documents that
  // points at /etc/passwd must not be treated as an in-root file.
  let real;
  try {
    real = path.resolve(io.realpathSync(resolved));
  } catch {
    return false;
  }
  const realInside = safeRoots.some((root) =>
    real.length > root.length && real.startsWith(root + path.sep)
  );
  if (!realInside) return false;

  let stat;
  try {
    stat = io.statSync(resolved);
  } catch {
    return false;
  }
  return Boolean(stat && typeof stat.isFile === 'function' && stat.isFile());
}

module.exports = { isSafeRevealPath };
