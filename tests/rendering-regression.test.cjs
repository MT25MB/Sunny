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

test('the recipe cards fit inside their panel', () => {
  // The results grid asked for columns of at least 300 pixels. In a
  // narrower window the cards were still laid out that wide and hung over
  // the right edge of the panel -- which is what the compact window size
  // in Settings produces. Capping the track at the panel's own width is
  // what stops it.
  const results = rule('.recipe-results');
  assert.ok(results, '.recipe-results must exist');
  assert.ok(
    /minmax\(min\(300px,\s*100%\),\s*1fr\)/.test(results),
    '.recipe-results must cap its column at the width of the panel'
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

// ============================================================================
// Recurring layout bugs: vertical header, broken scrolling, fullscreen mascot
// ============================================================================

test('the app header does not wrap to a second row', () => {
  // flex-wrap: wrap made the header stack vertically on narrow screens,
  // which made the bar look vertical and consumed all vertical space.
  const body = rule('.app-header');
  assert.ok(body !== null, '.app-header rule must exist');
  assert.ok(
    !/flex-wrap\s*:\s*wrap/.test(body),
    'the header must not wrap; use nowrap so items stay on one row'
  );
  assert.ok(
    /flex-wrap\s*:\s*nowrap/.test(body),
    'the header must explicitly use flex-wrap: nowrap'
  );
});

test('the app main area is a flex child that can shrink', () => {
  // min-height: 0 is required for a flex child to shrink below its content
  // size, which is the precondition for overflow-y to actually scroll.
  const body = rule('.app-main');
  assert.ok(body !== null, '.app-main rule must exist');
  assert.ok(
    /flex\s*:\s*1/.test(body),
    '.app-main must flex to fill remaining space'
  );
  assert.ok(
    /min-height\s*:\s*0/.test(body),
    '.app-main must allow shrinking below content size'
  );
  assert.ok(
    /overflow-y\s*:\s*auto/.test(body),
    '.app-main must scroll when content overflows'
  );
  assert.ok(
    /height\s*:\s*0/.test(body),
    '.app-main must have height: 0 to force flex height calculation'
  );
});

test('the app main area is not constrained to 720px', () => {
  // max-width: 720px centered content at 720px even when maximized,
  // leaving large empty areas on wide screens and making the app look broken.
  const body = rule('.app-main');
  assert.ok(body !== null, '.app-main rule must exist');
  assert.ok(
    !/max-width\s*:\s*720px/.test(body),
    '.app-main must not be constrained to 720px'
  );
});

test('the app shell is a flex column with constrained height', () => {
  // .app-shell must be display: flex with flex-direction: column and a
  // defined height so .app-main can flex within it.
  // There are two .app-shell rules; the second one (with display: flex)
  // overrides the first (display: grid). Find the flex one.
  const flexRule = CSS_BASE.match(/\.app-shell\s*\{[^}]*display\s*:\s*flex[^}]*\}/);
  assert.ok(flexRule !== null, '.app-shell must have a flex rule');
  const body = flexRule[0];
  assert.ok(
    /display\s*:\s*flex/.test(body),
    '.app-shell must be a flex container'
  );
  assert.ok(
    /flex-direction\s*:\s*column/.test(body),
    '.app-shell must be a column layout'
  );
  assert.ok(
    /height\s*:\s*100dvh/.test(body) || /height\s*:\s*100vh/.test(body),
    '.app-shell must have a defined height'
  );
});

test('launchExecutable is fire-and-forget (does not await process exit)', () => {
  // Awaiting the process blocks until the GUI app exits, so the handler
  // would hang for apps that stay running (calc, notepad, explorer...).
  // Resolution must happen on the 'spawn' event, never on exit.
  const LAUNCH = fs.readFileSync(path.join(REPO, 'src', 'electron', 'launch-executable.cjs'), 'utf8');
  assert.ok(
    LAUNCH.includes("child.on('spawn'"),
    'launchExecutable must resolve on the spawn event, not on process exit'
  );
  assert.ok(
    LAUNCH.includes("child.on('error'"),
    'launchExecutable must surface spawn failures instead of claiming success'
  );
  assert.ok(!LAUNCH.includes('promisify'), 'launchExecutable must not promisify execFile');
  assert.ok(!LAUNCH.includes('execFile('), 'launchExecutable must not use execFile');
});

test('fetchDigestNews uses the internet without invalid API key', () => {
  // The rss2json API rejected requests with api_key=demo, returning
  // 'api_key must be a valid API key.' The free tier works without it.
  assert.ok(
    !MAIN.includes('api_key=demo'),
    'fetchDigestNews must not use invalid api_key=demo'
  );
  assert.ok(
    MAIN.includes('rss_url=https://feeds.bbci.co.uk/news/rss.xml&count='),
    'fetchDigestNews must fetch BBC News RSS via rss2json'
  );
});

test('calculator opener uses reliable launch method', () => {
  // On Windows 11, calc.exe is a stub that may not open a window.
  // The opener should use explorer.exe with AppsFolder path.
  assert.ok(
    MAIN.includes("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
    'calculator opener should use AppsFolder path for reliable launching'
  );
});

// ============================================================================
// Stylesheet integrity: one missing brace nested ~27,000 lines of CSS inside
// .collapsible-section, so .app-header / .app-main never applied. These tests
// parse the stylesheet the way a browser does and fail if it ever regresses.
// ============================================================================

/**
 * Walks the stylesheet tracking brace depth, skipping comments, and returns
 * the depth at which each named selector's block opens plus the final depth.
 */
function analyseStylesheet(css) {
  const opens = [];
  let depth = 0;
  let inComment = false;
  let selectorStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const nx = css[i + 1];
    if (inComment) {
      if (ch === '*' && nx === '/') { inComment = false; i++; }
      continue;
    }
    if (ch === '/' && nx === '*') { inComment = true; i++; continue; }
    if (ch === '{') {
      const selector = css.slice(selectorStart, i).trim().replace(/\s+/g, ' ');
      opens.push({ selector, depth });
      depth++;
      selectorStart = i + 1;
    } else if (ch === '}') {
      depth--;
      selectorStart = i + 1;
    }
  }
  return { opens, finalDepth: depth };
}

test('the stylesheet has balanced braces', () => {
  const { finalDepth } = analyseStylesheet(CSS_NO_COMMENTS);
  assert.equal(finalDepth, 0, 'the stylesheet must end at brace depth 0');
});

test('core layout rules are top-level, not nested inside another rule', () => {
  const { opens } = analyseStylesheet(CSS_NO_COMMENTS);
  for (const selector of ['.app-shell', '.app-header', '.app-main']) {
    const match = opens.find((o) => o.selector === selector);
    assert.ok(match, `${selector} must exist as a rule`);
    assert.equal(
      match.depth,
      0,
      `${selector} must be a top-level rule (found at depth ${match.depth}); ` +
        'an unclosed brace earlier in the file would nest it and silently disable it'
    );
  }
});

test('the collapsible-section rule closes before the header rule', () => {
  // The specific regression: .collapsible-section { flex-wrap: wrap; was
  // missing its closing brace, so everything after it was nested.
  const { opens } = analyseStylesheet(CSS_NO_COMMENTS);
  const collapsible = opens.find((o) => o.selector === '.collapsible-section');
  const header = opens.find((o) => o.selector === '.app-header');
  assert.ok(collapsible, '.collapsible-section rule must exist');
  assert.ok(header, '.app-header rule must exist');
  assert.ok(
    collapsible.depth === 0 && header.depth === 0,
    'both rules must be top-level'
  );
});

// ============================================================================
// Letterbox fullscreen: a filled window keeps the app at its comfortable
// aspect ratio (640 x 900) and centres it, leaving empty bars either side.
// ============================================================================

test('the letterbox fullscreen rule exists and caps the app width', () => {
  const { opens } = analyseStylesheet(CSS_NO_COMMENTS);
  const match = opens.find((o) => o.selector === '.app-shell.letterboxed');
  assert.ok(match, '.app-shell.letterboxed rule must exist');
  assert.equal(match.depth, 0, 'the letterbox rule must be top-level');

  const ruleStart = CSS.indexOf('.app-shell.letterboxed');
  const ruleBody = CSS.slice(ruleStart, CSS.indexOf('}', ruleStart));
  assert.match(ruleBody, /max-width:\s*calc\(\s*100dvh\s*\*\s*0\.71/, 'letterbox must cap width to the comfortable aspect ratio');
  assert.match(ruleBody, /margin-left:\s*auto/, 'letterbox must centre the app');
  assert.match(ruleBody, /margin-right:\s*auto/, 'letterbox must centre the app');
});

test('the shell gets the letterboxed class when the window is filled', () => {
  const APP = fs.readFileSync(path.join(REPO, 'src', 'App.tsx'), 'utf8');
  assert.match(
    APP,
    /windowFilled \? ' letterboxed'/,
    'App.tsx must add the letterboxed class to .app-shell when windowFilled is true'
  );
});

test('the window restore is clamped to the work area (it cannot open off-screen)', () => {
  // A persisted y below the screen top would hide the header above the
  // screen edge; a persisted size larger than the display would clip the
  // bottom. The restore path must clamp both to the display it lands on.
  const start = MAIN.indexOf('function resolveInitialWindowBounds');
  assert.notStrictEqual(start, -1, 'resolveInitialWindowBounds must exist');
  const end = MAIN.indexOf('function persistWindowState', start);
  const body = MAIN.slice(start, end === -1 ? undefined : end);
  assert.match(body, /Math\.max\(saved\.y,\s*area\.y\)/, 'restore must clamp y to the work area');
  assert.match(body, /Math\.min\(saved\.y \+ saved\.height, area\.y \+ area\.height\)/, 'restore must clamp the bottom edge');
  assert.match(body, /Math\.min\(saved\.width, area\.width\)/, 'restore must clamp width to the screen');
  assert.match(body, /Math\.min\(saved\.height, area\.height\)/, 'restore must clamp height to the screen');
});

test('the preload requires only Electron (the sandbox cannot see local files)', () => {
  // A sandboxed preload runs before the app window exists and cannot load
  // local files; requiring anything else made electronAPI undefined in the
  // packaged build and showed the "previewing in a web browser" banner.
  const PRELOAD = fs.readFileSync(path.join(REPO, 'src', 'electron', 'preload.cjs'), 'utf8');
  const requires = [...PRELOAD.matchAll(/require\(([^)]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ["'electron'"], 'preload must require exactly electron and nothing else');
});

test('the browser-preview banner never shows inside the packaged app', () => {
  // The banner is a development aid for the plain-browser preview. It must
  // be conditioned on the bridge being absent, not render unconditionally.
  const APP = fs.readFileSync(path.join(REPO, 'src', 'App.tsx'), 'utf8');
  assert.match(
    APP,
    /const isBrowserPreview = typeof window !== "undefined" && !window\.electronAPI/,
    'the preview banner must be gated on window.electronAPI being absent'
  );
  assert.ok(
    APP.includes('{isBrowserPreview && ('),
    'the banner must only render when previewing in a browser'
  );
});
