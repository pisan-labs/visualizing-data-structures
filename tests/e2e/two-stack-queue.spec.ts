import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Type a value (or several) and press an operation's button. */
async function run(page: Page, button: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Value', { exact: true }).fill(value);
  await page.getByRole('button', { name: button, exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick settings by their radio labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByRole('radio', { name: l }).check();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/two-stack-queue/');
  await expect(page.getByRole('heading', { name: 'Queue from two stacks' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('values move across only when out is empty', async ({ page }) => {
  await run(page, 'Enqueue', '1 2 3 4');
  await run(page, 'Dequeue');
  await expect(narration(page)).toContainText("Pop out's top, 1");
  await expect(narration(page)).toContainText('This dequeue cost 9');
  await run(page, 'Enqueue', '5');
  await run(page, 'Dequeue');
  await expect(narration(page)).toContainText('out was not empty, so no moves: one pop');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Cost of the latest operations: 1, 1, 1, 1, 9, 1, 1/,
  );
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*15/);
});

test('moving everything every time costs 4n − 1 per dequeue', async ({ page }) => {
  await options(page, 'Move everything there and back every time, O(n)');
  await run(page, 'Enqueue', '1 2 3 4');
  await run(page, 'Dequeue');
  await expect(narration(page)).toContainText('This dequeue cost 15 stack operations');
  await expect(page.locator('.code')).toContainText('in.push(out.pop())');
});

test('an empty queue and a bad value are refused', async ({ page }) => {
  await run(page, 'Dequeue');
  await expect(narration(page)).toContainText('the queue is empty');
  await page.getByLabel('Value', { exact: true }).fill('cat');
  await page.getByRole('button', { name: 'Enqueue', exact: true }).click();
  await expect(page.getByText('not a whole number')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/two-stack-queue/#practice=13579&n=5');
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
  test(`no axe violations after a move (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Enqueue', '1 2 3 4 5');
    await run(page, 'Dequeue');
    await run(page, 'Enqueue', '6');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations moving everything every time (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, 'Move everything there and back every time, O(n)');
    await run(page, 'Enqueue', '1 2 3');
    await run(page, 'Peek');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
