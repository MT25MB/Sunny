/**
 * UNIT TESTS: CSP header rewrite
 * Tests for src/electron/csp.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { withCsp, CSP } = require('../../src/electron/csp.cjs');

// ============================================================================
// CSP constant
// ============================================================================

test('CSP: is a non-empty string', () => {
  assert.ok(typeof CSP === 'string');
  assert.ok(CSP.length > 0);
});

test('CSP: defaults to self', () => {
  assert.ok(CSP.includes("default-src 'self'"));
});

test('CSP: script-src is self-only', () => {
  assert.ok(CSP.includes("script-src 'self'"));
});

test('CSP: font-src is self-only', () => {
  assert.ok(CSP.includes("font-src 'self'"));
});

test('CSP: frame-ancestors is none', () => {
  assert.ok(CSP.includes("frame-ancestors 'none'"));
});

test('CSP: base-uri is self', () => {
  assert.ok(CSP.includes("base-uri 'self'"));
});

test('CSP: form-action is self', () => {
  assert.ok(CSP.includes("form-action 'self'"));
});

test('CSP: media-src allows blob', () => {
  assert.ok(CSP.includes("media-src 'self' blob:"));
});

test('CSP: does not allow Google Fonts', () => {
  assert.ok(!CSP.includes('fonts.googleapis.com'));
  assert.ok(!CSP.includes('fonts.gstatic.com'));
});

test('CSP: connect-src includes specific APIs', () => {
  assert.ok(CSP.includes('https://www.themealdb.com'));
  assert.ok(CSP.includes('https://api.open-meteo.com'));
  assert.ok(CSP.includes('https://api.rss2json.com'));
  assert.ok(CSP.includes('https://ip-api.com'));
});

test('CSP: connect-src allows localhost', () => {
  assert.ok(CSP.includes('http://localhost:*'));
  assert.ok(CSP.includes('http://127.0.0.1:*'));
});

// ============================================================================
// withCsp - normal operation
// ============================================================================

test('withCsp: removes existing CSP and inserts strict policy', () => {
  const incoming = {
    'Content-Type': ['text/html'],
    'Content-Security-Policy': ["default-src 'unsafe-inline'"],
    'X-Custom-Header': ['foo'],
  };

  const rewritten = withCsp(incoming);

  // Our CSP is present
  assert.ok('Content-Security-Policy' in rewritten);
  assert.ok(
    rewritten['Content-Security-Policy'][0].includes("default-src 'self'"),
    'policy must be our strict one'
  );

  // Old CSP removed
  assert.ok(
    !rewritten['Content-Security-Policy'][0].includes("default-src 'unsafe-inline'"),
    'old CSP must be removed'
  );

  // Unrelated headers preserved
  assert.deepStrictEqual(rewritten['Content-Type'], ['text/html']);
  assert.deepStrictEqual(rewritten['X-Custom-Header'], ['foo']);
});

test('withCsp: handles undefined input', () => {
  const rewritten = withCsp(undefined);
  assert.ok('Content-Security-Policy' in rewritten);
  assert.ok(
    rewritten['Content-Security-Policy'][0].includes("default-src 'self'"),
    'must insert our CSP'
  );
});

test('withCsp: handles null input', () => {
  const rewritten = withCsp(null);
  assert.ok('Content-Security-Policy' in rewritten);
  assert.ok(
    rewritten['Content-Security-Policy'][0].includes("default-src 'self'"),
    'must insert our CSP'
  );
});

test('withCsp: handles empty object', () => {
  const rewritten = withCsp({});
  assert.ok('Content-Security-Policy' in rewritten);
});

test('withCsp: does not mutate input', () => {
  const incoming = {
    'Content-Security-Policy': ["default-src 'unsafe-inline'"],
    'Content-Type': ['text/html'],
  };
  const originalCSP = incoming['Content-Security-Policy'][0];
  withCsp(incoming);
  assert.equal(incoming['Content-Security-Policy'][0], originalCSP, 'input must not be mutated');
});

test('withCsp: case-insensitive CSP key removal', () => {
  const incoming = {
    'content-security-policy': ["default-src 'unsafe-inline'"],
    'X-Other': ['value'],
  };
  const rewritten = withCsp(incoming);
  assert.ok(
    !('content-security-policy' in rewritten),
    'lowercase CSP key must be removed'
  );
  assert.ok(
    'Content-Security-Policy' in rewritten,
    'our CSP key must be present'
  );
});

test('withCsp: preserves multiple values for non-CSP headers', () => {
  const incoming = {
    'Set-Cookie': ['a=1', 'b=2'],
    'Content-Security-Policy': ["default-src 'unsafe-inline'"],
  };
  const rewritten = withCsp(incoming);
  assert.deepStrictEqual(rewritten['Set-Cookie'], ['a=1', 'b=2']);
});

test('withCsp: returns a new object (not the same reference)', () => {
  const incoming = { 'Content-Type': ['text/html'] };
  const rewritten = withCsp(incoming);
  assert.notStrictEqual(rewritten, incoming, 'must return new object');
});
