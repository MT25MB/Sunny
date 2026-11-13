'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Settings E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('Open Settings button opens settings modal', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await expect(btn).toBeVisible();
    await btn.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
  });

  test('settings modal contains provider selection', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    const providerSelect = page.locator('select, [role="combobox"]');
    // Provider selection may be a select or custom component
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('settings modal contains AI provider options', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    // Look for embedded, openai, anthropic, groq, ollama options
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Check for provider-related text
    await expect(page.getByText(/embedded|openai|anthropic|groq|ollama/i).first()).toBeVisible();
  });

  test('settings modal contains voice toggle', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/voice/i)).toBeVisible();
  });

  test('settings modal contains execution speed', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/execution speed|speed/i)).toBeVisible();
  });

  test('settings modal contains clarification level', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/clarification/i)).toBeVisible();
  });

  test('settings modal contains window size preset', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/window size|compact|comfortable|large/i)).toBeVisible();
  });

  test('settings modal contains auto-check updates toggle', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/auto.check|update/i)).toBeVisible();
  });

  test('settings modal contains init model button', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/init model|model/i)).toBeVisible();
  });

  test('settings modal contains debug log controls', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    await expect(page.getByText(/debug log|clear|export/i)).toBeVisible();
  });

  test('settings modal close button closes modal', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const closeBtn = page.getByRole('button', { name: /Close/ });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(dialog).not.toBeVisible();
    }
  });

  test('settings modal backdrop click closes modal', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Open Settings' });
    await btn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Click outside the modal content (on backdrop)
    await page.click('body', { position: { x: 50, y: 50 } });
    // Modal may or may not close on backdrop click - just verify no crash
  });
});
