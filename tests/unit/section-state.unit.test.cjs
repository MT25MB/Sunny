'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// section-state.ts is TypeScript - read as text for structural verification
const sectionPath = path.join(process.cwd(), 'src/lib/section-state.ts');
const sectionTs = fs.readFileSync(sectionPath, 'utf8');

describe('section-state — SECTION_IDS (structural)', () => {
  it('defines all 6 section IDs', () => {
    assert.ok(sectionTs.includes("'system-health'"));
    assert.ok(sectionTs.includes("'quick-actions'"));
    assert.ok(sectionTs.includes("'recipes'"));
    assert.ok(sectionTs.includes("'medication'"));
    assert.ok(sectionTs.includes("'digest'"));
    assert.ok(sectionTs.includes("'activity'"));
  });

  it('SECTION_IDS array is declared', () => {
    assert.ok(sectionTs.includes("SECTION_IDS = ["));
  });

  it('defaultSectionState is declared', () => {
    assert.ok(sectionTs.includes('defaultSectionState'));
  });

  it('system-health and quick-actions start open', () => {
    assert.ok(sectionTs.includes("'system-health': true"));
    assert.ok(sectionTs.includes("'quick-actions': true"));
  });

  it('recipes, medication, digest, activity start closed', () => {
    assert.ok(sectionTs.includes("recipes: false"));
    assert.ok(sectionTs.includes("medication: false"));
    assert.ok(sectionTs.includes("digest: false"));
    assert.ok(sectionTs.includes("activity: false"));
  });

  it('loadSectionState function exists', () => {
    assert.ok(sectionTs.includes('function loadSectionState'));
  });

  it('saveSectionState function exists', () => {
    assert.ok(sectionTs.includes('function saveSectionState'));
  });

  it('loadSectionState falls back to defaults on error', () => {
    assert.ok(sectionTs.includes('catch'));
    assert.ok(sectionTs.includes('defaultSectionState'));
  });

  it('saveSectionState catches errors silently', () => {
    assert.ok(sectionTs.includes('catch'));
    assert.ok(sectionTs.includes('// localStorage may be unavailable'));
  });

  it('loadSectionState only accepts boolean values', () => {
    assert.ok(sectionTs.includes('typeof parsed[id] === \'boolean\''));
  });

  it('storage key is defined', () => {
    assert.ok(sectionTs.includes("STORAGE_KEY = 'sunny_sections_v1'"));
  });

  it('SectionId type is exported', () => {
    assert.ok(sectionTs.includes('type SectionId'));
  });

  it('SectionState type is exported', () => {
    assert.ok(sectionTs.includes('type SectionState'));
  });
});
