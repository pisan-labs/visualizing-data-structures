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
  await page.goto(emptyStart('readers-writers'));
  await expect(page.getByRole('heading', { name: 'Readers and writers' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('two readers share the room', async ({ page }) => {
  for (const t of ['R1', 'R1', 'R2', 'R2']) await op(page, `Step ${t}`);
  await toEnd(page);
  await expect(narration(page)).toContainText('R2 is not the first reader in (n = 2)');
  await expect(stage(page).locator('text', { hasText: 'reading' })).toHaveCount(2);
});

test('a reader overtakes the waiting writer', async ({ page }) => {
  await op(page, 'Run schedule', 'R1 R1 R1 W R2 R2 R2');
  await toEnd(page);
  await expect(narration(page)).toContainText('R2 can still step');
  await expect(page.locator('.vars')).toContainText(/overtaken\s*"yes"/);
});

test('every interleaving: the turnstile never lets a later reader past the writer', async ({
  page,
}) => {
  await option(page, 'Read-write lock with a turnstile (no starving)');
  await op(page, 'Every interleaving');
  await toEnd(page);
  await expect(narration(page)).toContainText('Of the 196,340 interleavings');
  await expect(narration(page)).toContainText('Every one ends as the program means');
});

test('a bad schedule is refused', async ({ page }) => {
  await op(page, 'Run schedule', 'R1 R5');
  await expect(
    page.getByText('Name the threads W, R1, R2, R3, or number them 1 to 4 in lane order.'),
  ).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/readers-writers/#practice=13579&n=5');
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
  test(`no axe violations with the writer waiting (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Run schedule', 'R1 R1 R1 W R2 R2');
    await op(page, 'Every interleaving');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
