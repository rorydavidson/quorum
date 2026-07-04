import { test, expect } from '@playwright/test';

// Runs on both the desktop Chromium and the iPad-emulation projects.

test('public landing page renders with a sign-in call to action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Quorum Governance Portal')).toBeVisible();
  await expect(page.getByText(/sign in/i).first()).toBeVisible();
});

test('dev-auth bypass reaches the protected dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Your Spaces' })).toBeVisible();
});

test('spaces page lists seeded governance spaces', async ({ page }) => {
  await page.goto('/spaces');
  await expect(page.getByText('Board of Management').first()).toBeVisible();
});
