/**
 * Regression test: a collapsible section's panel must render BELOW its header,
 * never beside it. `flex-wrap: wrap` on the column section makes a tall panel
 * (e.g. the Activity Log) wrap into a second flex column next to the header,
 * clipping the conversation. Header-level wrapping is handled by
 * `.collapsible-header { flex-wrap: wrap; }` and must remain.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');

/** Concatenate every exact `selector { ... }` rule (styles are split across rules). */
function rule(selector) {
  const out = [];
  let i = -1;
  while ((i = CSS.indexOf(`${selector} {`, i + 1)) !== -1) {
    out.push(CSS.slice(i, CSS.indexOf('}', i) + 1));
  }
  assert.ok(out.length > 0, `${selector} rule must exist`);
  return out.join(' ').replace(/\s+/g, ' ');
}

test('collapsible sections stack their children in a single column', () => {
  const section = rule('.collapsible-section');
  assert.ok(section.includes('flex-direction: column'), 'section must be a column');
  assert.ok(
    !/flex-wrap:\s*wrap/.test(section),
    'section must not wrap: a tall panel would sit beside the header instead of below it'
  );
});

test('the header still wraps its own title and extra button', () => {
  const header = rule('.collapsible-header');
  assert.match(header, /flex-wrap:\s*wrap/, 'header wrapping must be preserved');
});

test('the chat section keeps its column layout', () => {
  const chat = rule('.chat-section');
  assert.match(chat, /flex-direction:\s*column/);
  assert.match(chat, /overflow:\s*hidden/);
});
