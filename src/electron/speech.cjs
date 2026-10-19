/**
 * Speech-to-text, run locally.
 *
 * The browser SpeechRecognition API is not an option here: Chromium's
 * implementation proxies to Google's servers and needs API keys it only ships
 * with Chrome, so it fails inside Electron. Local Whisper via transformers.js
 * is the only approach that works, and it is also the better privacy story —
 * audio never leaves the machine.
 *
 * Whisper is loaded lazily on first use: it is ~40 MB and most users will only
 * ever speak a handful of questions.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/** Smallest English-only Whisper. Accuracy is adequate for dictation. */
const ASR_MODEL_ID = 'onnx-community/whisper-tiny.en';

/** Whisper's required input: 16 kHz mono PCM. */
const SAMPLE_RATE = 16_000;

/**
 * Below this RMS the audio is effectively silence. Whisper does not report
 * "nothing was said" — it hallucinates plausible text, so an unguarded call
 * turns a silent microphone into a confident wrong answer.
 */
const SILENCE_RMS_THRESHOLD = 0.008;

const MAX_TRANSCRIBE_SECONDS = 30;

let asrPipeline = null;
let asrPromise = null;

/** Reported to the renderer so the UI can say "voice unavailable" honestly. */
let asrAvailable = true;
let asrError = '';

function getCacheDir() {
  return path.join(app.getPath('userData'), 'models-cache');
}

/** Loads Whisper once; concurrent callers share a single in-flight load. */
async function getAsrPipeline() {
  if (asrPipeline) return asrPipeline;
  if (asrPromise) return asrPromise;

  asrPromise = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowRemoteModels = true;
    lib.env.allowLocalModels = true;
    lib.env.cacheDir = getCacheDir();

    const pipeline = await lib.pipeline('automatic-speech-recognition', ASR_MODEL_ID, {
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',
      },
    });

    asrPipeline = pipeline;
    return pipeline;
  })();

  try {
    return await asrPromise;
  } catch (err) {
    asrError = err && err.message ? err.message : 'Voice input is unavailable.';
    asrAvailable = false;
    throw err;
  } finally {
    asrPromise = null;
  }
}

function rootMeanSquare(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Transcribes 16 kHz mono Float32 PCM.
 *
 * @param {Float32Array} samples
 * @returns {Promise<{ text: string, silent: boolean }>}
 */
async function transcribe(samples) {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error('No audio was captured.');
  }

  const maxSamples = MAX_TRANSCRIBE_SECONDS * SAMPLE_RATE;
  if (samples.length > maxSamples) {
    throw new Error(
      `Recording is longer than ${MAX_TRANSCRIBE_SECONDS} seconds. Hold the button and speak briefly.`
    );
  }

  const rms = rootMeanSquare(samples);
  if (rms < SILENCE_RMS_THRESHOLD) {
    // Returning an explicit "silent" is what stops Whisper inventing a sentence.
    return { text: '', silent: true };
  }

  const pipeline = await getAsrPipeline();
  const output = await pipeline(samples);
  const text = String(output?.text ?? '').trim();

  // Whisper still emits text for some quiet-but-not-silent input; if what comes
  // back is empty or only punctuation, treat it as nothing said.
  const meaningful = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (!meaningful) return { text: '', silent: true };

  return { text, silent: false };
}

function getAsrStatus() {
  return {
    available: asrAvailable,
    modelLoaded: Boolean(asrPipeline),
    model: ASR_MODEL_ID,
    error: asrError,
  };
}

/** Warms the model so the first tap does not wait on a download. */
async function preloadAsr() {
  if (!fs.existsSync(getCacheDir())) fs.mkdirSync(getCacheDir(), { recursive: true });
  await getAsrPipeline();
}

module.exports = {
  transcribe,
  getAsrStatus,
  preloadAsr,
  SAMPLE_RATE,
  MAX_TRANSCRIBE_SECONDS,
};
