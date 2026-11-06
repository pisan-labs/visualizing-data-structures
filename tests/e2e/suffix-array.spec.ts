import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/suffix-array/');
  await expect(page.getByRole('heading', { name: 'Suffix array and LCP' })).toBeVisible();
});

test('Build sorts the suffixes of BANANA and fills in LCP', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'SA = [5, 3, 1, 0, 4, 2] and LCP = [0, 1, 3, 0, 0, 2]',
  );
  await expect(narration(page)).toContainText('Prefix doubling took 2 rounds');
  await expect(stage(page)).toHaveAttribute('aria-label', /Suffix array 5 3 1 0 4 2/);
});

test('Search finds both copies of ANA, building first', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('ANA');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('at positions 1 and 3');
  await expect(page.locator('.vars')).toContainText(/found\s*"1 3"/);
});

test('Longest repeat in MISSISSIPPI is ISSI', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('MISSISSIPPI');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Longest repeat', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("'ISSI', at positions 1 and 4");
});

test('the naive build compares suffixes', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Comparing suffixes directly (insertion sort)').check();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('12 suffix comparisons');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/suffix-array/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  // Show me appears once the question is checked (an empty answer counts as a try).
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-build (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
