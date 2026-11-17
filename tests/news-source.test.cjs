/** News items must show a real source name, not "Unknown". */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'main.cjs'), 'utf8');

test('news source falls back to the feed title before Unknown', () => {
  const i = MAIN.indexOf('async function fetchDigestNews');
  const block = MAIN.slice(i, i + 1400);
  assert.match(block, /newsData\.feed\?\.title|feed\.title/, 'must use the RSS feed title');
  const sourceLine = block.split('\n').find(l => l.includes('source:'));
  assert.ok(sourceLine, 'must build a source field');
  assert.ok(sourceLine.indexOf('feed') < sourceLine.indexOf('Unknown'), 'feed title must precede the Unknown fallback');
});

test('the feed title is sanitized before display', () => {
  const i = MAIN.indexOf('async function fetchDigestNews');
  const block = MAIN.slice(i, i + 1400);
  assert.match(block, /sanitizeUntrustedContent\(String\(newsData\.feed/, 'feed-derived source must be sanitized');
});
