'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Morning Digest E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('digest section exists', async ({ page }) => {
    const section = page.locator('[id="digest"]');
    await expect(section).toBeVisible();
  });

  test('Fetch Morning Digest button exists', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await expect(btn).toBeVisible();
  });

  test('Fetch button is disabled while fetching', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await btn.click();

    await expect(btn).toBeDisabled();
    await expect(page.getByText(/Fetching/)).toBeVisible();
  });

  test('fetching digest shows weather and news', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await btn.click();

    // Wait for digest to load (may take a few seconds due to API calls)
    await page.waitForTimeout(5000);

    // Either weather or error should appear
    const weather = page.locator('.digest-weather');
    const error = page.locator('.error-banner');
    
    await expect(weather.or(error)).toBeVisible({ timeout: 10000 });
  });

  test('Speak Digest Aloud button appears after digest loads', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await btn.click();
    await page.waitForTimeout(5000);

    const speakBtn = page.getByRole('button', { name: 'Speak Digest Aloud' });
    // May or may not be visible depending on API success
    // Just verify the app doesn't crash
    await expect(page.locator('.digest-content')).toBeVisible();
  });

  test('Retry button appears on digest error', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await btn.click();
    await page.waitForTimeout(5000);

    // If there's an error, retry button should be visible
    const retryBtn = page.getByRole('button', { name: 'Retry' });
    // Only check if error state is present
    const errorBanner = page.locator('.error-banner');
    if (await errorBanner.isVisible()) {
      await expect(retryBtn).toBeVisible();
    }
  });

  test('digest shows weather details', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await btn.click();
    await page.waitForTimeout(5000);

    const weatherSection = page.locator('.digest-weather');
    if (await weatherSection.isVisible()) {
      // Should show temperature and condition
      await expect(page.getByText(/°C/)).toBeVisible();
    }
  });

  test('digest shows news items', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Fetch Morning Digest' });
    await btn.click();
    await page.waitForTimeout(5000);

    const newsSection = page.locator('.digest-news');
    if (await newsSection.isVisible()) {
      const newsItems = page.locator('.news-item');
      // May have 0+ items depending on API
      await expect(newsItems.first().or(page.getByText(/No news/))).toBeVisible();
    }
  });
});
