import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function search(page: Page, text: string) {
  await page.locator('#op-input').fill(text);
  await page.getByRole('button', { name: 'Search text', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/aho-corasick/');
  await expect(page.getByRole('heading', { name: 'Aho-Corasick', exact: true })).toBeVisible();
});

test('Search finds she, he and hers in ushers', async ({ page }) => {
  await fast(page);
  await search(page, 'ushers');
  await toEnd(page);
  await expect(narration(page)).toContainText("3 matches: 'she' at 1, 'he' at 2 and 'hers' at 2.");
  await expect(stage(page)).toHaveAttribute('aria-label', /she to he/);
  await expect(page.locator('.vars')).toContainText('fail hops');
});

test('Build links sets the failure links breadth first', async ({ page }) => {
  await fast(page);
  await page.getByRole('button', { name: 'Build links', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('4 of them go somewhere other than the root');
  // Failure links are dashed curves; output links too.
  await expect(stage(page).locator('path.curve')).not.toHaveCount(0);
});

test('Add pattern grows the trie and output sets report the same matches', async ({ page }) => {
  await fast(page);
  await page.locator('#op-input').fill('is');
  const more = form(page).locator('details.more');
  if (await more.count()) await more.locator('summary').click();
  await page.getByRole('button', { name: 'Add pattern', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText("now ends the pattern 'is'");
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Output sets: each node keeps the list (1975 paper)').check();
  await search(page, 'thisishers');
  await toEnd(page);
  await expect(narration(page)).toContainText('6 matches');
});

test('the drawing stays readable mid-scan', async ({ page }) => {
  await fast(page);
  await search(page, 'ushers');
  await toEnd(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
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
  await page.goto('/aho-corasick/#practice=17320&n=4');
  const first = page.locator('.question').first();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('The answer is');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-scan (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await search(page, 'ushers');
    await toEnd(page);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
