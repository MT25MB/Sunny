/**
 * Contrast regression test.
 *
 * Run with:  node --test tests/
 *
 * Three buttons in the app set a near-black text colour on a dark gradient.
 * The colour was left over from an earlier design where the fill was light,
 * so the labels measured 1.02:1 to 1.06:1 against their background -- WCAG AA
 * wants 4.5:1 for 16px bold text. "Fetch Morning Digest" was unreadable, and
 * so were the cooking-mode button and "I Took It", which is the main action
 * in the medication flow.
 *
 * This test walks the stylesheet and fails on any text/background pair below
 * the threshold, so the next dark-on-dark button is caught here rather than
 * by a user.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS_PATH = path.join(__dirname, '..', 'src', 'index.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf8');

/** WCAG AA for normal text. Large text (>=18.66px bold) only needs 3:1. */
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

function srgb(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const m = hex.replace('#', '').slice(0, 6);
  if (m.length !== 6 || /[^0-9a-fA-F]/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  if (l1 === null || l2 === null) return null;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Selectors that are allowed to sit below 4.5:1, and why.
 *
 *  - `:disabled` controls are exempt from WCAG contrast entirely.
 *  - Icon-only controls carry no text; WCAG requires 3:1 for the graphical
 *    component, which they clear.
 */
const EXEMPT = [
  { selector: '.primary-button:disabled', why: 'disabled controls are exempt from WCAG contrast' },
  { selector: '.voice-button', why: 'icon-only control; 3:1 applies' },
  { selector: '.api-key-input-wrap .api-key-toggle', why: 'icon-only control; 3:1 applies' },
];

function isExempt(selector) {
  return EXEMPT.some((e) => selector.includes(e.selector));
}

/** Pulls out simple `selector { ... }` rules. */
function parseRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim().split('\n').pop().trim();
    if (!selector || selector.startsWith('@')) continue;
    rules.push({ selector, body: m[2], line: css.slice(0, m.index).split('\n').length });
  }
  return rules;
}

test('no text/background pair in the stylesheet falls below WCAG AA', () => {
  const failures = [];

  for (const rule of parseRules(CSS)) {
    const colour = rule.body.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8})\b/);
    const background = rule.body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/);
    if (!colour || !background) continue;
    if (isExempt(rule.selector)) continue;

    // A background may be a gradient; check the first and last colour in it,
    // since the text sits somewhere between them.
    const backgrounds = (background[1].match(/#[0-9a-fA-F]{3,8}\b/g) || []).slice(0, 2);
    if (!backgrounds.length) continue;

    for (const bg of backgrounds) {
      const ratio = contrast(colour[1], bg);
      if (ratio === null) continue;
      if (ratio < AA_NORMAL) {
        failures.push(
          'line ' + rule.line + ': ' + rule.selector + ' -- ' + colour[1] +
          ' on ' + bg + ' is ' + ratio.toFixed(2) + ':1, needs ' + AA_NORMAL + ':1'
        );
      }
    }
  }

  assert.deepStrictEqual(
    failures,
    [],
    'text that cannot be read:\n  ' + failures.join('\n  ')
  );
});

test('the three buttons that regressed are legible', () => {
  // Explicit checks for the buttons that were reported broken, so the intent
  // survives a well-meaning colour tweak.
  const expectations = [
    { selector: '.digest-btn.primary', colour: '#f6c97a' },
    { selector: '.cooking-btn-primary', colour: '#f6c97a' },
    { selector: '.medication-btn.taken-btn', colour: '#71d2a4' },
  ];

  for (const { selector, colour } of expectations) {
    const index = CSS.indexOf(selector + ' {');
    assert.notStrictEqual(index, -1, selector + ' must exist');
    const block = CSS.slice(index, CSS.indexOf('}', index));
    assert.ok(
      block.includes('color: ' + colour),
      selector + ' must use ' + colour + ' for its text'
    );
  }
});

test('every exempt entry still has a stated reason', () => {
  // An exemption with no reason is how a real accessibility bug hides.
  for (const entry of EXEMPT) {
    assert.ok(
      entry.why && entry.why.length > 10,
      'exemption for ' + entry.selector + ' needs a reason'
    );
  }
});
