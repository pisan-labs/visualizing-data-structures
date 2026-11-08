import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function push(page: Page, values: string) {
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: 'Push', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/stack-list/');
  await expect(page.getByRole('heading', { name: 'Stack (linked list)' })).toBeVisible();
});

test('push links a node in front of the top', async ({ page }) => {
  await fast(page);
  await push(page, '10 20 30');
  await expect(narration(page)).toContainText('top = node. 30 is on top', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /From the top: 30, 20, 10, then null/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('node.next = top: the new node points at 20');
  await expect(page.locator('.code li.active')).toContainText('node.next = top');
});

test('pop leaves the old node as garbage', async ({ page }) => {
  await fast(page);
  await push(page, '1 2');
  await expect(narration(page)).toContainText('2 is on top', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Pop', exact: true }).click();
  await expect(narration(page)).toContainText('Return x = 2', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('top = top.next: top moves to 1');
  await expect(stage(page).getByText('garbage')).toBeVisible();
});

test('popping an empty stack underflows', async ({ page }) => {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Underflow on an empty stack' })
    .getByRole('button', { name: 'Load' })
    .click();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '3. pop()' }).click();
  await expect(narration(page)).toContainText('Stack underflow');
  await expect(stage(page).getByText('null', { exact: true })).toBeVisible();
});

test('the garbage step has no axe violations in dark mode', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await fast(page);
  await push(page, '5 6');
  await expect(narration(page)).toContainText('6 is on top', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Pop', exact: true }).click();
  await expect(narration(page)).toContainText('Return x = 6', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
