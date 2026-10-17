const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let transformersLib = null;
let pipeline = null;
let visionModel = null;
let visionProcessor = null;
let visionTokenizer = null;
let visionPromise = null;
let RawImageCtor = null;
let modelStatus = 'not-downloaded';
let modelProgress = 0;
let statusMessage = 'Model not loaded yet.';
let progressCallback = null;
let initPromise = null;

const MODEL_ID = 'onnx-community/moondream2.text_model-ONNX';
const MODEL_DTYPE = 'q4';
const APPROX_DOWNLOAD_MB = 1200;

// Moondream2 vision needs the full multimodal export. The text-generation
// pipeline above cannot accept an image at all: transformers.js routes images
// through AutoProcessor + the Moondream model class, and a text-generation
// pipeline silently discards them. This repo is the multimodal ONNX export.
const VISION_MODEL_ID = 'Xenova/moondream2';

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

/**
 * Loads the multimodal Moondream2 stack used for screen understanding.
 * Single-flight: concurrent callers share one in-flight load.
 */
async function initVisionModel() {
  if (visionModel && visionProcessor && visionTokenizer) {
    return { model: visionModel, processor: visionProcessor, tokenizer: visionTokenizer };
  }
  if (visionPromise) return visionPromise;

  visionPromise = (async () => {
    const lib = await loadTransformers();
    const { AutoProcessor, AutoTokenizer, Moondream1ForConditionalGeneration, RawImage } = lib;

    const [processor, tokenizer, model] = await Promise.all([
      AutoProcessor.from_pretrained(VISION_MODEL_ID),
      AutoTokenizer.from_pretrained(VISION_MODEL_ID),
      Moondream1ForConditionalGeneration.from_pretrained(VISION_MODEL_ID, {
        dtype: {
          embed_tokens: 'fp16',
          vision_encoder: 'q8',
          decoder_model_merged: 'q4',
        },
      }),
    ]);

    visionProcessor = processor;
    visionTokenizer = tokenizer;
    visionModel = model;
    RawImageCtor = RawImage;
    return { model, processor, tokenizer };
  })().catch((err) => {
    visionPromise = null;
    throw err;
  });

  return visionPromise;
}

/** Decodes a base64 PNG/JPEG payload (no data-URL prefix) into a RawImage. */
async function decodeImage(imageBase64) {
  const RawImage = RawImageCtor;
  if (!RawImage) throw new Error('Image decoding is unavailable.');
  const buffer = Buffer.from(imageBase64, 'base64');
  const blob = new Blob([buffer]);
  return RawImage.read(blob);
}

/**
 * Vision branch: runs a prompt against a screenshot using the multimodal
 * Moondream2 stack. This MUST succeed or throw — no fallback to text pipeline.
 * See the invariant comment in `runInference`.
 */
async function runVisionInference(prompt, imageBase64) {
  try {
    const { model, processor, tokenizer } = await initVisionModel();
    const image = await decodeImage(imageBase64);

    // Moondream expects the image marker plus an explicit Q/A scaffold.
    const text = `<image>\n\nQuestion: ${prompt}\n\nAnswer:`;
    const textInputs = tokenizer(text);
    const visionInputs = await processor(image);

    const output = await model.generate({
      ...textInputs,
      ...visionInputs,
      do_sample: false,
      max_new_tokens: 200,
    });

    const decoded = tokenizer.batch_decode(output, { skip_special_tokens: true });
    const text2 = Array.isArray(decoded) ? decoded[0] : decoded;
    const answer = typeof text2 === 'string'
      ? text2.split('Answer:').pop().trim()
      : '';
    return { response: answer };
  } catch (err) {
    // Never fall back to text pipeline — the invariant requires loud failure.
    return {
      response: '',
      error: `Vision inference failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Runs a prompt, optionally against a screen capture.
 *
 * With an image this uses the multimodal Moondream stack and actually feeds the
 * pixels to the vision encoder. Without one it uses the text-generation
 * pipeline, which is cheaper and is what decide-action wants.
 */
async function runInference(prompt, imageBase64) {
  // INVARIANT: when a screenshot is supplied, the answer MUST come from the
  // vision encoder. Falling back to the text pipeline would return a confident
  // reply that never saw the screen — far worse than an error, because the user
  // has no way to tell. So the vision branch fails loudly instead.
  if (imageBase64) {
    return runVisionInference(prompt, imageBase64);
  }

  try {
    if (!pipeline) {
      await initModel();
    }

    const output = await pipeline(prompt, {
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
