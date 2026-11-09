import { expect, test, type Page } from '@playwright/test';
import { opButton } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, button: string, text?: string) {
  if (text !== undefined) await page.getByLabel('Value').fill(text);
  await (await opButton(page, button)).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/circular-linked-list/');
  await expect(page.getByRole('heading', { name: 'Circular linked list' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('one node points at itself', async ({ page }) => {
  await op(page, 'Insert at front', '7');
  await expect(narration(page)).toContainText('7 is at the front', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /7 → back to 7\. tail → 7/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('new.next = new');
});

test('insert at the back moves tail onto the new node', async ({ page }) => {
  await op(page, 'Insert at back', '10 20 30');
  await expect(narration(page)).toContainText('30 is at the back', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /10 → 20 → 30 → back to 10\. tail → 30/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('That is the whole trick');
});

test('rotate and traverse once around', async ({ page }) => {
  await op(page, 'Insert at back', '1 2 3');
  await expect(narration(page)).toContainText('3 is at the back', { timeout: 10_000 });
  await op(page, 'Rotate');
  await expect(stage(page)).toHaveAttribute('aria-label', /2 → 3 → 1 → back to 2/, {
    timeout: 10_000,
  });
  await op(page, 'Traverse');
  await expect(narration(page)).toContainText('each once: 2 3 1', { timeout: 10_000 });
  await expect(page.locator('.vars')).toContainText('2 3 1');
});

test('removing from an empty list is an error the narration explains', async ({ page }) => {
  await op(page, 'Remove front');
  await expect(narration(page)).toContainText('the list is empty', { timeout: 10_000 });
  await expect(page.locator('.narration')).toHaveClass(/error/);
});
