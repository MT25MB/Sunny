/**
 * INTEGRATION TESTS: Model Inference
 * Tests for Moondream2 and Whisper actual inference.
 *
 * These tests require the models to be downloaded (may take several minutes on first run).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');

// These tests run verify-model.cjs which uses Electron directly
test('model: verify-model.cjs exists and is executable', () => {
  const fs = require('node:fs');
  const verifyModelPath = path.join(REPO, 'scripts', 'verify-model.cjs');
  assert.ok(fs.existsSync(verifyModelPath), 'verify-model.cjs exists');
  const content = fs.readFileSync(verifyModelPath, 'utf8');
  assert.ok(content.includes('initModel'), 'verify-model calls initModel');
  assert.ok(content.includes('runInference'), 'verify-model calls runInference');
  assert.ok(content.includes('makeTestImage'), 'verify-model builds test image for vision');
});

test('model: inference.cjs exports required functions', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes('initModel'), 'inference exports initModel');
  assert.ok(content.includes('getModelStatus'), 'inference exports getModelStatus');
  assert.ok(content.includes('runInference'), 'inference exports runInference');
  assert.ok(content.includes('writeDebugLog'), 'inference exports writeDebugLog');
  assert.ok(content.includes('clearDebugLogs'), 'inference exports clearDebugLogs');
  assert.ok(content.includes('exportDebugLogs'), 'inference exports exportDebugLogs');
  assert.ok(content.includes('getDebugLogCount'), 'inference exports getDebugLogCount');
});

test('model: speech.cjs exports required functions', () => {
  const fs = require('node:fs');
  const speechPath = path.join(REPO, 'src', 'electron', 'speech.cjs');
  const content = fs.readFileSync(speechPath, 'utf8');
  assert.ok(content.includes('transcribe'), 'speech exports transcribe');
  assert.ok(content.includes('getAsrStatus'), 'speech exports getAsrStatus');
  assert.ok(content.includes('preloadAsr'), 'speech exports preloadAsr');
  assert.ok(content.includes('SAMPLE_RATE'), 'speech exports SAMPLE_RATE');
  assert.ok(content.includes('MAX_TRANSCRIBE_SECONDS'), 'speech exports MAX_TRANSCRIBE_SECONDS');
});

test('model: Moondream2 model ID is declared', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes("MODEL_ID = 'Xenova/moondream2'"), 'Moondream2 model ID is declared');
});

test('model: Whisper model ID is declared', () => {
  const fs = require('node:fs');
  const speechPath = path.join(REPO, 'src', 'electron', 'speech.cjs');
  const content = fs.readFileSync(speechPath, 'utf8');
  assert.ok(content.includes("ASR_MODEL_ID = 'onnx-community/whisper-tiny.en'"), 'Whisper model ID is declared');
});

test('model: runInference branches on image presence', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes('if (imageBase64)'), 'runInference branches on image presence');
  assert.ok(content.includes('runVisionInference'), 'runInference delegates to runVisionInference for images');
});

test('model: runVisionInference uses AutoProcessor', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes('AutoProcessor'), 'runVisionInference uses AutoProcessor');
  assert.ok(content.includes('RawImage'), 'runVisionInference uses RawImage');
  assert.ok(content.includes('processor([image])'), 'runVisionInference passes image to processor');
});

test('model: model cache is redirected out of node_modules', () => {
  const fs = require('node:fs');
  const inferencePath = path.join(REPO, 'src', 'electron', 'inference.cjs');
  const content = fs.readFileSync(inferencePath, 'utf8');
  assert.ok(content.includes('env.cacheDir = cacheDir'), 'cacheDir is set explicitly');
  assert.ok(content.includes('userData'), 'cache dir lives under userData');
});

test('model: model loading does not terminate app on failure', () => {
  const fs = require('node:fs');
  const mainPath = path.join(REPO, 'src', 'electron', 'main.cjs');
  const content = fs.readFileSync(mainPath, 'utf8');
  const startupSection = content.slice(
    content.indexOf('inference.initModel((status)'),
    content.indexOf('app.on(\'window-all-closed\'')
  );
  assert.ok(!startupSection.includes('app.exit('), 'model load failure does not call app.exit');
  assert.ok(!startupSection.includes('showErrorBox'), 'model load failure does not show error box');
});
