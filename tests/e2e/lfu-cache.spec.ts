import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, opButton, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function op(page: Page, name: string, value: string) {
  await page.getByLabel('Key (and value)', { exact: true }).fill(value);
  await (await opButton(page, name)).click();
  await toEnd(page);
}

/** Put 7, 8 and 9, use 7 twice and 8 once, then put 5: 9 is the least used. */
async function fill(page: Page) {
  for (const kv of ['7 70', '8 80', '9 90']) await op(page, 'Put', kv);
  await op(page, 'Get', '7 7 8');
  await op(page, 'Put', '5 50');
}

async function options(page: Page, label: string) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  await page.getByRole('radio', { name: label }).check();
  await summary.click();
}

const SCAN = 'Scan every key to evict, O(n)';

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('lfu-cache'));
  await expect(page.getByRole('heading', { name: 'LFU cache' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('a full cache evicts the head of the smallest frequency’s list', async ({ page }) => {
  await fill(page);
  await expect(narration(page)).toContainText('(it evicted 9)');
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Lists by frequency: freq 1: 5; freq 2: 8; freq 3: 7\. minFreq = 1/,
  );
  await expect(page.locator('.vars')).toContainText(/scans\s*=?\s*0/);
});

test('the obvious design scans every key to find the same one', async ({ page }) => {
  await options(page, SCAN);
  await fill(page);
  await expect(narration(page)).toContainText('(it evicted 9)');
  await expect(page.locator('.vars')).toContainText(/scans\s*=?\s*3/);
  await expect(page.locator('.vars')).toContainText(/naive total\s*=?\s*15/);
  await expect(page.locator('.vars')).toContainText(/pattern total\s*=?\s*23/);
  await expect(page.locator('.code')).toContainText('the key with the fewest uses');
});

test('a tie goes to the least recently used, and minFreq moves up', async ({ page }) => {
  for (const kv of ['7 70', '8 80', '9 90']) await op(page, 'Put', kv);
  await op(page, 'Get', '8 9 7');
  await expect(stage(page)).toHaveAttribute('aria-label', /freq 2: 8, 9, 7\. minFreq = 2/);
  await op(page, 'Put', '5 50');
  await expect(narration(page)).toContainText('(it evicted 8)');
});

test('a key out of range is refused', async ({ page }) => {
  await page.getByLabel('Key (and value)', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Get', exact: true }).click();
  await expect(page.getByText('between 0 and 999')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/lfu-cache/#practice=13579&n=5');
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
  test(`no axe violations on the frequency lists (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fill(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations while scanning (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await options(page, SCAN);
    await fill(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
