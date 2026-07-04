import { test, expect } from '@playwright/test';

// Desktop-only (the iPad project restricts itself to smoke.spec.ts).

test('lists documents and opens then closes the PDF viewer', async ({ page }) => {
  await page.goto('/spaces/board/documents');

  // Mock mode serves sample files regardless of the (fake) Drive folder id.
  const fileName = page.getByText('Board Meeting Agenda').first();
  await expect(fileName).toBeVisible();

  // Clicking a viewable file opens the in-portal PDF viewer (a dialog).
  await fileName.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Escape closes it (keyboard handler in PDFViewer).
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('official records filter narrows the list', async ({ page }) => {
  await page.goto('/spaces/board/documents');
  await expect(page.getByText('Board Meeting Agenda').first()).toBeVisible();

  await page.getByRole('button', { name: /official records only/i }).first().click();

  // The ordinary document is filtered out; an Official Record remains.
  await expect(page.getByText('Board Meeting Agenda')).toHaveCount(0);
  await expect(page.getByText(/Official Record/i).first()).toBeVisible();
});
