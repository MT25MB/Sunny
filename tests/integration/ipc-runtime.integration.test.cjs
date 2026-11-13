'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// This test verifies IPC channel registration by examining the source code
// since we cannot run Electron in plain Node. It checks that all handlers
// are properly wired.

const mainCjsPath = path.join(process.cwd(), 'src/electron/main.cjs');
const fs = require('node:fs');
const mainCjs = fs.readFileSync(mainCjsPath, 'utf8');

describe('IPC runtime — handler wiring', () => {
  it('execute-actions handler uses interceptAction', () => {
    assert.ok(mainCjs.includes('interceptAction(action)'));
  });

  it('execute-actions handler checks block verdict', () => {
    assert.ok(mainCjs.includes("result.verdict === 'block'"));
  });

  it('execute-actions handler checks confirm verdict', () => {
    assert.ok(mainCjs.includes("result.verdict === 'confirm'"));
  });

  it('execute-actions handler calls confirmSensitiveOperation', () => {
    assert.ok(mainCjs.includes('confirmSensitiveOperation('));
  });

  it('execute-actions handler enforces MAX_ACTIONS_PER_BATCH', () => {
    assert.ok(mainCjs.includes('actions.length > MAX_ACTIONS_PER_BATCH'));
  });

  it('execute-actions handler asserts payload size', () => {
    assert.ok(mainCjs.includes('assertPayloadSize(actions, \'action batch\')'));
  });
});

describe('IPC runtime — decide_action handler', () => {
  it('applies system guardrail to prompt', () => {
    assert.ok(mainCjs.includes('withSystemGuardrail(params.prompt)'));
  });

  it('checks if vision is needed', () => {
    assert.ok(mainCjs.includes('Does this request require seeing'));
  });

  it('captures screen when needed', () => {
    assert.ok(mainCjs.includes('captureScreen()'));
  });

  it('sanitizes vision output for injection', () => {
    assert.ok(mainCjs.includes('sanitizeUntrustedContent(result.response'));
  });
});

describe('IPC runtime — analyze-screen handler', () => {
  it('applies system guardrail to prompt', () => {
    assert.ok(mainCjs.includes('withSystemGuardrail(prompt)'));
  });

  it('sanitizes screen-derived text for injection', () => {
    assert.ok(mainCjs.includes('sanitizeUntrustedContent(result.response'));
  });

  it('rate limits analyze-screen', () => {
    assert.ok(mainCjs.includes("rateLimit('sunny:analyze-screen')"));
  });
});

describe('IPC runtime — window action handler', () => {
  it('supports minimize action', () => {
    assert.ok(mainCjs.includes("action === 'minimize'"));
  });

  it('supports maximize action', () => {
    assert.ok(mainCjs.includes("case 'maximize':"));
  });

  it('supports close action', () => {
    assert.ok(mainCjs.includes("case 'close':"));
  });

  it('supports focus action', () => {
    assert.ok(mainCjs.includes("case 'focus':"));
  });

  it('supports hide action', () => {
    assert.ok(mainCjs.includes("case 'hide':"));
  });

  it('supports show action', () => {
    assert.ok(mainCjs.includes("case 'show':"));
  });

  it('supports get_info action', () => {
    assert.ok(mainCjs.includes("case 'get_info':"));
  });
});

describe('IPC runtime — clipboard handlers', () => {
  it('clipboard-read handler exists', () => {
    assert.ok(mainCjs.includes("ipcMain.handle('sunny:clipboard-read'"));
  });

  it('clipboard-write handler exists', () => {
    assert.ok(mainCjs.includes("ipcMain.handle('sunny:clipboard-write'"));
  });

  it('clipboard-write validates string input', () => {
    assert.ok(mainCjs.includes('typeof text !== \'string\''));
  });

  it('clipboard-write limits text to 10000 chars', () => {
    assert.ok(mainCjs.includes('text.length > 10000'));
  });
});

describe('IPC runtime — window info handler', () => {
  it('get-window-info handler exists', () => {
    assert.ok(mainCjs.includes("ipcMain.handle('sunny:get-window-info'"));
  });

  it('uses automation.getActiveWindow', () => {
    assert.ok(mainCjs.includes('automation.getActiveWindow()'));
  });

  it('returns window title, bounds, and state', () => {
    assert.ok(mainCjs.includes('win.getTitle()'));
    assert.ok(mainCjs.includes('win.getBounds()'));
    assert.ok(mainCjs.includes('win.isMaximized()'));
    assert.ok(mainCjs.includes('win.isMinimized()'));
    assert.ok(mainCjs.includes('win.isFocused()'));
  });
});

describe('IPC runtime — emergency stop', () => {
  it('emergency-stop hotkey is registered', () => {
    assert.ok(mainCjs.includes("'Control+Shift+Escape'"));
  });

  it('emergency-stop sets automationCancelled', () => {
    assert.ok(mainCjs.includes('automationCancelled = true'));
  });

  it('emergency-stop sends event to renderer', () => {
    assert.ok(mainCjs.includes("'sunny:emergency-stop'"));
  });

  it('emergency-stop-status handler exists', () => {
    assert.ok(mainCjs.includes("ipcMain.handle('sunny:emergency-stop-status'"));
  });

  it('reset-emergency-stop handler exists', () => {
    assert.ok(mainCjs.includes("ipcMain.handle('sunny:reset-emergency-stop'"));
  });
});

describe('IPC runtime — action verification', () => {
  it('verifyAction function exists', () => {
    assert.ok(mainCjs.includes('async function verifyAction'));
  });

  it('captures before screenshot for verification', () => {
    assert.ok(mainCjs.includes('beforeScreenshot = await captureScreen()'));
  });

  it('verifies click, double_click, drag, type, hotkey, key actions', () => {
    assert.ok(mainCjs.includes("['click', 'double_click', 'drag', 'type', 'hotkey', 'key']"));
  });
});

describe('IPC runtime — forbidden zones', () => {
  it('FORBIDDEN_ZONES are defined', () => {
    assert.ok(mainCjs.includes('const FORBIDDEN_ZONES'));
  });

  it('taskbar zone is defined', () => {
    assert.ok(mainCjs.includes("name: 'taskbar'"));
  });

  it('system_tray zone is defined', () => {
    assert.ok(mainCjs.includes("name: 'system_tray'"));
  });

  it('isInForbiddenZone function exists', () => {
    assert.ok(mainCjs.includes('function isInForbiddenZone'));
  });

  it('executeActions checks forbidden zones', () => {
    assert.ok(mainCjs.includes('isInForbiddenZone('));
  });
});
