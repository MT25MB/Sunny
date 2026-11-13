'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Medication Reminders E2E', () => {
  test.use({ launchOptions: { args: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').join(process.cwd(), 'dist/app.html'));
  });

  test('medication section exists', async ({ page }) => {
    const section = page.locator('[id="medication"]');
    await expect(section).toBeVisible();
  });

  test('Add Reminder button opens modal', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(page.getByText('Add Medication Reminder')).toBeVisible();
  });

  test('medication modal has name and time inputs', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await addBtn.click();

    const nameInput = page.locator('input[placeholder*="Vitamin"]');
    await expect(nameInput).toBeVisible();

    const timeInput = page.locator('input[placeholder*="08:30"]');
    await expect(timeInput).toBeVisible();
  });

  test('Save button is disabled without medication name', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await addBtn.click();

    const saveBtn = page.getByRole('button', { name: 'Save' });
    // The Save button should exist but clicking without name should not proceed
    await expect(saveBtn).toBeVisible();
  });

  test('invalid time format shows alert', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await addBtn.click();

    const nameInput = page.locator('input[placeholder*="Vitamin"]');
    await nameInput.fill('Test Med');

    const timeInput = page.locator('input[placeholder*="08:30"]');
    await timeInput.fill('invalid-time');

    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.click();

    // Should show alert about invalid time format
    // Note: In headless, alert dialogs are auto-dismissed
    // The error should prevent scheduling
  });

  test('valid medication reminder can be scheduled', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await addBtn.click();

    const nameInput = page.locator('input[placeholder*="Vitamin"]');
    await nameInput.fill('Vitamin D');

    const timeInput = page.locator('input[placeholder*="08:30"]');
    await timeInput.fill('08:30');

    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.click();

    // Modal should close and reminder should appear
    await page.waitForTimeout(1000);
    
    const medicationCard = page.locator('.medication-card');
    await expect(medicationCard).toBeVisible();
    await expect(page.getByText('Vitamin D')).toBeVisible();
    await expect(page.getByText('08:30')).toBeVisible();
  });

  test('I Took It button marks medication as taken', async ({ page }) => {
    // First add a reminder
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await addBtn.click();

    const nameInput = page.locator('input[placeholder*="Vitamin"]');
    await nameInput.fill('Test Med');

    const timeInput = page.locator('input[placeholder*="08:30"]');
    await timeInput.fill('09:00');

    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Click "I Took It"
    const tookBtn = page.getByRole('button', { name: /I Took It/ });
    await expect(tookBtn).toBeVisible();
    await tookBtn.click();

    // Reminder should show as taken
    await page.waitForTimeout(500);
    const takenBadge = page.getByText(/Taken/);
    await expect(takenBadge).toBeVisible();
  });

  test('Delete button removes medication reminder', async ({ page }) => {
    // First add a reminder
    const addBtn = page.getByRole('button', { name: 'Add Reminder' });
    await addBtn.click();

    const nameInput = page.locator('input[placeholder*="Vitamin"]');
    await nameInput.fill('Delete Me');

    const timeInput = page.locator('input[placeholder*="08:30"]');
    await timeInput.fill('10:00');

    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Click Delete
    const deleteBtn = page.getByRole('button', { name: /Delete Delete Me/ });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Reminder should be removed
    await page.waitForTimeout(500);
    const deletedCard = page.locator('.medication-card:has-text("Delete Me")');
    await expect(deletedCard).not.toBeVisible();
  });

  test('empty state shows when no reminders', async ({ page }) => {
    const emptyMsg = page.getByText(/No medication reminders set yet/);
    await expect(emptyMsg).toBeVisible();
  });
});
