import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

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
  await page.goto('/z-algorithm/');
  await expect(page.getByRole('heading', { name: 'Z-algorithm', exact: true })).toBeVisible();
});

test('Build Z finds the pattern through P$T', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('ABRACADABRA / ABRA');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(narration(page)).toContainText("S = P$T = 'ABRA$ABRACADABRA'");
  await page.getByRole('button', { name: 'Build Z', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('P occurs at shifts 0 and 7.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Found at 0 and 7\./);
  await expect(page.locator('.vars')).toContainText('comparisons');
});

test('the box copies a value, and the drawing stays readable', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('aabcaabxaaz');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Build Z', exact: true }).click();
  await toEnd(page);
  for (let i = 0; i < 40; i++) {
    if ((await narration(page).textContent())?.includes('i = 5 is inside the box [4, 6]')) break;
    await page.getByRole('button', { name: 'Step back' }).click();
  }
  await expect(narration(page)).toContainText('i = 5 is inside the box [4, 6]');
  // The copied value's arrow is the one curve in the drawing.
  await expect(stage(page).locator('path.curve')).toHaveCount(1);
  await settled(page);
  const px = await page.evaluate(() => {
    const svg = document.querySelector('.stage > svg') as SVGSVGElement;
    const scale = svg.getScreenCTM()!.a;
    const sizes = [...svg.querySelectorAll('text')]
      .filter((t) => (t.textContent ?? '').trim())
      .map((t) => Number(t.getAttribute('font-size')) * scale);
    return Math.min(...sizes);
  });
  expect(px).toBeGreaterThanOrEqual(9);
});

test('without the box, all the same letter costs n²/2', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('From scratch at every position').check();
  await page.locator('#op-input').fill('AAAAAAAAAAAAAAAA');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Build Z', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('That took 120 comparisons.');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/z-algorithm/#practice=31415&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-build (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Build Z', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
