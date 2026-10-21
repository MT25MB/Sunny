/**
 * Regression tests for the rendering faults found by measuring the running
 * app.
 *
 * Run with:  node --test tests/
 *
 * Each of these bugs was invisible in the source. They were found by driving
 * the real application over the DevTools protocol and measuring what was
 * actually on the screen, which is why the runtime check in
 * scripts/check-rendering.cjs now runs in CI. These tests are the cheap
 * half of that pair: they pin the specific mistakes so a well-meaning
 * stylesheet edit cannot quietly bring them back.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(REPO, 'src', 'index.css'), 'utf8');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');
const WORKFLOW = fs.readFileSync(
  path.join(REPO, '.github', 'workflows', 'screenshots.yml'),
  'utf8'
);

/** The stylesheet without its comments, so a comment between two
 * declarations does not hide the second one from the rule parser. */
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The stylesheet with its @media blocks removed.
 *
 * A rule is often written twice: once for the normal case and once inside a
 * media query that adjusts it for a narrow screen. Looking a rule up has to
 * find the first one, or a narrow-screen override is mistaken for the rule
 * itself.
 */
function withoutMediaBlocks(css) {
  let out = '';
  let i = 0;
  for (;;) {
    const at = css.indexOf('@media', i);
    if (at === -1) {
      out += css.slice(i);
      return out;
    }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) return out;
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
}

/** The stylesheet as the ordinary rules see it. */
const CSS_BASE = withoutMediaBlocks(CSS_NO_COMMENTS);

/** The declarations of one rule, or null if the rule is not there. */
function rule(selector) {
  const index = CSS_BASE.indexOf(selector + ' {');
  if (index === -1) return null;
  const start = CSS_BASE.indexOf('{', index);
  const end = CSS_BASE.indexOf('}', start);
  return CSS_BASE.slice(start + 1, end);
}

/**
 * The bodies of every @media block with the given query.
 *
 * The stylesheet keeps several separate narrow-screen blocks rather than
 * one long one, so a rule for a small window can be in any of them.
 */
function mediaBlocks(query) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const at = CSS_NO_COMMENTS.indexOf('@media ' + query, from);
    if (at === -1) return blocks;
    const open = CSS_NO_COMMENTS.indexOf('{', at);
    if (open === -1) return blocks;
    let depth = 0;
    for (let j = open; j < CSS_NO_COMMENTS.length; j += 1) {
      if (CSS_NO_COMMENTS[j] === '{') depth += 1;
      else if (CSS_NO_COMMENTS[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(CSS_NO_COMMENTS.slice(open + 1, j));
          from = j + 1;
          break;
        }
      }
    }
    if (from <= at) return blocks;
  }
}

/** True when any narrow-screen block contains the given declaration. */
function narrowScreensContain(pattern) {
  return mediaBlocks('(max-width: 520px)').some((block) => pattern.test(block));
}

test('the medication dialog sets its own text colour', () => {
  // The dialog is a white card inside a dark application. Its heading and
  // field labels inherited the app's light text colour and measured 1.11:1
  // and 1.57:1 against white, which is invisible. The buttons and inputs
  // looked fine only because the browser gives form controls a dark
  // default of their own, so the defect was easy to miss.
  for (const selector of ['.med-modal', '.med-modal h3', '.med-modal label']) {
    const body = rule(selector);
    assert.ok(body, selector + ' must exist');
    assert.ok(
      /(^|;)\s*color\s*:/.test(body),
      selector +
        ' must set a colour of its own; inherited light text is invisible on the white dialog'
    );
  }
});

test('the section headers do not inherit the browser button background', () => {
  // The section header is a <button>. A button with no background of its own
  // is painted with the browser's light grey default, which put the amber
  // section titles on a light bar at 1.58:1.
  const body = rule('.collapsible-toggle');
  assert.ok(body, '.collapsible-toggle must exist');
  assert.ok(
    /(^|;)\s*background\s*:/.test(body),
    '.collapsible-toggle must set a background; the browser default is a light bar'
  );
});

test('the action button labels wrap instead of being cut off', () => {
  // "Speak Status Aloud" was truncated to "Speak Status A..." because the
  // label was told never to wrap. That is worse than two lines for the
  // people this app is built for, and the unwrappable text was also what
  // made the button grid wider than its panel.
  for (const selector of ['.btn-label', '.btn-desc']) {
    const body = rule(selector);
    assert.ok(body, selector + ' must exist');
    assert.ok(
      !/white-space\s*:\s*nowrap/.test(body),
      selector + ' must not forbid wrapping'
    );
  }
});

test('the recipe search form fits on a narrow window', () => {
  // The search box is a text input, and a text input keeps the width it was
  // born with unless it is allowed to shrink. Side by side with the Search
  // button and the microphone, the form was 167px wider than its panel at
  // 360px, which pushed the microphone button off the window entirely.
  const input = rule('.recipe-search-input');
  assert.ok(input, '.recipe-search-input must exist');
  assert.ok(
    /min-width\s*:\s*0/.test(input),
    '.recipe-search-input must be allowed to shrink below its intrinsic width'
  );

  const form = rule('.recipe-search-form');
  assert.ok(form, '.recipe-search-form must exist');
  assert.ok(
    /flex-wrap\s*:\s*wrap/.test(form),
    '.recipe-search-form must be allowed to wrap onto a second line'
  );
});

