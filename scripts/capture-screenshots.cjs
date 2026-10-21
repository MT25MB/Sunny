const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Where the app exposes its DevTools endpoint (see main.cjs createWindow).
 * Overridable so the script can be pointed at a different browser in tests.
 */
const CDP_ENDPOINT = process.env.SUNNY_CDP_ENDPOINT || 'http://localhost:9222';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Opens one of the app's collapsible sections.
 *
 * The window is small, so most sections start folded away. Anything inside a
 * closed section is present in the DOM but not visible, which means a search
 * box cannot be typed into and a dialog that renders inside one never
 * becomes visible. The capture has to open a section before it can use what
 * is inside it.
 */
async function openSection(page, id) {
  const toggle = await page.$('#' + id + '-toggle');
  if (!toggle) {
    console.warn('No toggle found for section:', id);
    return false;
  }
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return true;

  await toggle.click();
  await page.waitForFunction(
    (sectionId) => {
      const button = document.querySelector('#' + sectionId + '-toggle');
      return Boolean(button) && button.getAttribute('aria-expanded') === 'true';
    },
    id,
    { timeout: 5000 }
  );
  return true;
}

/**
 * Returns the app's window.
 *
 * Playwright only exposes Browser.pages() for browsers it launched itself.
 * A browser attached over CDP keeps its pages under its default context, so
 * browser.pages is undefined and calling it threw
 * "browser.pages is not a function".
 *
 * The window can also appear a moment after the debugging endpoint starts
 * accepting connections, so poll for it rather than assuming it is there.
 */
async function getAppPage(browser) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const context of browser.contexts()) {
      const pages = context.pages();
      if (pages.length > 0) return pages[0];
    }
    await wait(500);
  }
  throw new Error('Sunny opened no page over the CDP endpoint.');
}

/**
 * Dismisses the first-run onboarding overlay if it is showing.
 *
 * A fresh CI profile has an empty localStorage, so the app opens with the
 * onboarding dialog on top of everything. It renders as a sibling of the app
 * shell, so the shell is still in the DOM -- but it would be what the
 * screenshot actually captures.
 */
async function dismissOnboarding(page) {
  const skip = await page.$('.onboarding-skip');
  if (!skip) return;
  try {
    await skip.click();
    await page.waitForSelector('.onboarding-skip', { state: 'detached', timeout: 5000 });
  } catch (err) {
    // Not fatal: the app shell is still reachable underneath.
    console.warn('Could not dismiss onboarding:', err.message);
  }
}

(async () => {
  // Connect to Electron via CDP
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const page = await getAppPage(browser);

  // Wait for app shell
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  await dismissOnboarding(page);
  await wait(1000);

  // Screenshot the real viewport. The window is 520x760, so the old fixed
  // 1200x700 clip was both larger than the window and hardcoded.
  // page.viewportSize() is null for a browser attached over CDP, so the
  // window's own inner dimensions are the reliable source.
  const size = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const viewport = {
    width: size.width || 520,
    height: size.height || 760,
  };

  // ---- 1. System Health Dashboard ----
  await page.screenshot({
    path: path.join(OUT_DIR, 'system-health.png'),
    clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
  });

  // ---- 2. Cooking Mode ----
  // Find first recipe card and click "Start Cooking". Recipe cards only
  // exist after a search, so try one and carry on if the network is down.
  try {
    await openSection(page, 'recipes');
    const searchInput = await page.$('.recipe-search-input');
    const searchButton = await page.$('.recipe-search-btn');
    if (searchInput && searchButton) {
      // TheMealDB searches by exact meal name, so 'chicken parmesan'
      // returns nothing and the app falls back to slow DuckDuckGo
      // scraping. 'chicken' matches immediately.
      await searchInput.fill('chicken');
      await searchButton.click();
      await page.waitForSelector('.recipe-card', { timeout: 30000 });
    }
  } catch (err) {
    console.warn('Recipe search unavailable, skipping cooking mode:', err.message);
  }

  const recipeCards = await page.$$('.recipe-card');
  if (recipeCards.length > 0) {
    const startBtn = await recipeCards[0].$('button:has-text("Start Cooking")');
    if (startBtn) {
      await startBtn.click();
      await page.waitForSelector('.cooking-mode-overlay', { timeout: 5000 });
      await wait(500);
      await page.screenshot({
        path: path.join(OUT_DIR, 'cooking-mode.png'),
      });
      // Close cooking mode
      const closeBtn = await page.$('.cooking-close-btn');
      if (closeBtn) await closeBtn.click();
      await page.waitForSelector('.cooking-mode-overlay', { state: 'detached', timeout: 5000 });
    }
  }

  // ---- 3. Medication Reminder Modal ----
  // The Add Reminder button sits in the section header so it stays reachable
  // while the section is closed, but the dialog it opens is inside the
  // panel, so the section has to be open before the dialog can show.
  await openSection(page, 'medication');
  const addBtn = await page.$('button:has-text("Add Reminder")');
  if (addBtn) {
    await addBtn.click();
    await page.waitForSelector('.med-modal-overlay', { timeout: 5000 });
    await wait(500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'medication-reminder.png'),
    });
    // Close modal
    const cancelBtn = await page.$('.med-modal button:has-text("Cancel")');
    if (cancelBtn) await cancelBtn.click();
    await page.waitForSelector('.med-modal-overlay', { state: 'detached', timeout: 5000 });
  }

  // For a browser attached over CDP, close() disconnects rather than killing
  // the app; the workflow stops it separately.
  await browser.close();
  console.log('Screenshots captured to', OUT_DIR);
  process.exit(0);
})().catch((err) => {
  console.error('Screenshot capture failed:', err && err.message);
  process.exit(1);
});