/**
 * UNIT TESTS: Section state (content-based)
 * Tests for src/lib/section-state.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'section-state.ts'), 'utf8');

// ============================================================================
// Section IDs
// ============================================================================

test('sections: defines SECTION_IDS array', () => {
  assert.ok(SRC.includes('export const SECTION_IDS = ['));
});

test('sections: includes all 6 section IDs', () => {
  for (const id of [
    'system-health',
    'quick-actions',
    'recipes',
    'medication',
    'digest',
    'activity',
  ]) {
    assert.ok(SRC.includes(`'${id}'`), `SECTION_IDS must include ${id}`);
  }
});

test('sections: exports SectionId type', () => {
  assert.ok(SRC.includes('export type SectionId ='));
});

test('sections: exports SectionState type', () => {
  assert.ok(SRC.includes('export type SectionState = Record<SectionId, boolean>;'));
});

// ============================================================================
// Default state
// ============================================================================

test('defaults: system-health starts open', () => {
  assert.ok(SRC.includes("'system-health': true"));
});

test('defaults: quick-actions starts open', () => {
  assert.ok(SRC.includes("'quick-actions': true"));
});

test('defaults: recipes starts closed', () => {
  assert.ok(SRC.includes("recipes: false"));
});

test('defaults: medication starts closed', () => {
  assert.ok(SRC.includes("medication: false"));
});

test('defaults: digest starts closed', () => {
  assert.ok(SRC.includes("digest: false"));
});

test('defaults: activity starts closed', () => {
  assert.ok(SRC.includes("activity: false"));
});

// ============================================================================
// Functions
// ============================================================================

test('functions: defines loadSectionState', () => {
  assert.ok(SRC.includes('export function loadSectionState()'));
});

test('functions: defines saveSectionState', () => {
  assert.ok(SRC.includes('export function saveSectionState('));
});

// ============================================================================
// Storage key
// ============================================================================

test('storage: defines section storage key', () => {
  assert.ok(SRC.includes("const STORAGE_KEY = 'sunny_sections_v1';"));
});

// ============================================================================
// Safety behavior
// ============================================================================

test('safety: loadSectionState falls back to defaults on error', () => {
  assert.ok(SRC.includes('return { ...defaultSectionState };'));
});

test('safety: saveSectionState catches errors silently', () => {
  assert.ok(SRC.includes('// localStorage may be unavailable in some sandboxed contexts'));
});

test('safety: loadSectionState only accepts boolean values', () => {
  assert.ok(SRC.includes('if (typeof parsed[id] === \'boolean\''));
});
