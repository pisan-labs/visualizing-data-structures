import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, button: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Intervals', { exact: true }).fill(value);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: (string | RegExp)[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/sweep-line/');
  await expect(page.getByRole('heading', { name: 'Sweep line (overlaps, skyline)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the sweep finds the most open at once, with the work beside it', async ({ page }) => {
  await press(page, 'Sweep');
  await expect(narration(page)).toContainText(
    'at most 3 intervals are open at once, first at time 4',
  );
  await expect(page.locator('.vars')).toContainText(/comparisons\s*=?\s*25/);
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*36/);
});

test('checking every start gives the same answer', async ({ page }) => {
  await options(page, 'Check every point, O(n²)');
  await press(page, 'Sweep');
  await expect(narration(page)).toContainText('at most 3 intervals are open at once');
  await expect(page.locator('.vars')).toContainText(/checks\s*=?\s*36/);
  await expect(page.locator('.code')).toContainText('check every start');
});

test('the tie rule decides whether touching intervals overlap', async ({ page }) => {
  await press(page, 'Load', '1-3 3-5 3-6 5-8');
  await press(page, 'Sweep');
  await expect(narration(page)).toContainText('at most 2 intervals');
  await options(page, /Starts go first/);
  await press(page, 'Sweep');
  await expect(narration(page)).toContainText('at most 3 intervals');
});

test('the skyline comes from a max-heap', async ({ page }) => {
  await options(page, /The skyline/);
  await press(page, 'Load', '2-12:8 4-6:3 7-10:5');
  await press(page, 'Sweep');
  await expect(narration(page)).toContainText('the skyline has 2 key points: (2, 8) (12, 0)');
  await expect(stage(page)).toHaveAttribute('aria-label', /Key points: \(2, 8\) \(12, 0\)/);
  await page.getByLabel('Intervals', { exact: true }).fill('2-5:20');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('height from 1 to 12')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/sweep-line/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  for (let q = 0; q < 2; q++) {
    const item = page.locator('.question').nth(q);
    await item.getByRole('button', { name: 'Check' }).click();
    const verdict = item.locator('.feedback strong');
    await expect(verdict).toContainText('Not quite. The answer is');
    const answer = ((await verdict.textContent()) ?? '')
      .replace(/^Not quite\. The answer is /, '')
      .replace(/\.$/, '');
    await item.getByRole('button', { name: 'Try again' }).click();
    const radio = item.getByRole('radio', { name: answer, exact: true });
    if (await radio.count()) await radio.check();
    else await item.getByRole('textbox').fill(answer);
    await item.getByRole('button', { name: 'Check' }).click();
    await expect(item.locator('.feedback')).toContainText('Yes.');
  }
  const show = page.locator('.question').first().getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-sweep (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Sweep');
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations mid-skyline (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, /The skyline/);
    await press(page, 'Sweep');
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
