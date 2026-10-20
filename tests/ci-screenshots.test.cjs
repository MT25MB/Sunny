/**
 * Regression tests for the CI screenshot capture.
 *
 * Run with:  node --test tests/
 *
 * These are guards, not end-to-end tests: the real capture needs Electron
 * and an X server, neither of which exists on a bare test runner. What they
 * do check is the class of mistake that actually broke CI -- using a
 * Playwright API that does not exist on a browser attached over CDP.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SCRIPT_PATH = path.join(REPO, 'scripts', 'capture-screenshots.cjs');
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
const WORKFLOW = fs.readFileSync(
  path.join(REPO, '.github', 'workflows', 'screenshots.yml'),
  'utf8'
);

test('capture script does not call the CDP-incompatible browser.pages()', () => {
  // Playwright only defines Browser.pages() for browsers it launched itself.
  // A browser attached over CDP keeps its pages under its default context,
  // so browser.pages is undefined and the call threw
  // "TypeError: browser.pages is not a function" -- which failed the job
  // after the app had already launched successfully.
  assert.ok(
    !/browser\s*\.\s*pages\s*\(/.test(SCRIPT),
    'must not call browser.pages(); use browser.contexts()[0].pages() instead'
  );
  assert.ok(
    /contexts\(\)/.test(SCRIPT),
    'must read pages from the CDP default context'
  );
  assert.ok(
    /\.pages\(\)/.test(SCRIPT),
    'must call pages() on a context'
  );
});

test('capture script waits for the window instead of assuming it exists', () => {
  // The DevTools endpoint can accept connections before the window opens,
  // so the page lookup has to poll rather than read context.pages()[0]
  // blind.
  assert.ok(
    /for\s*\(let attempt/.test(SCRIPT) && /await wait\(500\)/.test(SCRIPT),
    'must poll for the page rather than assume it is already open'
  );
});

test('capture script dismisses the onboarding overlay', () => {
  // A fresh CI profile has an empty localStorage, so the app opens with the
  // first-run overlay covering the whole UI. The screenshot would show the
  // onboarding instead of the app.
  assert.ok(
    /onboarding-skip/.test(SCRIPT),
    'must dismiss the onboarding overlay before capturing'
  );
});

test('capture script fails loudly rather than silently skipping', () => {
  // A silent exit 0 would leave the job green while producing nothing.
  assert.ok(
    /process\.exit\(1\)/.test(SCRIPT),
    'must exit non-zero when capture fails'
  );
  assert.ok(
    /\.catch\(/.test(SCRIPT),
    'must handle rejection of the top-level capture'
  );
});

test('screenshot workflow provides a display for Electron', () => {
  // Without one, Electron aborts with "Missing X server or $DISPLAY" during
  // platform init and the DevTools port never opens.
  assert.ok(
    /Xvfb\s+:99/.test(WORKFLOW),
    'the workflow must start a virtual framebuffer'
  );
  assert.ok(
    /DISPLAY:\s*':99'/.test(WORKFLOW),
    'the workflow must export DISPLAY for the launch step'
  );
  assert.ok(
    /--no-sandbox/.test(WORKFLOW),
    'the workflow must disable the sandbox; the runner has no SUID helper'
  );
  assert.ok(
    /--remote-debugging-port=9222/.test(WORKFLOW),
    'the workflow must open the DevTools port the script connects to'
  );
});

test('screenshot workflow can push its commit from a tag checkout', () => {
  // The workflow is triggered by a tag push, so the checkout is a detached
  // HEAD: a plain "git push" fails, and git-auto-commit-action's branch
  // input refuses to check out over the freshly captured images.
  assert.ok(
    /git push origin HEAD:main/.test(WORKFLOW),
    'must push the screenshot commit explicitly to main'
  );
  assert.ok(
    !/uses:\s*stefanzweifel\/git-auto-commit-action/.test(WORKFLOW),
    'git-auto-commit-action cannot be used from a detached HEAD'
  );
});
