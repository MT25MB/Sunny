'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Window Controls E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('window chrome buttons exist in header', async ({ page }) => {
    const pinBtn = page.getByRole('button', { name: /Keep Sunny on top/ });
    await expect(pinBtn).toBeVisible();

    const fillBtn = page.getByRole('button', { name: /Make Sunny fill the screen/ });
    await expect(fillBtn).toBeVisible();

    const minimizeBtn = page.getByRole('button', { name: 'Minimize Sunny' });
    await expect(minimizeBtn).toBeVisible();

    const closeBtn = page.getByRole('button', { name: 'Close Sunny' });
    await expect(closeBtn).toBeVisible();
  });

  test('pin button toggles always-on-top', async ({ page }) => {
    const pinBtn = page.getByRole('button', { name: /Keep Sunny on top/ });
    await expect(pinBtn).toBeVisible();
    await pinBtn.click();

    // Button should show active state
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');

    // Click again to toggle off
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('fill screen button toggles window fill', async ({ page }) => {
    const fillBtn = page.getByRole('button', { name: /Make Sunny fill the screen/ });
    await expect(fillBtn).toBeVisible();
    await fillBtn.click();

    // Button text should change to "Restore the Sunny window size"
    await expect(page.getByRole('button', { name: /Restore the Sunny window size/ })).toBeVisible();
  });

  test('minimize button exists', async ({ page }) => {
    const minimizeBtn = page.getByRole('button', { name: 'Minimize Sunny' });
    await expect(minimizeBtn).toBeVisible();
  });

  test('close button exists', async ({ page }) => {
    const closeBtn = page.getByRole('button', { name: 'Close Sunny' });
    await expect(closeBtn).toBeVisible();
  });

  test('footer links exist', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    const homeLink = page.getByRole('link', { name: 'Home' });
    await expect(homeLink).toBeVisible();

    const githubLink = page.getByRole('link', { name: 'GitHub' });
    await expect(githubLink).toBeVisible();

    const releasesLink = page.getByRole('link', { name: 'Releases' });
    await expect(releasesLink).toBeVisible();
  });

  test('Quit Sunny button exists in footer', async ({ page }) => {
    const quitBtn = page.getByRole('button', { name: 'Quit Sunny' });
    await expect(quitBtn).toBeVisible();
  });

  test('app title and subtitle are visible', async ({ page }) => {
    await expect(page.getByText('Sunny')).toBeVisible();
    await expect(page.getByText('Your Desktop Companion')).toBeVisible();
  });

  test('mascot logo is visible', async ({ page }) => {
    const logo = page.locator('img.app-logo');
    await expect(logo).toBeVisible();
  });

  test('browser preview banner shows when not in Electron', async ({ page }) => {
    // This test runs in Playwright (browser context), not Electron
    // So the browser preview banner should be visible
    const banner = page.locator('.browser-preview-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByText(/You are previewing Sunny in a web browser/)).toBeVisible();
  });

  test('browser preview banner has download link', async ({ page }) => {
    const banner = page.locator('.browser-preview-banner');
    await expect(banner).toBeVisible();

    const downloadLink = page.getByRole('link', { name: 'GitHub Releases' });
    await expect(downloadLink).toBeVisible();
  });
});
