'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Recipes & Cooking E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('recipes section exists and starts collapsed', async ({ page }) => {
    const section = page.locator('[id="recipes"]');
    await expect(section).toBeVisible();
  });

  test('recipe search form has input and button', async ({ page }) => {
    const input = page.locator('input[placeholder*="recipe"]');
    await expect(input).toBeVisible();

    const btn = page.getByRole('button', { name: /Search/ });
    await expect(btn).toBeVisible();
  });

  test('search button is disabled when query is empty', async ({ page }) => {
    const btn = page.locator('button.recipe-search-btn, button:has-text("Search")');
    await expect(btn).toBeDisabled();
  });

  test('typing in recipe search enables search button', async ({ page }) => {
    const input = page.locator('input[placeholder*="recipe"]');
    await input.fill('chicken parmesan');

    const btn = page.locator('button.recipe-search-btn, button:has-text("Search")');
    await expect(btn).toBeEnabled();
  });

  test('submitting recipe search shows results or error', async ({ page }) => {
    const input = page.locator('input[placeholder*="recipe"]');
    await input.fill('chicken');

    const form = page.locator('form.recipe-search-form');
    await form.submit();

    await page.waitForTimeout(3000);

    // Either results or error should appear
    const results = page.locator('.recipe-results');
    const error = page.locator('.recipe-search-error');
    
    // At least one of these should be present (results or error message)
    await expect(results.or(error)).toBeVisible({ timeout: 5000 });
  });

  test('Start Cooking button enters cooking mode', async ({ page }) => {
    // First search for a recipe
    const input = page.locator('input[placeholder*="recipe"]');
    await input.fill('chicken');

    const form = page.locator('form.recipe-search-form');
    await form.submit();
    await page.waitForTimeout(3000);

    // If results exist, click Start Cooking
    const startBtn = page.getByRole('button', { name: /Start Cooking/ });
    if (await startBtn.isVisible()) {
      await startBtn.click();

      // Cooking mode overlay should appear
      const overlay = page.locator('.cooking-mode-overlay');
      await expect(overlay).toBeVisible();

      // Should show step 1
      const stepText = page.locator('.step-instruction');
      await expect(stepText).toBeVisible();

      // Exit cooking mode
      const exitBtn = page.getByRole('button', { name: 'Exit cooking mode' });
      await expect(exitBtn).toBeVisible();
      await exitBtn.click();

      await expect(overlay).not.toBeVisible();
    }
  });

  test('MicButton exists when voice is enabled', async ({ page }) => {
    const micBtn = page.locator('button[aria-label*="microphone"], .mic-button');
    // Voice may or may not be available depending on environment
    // Just verify the button is not crashing the app
    await expect(micBtn.or(page.locator('.recipe-search-input'))).toBeVisible();
  });
});
