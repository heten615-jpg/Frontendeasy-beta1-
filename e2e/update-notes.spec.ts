import { expect, test } from '@playwright/test';

const UPDATE_NOTES_KEY = 'frontendeasy_update_notes_seen_schema_v22_ui3';

test('project update notes are hidden in the release UI', async ({ page }) => {
  await page.addInitScript((updateNotesKey) => {
    localStorage.clear();
    localStorage.setItem('frontendeasy_onboarding_complete_v1', 'done');
    localStorage.removeItem(updateNotesKey);
  }, UPDATE_NOTES_KEY);
  await page.goto('/');

  const notes = page.getByRole('dialog', { name: 'Project update notes' });
  await expect(notes).toHaveCount(0);

  await page.getByRole('button', { name: 'View ▾' }).click();
  await expect(page.getByRole('menuitem', { name: /Project update notes/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), UPDATE_NOTES_KEY)).toBeNull();
});
