import { expect, test } from '@playwright/test';

test.describe('demo mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('frontendeasy_onboarding_complete_v1', 'done');
      localStorage.setItem('frontendeasy_update_notes_seen_schema_v22_ui3', 'done');
    });
  });

  test('opens showcase project, shows demo banner, and keeps normal route unchanged', async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.locator('.frame').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.frame')).toHaveCount(3);
    await expect(page.getByText('Демо-режим — изменения сохраняются только в этом браузере')).toBeVisible();
    await expect(page.getByRole('button', { name: /↓ Frame|Export current page/i }).first()).toBeEnabled();

    await page.goto('/');
    await expect(page.locator('.frame').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Демо-режим — изменения сохраняются только в этом браузере')).toHaveCount(0);
  });
});
