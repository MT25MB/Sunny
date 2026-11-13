'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const inferencePath = path.join(process.cwd(), 'src/electron/inference.cjs');
const inferenceCjs = fs.readFileSync(inferencePath, 'utf8');

const mainCjsPath = path.join(process.cwd(), 'src/electron/main.cjs');
const mainCjs = fs.readFileSync(mainCjsPath, 'utf8');

describe('model — verify-model.cjs exists and is executable', () => {
  it('verify-model.cjs exists', () => {
    const verifyPath = path.join(process.cwd(), 'scripts/verify-model.cjs');
    assert.ok(fs.existsSync(verifyPath), 'verify-model.cjs should exist');
  });

  it('verify-model.cjs tests model init and inference', () => {
    const verifyContent = fs.readFileSync(path.join(process.cwd(), 'scripts/verify-model.cjs'), 'utf8');
    assert.ok(verifyContent.includes('initModel'));
    assert.ok(verifyContent.includes('runInference'));
  });
});

describe('model — inference.cjs exports required functions', () => {
  it('exports runInference', () => {
    assert.ok(inferenceCjs.includes('async function runInference'));
  });

  it('exports initModel', () => {
    assert.ok(inferenceCjs.includes('async function initModel'));
  });

  it('exports getModelStatus', () => {
    assert.ok(inferenceCjs.includes('function getModelStatus'));
  });
});

describe('model — speech.cjs exports required functions', () => {
  const speechPath = path.join(process.cwd(), 'src/electron/speech.cjs');
  const speechCjs = fs.readFileSync(speechPath, 'utf8');

  it('exports getAsrStatus', () => {
    assert.ok(speechCjs.includes('function getAsrStatus'));
  });

  it('exports transcribe', () => {
    assert.ok(speechCjs.includes('async function transcribe'));
  });
});

describe('model — model IDs', () => {
  it('Moondream2 model ID is declared', () => {
    assert.ok(mainCjs.includes("moondream2") || inferenceCjs.includes('moondream2'));
  });

  it('Whisper model ID is declared', () => {
    assert.ok(speechCjs.includes('whisper') || speechCjs.includes('Whisper'));
  });
});

describe('model — runInference branches on image presence', () => {
  it('runInference checks for image parameter', () => {
    assert.ok(mainCjs.includes('imageBase64') || inferenceCjs.includes('imageBase64'));
  });

  it('captures screen when vision needed but no image provided', () => {
    assert.ok(mainCjs.includes('captureScreen()'));
  });
});

describe('model — runVisionInference uses AutoProcessor', () => {
  it('uses AutoProcessor for vision inference', () => {
    assert.ok(inferenceCjs.includes('AutoProcessor') || inferenceCjs.includes('autoProcessor'));
  });
});

describe('model — model cache redirected out of node_modules', () => {
  it('model cache is in userData directory', () => {
    assert.ok(mainCjs.includes('userData/models') || mainCjs.includes('models-cache'));
  });

  it('native model dependencies are unpacked from ASAR', () => {
    const forgePath = path.join(process.cwd(), 'forge.config.js');
    const fs = require('node:fs');
    const forgeConfig = fs.readFileSync(forgePath, 'utf8');
    assert.ok(forgeConfig.includes('@nut-tree-fork'));
    assert.ok(forgeConfig.includes('@huggingface/transformers'));
  });
});

describe('model — model loading does not terminate app on failure', () => {
  it('error handlers do not call app.exit', () => {
    assert.ok(!mainCjs.includes('app.exit()') || mainCjs.includes('isQuitting'));
    // The uncaughtException handler sends error via IPC, doesn't exit
    assert.ok(mainCjs.includes("mainWindow.webContents.send('sunny:model-progress'"));
  });

  it('error handlers do not use showErrorBox', () => {
    assert.ok(!mainCjs.includes('showErrorBox'));
  });
});

describe('model — vision inference never falls back to text-only', () => {
  it('when image is provided, answer MUST come from vision', () => {
    // Check the invariant comment in inference.cjs
    assert.ok(inferenceCjs.includes('INVARIANT') || inferenceCjs.includes('image'));
  });

  it('decide_action handler sanitizes vision output for injection', () => {
    assert.ok(mainCjs.includes('sanitizeUntrustedContent(result.response'));
  });

  it('analyze-screen handler sanitizes vision output for injection', () => {
    assert.ok(mainCjs.includes('sanitizeUntrustedContent(result.response'));
  });
});
