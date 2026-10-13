const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let transformersLib = null;
let pipeline = null;
let modelStatus = 'not-downloaded';
let modelProgress = 0;
let statusMessage = 'Model not loaded yet.';
let progressCallback = null;
let initPromise = null;

const MODEL_ID = 'onnx-community/moondream2.text_model-ONNX';
const MODEL_DTYPE = 'q4';
const APPROX_DOWNLOAD_MB = 1200;

function getModelDir() {
  return path.join(app.getPath('userData'), 'models');
}

function getLogDir() {
  return path.join(app.getPath('home'), '.sunny', 'logs');
}

function getScreenshotDir() {
  return path.join(getLogDir(), 'screenshots');
}

function ensureLogDirs() {
  const logDir = getLogDir();
  const screenshotDir = getScreenshotDir();
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
}

async function loadTransformers() {
  if (transformersLib) return transformersLib;
  try {
    transformersLib = await import('@huggingface/transformers');
    const env = transformersLib.env;
    const modelDir = getModelDir();
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    env.localModelPath = modelDir;
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = path.join(
        require('node:module').createRequire(__filename).resolve('onnxruntime-node').replace(/node_modules\/.*$/, ''),
        'node_modules/onnxruntime-node/bin/'
      );
    }
  } catch (err) {
    modelStatus = 'error';
    statusMessage = 'Could not load the local AI engine. Please restart the app.';
    throw err;
  }
  return transformersLib;
}

async function initModel(onProgress) {
  if (pipeline && modelStatus === 'ready') return pipeline;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    progressCallback = onProgress || null;
  modelStatus = 'downloading';
  modelProgress = 0;
  statusMessage = 'Setting up your assistant... This happens only once!';

  try {
    const lib = await loadTransformers();
    modelStatus = 'downloading';
    statusMessage = `Downloading Sunny's vision model (~${(APPROX_DOWNLOAD_MB / 1000).toFixed(1)} GB). This happens only once!`;

    pipeline = await lib.pipeline('text-generation', MODEL_ID, {
      dtype: MODEL_DTYPE,
      progress_callback: (data) => {
        if (data.status === 'progress') {
          const pct = data.progress || 0;
          modelProgress = Math.round(pct);
          statusMessage = `Downloading Sunny's vision model... ${modelProgress}%`;
        } else if (data.status === 'done') {
          modelProgress = 100;
          statusMessage = 'Finishing setup...';
        } else if (data.status === 'ready') {
          modelStatus = 'loading';
          statusMessage = 'Loading the model into memory...';
        }
        if (progressCallback) progressCallback({ status: modelStatus, progress: modelProgress, message: statusMessage });
      },
    });

    modelStatus = 'ready';
    modelProgress = 100;
    statusMessage = 'Sunny is ready to help!';
    if (progressCallback) progressCallback({ status: modelStatus, progress: modelProgress, message: statusMessage });
    return pipeline;
  } catch (err) {
    modelStatus = 'error';
    statusMessage = 'Could not download the vision model. Please check your internet connection and restart.';
    if (progressCallback) progressCallback({ status: modelStatus, progress: 0, message: statusMessage });
    throw err;
  } finally {
    initPromise = null;
  }
})();
  
  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

function getModelStatus() {
  return { status: modelStatus, progress: modelProgress, message: statusMessage };
}

async function runInference(prompt, imageBase64) {
  if (!pipeline) {
    await initModel();
  }
  try {
    const fullPrompt = imageBase64
      ? `<image>\n\n${prompt}`
      : prompt;

    const output = await pipeline(fullPrompt, {
      max_new_tokens: 200,
      temperature: 0.3,
      do_sample: false,
    });

    const text = Array.isArray(output) && output[0]?.generated_text
      ? output[0].generated_text
      : typeof output === 'string' ? output : '';

    return { response: text };
  } catch (err) {
    return { response: '', error: err instanceof Error ? err.message : 'Inference failed.' };
  }
}

// Sensitive patterns to redact from logs
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{32,}/g,
  /sk-ant-[a-zA-Z0-9_-]{95}/g,
  /gsk_[a-zA-Z0-9]{32,}/g,
  /Bearer\s+[a-zA-Z0-9_-]{20,}/g,
  /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
];

function sanitizeForLog(obj) {
  const str = JSON.stringify(obj, null, 2);
  return SENSITIVE_PATTERNS.reduce((s, p) => s.replace(p, '[REDACTED]'), str);
}

function writeDebugLog(entry) {
  ensureLogDirs();
  const logFile = path.join(getLogDir(), 'task-history.json');
  let logs = [];
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      logs = JSON.parse(content);
      if (!Array.isArray(logs)) logs = [];
    }
  } catch {
    logs = [];
  }
  const sanitized = JSON.parse(sanitizeForLog(entry));
  logs.push(sanitized);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf-8');
}

function clearDebugLogs() {
  const logFile = path.join(getLogDir(), 'task-history.json');
  const screenshotDir = getScreenshotDir();
  try {
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    if (fs.existsSync(screenshotDir)) {
      const files = fs.readdirSync(screenshotDir);
      for (const file of files) {
        fs.unlinkSync(path.join(screenshotDir, file));
      }
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}

function exportDebugLogs() {
  const logFile = path.join(getLogDir(), 'task-history.json');
  try {
    if (!fs.existsSync(logFile)) return { content: '[]' };
    const content = fs.readFileSync(logFile, 'utf-8');
    return { content };
  } catch {
    return { content: '[]' };
  }
}

function getDebugLogCount() {
  const logFile = path.join(getLogDir(), 'task-history.json');
  try {
    if (!fs.existsSync(logFile)) return { count: 0 };
    const content = fs.readFileSync(logFile, 'utf-8');
    const logs = JSON.parse(content);
    return { count: Array.isArray(logs) ? logs.length : 0 };
  } catch {
    return { count: 0 };
  }
}

module.exports = {
  initModel,
  getModelStatus,
  runInference,
  writeDebugLog,
  clearDebugLogs,
  exportDebugLogs,
  getDebugLogCount,
  ensureLogDirs,
};
