const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  // Connect to Electron via CDP
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = (await browser.pages())[0];

  // Wait for app shell
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  await wait(1000);

  // ---- 1. System Health Dashboard ----
  await page.screenshot({
    path: path.join(OUT_DIR, 'system-health.png'),
    deviceScaleFactor: 2,
    clip: { x: 0, y: 0, width: 1200, height: 700 }
  });

  // ---- 2. Cooking Mode ----
  // Find first recipe card and click "Start Cooking"
  const recipeCards = await page.$$('.recipe-card');
  if (recipeCards.length > 0) {
    const startBtn = await recipeCards[0].$('button:has-text("Start Cooking")');
    if (startBtn) {
      await startBtn.click();
      await page.waitForSelector('.cooking-mode-overlay', { timeout: 5000 });
      await wait(500);
      await page.screenshot({
        path: path.join(OUT_DIR, 'cooking-mode.png'),
        deviceScaleFactor: 2
      });
      // Close cooking mode
      const closeBtn = await page.$('.cooking-close-btn');
      if (closeBtn) await closeBtn.click();
    }
  }

  // ---- 3. Medication Reminder Modal ----
  const addBtn = await page.$('button:has-text("Add Reminder")');
  if (addBtn) {
    await addBtn.click();
    await page.waitForSelector('.med-modal-overlay', { timeout: 5000 });
    await wait(500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'medication-reminder.png'),
      deviceScaleFactor: 2
    });
    // Close modal
    const cancelBtn = await page.$('.med-modal button:has-text("Cancel")');
    if (cancelBtn) await cancelBtn.click();
  }

  await browser.close();
  console.log('Screenshots captured to', OUT_DIR);
  process.exit(0);
})();