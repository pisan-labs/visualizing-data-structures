import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');
/** The value shown for one variable in the Variables panel. */
const variable = (page: Page, name: string) =>
  page
    .locator('.vars dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${name}$`) }) })
    .locator('dd');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function press(page: Page, button: string, input?: string) {
  if (input !== undefined) await page.getByLabel('Value or index').fill(input);
  const target = page.getByRole('button', { name: button, exact: true });
  // Get and Set sit under "More operations".
  if (!(await target.isVisible())) await page.locator('details.more > summary').click();
  await target.click();
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dynamic-array/');
  await expect(page.getByRole('heading', { name: 'Dynamic array (resizing)' })).toBeVisible();
});

test('appends double the array and keep a running cost per append', async ({ page }) => {
  await fast(page);
  await press(page, 'Append', '10 20 30');
  await expect(narration(page)).toContainText('So far 3 appends have cost 3 copies, 1 per append', {
    timeout: 20_000,
  });
  await expect(stage(page)).toHaveAttribute('aria-label', /size 3 and capacity 4: 10, 20, 30/);
  await expect(vars(page)).toContainText('copies/append');
});

test('a resize shows the new array while the values are copied', async ({ page }) => {
  await loadExample(page, 'Doubling as it fills');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '9. append(90)' }).click();
  await expect(narration(page)).toContainText('1.67 per append');
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('A = B');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('All 8 items are in B now');
  await expect(stage(page).getByText('new array B, 16 slots')).toBeVisible();
  await expect(stage(page)).toHaveAttribute('aria-label', /8 of 8 items copied/);
});

test('insert and set take an index and a value from one box', async ({ page }) => {
  await fast(page);
  await press(page, 'Append', '1 2 3');
  await expect(narration(page)).toContainText('3 appends', { timeout: 20_000 });
  await press(page, 'Insert', '0 9');
  await expect(narration(page)).toContainText('9 is now at index 0', { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute('aria-label', /: 9, 1, 2, 3\./);
  await press(page, 'Set', '3, 7');
  await expect(narration(page)).toContainText('The old value, 3, is gone', { timeout: 10_000 });

  await press(page, 'Insert', '5');
  await expect(page.getByRole('alert')).toContainText(
    'Insert needs an index and a value, separated by a space.',
  );
  await press(page, 'Get', '4');
  await expect(narration(page)).toContainText('Index out of range', { timeout: 10_000 });
});

test('shrinking at half full thrashes, at a quarter it does not', async ({ page }) => {
  await loadExample(page, 'Shrinking at half full thrashes');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '10. removeLast()' }).click();
  await expect(variable(page, 'copies')).toHaveText('24');
  await page.getByText('Options').click();
  await page.getByLabel('To half when a quarter full').check();
  await expect(page.locator('.code')).toContainText('if size > 0 and size == capacity / 4');
  await page.getByRole('button', { name: '10. removeLast()' }).click();
  await expect(variable(page, 'copies')).toHaveText('4');
});

test('the copying step has no axe violations in dark mode', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await loadExample(page, 'Doubling as it fills');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: '5. append(50)' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(stage(page).getByText('new array B, 8 slots')).toBeVisible();
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});
