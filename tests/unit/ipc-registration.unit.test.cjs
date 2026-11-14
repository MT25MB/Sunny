/**
 * UNIT TESTS: IPC handler registration and tool dispatch
 * Tests for src/electron/main.cjs
 *
 * Content-based verification of the main process IPC surface.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN_PATH = path.join(__dirname, '..', '..', 'src', 'electron', 'main.cjs');
const MAIN = fs.readFileSync(MAIN_PATH, 'utf8');

// ============================================================================
// IPC channel registration
// ============================================================================

function extractIPCHandlers(src) {
  const handlers = new Set();
  const re = /ipcMain\.handle\(\s*['"](sunny:[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) handlers.add(m[1]);
  return handlers;
}

test('IPC: registers all required channels', () => {
  const handlers = extractIPCHandlers(MAIN);
  const required = [
    'sunny:get-system-status',
    'sunny:speak-notification',
    'sunny:search-recipe',
    'sunny:get-daily-digest',
    'sunny:schedule-medication-reminder',
    'sunny:medication-taken',
    'sunny:delete-medication-reminder',
    'sunny:get-medication-reminders',
    'sunny:execute-tool',
    'sunny:init-model',
    'sunny:check-for-updates',
    'sunny:download-update',
    'sunny:quit-and-install',
    'sunny:set-preferences',
    'sunny:get-auto-check-updates',
    'sunny:set-auto-check-updates',
    'sunny:set-window-preset',
    'sunny:reset-window-position',
    'sunny:quit-app',
    'sunny:get-always-on-top',
    'sunny:set-always-on-top',
    'sunny:get-window-state',
    'sunny:get-window-filled',
    'sunny:toggle-window-filled',
    'sunny:transcribe',
    'sunny:get-speech-status',
    'sunny:capture-screen',
    'sunny:analyze-screen',
    'sunny:decide-action',
    'sunny:execute-actions',
    'sunny:cancel-actions',
    'sunny:window-action',
    'sunny:get-available-tools',
    'sunny:is-tool-available',
    'sunny:write-debug-log',
    'sunny:clear-debug-logs',
    'sunny:export-debug-logs',
    'sunny:get-debug-log-count',
    'sunny:save-credential',
    'sunny:load-credential',
    'sunny:delete-credential',
  ];
  for (const channel of required) {
    assert.ok(handlers.has(channel), `main.cjs must register ${channel}`);
  }
});

test('IPC: no duplicate channel registrations', () => {
  const handlers = extractIPCHandlers(MAIN);
  const all = [];
  const re = /ipcMain\.handle\(\s*['"](sunny:[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(MAIN)) !== null) all.push(m[1]);
  const duplicates = all.filter((item, index) => all.indexOf(item) !== index);
  assert.deepStrictEqual([...new Set(duplicates)], [], `no duplicate IPC handlers: ${duplicates.join(', ')}`);
});

// ============================================================================
// SUNNY_TOOLS allowlist
// ============================================================================

function extractSUNNY_TOOLS(src, filePath) {
  // First try inline array: const SUNNY_TOOLS = [...]
  const inlineMatch = src.match(/const SUNNY_TOOLS = \[([^\]]+)\]/);
  if (inlineMatch) {
    return inlineMatch[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  }
  // Fallback: required from external JSON file
  const reqMatch = src.match(/require\(['"]([^'"]*sunny-tools[^'"]*)['"]\)/);
  assert.ok(reqMatch, `SUNNY_TOOLS must be declared or required in ${filePath}`);
  const toolsPath = path.join(path.dirname(filePath), reqMatch[1]);
  const toolsJson = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));
  return toolsJson;
}

test('tools: SUNNY_TOOLS is declared', () => {
  const tools = extractSUNNY_TOOLS(MAIN, MAIN_PATH);
  assert.ok(tools.length > 0, 'SUNNY_TOOLS must not be empty');
});

test('tools: SUNNY_TOOLS includes core tools', () => {
  const tools = extractSUNNY_TOOLS(MAIN, MAIN_PATH);
  for (const tool of [
    'get_system_status',
    'speak_notification',
    'search_recipe',
    'get_daily_digest',
    'schedule_medication_reminder',
    'emit_cooking_step',
    'decide_action',
    'execute_actions',
  ]) {
    assert.ok(tools.includes(tool), `SUNNY_TOOLS must include ${tool}`);
  }
});

// ============================================================================
// runTool dispatch cases
// ============================================================================

function extractRunToolCases(src) {
  const cases = new Set();
  const re = /if \(toolName === ['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src)) !== null) cases.add(m[1]);
  return cases;
}

test('runTool: has dispatch case for every SUNNY_TOOLS entry', () => {
  const tools = extractSUNNY_TOOLS(MAIN, MAIN_PATH);
  const cases = extractRunToolCases(MAIN);
  for (const tool of tools) {
    assert.ok(cases.has(tool), `runTool must handle "${tool}"`);
  }
});

test('runTool: handles get_system_status', () => {
  assert.ok(MAIN.includes("if (toolName === 'get_system_status') return buildSystemStatus();"));
});

test('runTool: handles speak_notification', () => {
  assert.ok(MAIN.includes("if (toolName === 'speak_notification')"));
});

test('runTool: handles search_recipe', () => {
  assert.ok(MAIN.includes("if (toolName === 'search_recipe')"));
});

test('runTool: handles get_daily_digest', () => {
  assert.ok(MAIN.includes("if (toolName === 'get_daily_digest')"));
});

test('runTool: handles schedule_medication_reminder', () => {
  assert.ok(MAIN.includes("if (toolName === 'schedule_medication_reminder')"));
});

test('runTool: handles emit_cooking_step', () => {
  assert.ok(MAIN.includes("if (toolName === 'emit_cooking_step')"));
});

test('runTool: handles decide_action', () => {
  assert.ok(MAIN.includes("if (toolName === 'decide_action')"));
});

test('runTool: handles execute_actions', () => {
  assert.ok(MAIN.includes("if (toolName === 'execute_actions')"));
});

// ============================================================================
// validateToolParams cases
// ============================================================================

function extractValidateToolParamsCases(src) {
  const cases = new Set();
  const re = /if \(toolName === ['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src)) !== null) cases.add(m[1]);
  return cases;
}

test('validateToolParams: has validation case for every SUNNY_TOOLS entry', () => {
  const tools = extractSUNNY_TOOLS(MAIN, MAIN_PATH);
  const cases = extractValidateToolParamsCases(MAIN);
  for (const tool of tools) {
    assert.ok(cases.has(tool), `validateToolParams must handle "${tool}"`);
  }
});

test('validateToolParams: validates search_recipe query length', () => {
  assert.ok(MAIN.includes("query.length > 100"), 'must validate query length');
  assert.ok(MAIN.includes('maxResults < 1 || maxResults > 10'), 'must validate maxResults range');
});

test('validateToolParams: validates get_daily_digest newsCount range', () => {
  assert.ok(MAIN.includes('newsCount < 1 || newsCount > 10'), 'must validate newsCount range');
});

test('validateToolParams: validates medication timeString format', () => {
  assert.ok(MAIN.includes("!/^([01]\\d|2[0-3]):([0-5]\\d)$/.test(timeString)"), 'must validate HH:MM format');
});

test('validateToolParams: validates speak_notification message length', () => {
  assert.ok(MAIN.includes("message.length > 500"), 'must validate message length');
});

test('validateToolParams: validates speak_notification priority', () => {
  assert.ok(MAIN.includes("SPEECH_PRIORITIES.includes(priority)"), 'must validate priority');
});

test('validateToolParams: validates speak_notification repeat range', () => {
  assert.ok(MAIN.includes("repeat < 1 || repeat > 3"), 'must validate repeat range');
});

// ============================================================================
// SENSITIVE_OPERATIONS
// ============================================================================

function extractSENSITIVE_OPERATIONS(src) {
  const start = src.indexOf('const SENSITIVE_OPERATIONS = new Set([');
  assert.notStrictEqual(start, -1, 'SENSITIVE_OPERATIONS must exist');
  const end = src.indexOf(']);', start);
  assert.notStrictEqual(end, -1, 'SENSITIVE_OPERATIONS must close');
  const block = src.slice(start, end);
  const ops = new Set();
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(block)) !== null) ops.add(m[1]);
  return ops;
}

test('security: SENSITIVE_OPERATIONS is declared', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  assert.ok(ops.size > 0, 'SENSITIVE_OPERATIONS must not be empty');
});

test('security: SENSITIVE_OPERATIONS includes execute_actions', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  assert.ok(ops.has('execute_actions'), 'execute_actions must be sensitive');
});

test('security: SENSITIVE_OPERATIONS includes decide_action', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  assert.ok(ops.has('decide_action'), 'decide_action must be sensitive');
});

test('security: SENSITIVE_OPERATIONS includes init_model', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  assert.ok(ops.has('init_model'), 'init_model must be sensitive');
});

test('security: SENSITIVE_OPERATIONS includes capture_screen', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  assert.ok(ops.has('capture_screen'), 'capture_screen must be sensitive');
});

test('security: SENSITIVE_OPERATIONS includes analyze_screen', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  assert.ok(ops.has('analyze_screen'), 'analyze_screen must be sensitive');
});

test('security: SENSITIVE_OPERATIONS includes credential operations', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  for (const op of ['save_credential', 'load_credential', 'delete_credential']) {
    assert.ok(ops.has(op), `${op} must be sensitive`);
  }
});

test('security: SENSITIVE_OPERATIONS includes debug log operations', () => {
  const ops = extractSENSITIVE_OPERATIONS(MAIN);
  for (const op of ['write_debug_log', 'clear_debug_logs', 'export_debug_logs']) {
    assert.ok(ops.has(op), `${op} must be sensitive`);
  }
});

// ============================================================================
// Security guards
// ============================================================================

test('security: assertTrustedSender is defined', () => {
  assert.ok(MAIN.includes('function assertTrustedSender(event)'));
});

test('security: assertTrustedSender checks event.sender', () => {
  assert.ok(MAIN.includes('event.sender !== mainWindow.webContents'));
});

test('security: rateLimit is defined', () => {
  assert.ok(MAIN.includes('function rateLimit(channel)'));
});

test('security: assertPayloadSize is defined', () => {
  assert.ok(MAIN.includes('function assertPayloadSize(value, label)'));
});

test('security: MAX_PAYLOAD_BYTES is defined', () => {
  assert.ok(MAIN.includes('const MAX_PAYLOAD_BYTES = 128 * 1024;'));
});

test('security: withSystemGuardrail is defined', () => {
  assert.ok(MAIN.includes('function withSystemGuardrail(userPrompt)'));
});

test('security: SUNNY_SYSTEM_GUARDRAIL is defined', () => {
  assert.ok(MAIN.includes('const SUNNY_SYSTEM_GUARDRAIL ='));
});

test('security: guardrail mentions prompt injection', () => {
  assert.ok(MAIN.includes('prompt injection') || MAIN.includes('injection'));
});

// ============================================================================
// Rate limiting
// ============================================================================

test('security: RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_CALLS defined', () => {
  assert.ok(MAIN.includes('const RATE_LIMIT_WINDOW_MS = 60_000;'));
  assert.ok(MAIN.includes('const RATE_LIMIT_MAX_CALLS = 30;'));
});

test('security: rate buckets use Map', () => {
  assert.ok(MAIN.includes('const rateBuckets = new Map();'));
});

// ============================================================================
// Tool timeouts
// ============================================================================

test('tools: TOOL_TIMEOUTS defines get_daily_digest extended timeout', () => {
  assert.ok(MAIN.includes('get_daily_digest: 45_000'));
});

test('tools: TOOL_CALL_TIMEOUT_MS default defined', () => {
  assert.ok(MAIN.includes('const TOOL_CALL_TIMEOUT_MS = 10_000;'));
});

// ============================================================================
// runConfiguredInference
// ============================================================================

test('inference: runConfiguredInference routes to embedded model', () => {
  assert.ok(MAIN.includes("if (provider === 'embedded')"));
  assert.ok(MAIN.includes('return inference.runInference(guardedPrompt, imageBase64);'));
});

test('inference: runConfiguredInference routes to cloud providers', () => {
  assert.ok(MAIN.includes("const { runProviderInference } = require('./providers.cjs');"));
});

test('inference: runConfiguredInference reads stored credentials', () => {
  assert.ok(MAIN.includes('const apiKey = credentialKey ? readStoredCredential(credentialKey) : \'\';'));
});

test('inference: runConfiguredInference rejects missing API key', () => {
  assert.ok(MAIN.includes("if (!apiKey && provider !== 'ollama')"));
});
