/**
 * Accent color system regressions. The accent must be a distinct third hue
 * (not another orange), must keep the amber brand/status meanings intact, and
 * must meet contrast on the dark surfaces in both the app and the website.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const APP = read('src/index.css');
const SITE = read('index.html');
const LEGAL = read('public/assets/site.css');

const ACCENT = {
  soft: '#BCC5F2',
  base: '#9DA9E8',
  strong: '#8493DC',
  deep: '#6E7FCB',
};

test('all three surfaces declare the accent ramp', () => {
  for (const [name, css] of [['app', APP], ['website', SITE], ['legal pages', LEGAL]]) {
    for (const step of Object.values(ACCENT)) {
      assert.ok(css.includes(step), `${name} must declare ${step}`);
    }
  }
});

test('keyboard focus uses the accent, not the brand amber', () => {
  assert.ok(APP.includes('outline: 3px solid var(--accent)'), 'app focus ring must use accent');
  assert.ok(SITE.includes('--focus: var(--accent)'), 'website focus token must use accent');
  assert.ok(LEGAL.includes('--focus: var(--accent)'), 'legal pages focus token must use accent');
});

test('amber remains the primary action color', () => {
  assert.ok(APP.includes('background: #f1b568'), 'primary buttons must stay amber');
  assert.ok(SITE.includes('--brand: #f1a95b'), 'website brand must stay amber');
});

test('status hues keep their separate meanings', () => {
  assert.ok(APP.includes('#71d2a4'), 'success green must remain');
  assert.ok(APP.includes('#77b9d5'), 'running blue must remain');
  assert.ok(APP.includes('#e28778'), 'error coral must remain');
});

test('accent is applied to structure, links and chat, not just declared', () => {
  assert.match(APP, /color: var\(--accent-soft\);\s*font: 700 1\.125rem/, 'section titles');
  assert.ok(APP.includes('background: rgba(157, 169, 232, 0.16)'), 'assistant role chip');
  assert.ok(APP.includes('border-color: rgba(157, 169, 232, 0.45)'), 'assistant chat bubble');
  assert.ok(SITE.includes('color: var(--accent-soft);\n    margin-bottom: var(--space-3)'), 'site kicker');
});

// --- measured color science (no estimates) ---------------------------------
function toLin(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}
function luminance(hex) {
  const [r, g, b] = toLin(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hue(hex) {
  const [r, g, b] = toLin(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const h = Math.atan2(B, A) * 180 / Math.PI;
  return h < 0 ? h + 360 : h;
}

test('accent text passes contrast on all dark surfaces', () => {
  for (const bg of ['#11161b', '#131a1f', '#171d22', '#1d262c', '#202930']) {
    const ratio = contrast(ACCENT.soft, bg);
    assert.ok(ratio >= 4.5, `accent-soft on ${bg} is ${ratio.toFixed(2)}:1, below 4.5:1`);
  }
});

test('dark text on the accent fill passes contrast', () => {
  assert.ok(contrast('#131a1f', ACCENT.base) >= 4.5, 'dark ink on accent fill must pass');
});

test('accent hue is distinct from every brand and status hue', () => {
  const accentHue = hue(ACCENT.base);
  for (const [name, hex] of Object.entries({
    amber: '#f1b568', success: '#71d2a4', running: '#77b9d5', error: '#e28778',
  })) {
    const d = Math.min(Math.abs(accentHue - hue(hex)), 360 - Math.abs(accentHue - hue(hex)));
    assert.ok(d >= 15, `accent is within 15 degrees of ${name} (${d.toFixed(0)} degrees)`);
  }
});
