'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const cspModule = require(path.join(process.cwd(), 'src/electron/csp.cjs'));
const { withCsp, CSP } = cspModule;

describe('csp — CSP constant', () => {
  it('CSP is a non-empty policy string', () => {
    assert.strictEqual(typeof CSP, 'string');
    assert.ok(CSP.length > 0);
  });

  it('defaults to self', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("default-src 'self'"));
  });

  it('script-src is self-only', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("script-src 'self'"));
  });

  it('font-src is self-only', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("font-src 'self'"));
  });

  it('frame-ancestors is none', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("frame-ancestors 'none'"));
  });

  it('base-uri is self', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("base-uri 'self'"));
  });

  it('form-action is self', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("form-action 'self'"));
  });

  it('media-src allows blob', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("media-src 'self' blob:"));
  });

  it('does not allow Google Fonts', () => {
    const cspString = CSP;
    assert.ok(!cspString.includes('fonts.googleapis.com'));
    assert.ok(!cspString.includes('fonts.gstatic.com'));
  });

  it('connect-src includes specific APIs', () => {
    const cspString = CSP;
    assert.ok(cspString.includes('connect-src'));
  });

  it('connect-src allows localhost', () => {
    const cspString = CSP;
    assert.ok(cspString.includes('localhost'));
  });

  it('style-src allows unsafe-inline', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("style-src 'self' 'unsafe-inline'"));
  });

  it('img-src allows data and https', () => {
    const cspString = CSP;
    assert.ok(cspString.includes("img-src 'self' data: https:"));
  });
});

describe('csp — withCsp', () => {
  it('removes existing CSP and inserts strict policy', () => {
    const headers = {
      'content-security-policy': ["default-src 'none'"],
      'x-custom': ['value'],
    };
    const result = withCsp(headers);
    assert.ok(!result['Content-Security-Policy'][0].includes("default-src 'none'"));
    assert.ok(result['Content-Security-Policy'][0].includes("default-src 'self'"));
    assert.deepStrictEqual(result['x-custom'], ['value']);
  });

  it('handles undefined input', () => {
    assert.doesNotThrow(() => withCsp(undefined));
    const result = withCsp(undefined);
    assert.ok(result['Content-Security-Policy']);
    assert.ok(result['Content-Security-Policy'][0].includes("default-src 'self'"));
  });

  it('handles null input', () => {
    assert.doesNotThrow(() => withCsp(null));
    const result = withCsp(null);
    assert.ok(result['Content-Security-Policy']);
    assert.ok(result['Content-Security-Policy'][0].includes("default-src 'self'"));
  });

  it('handles empty object', () => {
    const result = withCsp({});
    assert.ok(result['Content-Security-Policy']);
  });

  it('does not mutate input', () => {
    const headers = { 'x-custom': ['value'] };
    const original = { ...headers };
    withCsp(headers);
    assert.deepStrictEqual(headers, original);
  });

  it('case-insensitive CSP key removal', () => {
    const headers = {
      'Content-Security-Policy': ["default-src 'none'"],
      'x-other': ['value'],
    };
    const result = withCsp(headers);
    assert.ok(!result['Content-Security-Policy'][0].includes("default-src 'none'"));
    assert.deepStrictEqual(result['x-other'], ['value']);
  });

  it('preserves multiple values for non-CSP headers', () => {
    const headers = {
      'x-custom': ['value1', 'value2'],
      'content-security-policy': ["default-src 'none'"],
    };
    const result = withCsp(headers);
    assert.deepStrictEqual(result['x-custom'], ['value1', 'value2']);
  });

  it('returns a new object (not the same reference)', () => {
    const headers = { 'x-custom': ['value'] };
    const result = withCsp(headers);
    assert.notStrictEqual(result, headers);
  });

  it('strict policy includes script-src self-only', () => {
    const result = withCsp({});
    assert.ok(result['Content-Security-Policy'][0].includes("script-src 'self'"));
  });

  it('strict policy includes object-src none', () => {
    const result = withCsp({});
    const csp = result['Content-Security-Policy'][0];
    assert.ok(csp.includes("object-src 'none'"));
  });

  it('strict policy includes base-uri self', () => {
    const result = withCsp({});
    assert.ok(result['Content-Security-Policy'][0].includes("base-uri 'self'"));
  });
});
