#!/usr/bin/env electron
/**
 * Verifies the AI model end to end through the real inference stack.
 *
 * Run with:  npm run verify:model
 *
 * This must be an Electron process (not bare node): inference.cjs reads
 * app.getPath(), which is main-process only.
 *
 * It is a real gate, not a smoke test. An empty text response used to pass
 * here because the assertion only checked for an `error` field — the exact
 * bug it should have caught. Both the text and vision replies must now contain
 * actual content.
 */

const { app } = require('electron');
const zlib = require('node:zlib');
const inference = require('../src/electron/inference.cjs');

/**
 * Builds a valid 16x16 solid-blue PNG in memory.
 *
 * Hand-written base64 PNGs are a trap: a wrong CRC makes libpng fail with
 * "vipspng: libpng read error", which looks like a model bug but is not one.
 * 16x16 is large enough that the vision tower produces real embeddings — a 1x1
 * image fails on token/feature mismatch and proves nothing.
 */
function makeTestImage() {
  const WIDTH = 16;
  const HEIGHT = 16;

  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  let offset = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < WIDTH; x += 1) {
      raw[offset] = 40;   // R
      raw[offset + 1] = 90; // G
      raw[offset + 2] = 200; // B — blue
      offset += 3;
    }
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
    return Buffer.concat([length, typeAndData, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return png.toString('base64');
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verify() {
  console.log('[Verify] electron :', app.getPath('exe'));
  console.log('[Verify] userData:', app.getPath('userData'));

  console.log('[Verify] Loading model (first run downloads ~1.5 GB)...');
  await inference.initModel((status) => {
    console.log(`[Verify]   ${status.progress}% — ${status.message}`);
  });

  const status = inference.getModelStatus();
  assert(status.status === 'ready', `model not ready: ${JSON.stringify(status)}`);
  console.log('[Verify] Model ready.');

  // --- Text path ----------------------------------------------------------
  console.log('[Verify] Testing text generation...');
  const text = await inference.runInference('Question: What is the capital of France?\n\nAnswer:');
  assert(!text.error, `text inference errored: ${text.error}`);
  assert(
    typeof text.response === 'string' && text.response.trim().length > 0,
    'text inference returned an empty response'
  );
  console.log('[Verify]   reply:', text.response.trim().slice(0, 120));

  // --- Vision path --------------------------------------------------------
  // Must run with an image attached. Falling back to text here would return a
  // confident answer that never saw the picture, which is the invariant the
  // H6 regression test guards.
  console.log('[Verify] Testing vision inference...');
  const vision = await inference.runInference('Question: What colour is this image?\n\nAnswer:', makeTestImage());
  assert(!vision.error, `vision inference errored: ${vision.error}`);
  assert(
    typeof vision.response === 'string' && vision.response.trim().length > 0,
    'vision inference returned an empty response'
  );
  console.log('[Verify]   reply:', vision.response.trim().slice(0, 120));

  console.log('\n[Verify] PASS — text and vision inference both return real content.');
}

app.whenReady()
  .then(async () => {
    await verify();
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[Verify] FAIL —', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  });

process.on('unhandledRejection', (reason) => {
  console.error('[Verify] FAIL — unhandled rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[Verify] FAIL — uncaught exception:', err);
  process.exit(1);
});
