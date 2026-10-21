#!/usr/bin/env node
/**
 * End-to-end check of the microphone path.
 *
 * Run with:  node scripts/check-microphone.cjs
 *
 * Chromium has a fake audio device: instead of a person speaking, it
 * produces a tone through the same getUserMedia and MediaRecorder path a
 * real microphone uses. That exercises the whole chain -- permission,
 * capture, resampling, the hop to the main process, and Whisper -- without
 * needing a human voice, and without needing a machine that has a
 * microphone at all.
 *
 * What this cannot check is whether Whisper transcribes real speech
 * accurately. What it does check is that pressing and holding the button
 * starts a recording, that releasing it produces a transcript rather than
 * an error, and that the microphone is released afterwards instead of
 * being left open.
 *
 * It needs a display (WSLg on a developer machine, Xvfb in CI) and the
 * speech model, which the app downloads on first run.
 */

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const REPO = path.resolve(__dirname, '..');
const APP = path.join(REPO, 'out', 'Sunny-linux-x64', 'sunny-desktop');
const PORT = Number(process.env.SUNNY_MIC_CDP_PORT || 9334);

const { chromium } = require(path.join(REPO, 'node_modules', 'playwright'));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      require('node:http')
        .get(`http://localhost:${PORT}/json/version`, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() > deadline) reject(new Error('the DevTools endpoint never opened'));
          else setTimeout(attempt, 300);
        });
    };
    attempt();
  });
}

(async () => {
  if (!fs.existsSync(APP)) {
    console.error('No packaged app at ' + APP);
    console.error('Build one first: npm run build && npm run package');
    process.exit(2);
  }

  const app = spawn(
    APP,
    [
      '--remote-debugging-port=' + PORT,
      '--no-sandbox',
      // The fake microphone, and an automatic answer to its permission
      // prompt.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
    {
      cwd: path.dirname(APP),
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let log = '';
  app.stdout.on('data', (d) => { log += d.toString(); });
  app.stderr.on('data', (d) => { log += d.toString(); });

  const cleanup = () => {
    try { app.kill(); } catch { /* already gone */ }
  };
  process.on('exit', cleanup);

  try {
    await waitForCdp(30000);
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
    const context = browser.contexts()[0];
    let page = context.pages()[0];
    if (!page) page = await context.newPage();
    await page.waitForSelector('.app-shell', { timeout: 20000 });
    await wait(1200);

    const skip = await page.$('.onboarding-skip');
    if (skip) {
      await skip.click().catch(() => {});
      await wait(600);
    }

    // The microphone button lives in the recipe form, and the window is
    // small, so the section has to be open and the button in view before a
    // pointer event can land on it.
    for (const toggle of await page.$$('.collapsible-toggle')) {
      if ((await toggle.getAttribute('aria-expanded')) === 'false') {
        await toggle.click().catch(() => {});
        await wait(120);
      }
    }
    await wait(500);

    const mic = await page.$('.mic-btn');
    if (!mic) {
      console.error('FAIL: there is no microphone button to test');
      process.exit(1);
    }
    await mic.scrollIntoViewIfNeeded();
    await wait(300);

    // Watch every stream the page opens, so the microphone can be shown to
    // be released rather than merely assumed to be.
    await page.evaluate(() => {
      window.__streams = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__streams.push(stream);
        return stream;
      };
    });

    const devices = await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tracks = stream.getTracks().map((t) => t.kind + ':' + t.label);
        stream.getTracks().forEach((t) => t.stop());
        return { ok: true, tracks };
      } catch (err) {
        return { ok: false, error: err.name + ': ' + err.message };
      }
    });
    console.log('microphone opened:', JSON.stringify(devices));
    if (!devices.ok) {
      console.error('FAIL: the microphone could not be opened');
      process.exit(1);
    }

    // Hold the button, then let go, the way a person would.
    const box = await mic.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await wait(2500);

    const held = await page.$eval('.mic-btn', (el) => el.className).catch(() => '');
    console.log('while held, the button is:', held);
    if (!held.includes('recording')) {
      console.error('FAIL: holding the button did not start a recording');
      process.exit(1);
    }

    await page.mouse.up();

    const deadline = Date.now() + 120000;
    let outcome = null;
    while (Date.now() < deadline) {
      outcome = await page.evaluate(() => {
        const button = document.querySelector('.mic-btn');
        const error = document.querySelector('.mic-error');
        const input = document.querySelector('.recipe-search-input');
        return {
          button: button ? button.className : '(gone)',
          error: error ? error.textContent.trim() : '',
          query: input ? input.value : '',
        };
      });
      if (outcome.error || outcome.query) break;
      await wait(1000);
    }
    console.log('outcome:', JSON.stringify(outcome));

    // The microphone must not be left open. A stream that is still live
    // would keep the device held and the recording indicator on.
    const stillLive = await page.evaluate(() =>
      (window.__streams || []).reduce(
        (count, stream) =>
          count + stream.getAudioTracks().filter((t) => t.readyState === 'live').length,
        0
      )
    );

    const problems = [];
    if (outcome && outcome.error) problems.push('it reported an error: ' + outcome.error);
    if (!outcome || (!outcome.query && !outcome.error)) {
      problems.push('it produced no transcript');
    }
    if (outcome && outcome.button.includes('recording')) {
      problems.push('the microphone was left open');
    }
    if (stillLive > 0) problems.push(stillLive + ' audio track(s) were left live');

    if (problems.length > 0) {
      console.error('FAIL: ' + problems.join('; '));
      console.error(log.slice(-2000));
      process.exit(1);
    }

    console.log('\nPASS: the microphone was opened, recorded, transcribed and released.');
    console.log('      transcript: ' + JSON.stringify(outcome.query));
    await browser.close().catch(() => {});
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err && err.message);
    console.error(log.slice(-2000));
    process.exit(1);
  } finally {
    cleanup();
  }
})();
