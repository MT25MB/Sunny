/**
 * Unit tests for the deterministic command router
 * (src/electron/command-router.cjs).
 *
 * The bug this exists for: the chat promised "open calculator" in its
 * placeholder but every path to the desktop was prose from the model with
 * no actions ever built, so the user saw "Done." and nothing opened. These
 * tests pin the recognised commands and the sanitised action envelope the
 * model may emit.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseCommand,
  extractActionEnvelope,
  sanitiseModelAction,
  normaliseCommand,
} = require('../../src/electron/command-router.cjs');

const REPO = path.join(__dirname, '..', '..');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'electron', 'main.cjs'), 'utf8');
const APP = fs.readFileSync(path.join(REPO, 'src', 'App.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// parseCommand — recognised commands
// ---------------------------------------------------------------------------

test('parseCommand routes web searches to Chrome', () => {
  const cases = [
    ['search up pineapple on google chrome', 'pineapple'],
    ['search up pineapple', 'pineapple'],
    ['search for pasta recipes', 'pasta recipes'],
    ['search pasta recipes', 'pasta recipes'],
    ['google weather london', 'weather london'],
    ['look up pasta recipes', 'pasta recipes'],
    ['find flights to rome', 'flights to rome'],
    ['web search cats', 'cats'],
    ['search the web for cats', 'cats'],
    ['search for the weather', 'weather'],
  ];
  for (const [input, expected] of cases) {
    const decision = parseCommand(input);
    assert.ok(decision, `expected a decision for ${JSON.stringify(input)}`);
    assert.deepEqual(
      decision.actions,
      [{ type: 'web_search', query: expected }],
      `wrong query for ${JSON.stringify(input)}`
    );
  }
});

test('parseCommand leaves non-search text to the model', () => {
  assert.equal(parseCommand('what is the time'), null);
  assert.equal(parseCommand('tell me about cats'), null);
  assert.equal(parseCommand('search'), null);
});

test('sanitiseModelAction accepts web_search with a sane query', () => {
  const action = sanitiseModelAction({ type: 'web_search', query: 'pineapple' });
  assert.deepEqual(action, { type: 'web_search', query: 'pineapple' });
  assert.equal(sanitiseModelAction({ type: 'web_search', query: '' }), null);
  assert.equal(sanitiseModelAction({ type: 'web_search', query: 'x' }), null);
  assert.equal(sanitiseModelAction({ type: 'web_search', query: 'y'.repeat(200) }), null);
});

test('the JSON envelope protocol accepts web_search', () => {
  const envelope = extractActionEnvelope('{"response": "Searching.", "actions": [{"type": "web_search", "query": "pineapple"}]}');
  assert.ok(envelope);
  assert.deepEqual(envelope.actions, [{ type: 'web_search', query: 'pineapple' }]);
});

test('parseCommand opens the calculator for plain and polite phrasings', () => {
  for (const input of [
    'open calculator',
    'Open the Calculator.',
    'please open calculator',
    'Please open the calculator for me',
    'can you open the calculator',
    'sunny, open calculator',
    'launch calculator',
    'start the calculator',
    'open calc',
  ]) {
    const decision = parseCommand(input);
    assert.ok(decision, `expected a decision for ${JSON.stringify(input)}`);
    assert.deepEqual(decision.actions, [{ type: 'open_app', app: 'calculator' }], `actions for ${JSON.stringify(input)}`);
    assert.ok(decision.response.length > 0);
  }
});

test('parseCommand opens the other advertised apps', () => {
  const cases = [
    ['open my files', 'files'],
    ['open file explorer', 'files'],
    ['open notepad', 'notepad'],
    ['open word', 'word'],
    ['open excel', 'excel'],
    ['spreadsheet', undefined], // no verb -> no match
    ['open settings', 'settings'],
    ['open control panel', 'settings'],
    ['open calendar', 'calendar'],
    ['open photos', 'photos'],
  ];
  for (const [input, app] of cases) {
    const decision = parseCommand(input);
    if (app === undefined) {
      assert.equal(decision, null, `${JSON.stringify(input)} must not be a command`);
    } else {
      assert.ok(decision, `expected a decision for ${JSON.stringify(input)}`);
      assert.deepEqual(decision.actions, [{ type: 'open_app', app }]);
    }
  }
});

test('parseCommand recognises screenshot requests', () => {
  for (const input of ['take a screenshot', 'take screenshot', 'screenshot', 'capture the screen', 'save a screenshot']) {
    const decision = parseCommand(input);
    assert.ok(decision, `expected a decision for ${JSON.stringify(input)}`);
    assert.deepEqual(decision.actions, [{ type: 'screenshot' }]);
  }
});

test('parseCommand recognises window commands, never a bare close', () => {
  assert.deepEqual(parseCommand('minimize the window').actions, [{ type: 'window_action', action: 'minimize' }]);
  assert.deepEqual(parseCommand('maximize the window').actions, [{ type: 'window_action', action: 'maximize' }]);
  assert.deepEqual(parseCommand('hide the window').actions, [{ type: 'window_action', action: 'hide' }]);
  assert.deepEqual(parseCommand('close the window').actions, [{ type: 'window_action', action: 'close' }]);
  assert.equal(parseCommand('close calculator'), null, 'close must not target this app from a bare verb');
  assert.equal(parseCommand('close'), null, 'a bare close is ambiguous and must fall back to the model');
});

test('parseCommand recognises the clipboard trio', () => {
  assert.deepEqual(parseCommand('copy').actions, [{ type: 'copy' }]);
  assert.deepEqual(parseCommand('paste').actions, [{ type: 'paste' }]);
  assert.deepEqual(parseCommand('select all').actions, [{ type: 'select_all' }]);
});

test('parseCommand leaves questions and multi-step requests to the model', () => {
  assert.equal(parseCommand('what is the weather today'), null);
  assert.equal(parseCommand('open calculator and type 5'), null);
  assert.equal(parseCommand('set a timer for 5 minutes'), null);
  assert.equal(parseCommand('tell me a joke'), null);
  assert.equal(parseCommand(''), null);
});

// ---------------------------------------------------------------------------
// normaliseCommand
// ---------------------------------------------------------------------------

test('normaliseCommand collapses punctuation, case and spacing', () => {
  assert.equal(normaliseCommand('  Sunny, OPEN   the Calculator!  '), 'sunny open the calculator');
});

// ---------------------------------------------------------------------------
// extractActionEnvelope — the model's JSON protocol
// ---------------------------------------------------------------------------

test('extractActionEnvelope parses a well-formed envelope', () => {
  const envelope = extractActionEnvelope(
    '{"response": "Opening the Calculator for you.", "actions": [{"type": "open_app", "app": "calculator"}]}'
  );
  assert.ok(envelope);
  assert.equal(envelope.response, 'Opening the Calculator for you.');
  assert.deepEqual(envelope.actions, [{ type: 'open_app', app: 'calculator' }]);
});

test('extractActionEnvelope finds JSON inside surrounding prose', () => {
  const envelope = extractActionEnvelope(
    'Sure thing! {"response": "Done.", "actions": [{"type": "screenshot"}]} there you go'
  );
  assert.ok(envelope);
  assert.deepEqual(envelope.actions, [{ type: 'screenshot' }]);
});

test('extractActionEnvelope returns plain text answers as prose with no actions', () => {
  assert.equal(extractActionEnvelope('The capital of France is Paris.'), null);
});

test('extractActionEnvelope drops unsafe action types but keeps the reply', () => {
  const envelope = extractActionEnvelope(
    '{"response": "Okay.", "actions": [{"type": "hotkey", "keys": ["alt", "f4"]}, {"type": "screenshot"}]}'
  );
  assert.ok(envelope);
  assert.deepEqual(envelope.actions, [{ type: 'screenshot' }]);
});

test('extractActionEnvelope drops mouse and keyboard injection', () => {
  for (const action of [
    { type: 'click', x: 10, y: 10 },
    { type: 'drag', from: [0, 0], to: [5, 5] },
    { type: 'type', text: 'hello' },
    { type: 'key', key: 'Delete' },
    { type: 'move', x: 100, y: 100 },
    { type: 'hover', x: 100, y: 100 },
  ]) {
    assert.equal(sanitiseModelAction(action), null, `${action.type} must never be model-emitted`);
  }
});

test('extractActionEnvelope drops actions for apps this build cannot open', () => {
  const envelope = extractActionEnvelope(
    '{"response": "Sure.", "actions": [{"type": "open_app", "app": "utorrent"}]}'
  );
  assert.ok(envelope);
  assert.equal(envelope.actions, undefined, 'unknown app must be dropped');
});

test('extractActionEnvelope handles corrupt JSON as prose', () => {
  assert.equal(extractActionEnvelope('{"response": "unterminated'), null);
});

// ---------------------------------------------------------------------------
// main.cjs / App.tsx wiring — the envelope bug that printed "Done."
// ---------------------------------------------------------------------------

test('main.cjs routes decide_action through the shared deterministic helper', () => {
  assert.ok(MAIN.includes("require('./command-router.cjs')"), 'main.cjs must require the command router');
  assert.ok(MAIN.includes('async function decideAction'), 'main.cjs must define decideAction');
  // The tool path and the dedicated handler both go through decideAction.
  const occurrences = MAIN.split('decideAction(').length - 1;
  assert.ok(occurrences >= 3, 'decideAction must be called from both the tool path and the dedicated handler');
  // Deterministic commands must not touch the model at all.
  assert.ok(MAIN.includes('const deterministic = parseCommand(prompt)'), 'decideAction must check the deterministic router first');
});

test('App.tsx unwraps the { success, data } envelope before reading the decision', () => {
  assert.ok(APP.includes('unwrapToolResult'), 'App.tsx must unwrap tool envelopes');
  assert.ok(
    APP.includes('envelope.data') || APP.includes('box.data'),
    'unwrapToolResult must prefer the data field of the envelope'
  );
  // The chat handler must no longer read result.result.response directly
  // without unwrapping.
  assert.ok(
    !APP.includes('const decision = result.result as { response?: string'),
    'the old shape-mismatched cast must be gone'
  );
});

test('App.tsx tells the user when an action fails, instead of claiming it succeeded', () => {
  // execute_actions errors come back as { success: false, error } INSIDE a
  // successful IPC response; the renderer must surface that, not "Completed".
  assert.ok(APP.includes('Execution failed: '), 'the chat must surface execution failures');
  assert.ok(
    APP.includes("execOutcome.success === false"),
    'the chat must check the unwrapped outcome for failure'
  );
  assert.ok(
    !APP.includes('"Completed: " + actions.map(a => a.type).join(", ")'),
    'the unconditional success message must be gone'
  );
});

test('App.tsx shows the friendly response instead of a generic "Done."', () => {
  assert.ok(
    APP.includes('decision.response || "Done."'),
    'the assistant message should carry the model/router response when present'
  );
  // The error path for decide_action failures must exist too.
  assert.ok(
    APP.includes('Could not understand: '),
    'the chat must surface decide_action failures'
  );
});
