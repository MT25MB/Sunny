/**
 * Regression test for a bug that shipped in v1.5.48 and made every recipe
 * search return zero results: fetchWithTimeout() already returns the parsed
 * JSON body, but the recipe search called .json() on it a second time.
 * response.json is not a function on a plain object, every candidate query
 * threw, and the user saw "I couldn't find anything".
 *
 * This test scans every fetchWithTimeout call site and fails if any of the
 * following 200 characters calls .json() on the result.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');

test('no fetchWithTimeout call site calls .json() on the result', () => {
  const re = /await fetchWithTimeout\(/g;
  let m;
  let count = 0;
  while ((m = re.exec(MAIN)) !== null) {
    count += 1;
    const window = MAIN.slice(m.index, m.index + 400);
    assert.ok(
      !window.includes('.json('),
      `fetchWithTimeout returns the parsed body - remove the extra .json() (call site #${count})`
    );
  }
  assert.ok(count >= 3, 'expected several fetchWithTimeout call sites to exist');
});

test('fetchWithTimeout returns parsed JSON, not a Response', () => {
  // Document the contract so the name does not mislead callers again.
  assert.ok(
    MAIN.includes('return await response.json();'),
    'fetchWithTimeout must document that it returns the parsed body'
  );
});
