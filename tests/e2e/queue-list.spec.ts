import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function enqueue(page: Page, values: string) {
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: 'Enqueue', exact: true }).click();
}

async function openExample(page: Page, title: string, jumpTo: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: jumpTo }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/queue-list/');
  await expect(page.getByRole('heading', { name: 'Queue (linked list)' })).toBeVisible();
});

test('enqueue joins at the tail, dequeue leaves from the head', async ({ page }) => {
  await fast(page);
  await enqueue(page, '10 20 30');
  await expect(narration(page)).toContainText('30 is at the back of the queue', {
    timeout: 10_000,
  });
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /From head to tail: 10, 20, 30, then null/,
  );
  await page.getByRole('button', { name: 'Dequeue', exact: true }).click();
  await expect(narration(page)).toContainText('Return x = 10', { timeout: 10_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /From head to tail: 20, 30, then null/);
});

test('the first enqueue points head at the new node', async ({ page }) => {
  await openExample(page, 'The first enqueue sets both pointers', '1. enqueue(5)');
  await expect(narration(page)).toContainText('head and tail point at the same node');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('head = node');
  await expect(page.locator('.code li.active')).toContainText('head = node');
});

test('the last dequeue clears tail', async ({ page }) => {
  await openExample(page, 'The last dequeue clears tail too', '2. dequeue()');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('set tail = null as well');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('But tail still points at the old node');
  // Only head is null at this point (the tail's "null" from the next step fades out).
  await expect(stage(page).getByText('null', { exact: true })).toHaveCount(1);
});

test('the one-node dequeue step has no axe violations in high contrast', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
  await openExample(page, 'The last dequeue clears tail too', '2. dequeue()');
  await page.getByRole('button', { name: 'Step back' }).click();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
