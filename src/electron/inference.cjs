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

// Use the multimodal Moondream2 model for both text generation and vision
const MODEL_ID = 'Xenova/moondream2';
const MODEL_DTYPE = 'q4';
// Measured on disk after a cold fetch of Xenova/moondream2 at the dtypes
// below: 1,479,956,659 bytes across three .onnx files plus tokenizer/config.
const APPROX_DOWNLOAD_MB = 1500;
const APPROX_DOWNLOAD_BYTES = APPROX_DOWNLOAD_MB * 1000 * 1000;

function getModelDir() {
  return path.join(app.getPath('userData'), 'models');
}

/**
 * transformers.js defaults its cache to `__dirname/.cache` — that is, inside
 * `node_modules`. Anything downloaded there gets packaged into the installer,
 * which previously added ~1.4 GB of model weights to a 2.27 GB app.asar.
 * Point it at userData so the download lives with the app's other data.
 */
function getModelCacheDir() {
  return path.join(app.getPath('userData'), 'models-cache');
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
    const cacheDir = getModelCacheDir();
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    env.localModelPath = modelDir;
    env.cacheDir = cacheDir;
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

/**
 * Forwards a transformers.js progress event onto the renderer's
 * sunny:model-progress channel.
 *
 * This matters for a first run: the model is ~1.4 GB, and a spinner with no
 * percentage reads as a hang to anyone waiting on it.
 */
function makeProgressReporter() {
  const seen = new Map();
  // transformers.js fires `progress` per network chunk. A 1.5 GB download is
  // tens of thousands of them, and forwarding each one floods the IPC channel
  // and repaints the UI far faster than a human can read. Only forward when
  // the displayed percentage actually changes.
  let lastSentProgress = -1;

  return (data) => {
    if (!progressCallback || !data) return;

    if (data.status === 'progress') {
      // Many files make up the model. Track bytes per file and report the
      // aggregate, so the number climbs steadily instead of jumping 0 -> 100.
      const file = data.file || 'model';
      const current = seen.get(file) || 0;
      const next = Math.max(current, data.loaded || 0);
      seen.set(file, next);
      const total = [...seen.values()].reduce((sum, n) => sum + n, 0);
      modelProgress = Math.min(99, Math.round((total / APPROX_DOWNLOAD_BYTES) * 100));
      modelStatus = 'downloading';
      statusMessage = `Downloading Sunny's model... ${modelProgress}%`;

      if (modelProgress === lastSentProgress) return;
      lastSentProgress = modelProgress;
    } else if (data.status === 'done') {
      modelStatus = 'loading';
      statusMessage = 'Loading the model into memory...';
    } else if (data.status === 'ready') {
      modelStatus = 'loading';
      statusMessage = 'Loading the model into memory...';
    }

    progressCallback({ status: modelStatus, progress: modelProgress, message: statusMessage });
  };
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
      statusMessage = `Downloading Sunny's model (~${(APPROX_DOWNLOAD_MB / 1000).toFixed(1)} GB). This happens only once!`;

      // One multimodal Moondream2 stack serves both text and vision.
      const onFileProgress = makeProgressReporter();

      const [processor, tokenizer, model] = await Promise.all([
        transformersLib.AutoProcessor.from_pretrained(MODEL_ID),
        transformersLib.AutoTokenizer.from_pretrained(MODEL_ID),
        transformersLib.Moondream1ForConditionalGeneration.from_pretrained(MODEL_ID, {
          dtype: {
            embed_tokens: 'fp16',
            vision_encoder: 'q8',
            decoder_model_merged: MODEL_DTYPE,
          },
          progress_callback: onFileProgress,
        }),
      ]);

      // Store for vision inference
      pipeline = {
        model,
        processor,
        tokenizer,
        Tensor: transformersLib.Tensor,
        generate: async (inputs, options = {}) => {
          return model.generate(inputs, options);
        },
      };

      modelStatus = 'ready';
      modelProgress = 100;
      statusMessage = 'Sunny is ready to help!';
      if (progressCallback) progressCallback({ status: modelStatus, progress: modelProgress, message: statusMessage });
      return pipeline;
    } catch (err) {
      modelStatus = 'error';
      statusMessage = `Sunny could not load its AI model: ${err.message}`;
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

/** Decodes a base64 PNG/JPEG payload (no data-URL prefix) into a RawImage. */
async function decodeImage(imageBase64) {
  const lib = await import('@huggingface/transformers');
  const RawImage = lib.RawImage;
  if (!RawImage) throw new Error('Image decoding is unavailable.');
  const buffer = Buffer.from(imageBase64, 'base64');
  const blob = new Blob([buffer]);
  return RawImage.read(blob);
}

/**
 * Vision branch: runs a prompt against a screenshot using the multimodal
 * Moondream2 stack. This MUST succeed or throw — no fallback to text pipeline.
 */
async function runVisionInference(prompt, imageBase64) {
  try {
    if (!pipeline) {
      await initModel();
    }
    if (!pipeline) throw new Error('Model not initialized');
    const { model, processor, tokenizer, Tensor } = pipeline;
    const image = await decodeImage(imageBase64);

    // Moondream2 needs one image token per vision feature spliced into the
    // prompt. Neither helper does this for us: AutoProcessor resolves to the
    // generic Processor, which only emits pixel_values and never tokenizes
    // text, and the tokenizer leaves a literal "<image>" as ordinary text. Get
    // the counts wrong and the model raises
    // "Number of tokens and features do not match".
    const visionInputs = await processor([image]);

    // The SigLIP tower resizes every image to 378x378 and patches at 14px, so
    // the feature count is fixed rather than dependent on the source image.
    // Derived rather than hard-coded so a processor config change shows up as a
    // mismatch here instead of silently returning a wrong answer.
    const PATCH_SIZE = 14;
    const [batch, , height, width] = visionInputs.pixel_values.dims;
    const numFeatures = (height / PATCH_SIZE) * (width / PATCH_SIZE);

    if (!Number.isInteger(numFeatures) || numFeatures <= 0 || batch !== 1) {
      throw new Error(`Unexpected pixel_values shape: ${visionInputs.pixel_values.dims}`);
    }

    const imageTokenId = BigInt(model.config.image_token_index);

    // Moondream was instruction-tuned on a Question/Answer scaffold and
    // answers far better when it is present, so normalise whatever the caller
    // passed rather than trusting it to arrive pre-formatted.
    const question = /question\s*:/i.test(prompt) ? prompt : `Question: ${prompt}`;
    const scaffold = /answer\s*:/i.test(question) ? question : `${question}\n\nAnswer:`;

    const promptIds = tokenizer(scaffold).input_ids.data;

    // Keep the BOS token, splice in the image tokens, then the rest of the prompt.
    const ids = [
      promptIds[0],
      ...new Array(numFeatures).fill(imageTokenId),
      ...promptIds.slice(1),
    ];

    const input_ids = new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
    const attention_mask = new Tensor(
      'int64',
      BigInt64Array.from(new Array(ids.length).fill(1n)),
      [1, ids.length]
    );

    const output = await model.generate({
      input_ids,
      attention_mask,
      ...visionInputs,
      do_sample: false,
      max_new_tokens: 200,
    });

    const decoded = tokenizer.batch_decode(output, { skip_special_tokens: true });
    const first = Array.isArray(decoded) ? decoded[0] : decoded;
    const answer = typeof first === 'string' && first.length > 0
      ? first.split('Answer:').pop()?.trim() ?? ''
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

    // model.generate() returns raw token ids, not text. They must be decoded
    // with the tokenizer. The previous code looked for `generated_text`, a
    // property a raw model never returns, so every text-only reply was empty.
    const { model, tokenizer } = pipeline;
    const inputs = tokenizer(prompt);
    const output = await model.generate({ ...inputs, do_sample: false, max_new_tokens: 200 });

    const decoded = tokenizer.batch_decode(output, { skip_special_tokens: true });
    const raw = Array.isArray(decoded) ? decoded[0] : decoded;
    const text = typeof raw === 'string' ? raw.trim() : '';

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