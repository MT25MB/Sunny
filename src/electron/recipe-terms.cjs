/**
 * Builds the list of queries to try for the recipe search, best first.
 *
 * TheMealDB matches meal NAMES as substrings, so natural searches like
 * "cookie recipe" match nothing at all (0 results - what the user saw).
 * This builds candidate queries: the raw phrase, the phrase with the
 * recipe/filler words removed, and finally the remaining significant
 * tokens, longest first - deduped and kept >= 3 characters.
 *
 * Pure, exported for plain-node unit testing (no Electron imports).
 */

'use strict';

const FILLER_PHRASES = [
  'how to make', 'how to cook', 'how to bake', 'how do i make',
  'recipe for', 'recipes for', 'a recipe for', 'an easy', 'a quick',
];

const FILLER_WORDS = [
  'recipe', 'recipes', 'dish', 'meal', 'dinner', 'desert', 'dessert',
  'easy', 'simple', 'quick', 'best', 'delicious', 'homemade',
  'make', 'cook', 'bake', 'makeahead', 'overnight', 'beginner', 'beginners',
];

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'of', 'for', 'to', 'in', 'on', 'at', 'is']);

/** Collapse whitespace, lowercase, trim. */
function normalise(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} raw the user's raw search text
 * @returns {string[]} candidate queries, best first, deduplicated
 */
function buildRecipeSearchTerms(raw) {
  const cleaned = normalise(raw);
  if (cleaned.length < 3) return [];
  // A phrase made only of stopwords carries no searchable meaning.
  if (cleaned.split(' ').every((t) => STOPWORDS.has(t))) return [];

  const seen = new Set();
  const terms = [];
  const push = (candidate) => {
    const key = normalise(candidate);
    if (key.length >= 3 && !seen.has(key)) {
      seen.add(key);
      terms.push(key);
    }
  };

  push(cleaned);

  // Drop recipe/filler phrases anywhere in the string.
  let stripped = cleaned;
  for (const phrase of FILLER_PHRASES) {
    stripped = stripped.split(phrase).join(' ');
  }
  for (const word of FILLER_WORDS) {
    stripped = stripped.replace(new RegExp('\\b' + word + '\\b', 'g'), ' ');
  }
  push(stripped);

  // Fall back to the most significant tokens, longest first.
  const tokens = normalise(stripped || cleaned)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .sort((a, b) => b.length - a.length);
  for (const token of tokens) push(token);

  return terms;
}

module.exports = { buildRecipeSearchTerms, normalise };
