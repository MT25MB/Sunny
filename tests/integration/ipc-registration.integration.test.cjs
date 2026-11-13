'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Read main.cjs as text to verify IPC handler registration
const mainCjsPath = path.join(process.cwd(), 'src/electron/main.cjs');
const mainCjs = fs.readFileSync(mainCjsPath, 'utf8');

const preloadPath = path.join(process.cwd(), 'src/electron/preload.cjs');
const preloadCjs = fs.readFileSync(preloadPath, 'utf8');

const interceptorPath = path.join(
  process.cwd(),
  'src/main/security/interceptor.cjs'
);
const interceptorCjs = fs.readFileSync(interceptorPath, 'utf8');

// SENSITIVE_OPERATIONS is defined in main.cjs, not interceptor.cjs
const sensitiveOpsSource = mainCjs;

describe('IPC — all required channels are registered', () => {
  const requiredChannels = [
    'sunny:get-system-status',
    'sunny:execute-tool',
    'sunny:capture-screen',
    'sunny:analyze-screen',
    'sunny:decide-action',
    'sunny:execute-actions',
    'sunny:cancel-actions',
    'sunny:window-action',
    'sunny:clipboard-read',
    'sunny:clipboard-write',
    'sunny:get-window-info',
    'sunny:emergency-stop-status',
    'sunny:reset-emergency-stop',
    'sunny:quit-app',
    'sunny:set-always-on-top',
    'sunny:get-always-on-top',
    'sunny:get-window-state',
    'sunny:set-window-preset',
    'sunny:reset-window-position',
    'sunny:toggle-window-filled',
    'sunny:get-window-filled',
    'sunny:get-speech-status',
    'sunny:transcribe',
    'sunny:set-preferences',
    'sunny:get-model-status',
    'sunny:init-model',
    'sunny:check-for-updates',
    'sunny:download-update',
    'sunny:quit-and-install',
    'sunny:get-auto-check-updates',
    'sunny:set-auto-check-updates',
    'sunny:schedule-medication-reminder',
    'sunny:medication-taken',
    'sunny:get-medication-reminders',
    'sunny:delete-medication-reminder',
    'sunny:write-debug-log',
    'sunny:clear-debug-logs',
    'sunny:export-debug-logs',
    'sunny:get-debug-log-count',
    'sunny:save-credential',
    'sunny:load-credential',
    'sunny:delete-credential',
  ];

  for (const channel of requiredChannels) {
    it(`registers ${channel}`, () => {
      assert.ok(
        mainCjs.includes(`ipcMain.handle('${channel}'`),
        `${channel} should be registered in main.cjs`
      );
    });
  }
});

describe('IPC — no duplicate channel registrations', () => {
  const channels = mainCjs.match(/ipcMain\.handle\('([^']+)'/g) || [];
  const channelNames = channels.map((c) => c.match(/'([^']+)'/)[1]);
  const duplicates = channelNames.filter(
    (name, index) => channelNames.indexOf(name) !== index
  );
  it('has no duplicate IPC channel registrations', () => {
    assert.deepStrictEqual(duplicates, []);
  });
});

describe('IPC — SUNNY_TOOLS allowlist', () => {
  it('SUNNY_TOOLS is declared in main.cjs', () => {
    assert.ok(mainCjs.includes('const SUNNY_TOOLS'));
  });

  it('SUNNY_TOOLS includes core tools', () => {
    const coreTools = [
      'get_system_status',
      'speak_notification',
      'search_recipe',
      'get_daily_digest',
      'schedule_medication_reminder',
      'emit_cooking_step',
      'decide_action',
      'execute_actions',
    ];
    for (const tool of coreTools) {
      assert.ok(
        mainCjs.includes(`'${tool}'`),
        `SUNNY_TOOLS should include ${tool}`
      );
    }
  });

  it('SUNNY_TOOLS allowlist is identical in main.cjs and preload.cjs', () => {
    const mainToolsMatch = mainCjs.match(/const SUNNY_TOOLS = \[([^\]]+)\]/);
    const preloadToolsMatch = preloadCjs.match(/const SUNNY_TOOLS = \[([^\]]+)\]/);
    const mainTools = mainToolsMatch ? mainToolsMatch[1] : '';
    const preloadTools = preloadToolsMatch ? preloadToolsMatch[1] : '';
    assert.ok(mainTools, 'main.cjs should define SUNNY_TOOLS');
    assert.ok(preloadTools, 'preload.cjs should define SUNNY_TOOLS');
    assert.strictEqual(mainTools.trim(), preloadTools.trim());
  });
});

