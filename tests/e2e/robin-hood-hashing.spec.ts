import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Answer the first practice question by reading the answer a wrong try reveals. */
async function answerFirst(page: Page) {
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
  return first;
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('robin-hood-hashing'));
  await expect(page.getByRole('heading', { name: 'Robin Hood hashing' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a key far from home takes the slot of a richer key', async ({ page }) => {
  await op(page, 'Insert', '22 33 1 44');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /2: 44 \(d 2\), 3: 1 \(d 2\)/);
  await expect(page.locator('.vars')).toContainText(/max d\s*2/);
  await expect(page.locator('.vars')).toContainText(/linear max d\s*3/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('44 is poorer, so it takes the slot');
});

test('search stops early, and delete shifts keys back', async ({ page }) => {
  await op(page, 'Insert', '22 33 1 44 4 5');
  await op(page, 'Search', '55');
  await toEnd(page);
  await expect(narration(page)).toContainText('without reaching an empty slot');
  await op(page, 'Delete', '33');
  await toEnd(page);
  await expect(narration(page)).toContainText('Shifted back: 44, 1.');
  await expect(stage(page).locator('text', { hasText: 'DEL' })).toHaveCount(0);
});

test('plain linear probing is one option away', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Plain linear probing, for comparison').check();
  await op(page, 'Insert', '22 33 1 44');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText(/max d\s*3/);
  await expect(page.locator('.vars')).toContainText(/robin max d\s*2/);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/robin-hood-hashing/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-swap (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Examples' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Take from the rich' })
      .getByRole('button', { name: 'Load' })
      .click();
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
