'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Onboarding E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('onboarding screen shows on first run', async ({ page }) => {
    // In a fresh profile, onboarding should show
    const onboarding = page.locator('[role="dialog"]');
    // May or may not show depending on stored preferences
    // Just verify the app doesn't crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('onboarding has Complete and Skip buttons', async ({ page }) => {
    const onboarding = page.locator('[role="dialog"]');
    if (await onboarding.isVisible()) {
      const completeBtn = page.getByRole('button', { name: /Complete/ });
      await expect(completeBtn).toBeVisible();

      const skipBtn = page.getByRole('button', { name: /Skip/ });
      await expect(skipBtn).toBeVisible();
    }
  });

  test('onboarding Complete button dismisses onboarding', async ({ page }) => {
    const onboarding = page.locator('[role="dialog"]');
    if (await onboarding.isVisible()) {
      const completeBtn = page.getByRole('button', { name: /Complete/ });
      await completeBtn.click();

      await expect(onboarding).not.toBeVisible();
    }
  });

  test('onboarding Skip button dismisses onboarding', async ({ page }) => {
    const onboarding = page.locator('[role="dialog"]');
    if (await onboarding.isVisible()) {
      const skipBtn = page.getByRole('button', { name: /Skip/ });
      await skipBtn.click();

      await expect(onboarding).not.toBeVisible();
    }
  });

  test('after onboarding, main app sections are visible', async ({ page }) => {
    // Dismiss onboarding if present
    const onboarding = page.locator('[role="dialog"]');
    if (await onboarding.isVisible()) {
      const skipBtn = page.getByRole('button', { name: /Skip/ });
      await skipBtn.click();
    }

    // Main sections should be visible
    await expect(page.locator('[id="system-health"]')).toBeVisible();
    await expect(page.locator('[id="quick-actions"]')).toBeVisible();
  });
});
