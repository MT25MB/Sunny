/**
 * Bounded, safe file lookup for chat requests like
 * "find BWSI.txt on my computer and open it in File Explorer".
 *
 * Only filenames (never user-supplied paths) are accepted, and the search is
 * confined to a few known user folders with depth/entry limits — this must
 * never become a general-purpose filesystem probe driven by model output.
 */

'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');

/** A standalone filename token, e.g. "BWSI.txt", "report-final.pdf". */
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,110}\.[A-Za-z0-9]{1,6}$/;
const BAD_NAME_CHARS = /[\\/]|^\.|\.\./;

/**
 * Extract a safe basename from a chat message. Returns null for anything that
 * looks like a path or is too long.
 * @param {string} text
 * @returns {string | null}
 */
function extractFileName(text) {
  if (typeof text !== 'string') return null;
  const tokens = text.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const name = tokens[i].replace(/[!?,;:.]+$/, '').trim();
    if (!FILE_NAME_RE.test(name)) continue;
    if (name.length > 120 || BAD_NAME_CHARS.test(name)) return null;
    if (/^[A-Za-z]:/.test(name)) return null;
    return name;
  }
  return null;
}

/**
 * Find a file by exact (then partial) case-insensitive name within the given
 * roots. Bounded by depth and entry count; symlinked directories are skipped.
 * @param {string} name
 * @param {string[]} roots
 * @param {{ maxDepth?: number, maxEntries?: number }} [options]
 * @returns {Promise<string | null>} absolute path of the first match
 */
async function findUserFile(name, roots, { maxDepth = 4, maxEntries = 8000 } = {}) {
  if (!name || typeof name !== 'string') return null;
  const needle = name.toLowerCase();
  let scanned = 0;
  let partial = null;

  for (const root of roots) {
    if (!root || typeof root !== 'string') continue;
    if (partial && scanned >= maxEntries) break;

    async function walk(dir, depth) {
      if (depth > maxDepth || scanned >= maxEntries) return;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (scanned >= maxEntries) return;
        scanned += 1;
        const lower = entry.name.toLowerCase();
        if (entry.isFile()) {
          if (lower === needle) {
            partial = path.join(dir, entry.name);
            return;
          }
          if (!partial && lower.includes(needle)) partial = path.join(dir, entry.name);
        } else if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')) {
          await walk(path.join(dir, entry.name), depth + 1);
        }
      }
    }

    await walk(root, 0);
    if (partial && path.basename(String(partial)).toLowerCase() === needle) return partial;
  }
  return partial;
}

module.exports = { extractFileName, findUserFile };
