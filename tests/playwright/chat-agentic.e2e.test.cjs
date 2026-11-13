'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Chat & Agentic Desktop Control E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('activity log section exists', async ({ page }) => {
    const section = page.locator('[id="activity"]');
    await expect(section).toBeVisible();
  });

  test('chat input field exists with placeholder', async ({ page }) => {
    const input = page.locator('input[placeholder*="command"]');
    await expect(input).toBeVisible();
  });

  test('send button is disabled when chat input is empty', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Send command' });
    await expect(btn).toBeDisabled();
  });

  test('typing in chat enables send button', async ({ page }) => {
    const input = page.locator('input[placeholder*="command"]');
    await input.fill('open calculator');

    const btn = page.getByRole('button', { name: 'Send command' });
    await expect(btn).toBeEnabled();
  });

  test('submitting chat message adds user message to activity log', async ({ page }) => {
    const input = page.locator('input[placeholder*="command"]');
    await input.fill('test message');

    const form = page.locator('form.chat-input-form');
    await form.submit();

    await page.waitForTimeout(1000);

    const userMsg = page.getByText('test message');
    await expect(userMsg).toBeVisible();
  });

  test('chat shows system welcome message', async ({ page }) => {
    const welcomeMsg = page.getByText(/Welcome to Sunny/);
    await expect(welcomeMsg).toBeVisible();
  });

  test('show chat toggle hides/shows activity section', async ({ page }) => {
    // Initially activity section is visible
    const activitySection = page.locator('[id="activity"]');
    await expect(activitySection).toBeVisible();

    // Click the chat show/hide button in header
    const chatToggle = page.getByRole('button', { name: /Hide chat history/ });
    await expect(chatToggle).toBeVisible();
    await chatToggle.click();

    await expect(activitySection).not.toBeVisible();

    // Toggle back
    await chatToggle.click();
    await expect(activitySection).toBeVisible();
  });

  test('decide_action via chat does not crash on empty input', async ({ page }) => {
    const input = page.locator('input[placeholder*="command"]');
    await input.fill('');
    await input.blur();

    const btn = page.getByRole('button', { name: 'Send command' });
    await expect(btn).toBeDisabled();
  });

  test('chat processes commands without throwing errors', async ({ page }) => {
    const input = page.locator('input[placeholder*="command"]');
    await input.fill('check system health');

    const form = page.locator('form.chat-input-form');
    await form.submit();

    // Should not show error
    await page.waitForTimeout(2000);
    const errorMsg = page.getByText(/Error:/);
    await expect(errorMsg).not.toBeVisible();
  });
});
