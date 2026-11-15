/**
 * Cross-module coherence tests.
 *
 * Unit tests pin each module in isolation. These tests pin the seams
 * between them - the seams where "open calculator" silently did nothing:
 * the assistant can emit an action the desktop cannot perform, or the
 * renderer waits for an event the main process never sends.
 *
 * Both bugs produced "Done." with no effect and neither was visible from
 * any single file. Each test here fails if one side of a seam drifts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const MAIN = read('src/electron/main.cjs');
const PRELOAD = read('src/electron/preload.cjs');
const APP = read('src/App.tsx');
const ROUTER = require('../src/electron/command-router.cjs');

/** Extract and evaluate a top-level const <name> = { ... } object literal. */
function extractConstObject(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const openBrace = source.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const text = source.slice(openBrace, i + 1);
        // The literal contains plain data only - safe to evaluate locally.
        return new Function(`return (${text});`)();
      }
    }
  }
  throw new Error(`could not find the end of ${name}`);
}

// ---------------------------------------------------------------------------
// 1. Every app the router can open, APP_EXE_OPENERS must be able to launch.
// ---------------------------------------------------------------------------

test('every app key the command router can emit is launchable on this platform', () => {
  const openers = extractConstObject(MAIN, 'APP_EXE_OPENERS');
  const platform = process.platform;
  const table = openers[platform] || {};

  const routerApps = new Set(ROUTER.OPEN_APP_ALIASES.map(([, app]) => app));
  assert.ok(routerApps.size > 0, 'router must declare at least one app');

  for (const app of routerApps) {
    const entry = table[app];
    assert.ok(
      entry,
      `APP_EXE_OPENERS[${platform}]['${app}'] is missing - the router can emit "open ${app}" but the desktop cannot launch it`
    );
    assert.ok(
      entry.exe || entry.uri,
      `APP_EXE_OPENERS[${platform}]['${app}'] has no exe or uri - it can never launch`
    );
  }
});

test('the windows opener set covers the calculator (the exact broken case)', () => {
  const openers = extractConstObject(MAIN, 'APP_EXE_OPENERS');
  const calc = openers.win32 && openers.win32.calculator;
  assert.ok(calc, 'win32 calculator opener must exist');
  // explorer + AppsFolder is the reliable Store-app launch path; a bare
  // calc.exe stub may never open a window on Windows 10/11.
  assert.match(
    String(calc.args && calc.args.join(' ')),
    /Microsoft\.WindowsCalculator_8wekyb3d8bbwe!App/,
    'calculator must launch via the AppsFolder AUMID'
  );
});

// ---------------------------------------------------------------------------
// 2. Every action type the router may emit, executeActions must handle.
// ---------------------------------------------------------------------------

test('every action type the router can emit is handled by execute_actions', () => {
  for (const type of ROUTER.SAFE_ACTION_TYPES) {
    assert.ok(
      MAIN.includes(`action.type === '${type}'`),
      `executeActions must handle type '${type}' or the router can emit an action the desktop refuses`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Decide on deterministic commands before ever calling the model.
// ---------------------------------------------------------------------------

test('decideAction resolves the deterministic router before any model call', () => {
  const start = MAIN.indexOf('async function decideAction');
  assert.notStrictEqual(start, -1);
  const end = MAIN.indexOf('\n/**', start);
  const body = MAIN.slice(start, end);
  const parseIdx = body.indexOf('parseCommand(');
  const modelIdx = body.indexOf('runConfiguredInference(');
  assert.notStrictEqual(parseIdx, -1, 'decideAction must consult the deterministic router');
  if (modelIdx !== -1) {
    assert.ok(parseIdx < modelIdx, 'the deterministic router must run before any model call');
  }
});

// ---------------------------------------------------------------------------
// 4. The letterbox link: main -> preload -> App -> CSS class.
// ---------------------------------------------------------------------------

test('the window-filled signal chain is wired end to end', () => {
  // main sends the event...
  assert.ok(MAIN.includes("'sunny:window-filled-changed'"), 'main must forward sunny:window-filled-changed');
  assert.ok(MAIN.includes('toggle-window-filled'), 'main must handle the toggle-window-filled IPC');
  // ...preload subscribes to exactly the channel main sends...
  assert.ok(PRELOAD.includes('window-filled-changed'), 'preload must subscribe to sunny:window-filled-changed');
  assert.ok(PRELOAD.includes('onWindowFilledChanged'), 'preload must expose onWindowFilledChanged');
  // ...App subscribes to that same binding and toggles the class.
  assert.ok(APP.includes('onWindowFilledChanged'), 'App.tsx must subscribe to onWindowFilledChanged');
  assert.ok(APP.includes("' letterboxed'"), 'App.tsx must tag the shell with the letterboxed class');
});

test('the fill-the-screen toggle is wired from the header button to the OS', () => {
  assert.ok(APP.includes('handleToggleWindowFilled'), 'the header must have the fill handler');
  assert.ok(APP.includes('toggleWindowFilled'), 'App.tsx must call windowControls.toggleWindowFilled');
  assert.ok(PRELOAD.includes('toggleWindowFilled'), 'preload must expose toggleWindowFilled');
  assert.ok(MAIN.includes("'sunny:toggle-window-filled'"), 'main must handle the toggle IPC');
});

// ---------------------------------------------------------------------------
// 5. The app can always be asked to open what it advertises.
// ---------------------------------------------------------------------------

test('the chat placeholder example is a command the desktop can actually run', () => {
  // The placeholder tells the user to type "open calculator". If that exact
  // example could not work, the app would advertise a broken promise.
  const decision = ROUTER.parseCommand('open calculator');
  assert.ok(decision, 'the advertised example must be a recognised command');
  const openers = extractConstObject(MAIN, 'APP_EXE_OPENERS');
  assert.ok(openers.win32.calculator, 'the advertised example must launch on Windows');
});
