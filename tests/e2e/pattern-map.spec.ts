import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function run(page: Page, button: string, input?: string) {
  if (input !== undefined)
    await page.getByLabel('Cue, family or problem', { exact: true }).fill(input);
  await (await opButton(page, button)).click();
  await toEnd(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/pattern-map/');
  await expect(page.getByRole('heading', { name: 'Which pattern fits? (a map)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a cue leads to its pattern, its cost, and its page', async ({ page }) => {
  await run(page, 'Follow cue', 'the k largest');
  await expect(narration(page)).toContainText('The naive way: sort everything, O(n log n).');
  await expect(narration(page)).toContainText('Its page is /top-k/.');
  await expect(stage(page)).toHaveAttribute('aria-label', /^Heap patterns: Top k with a heap/);
  await expect(page.locator('.vars')).toContainText(/hops\s*=?\s*2/);
});

test('a family shows every pattern, by name or by number', async ({ page }) => {
  await run(page, 'Show family', '11');
  await expect(narration(page)).toContainText('That is the Concurrency family: 9 patterns');
  await expect(stage(page)).toHaveAttribute('aria-label', /Deadlock \(\/deadlock\/\)/);
  await run(page, 'Show family', 'Intervals');
  await expect(narration(page)).toContainText('That is the Intervals family: 2 patterns');
});

test('a problem is read cue by cue, and a look-alike is ruled out', async ({ page }) => {
  await run(page, 'Which pattern?', '2');
  await expect(narration(page)).toContainText('So: Monotonic queue. Sliding window is ruled out.');
  await expect(stage(page)).toHaveAttribute('aria-label', /a look-alike/);
  await expect(page.locator('.code')).toContainText('rule p out');
});

test('with look-alikes off, the reading skips them', async ({ page }) => {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  await page.getByRole('checkbox', { name: 'Rule out look-alike cues' }).uncheck();
  await summary.click();
  await run(page, 'Which pattern?', '2');
  await expect(narration(page)).toContainText('So: Monotonic queue.');
  await expect(narration(page)).not.toContainText('ruled out');
});

test('the whole map, and words that are not a cue', async ({ page }) => {
  await run(page, 'Whole map');
  await expect(narration(page)).toContainText('11 families, 51 patterns and 89 cues');
  await run(page, 'Follow cue', 'zebra');
  await expect(narration(page)).toContainText('No cue on the map reads “zebra”');
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/pattern-map/#practice=13579&n=5');
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
  test(`no axe violations on a family (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Show family', 'Concurrency');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on a problem with a look-alike (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await run(page, 'Which pattern?', '3');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
