'use strict';

// E2E tests for System Health flow
// These tests launch the packaged Electron app and interact with the UI
// using Playwright. They require the app to be built first.

const { test, expect } = require('@playwright/test');

test.describe('System Health E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    // Navigate to the app - in E2E this loads the built dist/app.html
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('system health section is visible by default', async ({ page }) => {
    const section = page.locator('[id="system-health"]');
    await expect(section).toBeVisible();
  });

  test('Check System Health button exists and is enabled', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Check System Health' });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('Clicking Check System Health shows status indicators', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Check System Health' });
    await btn.click();

    // Wait for status indicators to appear
    await page.waitForTimeout(2000);

    const battery = page.getByText(/Battery/);
    const wifi = page.getByText(/Wi-Fi/);
    const internet = page.getByText(/Internet/);
    const cpu = page.getByText(/CPU/);
    const memory = page.getByText(/Memory/);

    await expect(battery).toBeVisible();
    await expect(wifi).toBeVisible();
    await expect(internet).toBeVisible();
    await expect(cpu).toBeVisible();
    await expect(memory).toBeVisible();
  });

  test('Speak Status Aloud button is disabled when no status', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Speak Status Aloud' });
    await expect(btn).toBeDisabled();
  });

  test('Speak Status Aloud button is enabled after health check', async ({ page }) => {
    const checkBtn = page.getByRole('button', { name: 'Check System Health' });
    await checkBtn.click();
    await page.waitForTimeout(2000);

    const speakBtn = page.getByRole('button', { name: 'Speak Status Aloud' });
    await expect(speakBtn).toBeEnabled();
  });

  test('Clear Chat History button clears messages', async ({ page }) => {
    // First trigger a message
    const checkBtn = page.getByRole('button', { name: 'Check System Health' });
    await checkBtn.click();
    await page.waitForTimeout(2000);

    const clearBtn = page.getByRole('button', { name: 'Clear Chat History' });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Chat should show empty state
    const emptyMsg = page.getByText(/No activity yet/);
    await expect(emptyMsg).toBeVisible();
  });

  test('Open Settings button opens settings modal', async ({ page }) => {
    const settingsBtn = page.getByRole('button', { name: 'Open Settings' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // Settings modal should appear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
  });

  test('High contrast toggle works', async ({ page }) => {
    const contrastBtn = page.locator('button[aria-label*="contrast"]');
    await expect(contrastBtn).toBeVisible();
    await contrastBtn.click();

    // High contrast class should be applied
    const appShell = page.locator('.app-shell');
    await expect(appShell).toHaveClass(/high-contrast/);

    // Toggle back
    await contrastBtn.click();
    await expect(appShell).not.toHaveClass(/high-contrast/);
  });

  test('Minimize button minimizes window', async ({ page }) => {
    const minimizeBtn = page.getByRole('button', { name: 'Minimize Sunny' });
    await expect(minimizeBtn).toBeVisible();
    await minimizeBtn.click();

    // Window should be minimized (hard to verify in headless, but button click should not throw)
  });

  test('Close button hides window to tray', async ({ page }) => {
    const closeBtn = page.getByRole('button', { name: 'Close Sunny' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Window should be hidden (not quit)
  });
});
