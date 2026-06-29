import { expect, test } from '@playwright/test';

test('onboarding reflects the current workspace shell and can be restarted', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto('/');

  const dialog = page.getByRole('dialog', { name: 'Getting started' });
  const expectedTitles = [
    'Start from the workspace shell',
    'Pages, layers, and libraries',
    'Create from the floating toolbar',
    'Inspect, search, and reuse styles',
    'Choose the right working mode',
    'Preflight before export',
    'Save versions and sync safely',
  ];

  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('heading', { name: expectedTitles[0] })).toBeVisible();
  await expect(dialog).toContainText('Cmd/Ctrl+K');
  await expect(dialog).toContainText(`1 / ${expectedTitles.length}`);
  await expect(page.locator('.tour-spotlight')).toBeVisible();

  for (let index = 1; index < expectedTitles.length; index += 1) {
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: expectedTitles[index] })).toBeVisible();
    await expect(dialog).toContainText(`${index + 1} / ${expectedTitles.length}`);
  }

  await dialog.getByRole('button', { name: 'Start designing' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('frontendeasy_onboarding_complete_v1'))).toBe('done');

  await page.getByRole('button', { name: 'View ▾' }).click();
  await page.getByRole('menuitem', { name: /Restart onboarding/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: expectedTitles[0] })).toBeVisible();
});