test('a narrow window stacks the search form', () => {
  // With the form wrapped but still in a row, the search box was left about
  // eighty pixels wide and its placeholder was cut to "Sea". On a small
  // screen each control takes a line of its own, which also makes the
  // Search button a large target.
  assert.ok(
    narrowScreensContain(/\.recipe-search-form\s*\{[^}]*flex-direction\s*:\s*column/),
    'the search form must stack on a narrow window'
  );
  assert.ok(
    narrowScreensContain(/\.recipe-search-btn\s*\{[^}]*width\s*:\s*100%/),
    'the Search button must be full width on a narrow window'
  );
});

test('the section titles break at word boundaries', () => {
  // "Medication Reminders" was cut as "Medi / catio / n" because the title
  // was told it could break anywhere, and the section header has a button
  // beside it that left the title almost no room.
  const title = rule('.collapsible-title');
  assert.ok(title, '.collapsible-title must exist');
  assert.ok(
    !/overflow-wrap\s*:\s*anywhere/.test(title),
    '.collapsible-title must not break words at arbitrary points'
  );
  assert.ok(
    /overflow-wrap\s*:\s*break-word/.test(title),
    '.collapsible-title should break a word only when it cannot fit'
  );
});

test('a narrow window gives the section title a line of its own', () => {
  // The title and the button beside it cannot share a line in a narrow
  // window. Squeezing them left the title in a box about fifty pixels wide
  // and broke the words in half.
  assert.ok(
    narrowScreensContain(/\.collapsible-header\s*\{[^}]*flex-wrap\s*:\s*wrap/),
    'the section header must wrap on a narrow window'
  );
  assert.ok(
    narrowScreensContain(/\.collapsible-toggle\s*\{[^}]*flex\s*:\s*1 0 100%/),
    'the section title must take the whole line on a narrow window'
  );
});

test('the dimmest greys in the app are gone', () => {
  // These measured 3.57:1 and 2.66:1 on the surfaces they sit on, and they
  // were the captions under the section illustrations, the message
  // timestamp and the footer's legal line -- the smallest text in the app,
  // which is exactly the text that has to stay legible.
  for (const grey of ['#708087', '#5d6b72']) {
    assert.ok(
      !CSS.toLowerCase().includes(grey),
      grey + ' is too dim to read and must not come back'
    );
  }
});

test('the microphone does not ask for confirmation every time', () => {
  // Voice input was listed as a sensitive operation, so holding the button
  // and letting go popped a modal asking whether Sunny may transcribe the
  // recording. The press is the consent, and a dialog every time makes the
  // feature unusable. The sender is still checked; only the dialog is gone.
  const start = MAIN.indexOf('SENSITIVE_OPERATIONS');
  assert.ok(start !== -1, 'SENSITIVE_OPERATIONS must exist');
  const sensitive = MAIN.slice(start, MAIN.indexOf(']);', start));
  assert.ok(sensitive.length > 0, 'SENSITIVE_OPERATIONS must have a body');
  assert.ok(
    !/['"]transcribe_speech['"]/.test(sensitive),
    'transcribe_speech must not require a confirmation dialog'
  );
});

test('the runtime rendering check exists and covers both faults', () => {
  const scriptPath = path.join(REPO, 'scripts', 'check-rendering.cjs');
  assert.ok(fs.existsSync(scriptPath), 'scripts/check-rendering.cjs must exist');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.ok(
    /contrast|ratio/.test(script),
    'the check must measure text against its background'
  );
  assert.ok(
    /overflow/.test(script),
    'the check must look for content that overflows its panel'
  );
  assert.ok(
    /process\.exit\(/.test(script),
    'the check must set an exit code'
  );
  assert.ok(
    /problems\s*>\s*0\s*\?\s*1\s*:\s*0/.test(script),
    'the check must exit non-zero when it finds a problem'
  );
  // A gradient paints the element even though its background-color is
  // transparent, so ignoring background-image made a green button on a dark
  // gradient look like green text on white.
  assert.ok(
    /backgroundImage/.test(script),
    'the check must understand gradients, not just background-color'
  );
  // The app is measured twice, because the layout is different on a narrow
  // screen and that is where the search form used to run off the side.
  assert.ok(
    /setDeviceMetricsOverride/.test(script),
    'the check must measure the app on a narrow screen as well'
  );
});

test('the screenshot workflow runs the rendering check', () => {
  // The job already has the app running under Xvfb with its DevTools port
  // open, so measuring the real rendering there costs nothing extra and
  // catches the fault before a user does.
  assert.ok(
    /check-rendering\.cjs/.test(WORKFLOW),
    'the workflow must run the rendering check against the running app'
  );
  assert.ok(
    /check-rendering\.cjs[\s\S]*kill \$APP_PID/.test(WORKFLOW),
    'the check must run while the app is still up'
  );
});

test('the microphone check uses the fake audio device', () => {
  // Chromium's fake device puts a tone through the same capture path a real
  // microphone uses, so the whole chain can be tested without a human
  // voice or a machine with a microphone.
  const scriptPath = path.join(REPO, 'scripts', 'check-microphone.cjs');
  assert.ok(fs.existsSync(scriptPath), 'scripts/check-microphone.cjs must exist');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.ok(
    /use-fake-device-for-media-stream/.test(script),
    'the check must use the fake audio device'
  );
  assert.ok(
    /recording/.test(script),
    'the check must confirm the recording actually started'
  );
  assert.ok(
    /readyState/.test(script),
    'the check must confirm the microphone was released afterwards'
  );
});
