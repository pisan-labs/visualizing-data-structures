import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');

/** A link that starts empty with these settings. */
const start = (settings: Record<string, string>) => {
  const json = JSON.stringify({ format: 1, viz: 'policy-optimization', settings, ops: [] });
  return `/policy-optimization/#ex=j${Buffer.from(json).toString('base64url')}`;
};

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Rewards', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Policy optimization (PPO, GRPO, DPO)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

test('a GRPO step scores the group and moves the bars', async ({ page }) => {
  await open(page, emptyStart('policy-optimization'));
  await op(page, 'Step');
  await toEnd(page);
  await expect(narration(page)).toContainText('Step 1 done');
  await expect(narration(page)).toContainText('Canberra 0.30 → 0.39');
  await expect(page.locator('.vars')).toContainText(/step\s*1/);
});

test('new rewards, ten steps, and rewards that do not fit are refused', async ({ page }) => {
  await open(page, emptyStart('policy-optimization'));
  await op(page, 'Set rewards', '1 0 0 0');
  await op(page, 'Run 10 steps');
  await toEnd(page);
  await expect(narration(page)).toContainText('10 steps done');
  await page.getByLabel('Rewards', { exact: true }).fill('1 2 3');
  await page.getByRole('button', { name: 'Set rewards', exact: true }).click();
  await expect(page.getByText('Type four rewards')).toBeVisible();
});

test('PPO clips and its critic learns; DPO learns from a pair', async ({ page }) => {
  await open(page, start({ method: 'ppo', clip: '0.2', beta: '0' }));
  await op(page, 'Step');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/V\s*0\.\d+/);
  await open(page, start({ method: 'dpo', clip: '0.2', beta: '0.5' }));
  await op(page, 'Step');
  await toEnd(page);
  await expect(narration(page)).toContainText('Step 1 done');
  await expect(page.locator('.stage')).toContainText('the preference');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await open(page, emptyStart('policy-optimization'));
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/policy-optimization/#practice=13579&n=5');
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
  test(`no axe violations in the second pass (${theme})`, async ({ page }) => {
    await open(page, emptyStart('policy-optimization'));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Step');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
