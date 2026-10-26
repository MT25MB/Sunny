/**
 * Feature verification tests for the Sunny Electron app.
 *
 * These tests verify that every UI feature the user needs is actually
 * implemented: recipe search, medication reminders, Morning Digest weather
 * and news, window title-bar buttons, and voice input without a confirmation
 * dialog.
 *
 * Run with:  node --test tests/features.feature.test.cjs
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..");
const CSS = fs.readFileSync(path.join(REPO, "src", "index.css"), "utf8");
const MAIN = fs.readFileSync(path.join(REPO, "src", "electron", "main.cjs"), "utf8");
const APP = fs.readFileSync(path.join(REPO, "src", "App.tsx"), "utf8");

/** The stylesheet without its comments. */
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The declarations of one rule, or null if the rule is not there.
 */
function rule(selector) {
  const index = CSS_NO_COMMENTS.indexOf(selector + " {");
  if (index === -1) return null;
  const start = CSS_NO_COMMENTS.indexOf("{", index);
  const end = CSS_NO_COMMENTS.indexOf("}", start);
  return CSS_NO_COMMENTS.slice(start + 1, end);
}

// ============================================================================
// Recipe search feature
// ============================================================================

test("recipe search IPC handler exists in the main process", () => {
  assert.ok(/sunny:search-recipe/.test(MAIN), "the main process must handle sunny:search-recipe");
  assert.ok(/searchRecipes/.test(MAIN), "the main process must define searchRecipes");
});

test("recipe search form CSS is present", () => {
  assert.ok(rule(".recipe-search-form") !== null, ".recipe-search-form must be styled");
  assert.ok(rule(".recipe-search-input") !== null, ".recipe-search-input must be styled");
  assert.ok(rule(".recipe-search-btn") !== null, ".recipe-search-btn must be styled");
});

test("recipe results CSS is present", () => {
  assert.ok(rule(".recipe-results") !== null, ".recipe-results must be styled");
  assert.ok(rule(".recipe-card") !== null, ".recipe-card must be styled");
  assert.ok(rule(".recipe-select-btn") !== null, ".recipe-select-btn must be styled");
});

// ============================================================================
// Medication reminder feature
// ============================================================================

test("schedule medication reminder IPC handler exists", () => {
  assert.ok(/sunny:schedule-medication-reminder/.test(MAIN), "the main process must handle sunny:schedule-medication-reminder");
  assert.ok(/scheduleMedicationReminder/.test(MAIN), "the main process must define scheduleMedicationReminder");
});

test("add-medication button CSS is present", () => {
  assert.ok(rule(".collapsible-header > .add-medication-btn") !== null, "the add-medication button in collapsible headers must be styled");
  assert.ok(rule(".medication-btn") !== null, ".medication-btn must be styled");
  assert.ok(rule(".medication-btn.taken-btn") !== null, ".medication-btn.taken-btn must be styled");
  assert.ok(rule(".medication-btn.taken-btn:hover") !== null, ".medication-btn.taken-btn:hover must be styled");
});

// ============================================================================
// Morning Digest: weather and news
// ============================================================================

test("digest weather section CSS is present", () => {
  assert.ok(rule(".digest-weather") !== null, ".digest-weather must be styled");
  assert.ok(rule(".weather-feels") !== null, ".weather-feels must be styled");
  assert.ok(rule(".weather-details") !== null, ".weather-details must be styled");
  assert.ok(rule(".weather-detail") !== null, ".weather-detail must be styled");
  assert.ok(rule(".detail-label") !== null, ".detail-label must be styled");
});

test("digest news section CSS is present", () => {
  assert.ok(rule(".digest-news") !== null, ".digest-news must be styled");
  assert.ok(rule(".news-image") !== null, ".news-image must be styled");
  assert.ok(rule(".news-content") !== null, ".news-content must be styled");
  assert.ok(rule(".news-title") !== null, ".news-title must be styled");
  assert.ok(rule(".news-date") !== null, ".news-date must be styled");
  assert.ok(rule(".news-source") !== null, ".news-source must be styled");
});

test("section mascot caption CSS is present", () => {
  assert.ok(rule(".section-mascot-caption") !== null, ".section-mascot-caption must be styled");
});

test("App.tsx renders digest weather when data is available", () => {
  assert.ok(/digest-weather/.test(APP), "App.tsx must render digest-weather");
  assert.ok(/weather-feels/.test(APP), "App.tsx must render weather-feels");
  assert.ok(/weather-details/.test(APP), "App.tsx must render weather-details");
  assert.ok(/detail-label/.test(APP), "App.tsx must render detail-label");
});

test("App.tsx renders digest news when data is available", () => {
  assert.ok(/digest-news/.test(APP), "App.tsx must render digest-news");
});

test("App.tsx renders news items", () => {
  assert.ok(/news-image/.test(APP) || /news-content/.test(APP), "App.tsx must render news items");
});

// ============================================================================
// Window title bar buttons (Windows)
// ============================================================================

test("window minimize and close buttons CSS is present", () => {
  // Base styles for all window buttons
  assert.ok(/\.window-btn\s*\{/.test(CSS_NO_COMMENTS), ".window-btn base styles must be styled");
  // Close button specific hover/focus styles
  assert.ok(/\.window-btn-close:focus-visible/.test(CSS_NO_COMMENTS), ".window-btn-close focus-visible styles must exist");
  // Minimize and close classes used on button elements
  assert.ok(/window-btn-minimize/.test(CSS_NO_COMMENTS), "window-btn-minimize class must exist in CSS");
  assert.ok(/window-btn-close/.test(CSS_NO_COMMENTS), "window-btn-close class must exist in CSS");
});

test("App.tsx renders window buttons", () => {
  assert.ok(/window-btn-minimize/.test(APP), "App.tsx must render window-btn-minimize");
  assert.ok(/window-btn-close/.test(APP), "App.tsx must render window-btn-close");
  assert.ok(/handleMinimizeWindow/.test(APP), "App.tsx must define handleMinimizeWindow");
  assert.ok(/handleCloseWindow/.test(APP), "App.tsx must define handleCloseWindow");
});

// ============================================================================
// Voice input without confirmation dialog
// ============================================================================

test("transcribe_speech is not in SENSITIVE_OPERATIONS", () => {
  const start = MAIN.indexOf("SENSITIVE_OPERATIONS");
  assert.ok(start !== -1, "SENSITIVE_OPERATIONS must exist");
  const sensitive = MAIN.slice(start, MAIN.indexOf("]);", start));
  assert.ok(!/["']transcribe_speech["']/.test(sensitive), "transcribe_speech must not require a confirmation dialog");
});
