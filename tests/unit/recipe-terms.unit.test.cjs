/**
 * Unit tests for the recipe search query builder and the search wiring.
 *
 * TheMealDB matches meal NAMES as substrings, so a natural search like
 * "cookie recipe" returns nothing (what the user saw). The builder turns
 * that into candidate queries - raw phrase, then filler-stripped, then the
 * significant tokens, longest first - deduplicated and kept >= 3 chars.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildRecipeSearchTerms, normalise } = require('../../src/electron/recipe-terms.cjs');

const REPO = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MAIN = read('src/electron/main.cjs');
const APP = read('src/App.tsx');

test('"cookie recipe" searches "cookie" after the raw phrase (the user-facing bug)', () => {
  const terms = buildRecipeSearchTerms('cookie recipe');
  assert.deepEqual(terms, ['cookie recipe', 'cookie']);
});

test('filler words are removed: "how to make lasagna" finds "lasagna"', () => {
  const terms = buildRecipeSearchTerms('how to make lasagna');
  assert.ok(terms.includes('lasagna'));
  assert.ok(terms[0] === 'how to make lasagna', 'the raw phrase stays first');
});

test('"recipe for apple pie" finds "apple pie", then "apple" and "pie"', () => {
  const terms = buildRecipeSearchTerms('recipe for apple pie');
  assert.deepEqual(terms.slice(0, 3), ['recipe for apple pie', 'apple pie', 'apple']);
  assert.ok(terms.slice(0, 4).includes('pie'));
});

test('significant tokens are ordered by length, longest first', () => {
  const terms = buildRecipeSearchTerms('chocolate chip cookies');
  const afterFull = terms.slice(1);
  assert.deepEqual(afterFull, ['chocolate', 'cookies', 'chip']);
});

test('stopword-only queries yield nothing meaningful', () => {
  assert.deepEqual(buildRecipeSearchTerms('the and of'), []);
  assert.deepEqual(buildRecipeSearchTerms(''), []);
  assert.deepEqual(buildRecipeSearchTerms('   '), []);
});

test('short and trivial queries are handled safely', () => {
  assert.deepEqual(buildRecipeSearchTerms('an'), []);
  assert.deepEqual(buildRecipeSearchTerms('pie'), ['pie']);
});

test('normalise collapses case, punctuation and spacing', () => {
  assert.equal(normalise('  Chocolate   CHIP   Cookies!  '), 'chocolate chip cookies!');
});

test('searchRecipes in main.cjs tries candidate terms with a timeout', () => {
  assert.ok(MAIN.includes('buildRecipeSearchTerms(query)'), 'the search must use the candidate terms');
  assert.ok(MAIN.includes('fetchWithTimeout('), 'the search must use the timeout-wrapped fetch');
  // The old single raw-query fetch must be gone.
  assert.ok(!MAIN.includes('/search.php?s=${encodeURIComponent(query)}'), 'the raw-query fetch must be gone');
});

test('main.cjs requires the recipe-terms module', () => {
  assert.ok(MAIN.includes("require('./recipe-terms.cjs')"), 'main.cjs must require the terms builder');
});

test('the renderer handles empty recipe results honestly', () => {
  assert.ok(APP.includes("couldn't find anything for"), 'empty result must get a helpful message');
  assert.ok(APP.includes('Try a simpler search'), 'the message must guide the user to a working search');
  // The misleading "Found 0 recipe(s)" must be gone.
  assert.ok(!APP.includes('Found ${(result.result as { recipes: Recipe[] }).recipes.length}'), 'the misleading count must be gone');
});
