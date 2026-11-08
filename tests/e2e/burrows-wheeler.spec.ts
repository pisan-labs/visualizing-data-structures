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
  await page.goto('/burrows-wheeler/');
  await expect(
    page.getByRole('heading', { name: 'Burrows-Wheeler transform', exact: true }),
  ).toBeVisible();
});

test('Transform turns banana into annb$aa, and Invert brings it back', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Transform', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("BWT('banana') = 'annb$aa'");
  await expect(stage(page)).toHaveAttribute('aria-label', /Sorted rotations: \$banana/);
  await expect(page.locator('.vars')).toContainText('runs in L');
  await page.getByRole('button', { name: 'Invert', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("one LF step per character: 'banana'");
  await expect(stage(page)).toHaveAttribute('aria-label', /Recovered so far: banana\./);
});

test('without the marker the page keeps the index', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('No marker: keep the row of the original').check();
  await page.getByRole('button', { name: 'Transform', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("'nnbaaa' with index 3");
});

test('the LF arrow is drawn mid-walk, and the text stays readable', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('abracadab');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Invert', exact: true }).click();
  await toEnd(page);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Go there.');
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

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question has a Show me that plays the answer', async ({ page }) => {
  await page.goto('/burrows-wheeler/#practice=16180&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-walk (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('button', { name: 'Transform', exact: true }).click();
    await page.getByRole('button', { name: 'Invert', exact: true }).click();
    await toEnd(page);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
