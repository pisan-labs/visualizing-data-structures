import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined)
    await page.getByLabel('Gradients, one per worker', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('ring-allreduce'));
  await expect(page.getByRole('heading', { name: 'Ring all-reduce' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('all-reduce leaves every worker with the sum', async ({ page }) => {
  await op(page, 'Load', '3 1 4 1 / 5 9 2 6 / 5 3 5 8 / 9 7 9 3');
  await op(page, 'All-reduce');
  await toEnd(page);
  await expect(narration(page)).toContainText('every worker holds the whole sum, (22, 20, 20, 18)');
  await expect(stage(page).locator('text', { hasText: 'all-reduced' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/chunks sent per worker\s*6/);
});

test('reduce-scatter alone, and gradients of the wrong shape are refused', async ({ page }) => {
  await op(page, 'Load', '3 1 4 1 / 5 9 2 6 / 5 3 5 8 / 9 7 9 3');
  await op(page, 'Reduce-scatter');
  await toEnd(page);
  await expect(narration(page)).toContainText('worker 1 holds the whole sum of b, 20');
  await page.getByLabel('Gradients, one per worker', { exact: true }).fill('1 2 3 / 4 5');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Type one vector per worker')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/ring-allreduce/#practice=13579&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const verdict = first.locator('.feedback strong');
  await expect(verdict).toContainText('Not quite. The answer is');
  const answer = ((await verdict.textContent()) ?? '')
    .replace(/^Not quite\. The answer is /, '')
    .replace(/\.$/, '');
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations, mid-step and at the end (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Load', '3 1 4 1 / 5 9 2 6 / 5 3 5 8 / 9 7 9 3');
    await op(page, 'All-reduce');
    await toEnd(page);
    await settled(page);
    const end = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(end)).toEqual([]);
    // Back to a step with chunks in flight.
    const slider = page.getByRole('slider', { name: 'Timeline' });
    await slider.focus();
    await page.keyboard.press('Home');
    for (let k = 0; k < 2; k++) await page.keyboard.press('ArrowRight');
    await settled(page);
    await expect(stage(page).locator('text', { hasText: 'step 1 of 3' })).toBeVisible();
    const mid = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(mid)).toEqual([]);
  });
}
