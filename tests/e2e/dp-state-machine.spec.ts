import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Prices', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
  await toEnd(page);
}

/** Open Options, set them with `act`, and close it again. */
async function options(page: Page, act: () => Promise<void>) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  await act();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dp-state-machine/');
  await expect(
    page.getByRole('heading', { name: 'DP: states over time (buy and sell)' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('with the cooldown, the best plan sells early', async ({ page }) => {
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('max(free[n], cool[n]) = 9');
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*112/);
  await op(page, 'Trace the plan');
  await expect(narration(page)).toContainText(
    'buy on day 2, sell on day 3, buy on day 5, sell on day 6',
  );
  await expect(stage(page).locator('text', { hasText: 'sell' }).first()).toBeVisible();
});

test('without the cooldown, every rise is taken', async ({ page }) => {
  await options(page, () =>
    page.getByRole('checkbox', { name: 'Cooldown: rest the day after each sale' }).uncheck(),
  );
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('free[n] = 14');
  await expect(page.locator('.code')).toContainText('free[t] = max(free[t − 1], hold[t − 1] + p)');
});

test('plain recursion makes the calls the table saves', async ({ page }) => {
  await options(page, () =>
    page.getByRole('radio', { name: 'Plain recursion, exponential' }).check(),
  );
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('112 calls for 21 cells');
  await op(page, 'Trace the plan');
  await expect(narration(page)).toContainText('keeps no table');
});

test('prices load, and a bad price is refused', async ({ page }) => {
  await op(page, 'Load prices', '2 3 5 6 8');
  await op(page, 'Solve');
  await expect(narration(page)).toContainText('= 6');
  await page.getByLabel('Prices', { exact: true }).fill('3 99');
  await page.getByRole('button', { name: 'Load prices', exact: true }).click();
  await expect(page.getByText('out of range')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/dp-state-machine/#practice=13579&n=5');
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
  const show = first.getByRole('button', { name: 'Show me' });
  if (await show.count()) await showMe(page, show);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations on a traced plan (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Solve');
    await op(page, 'Trace the plan');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on plain recursion (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, () =>
      page.getByRole('radio', { name: 'Plain recursion, exponential' }).check(),
    );
    await op(page, 'Solve');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
