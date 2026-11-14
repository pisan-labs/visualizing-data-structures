import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Schedule', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  const choice = page.getByLabel(label, { exact: true });
  if (!(await choice.isVisible())) await page.getByText('Options', { exact: true }).click();
  await choice.check();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('deadlock'));
  await expect(page.getByRole('heading', { name: 'Deadlock' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('opposite orders deadlock, and the search finds the cycle', async ({ page }) => {
  for (const t of ['T1', 'T2', 'T1', 'T2']) await op(page, `Step ${t}`);
  await toEnd(page);
  await expect(narration(page)).toContainText('deadlock');
  await op(page, 'Find the cycle');
  await toEnd(page);
  await expect(narration(page)).toContainText('Cycle: T1 → T2 → T1');
  await expect(stage(page).locator('text', { hasText: 'cycle T1 → T2 → T1' })).toBeVisible();
});

test('every interleaving: 4 of 14 deadlock, and none with one global order', async ({ page }) => {
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('4 schedules end in deadlock between T1 and T2');
  await option(page, 'Everyone takes a first (one global order)');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'All 8 interleavings from the start end with every thread done',
  );
});

test('a bad schedule is refused', async ({ page }) => {
  await op(page, 'Run schedule', '1 2 7');
  await expect(page.getByText('Threads are numbered 1 to 3.')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/deadlock/#practice=13579&n=5');
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
  test(`no axe violations on the cycle found (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Run schedule', '1 2 1 2');
    await op(page, 'Find the cycle');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
