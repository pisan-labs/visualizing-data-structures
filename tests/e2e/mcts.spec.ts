import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

/** A link that loads these operations with these settings. */
function link(ops: unknown[], settings: Record<string, unknown> = {}, seed = 3) {
  const json = JSON.stringify({ format: 1, viz: 'mcts', seed, settings, ops });
  return `/mcts/#ex=j${Buffer.from(json).toString('base64url')}`;
}

const iterations = (k: number) => Array.from({ length: k }, () => ['iterate']);

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('mcts'));
  await expect(page.getByRole('heading', { name: 'Monte Carlo tree search' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('30 iterations pick cat, 100 pick dog', async ({ page }) => {
  await page.goto(link([['run']], { budget: '30' }));
  await expect(narration(page)).toContainText('The move is cat');
  await expect(page.locator('.vars')).toContainText(/its visits\s*13/);
  await page.goto(link([['run']], { budget: '100' }));
  await expect(narration(page)).toContainText('dog 63 visits');
  await expect(narration(page)).toContainText('The move is dog');
});

test('selection shows UCB1 scores, and Iterate adds a round', async ({ page }) => {
  await page.goto(link(iterations(5)));
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Go to dog');
  await expect(stage(page).locator('text', { hasText: 'UCB 1.77' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Iterate', exact: true }).click();
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
  await expect(page.locator('.vars')).toContainText(/iterations\s*1/);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/mcts/#practice=13579&n=5');
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
  test(`no axe violations on the move, a selection and a rollout (${theme})`, async ({ page }) => {
    await page.goto(link([['run']], { budget: '30' }));
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await settled(page);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21aa'];
    expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
    // Back through backpropagation to the rollout, then to a selection with UCB1 labels.
    for (const k of [2, 2]) {
      for (let i = 0; i < k; i++) await page.getByRole('button', { name: 'Step back' }).click();
      await settled(page);
      expect(axeFindings(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
    }
  });
}
