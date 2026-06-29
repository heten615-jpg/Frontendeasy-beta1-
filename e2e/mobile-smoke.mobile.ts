import { expect, test, type Page } from '@playwright/test';

async function openSeededEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('frontendeasy_onboarding_complete_v1', 'done');
    localStorage.setItem('frontendeasy_update_notes_seen_schema_v22_ui3', 'done');
  });
  await page.goto('/');
  await expect(page.locator('.frame').first()).toBeVisible({ timeout: 15_000 });
}

test('mobile browser smoke keeps core editor chrome usable', async ({ page }) => {
  await openSeededEditor(page);

  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.left-panel')).toBeVisible();
  await expect(page.locator('.right-panel-shell')).toBeHidden();
  await expect(page.locator('.bottom-toolbar')).toBeVisible();

  const columns = await page.locator('.app-shell').evaluate(node => getComputedStyle(node).gridTemplateColumns);
  expect(columns.trim().split(/\s+/)).toHaveLength(2);

  await page.getByRole('button', { name: 'Frame tool (F)' }).click();
  await expect(page.getByRole('button', { name: 'Frame tool (F)' })).toHaveAttribute('aria-pressed', 'true');

  const button = page.locator('.frame').first().locator('.element.is-button').first();
  await button.click();
  await expect(button).toHaveClass(/selected/);
});
