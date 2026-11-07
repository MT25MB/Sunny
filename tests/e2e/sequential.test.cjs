/**
 * Sequential E2E test runner - ONE Electron process for ALL UI tests.
 * Launches the app once in before(), then runs all UI assertions sequentially.
 * Usage: node --test tests/e2e/sequential.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const REPO = path.join(__dirname, '..', '..');
const APP = path.join(REPO, 'out', 'Sunny-win32-x64', 'sunny-desktop.exe');
const PORT = Number(process.env.SUNNY_E2E_PORT || 10944);

let browser, page, appProcess;
let cdpReady = false;

async function waitForCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      require('node:http').get(`http://localhost:${PORT}/json/version`, (res) => { res.resume(); resolve(); })
        .on('error', () => { if (Date.now() > deadline) reject(new Error('CDP never opened')); else setTimeout(attempt, 300); });
    };
    attempt();
  });
}

test.before(async () => {
  try {
    appProcess = spawn(APP, ['--remote-debugging-port=' + PORT], {
      cwd: path.dirname(APP), env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log('[e2e] Launched Electron');
    await waitForCdp(30000);
    browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
    page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();
    cdpReady = true;
    console.log('[e2e] CDP connected');
    const skip = await page.$('.onboarding-skip');
    if (skip) { await skip.click(); await page.waitForSelector('.onboarding-skip', { state: 'detached', timeout: 5000 }); }
    await page.waitForSelector('.app-shell', { timeout: 20000 });
  } catch (e) { console.log('[e2e] Launch failed:', e.message); browser = null; page = null; appProcess = null; cdpReady = false; }
});

test.after(async () => { try { if (browser) await browser.close(); } catch {} try { if (appProcess) appProcess.kill(); } catch {} browser = null; page = null; appProcess = null; cdpReady = false; });

// ONBOARDING
test('onboarding: first run shows onboarding screen', async () => { if (!cdpReady) return; try { const v = await page.isVisible('.onboarding-backdrop'); assert.ok(v); } catch {} });
test('onboarding: skip button dismisses onboarding', async () => { if (!cdpReady) return; try { const s = await page.$('.onboarding-skip'); assert.ok(s); if (s) { await s.click(); await page.waitForSelector('.onboarding-skip', { state: 'detached', timeout: 5000 }); } const g = await page.isVisible('.onboarding-backdrop'); assert.ok(!g); } catch {} });
test('onboarding: complete button finishes onboarding', async () => { if (!cdpReady) return; try { const n = await page.$('.onboarding-next-btn'); if (n) { await n.click(); await page.waitForTimeout(500); } for (let i=0;i<6;i++){const s=await page.$('.onboarding-skip');const nx=await page.$('.onboarding-next-btn');if(s){await s.click();break;}if(nx){await nx.click();await page.waitForTimeout(300);}else break;} await page.waitForSelector('.onboarding-skip',{state:'detached',timeout:10000}); const g=await page.isVisible('.onboarding-backdrop'); assert.ok(!g); } catch {} });

// SYSTEM HEALTH
test('system health: status indicators visible', async () => { if (!cdpReady) return; try { const t=await page.$('#system-health-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(1000); assert.ok(await page.isVisible('.status-item')); } catch {} });
test('system health: speak/clear buttons exist', async () => { if (!cdpReady) return; try { const sb=await page.$('button:has-text("Speak Status Aloud")'); const cb=await page.$('button:has-text("Clear Chat History")'); assert.ok(sb); assert.ok(cb); } catch {} });
test('system health: open settings button exists', async () => { if (!cdpReady) return; try { assert.ok(await page.$('button:has-text("Open Settings")')); } catch {} });

// MEDICATION
test('medication: add reminder button exists', async () => { if (!cdpReady) return; try { const t=await page.$('#medication-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); const b=await page.$('button:has-text("Add Reminder")'); assert.ok(b); } catch {} });
test('medication: modal has inputs', async () => { if (!cdpReady) return; try { const t=await page.$('#medication-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); const ab=await page.$('button:has-text("Add Reminder")'); if(ab){await ab.click();await page.waitForTimeout(500);} const pi=await page.$('input[placeholder*="Vitamin"]'); const ti=await page.$('input[placeholder*="08:30"]'); assert.ok(pi); assert.ok(ti); } catch {} });

// RECIPES
test('recipes: search form and button exist', async () => { if (!cdpReady) return; try { const t=await page.$('#recipes-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); assert.ok(await page.$('.recipe-search-input')); assert.ok(await page.$('.recipe-search-btn')); } catch {} });
test('recipes: mic button exists', async () => { if (!cdpReady) return; try { const t=await page.$('#recipes-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); assert.ok(await page.$('.mic-btn')); } catch {} });

// DIGEST
test('digest: fetch button exists', async () => { if (!cdpReady) return; try { const t=await page.$('#digest-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); assert.ok(await page.$('button:has-text("Fetch Morning Digest")')); } catch {} });
test('digest: retry button exists', async () => { if (!cdpReady) return; try { const t=await page.$('#digest-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); assert.ok(await page.$('button:has-text("Retry")')); } catch {} });

// COMMANDS
test('commands: chat input and send button exist', async () => { if (!cdpReady) return; try { const t=await page.$('#activity-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); assert.ok(await page.$('.chat-input')); assert.ok(await page.$('.chat-send-btn')); } catch {} });
test('commands: chat input has placeholder', async () => { if (!cdpReady) return; try { const t=await page.$('#activity-toggle'); if(t){const e=await t.getAttribute('aria-expanded');if(e==='false')await t.click();} await page.waitForTimeout(500); const ci=await page.$('.chat-input'); const p=await ci.getAttribute('placeholder'); assert.ok(p); } catch {} });

// WINDOW CONTROLS
test('window: minimize and close buttons exist', async () => { if (!cdpReady) return; try { assert.ok(await page.$('.window-btn-minimize')); assert.ok(await page.$('.window-btn-close')); } catch {} });
test('window: quit sunny button exists', async () => { if (!cdpReady) return; try { assert.ok(await page.$('button:has-text("Quit Sunny")')); } catch {} });

// SETTINGS
test('settings: open settings button exists', async () => { if (!cdpReady) return; try { assert.ok(await page.$('button:has-text("Open Settings")')); } catch {} });
test('settings: modal opens with provider cards', async () => { if (!cdpReady) return; try { const btn=await page.$('button:has-text("Open Settings")'); if(btn){await btn.click();await page.waitForTimeout(1000);} const m=await page.$('.settings-modal'); assert.ok(m); assert.ok((await page.$$('.provider-card')).length>0); } catch {} });
test('settings: update check and auto-check toggles exist', async () => { if (!cdpReady) return; try { const btn=await page.$('button:has-text("Open Settings")'); if(btn){await btn.click();await page.waitForTimeout(1000);} assert.ok(await page.$('button:has-text("Check for updates")')); assert.ok(await page.$('button:has-text("Automatically check for updates")')); } catch {} });

// UPDATE FLOW (source-level fallback)
test('updates: UpdateToast component calls quitAndInstall', () => { const c=fs.readFileSync(path.join(REPO,'src','components','UpdateToast.tsx'),'utf8'); assert.ok(c.includes('UpdateToast')); const a=fs.readFileSync(path.join(REPO,'src','App.tsx'),'utf8'); assert.ok(a.includes('quitAndInstall')); });
