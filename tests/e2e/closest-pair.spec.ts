import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

/** Step forward up to n times, stopping at the last step shown at this detail level. */
async function stepForward(page: Page, n: number) {
  const fwd = page.getByRole('button', { name: 'Step forward' });
  for (let i = 0; i < n && !(await fwd.isDisabled()); i++) await fwd.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/closest-pair/');
  await expect(page.getByRole('heading', { name: 'Closest pair of points' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('divide and conquer finds the pair across the line', async ({ page }) => {
  await page.getByLabel('Points', { exact: true }).fill('1,1 3,9 2,5 5,6 6,6 10,2 9,10 11,6');
  await page.getByRole('button', { name: 'Load points', exact: true }).click();
  await page.getByRole('button', { name: 'Find closest pair', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('The closest pair is D(5, 6) and E(6, 6)');
  await expect(narration(page)).toContainText('brute force needs 28');
  await expect(stage(page)).toHaveAttribute('aria-label', /Closest pair: D and E/);
});

test('brute force compares every pair', async ({ page }) => {
  await loadExample(page, 'Brute force tries every pair');
  await toEnd(page);
  await expect(narration(page)).toContainText('120 comparisons; brute force needs 120');
  await expect(page.locator('.code')).toContainText('BRUTE-CLOSEST(P)');
});

test('bad input is explained', async ({ page }) => {
  await page.getByLabel('Points', { exact: true }).fill('1,2 30,4');
  await page.getByRole('button', { name: 'Load points', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('from 0 to 12');
});

test('the strip and the calls are drawn', async ({ page }) => {
  await loadExample(page, 'Sixteen points, divided and conquered');
  await stepForward(page, 30);
  await expect(stage(page).locator('text', { hasText: 'calls (outermost first)' })).toBeVisible();
  await expect
    .poll(async () => {
      const box = await stage(page).boundingBox();
      return box ? box.width > 200 && box.height > 150 : false;
    })
    .toBe(true);
});

test('a concept check answers and Show me plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.check').filter({ hasText: 'Is the point (9, 4) in the strip?' });
  await check.getByRole('button', { name: 'Yes, (9 − 6)² = 9 < 10' }).click();
  await expect(check).toContainText('Yes.');
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('practice questions grade and Show me plays the answer', async ({ page }) => {
  await page.goto('/closest-pair/#practice=7&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations during a strip check (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'The closest pair crosses the line');
    await stepForward(page, 24);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
