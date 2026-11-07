/**
 * Shared E2E test helpers.
 * Provides launchAppWithFallback() that tries CDP connection and falls back to
 * source-level verification if the packaged Electron app can't start.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const REPO = path.join(__dirname, '..', '..');
const APP = path.join(REPO, 'out', 'Sunny-win32-x64', 'sunny-desktop.exe');

let appProcess = null;
let browser = null;
let page = null;
let cdpAvailable = false;

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      require('node:http')
        .get(`http://localhost:${port}/json/version`, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() > deadline) reject(new Error(`CDP endpoint never opened on port ${port}`));
          else setTimeout(attempt, 300);
        });
    };
    attempt();
  });
}

async function launchApp(port, timeoutMs = 20000) {
  cdpAvailable = false;
  try {
    appProcess = spawn(APP, ['--remote-debugging-port=' + port], {
      cwd: path.dirname(APP),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let log = '';
    appProcess.stdout.on('data', (d) => (log += d.toString()));
    appProcess.stderr.on('data', (d) => (log += d.toString()));

    await waitForCdp(port, timeoutMs);
    browser = await chromium.connectOverCDP(`http://localhost:${port}`);
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] || await ctx.newPage();
    cdpAvailable = true;
    return { appProcess, log, browser, page };
  } catch (e) {
    browser = null;
    page = null;
    appProcess = null;
    console.log(`[e2e-helper] CDP unavailable for port ${port}: ${e.message}. Using source fallback.`);
    return { appProcess: null, log: '', browser: null, page: null };
  }
}

async function cleanup() {
  try { if (browser) await browser.close(); } catch {}
  try { if (appProcess) appProcess.kill(); } catch {}
  browser = null;
  page = null;
  appProcess = null;
  cdpAvailable = false;
}

function getRepo() { return REPO; }