describe('IPC — runTool dispatch cases', () => {
  const dispatchCases = [
    'get_system_status',
    'speak_notification',
    'search_recipe',
    'get_daily_digest',
    'schedule_medication_reminder',
    'emit_cooking_step',
    'decide_action',
    'execute_actions',
  ];

  for (const tool of dispatchCases) {
    it(`runTool has dispatch case for ${tool}`, () => {
      assert.ok(
        mainCjs.includes(`toolName === '${tool}'`),
        `runTool should have case for ${tool}`
      );
    });
  }
});

describe('IPC — validateToolParams cases', () => {
  const validationCases = [
    'speak_notification',
    'search_recipe',
    'get_daily_digest',
    'schedule_medication_reminder',
    'emit_cooking_step',
    'decide_action',
    'execute_actions',
  ];

  for (const tool of validationCases) {
    it(`validateToolParams has validation case for ${tool}`, () => {
      assert.ok(
        mainCjs.includes(`toolName === '${tool}'`),
        `validateToolParams should have case for ${tool}`
      );
    });
  }
});

describe('IPC — sensitive tools are protected', () => {
  const sensitiveOps = [
    'execute_actions',
    'open_app',
    'save_credential',
    'load_credential',
    'delete_credential',
    'capture_screen',
    'analyze_screen',
    'decide_action',
    'init_model',
    'write_debug_log',
    'clear_debug_logs',
    'export_debug_logs',
  ];

  const interceptorOpsMatch = sensitiveOpsSource.match(
    /SENSITIVE_OPERATIONS = new Set\(\[([^\]]+)\]/
  );
  const interceptorOps = interceptorOpsMatch ? interceptorOpsMatch[1] : '';
  assert.ok(interceptorOps, 'SENSITIVE_OPERATIONS should be defined');

  for (const op of sensitiveOps) {
    it(`SENSITIVE_OPERATIONS includes ${op}`, () => {
      assert.ok(
        interceptorOps.includes(`'${op}'`),
        `${op} should be in SENSITIVE_OPERATIONS`
      );
    });
  }
});

describe('IPC — security guards', () => {
  it('assertTrustedSender is defined', () => {
    assert.ok(mainCjs.includes('function assertTrustedSender'));
  });

  it('assertTrustedSender checks event.sender', () => {
    assert.ok(mainCjs.includes('event.sender !== mainWindow.webContents'));
  });

  it('rateLimit is defined', () => {
    assert.ok(mainCjs.includes('function rateLimit'));
  });

  it('assertPayloadSize is defined', () => {
    assert.ok(mainCjs.includes('function assertPayloadSize'));
  });

  it('MAX_PAYLOAD_BYTES is defined', () => {
    assert.ok(mainCjs.includes('const MAX_PAYLOAD_BYTES'));
  });

  it('withSystemGuardrail is defined', () => {
    assert.ok(mainCjs.includes('function withSystemGuardrail'));
  });

  it('SUNNY_SYSTEM_GUARDRAIL is defined', () => {
    assert.ok(mainCjs.includes('const SUNNY_SYSTEM_GUARDRAIL'));
  });

  it('guardrail mentions prompt injection', () => {
    assert.ok(mainCjs.includes('prompt injection'));
  });

  it('RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_CALLS defined', () => {
    assert.ok(mainCjs.includes('const RATE_LIMIT_WINDOW_MS'));
    assert.ok(mainCjs.includes('const RATE_LIMIT_MAX_CALLS'));
  });

  it('rate buckets use Map', () => {
    assert.ok(mainCjs.includes('const rateBuckets = new Map()'));
  });
});

describe('IPC — tool timeouts', () => {
  it('TOOL_TIMEOUTS defines get_daily_digest extended timeout', () => {
    assert.ok(mainCjs.includes('get_daily_digest: 45_000'));
  });

  it('TOOL_CALL_TIMEOUT_MS default defined', () => {
    assert.ok(mainCjs.includes('const TOOL_CALL_TIMEOUT_MS'));
  });
});

describe('IPC — runConfiguredInference', () => {
  it('runConfiguredInference routes to embedded model', () => {
    assert.ok(mainCjs.includes("provider === 'embedded'"));
  });

  it('runConfiguredInference routes to cloud providers', () => {
    assert.ok(mainCjs.includes("provider === 'ollama'"));
    assert.ok(mainCjs.includes('runProviderInference'));
    assert.ok(mainCjs.includes('PROVIDER_CREDENTIAL_KEYS'));
  });

  it('runConfiguredInference reads stored credentials', () => {
    assert.ok(mainCjs.includes('readStoredCredential'));
  });

  it('runConfiguredInference rejects missing API key', () => {
    assert.ok(mainCjs.includes('!apiKey && provider !== \'ollama\''));
  });
});

