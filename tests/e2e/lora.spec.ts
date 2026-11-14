import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const rankOne = JSON.parse(fs.readFileSync('src/viz/lora/examples/rank-one-target.json', 'utf8'));

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const link = (ex: object) => `/lora/#ex=j${Buffer.from(JSON.stringify(ex)).toString('base64url')}`;

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'LoRA (low-rank adapters)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

test('a rank-1 adapter learns a rank-1 update', async ({ page }) => {
  await ready(page, link(rankOne));
  await toEnd(page);
  await expect(narration(page)).toContainText('Every entry of ΔW is within');
  await expect(page.locator('.vars')).toContainText(/steps\s*60/);
  await expect(page.locator('.vars')).toContainText(/trained numbers\s*8/);
});

test('a bad target is refused, and merge folds ΔW into W', async ({ page }) => {
  await ready(page, emptyStart('lora'));
  const input = page.getByLabel('Target: a rank, or 16 numbers', { exact: true });
  await input.fill('9');
  await page.getByRole('button', { name: 'Target', exact: true }).click();
  await expect(page.getByText('Type a rank from 1 to 4')).toBeVisible();
  await input.fill('1');
  await page.getByRole('button', { name: 'Target', exact: true }).click();
  await page.getByRole('button', { name: 'Train (20 steps)', exact: true }).click();
  await page.getByRole('button', { name: 'Merge into W', exact: true }).click();
  await toEnd(page);
  await expect(narration(page)).toContainText('Merged');
  await expect(stage(page).locator('text', { hasText: 'W + ΔW (merged)' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/multiply-adds per input\s*16/);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await ready(page, emptyStart('lora'));
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/lora/#practice=13579&n=5');
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
  test(`no axe violations on a trained adapter (${theme})`, async ({ page }) => {
    await ready(page, link(rankOne));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