describe('preload — electronAPI methods', () => {
  const preloadMethods = [
    'executeTool',
    'invokeTool',
    'getSystemStatus',
    'searchRecipe',
    'getDailyDigest',
    'scheduleMedicationReminder',
    'markMedicationTaken',
    'deleteMedicationReminder',
    'getMedicationReminders',
    'speakNotification',
    'onSystemStatusChange',
    'onModelProgress',
    'onWindowVisibilityChange',
    'onMedicationReminder',
    'onMedicationReminderAdded',
    'onCookingStepChange',
    'getAvailableTools',
    'isToolAvailable',
    'listTools',
    'checkForUpdates',
    'downloadUpdate',
    'getAutoCheckUpdates',
    'setAutoCheckUpdates',
    'setPreferences',
    'getSpeechStatus',
    'transcribe',
    'quitAndInstall',
    'onUpdateAvailable',
    'onUpdateDownloaded',
    'onUpdateError',
    'readClipboard',
    'writeClipboard',
    'getWindowInfo',
    'getEmergencyStopStatus',
    'resetEmergencyStop',
    'onEmergencyStop',
  ];

  for (const method of preloadMethods) {
    it(`preload exposes electronAPI.${method}`, () => {
      assert.ok(
        preloadCjs.includes(`${method}:`),
        `preload.cjs should expose electronAPI.${method}`
      );
    });
  }
});

describe('preload — windowControls', () => {
  const windowControlMethods = [
    'nativeTitleBar',
    'quitApp',
    'minimizeWindow',
    'closeWindow',
    'setAlwaysOnTop',
    'getAlwaysOnTop',
    'onAlwaysOnTopChanged',
    'getWindowState',
    'setWindowPreset',
    'resetWindowPosition',
    'toggleWindowFilled',
    'isWindowFilled',
    'onWindowFilledChanged',
  ];

  for (const method of windowControlMethods) {
    it(`preload exposes windowControls.${method}`, () => {
      assert.ok(
        preloadCjs.includes(`${method}:`),
        `preload.cjs should expose windowControls.${method}`
      );
    });
  }
});

describe('preload — sunnyDesktop legacy surface', () => {
  const legacyMethods = [
    'captureScreen',
    'analyzeScreen',
    'decideAction',
    'executeActions',
    'cancelActions',
    'windowAction',
    'readClipboard',
    'writeClipboard',
    'getWindowInfo',
    'getEmergencyStopStatus',
    'resetEmergencyStop',
    'onEmergencyStop',
    'getModelStatus',
    'initModel',
    'onModelProgress',
    'writeDebugLog',
    'clearDebugLogs',
    'exportDebugLogs',
    'getDebugLogCount',
    'saveCredential',
    'loadCredential',
    'deleteCredential',
  ];

  for (const method of legacyMethods) {
    it(`preload exposes sunnyDesktop.${method}`, () => {
      assert.ok(
        preloadCjs.includes(`${method}:`),
        `preload.cjs should expose sunnyDesktop.${method}`
      );
    });
  }
});

describe('preload — sanitizes input', () => {
  it('preload uses contextBridge.exposeInMainWorld', () => {
    assert.ok(preloadCjs.includes('contextBridge.exposeInMainWorld'));
  });

  it('preload exposes electronAPI', () => {
    assert.ok(preloadCjs.includes("exposeInMainWorld('electronAPI'"));
  });

  it('preload exposes windowControls', () => {
    assert.ok(preloadCjs.includes("exposeInMainWorld('windowControls'"));
  });

  it('preload exposes sunnyDesktop legacy surface', () => {
    assert.ok(preloadCjs.includes("exposeInMainWorld('sunnyDesktop'"));
  });

  it('preload sanitizes input with deepSanitize', () => {
    assert.ok(preloadCjs.includes('function deepSanitize'));
  });

  it('preload DANGEROUS_CHARS_REGEX blocks command substitution', () => {
    assert.ok(preloadCjs.includes('const DANGEROUS_CHARS_REGEX'));
  });
});

describe('main.cjs — security imports', () => {
  it('main.cjs imports interceptor functions', () => {
    assert.ok(mainCjs.includes('interceptAction'));
    assert.ok(mainCjs.includes('sanitizeUntrustedContent'));
    assert.ok(mainCjs.includes('checkParameterAmbiguity'));
    assert.ok(mainCjs.includes('DESTRUCTIVE_TEXT_PATTERN'));
  });

  it('execute-actions handler uses interceptAction', () => {
    assert.ok(mainCjs.includes('const result = interceptAction(action)'));
  });

  it('execute-actions handler checks block verdict', () => {
    assert.ok(mainCjs.includes("result.verdict === 'block'"));
  });

  it('execute-actions handler checks confirm verdict', () => {
    assert.ok(mainCjs.includes("result.verdict === 'confirm'"));
  });

  it('execute-actions handler calls confirmSensitiveOperation', () => {
    assert.ok(mainCjs.includes('confirmSensitiveOperation'));
  });
});
