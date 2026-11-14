import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function request(page: Page, times: string) {
  await page.getByLabel('Request time (s)', { exact: true }).fill(times);
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await toEnd(page);
}

/** Open Options, pick a limiter by its radio label, and close it again. */
async function limiter(page: Page, label: string) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  await page.getByRole('radio', { name: label }).check();
  await summary.click();
}

const FIXED = 'Fixed window counter: the obvious design';
const LOG = 'Sliding log: exact, one time per request';
const BUCKET = 'Token bucket: a steady rate, bursts up to L';

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('rate-limiter'));
  await expect(page.getByRole('heading', { name: 'Rate limiter' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('the page opens on the burst at a window edge, run by the counter', async ({ page }) => {
  await page.goto('/rate-limiter/');
  await expect(narration(page)).toContainText('0.9 < 3: let it through');
  await expect(page.locator('.vars')).toContainText(/busiest 10 s\s*=?\s*4/);
  await expect(stage(page)).toHaveAttribute('aria-label', /Let through: 7, 8, 9, 11, 21/);
});

test('a fixed window lets twice the limit through across an edge', async ({ page }) => {
  await limiter(page, FIXED);
  await request(page, '7 8 9 10 11 12');
  await expect(narration(page)).toContainText('6 let through in the last 10 seconds');
  await expect(narration(page)).toContainText('the burst at a window edge');
  await expect(page.locator('.vars')).toContainText(/busiest 10 s\s*=?\s*6/);
  await expect(page.locator('.vars')).toContainText(/memory kept\s*=?\s*2/);
});

test('the sliding log refuses the burst and keeps one time per request', async ({ page }) => {
  await limiter(page, LOG);
  await request(page, '7 8 9 10');
  await expect(narration(page)).toContainText('The log holds 3, the limit: refuse it');
  await expect(stage(page)).toHaveAttribute('aria-label', /The log holds 7, 8, 9/);
  await expect(page.locator('.code')).toContainText('log.removeFirst()');
});

test('the token bucket refuses a request with less than one token', async ({ page }) => {
  await limiter(page, BUCKET);
  await request(page, '0 0 0 0');
  await expect(narration(page)).toContainText('tokens = 0 < 1: refuse it');
  await expect(narration(page)).toContainText('a whole token again at 4');
});

test('a time out of order is refused, and a bad time is an error', async ({ page }) => {
  await request(page, '12 5');
  await expect(narration(page)).toContainText('Requests arrive in time order');
  await page.getByLabel('Request time (s)', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('Keep times between 0 and 39 seconds')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/rate-limiter/#practice=13579&n=5');
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
  test(`no axe violations on the counter's estimate (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await request(page, '7 8 9 10 11 12');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });

  test(`no axe violations on the log and the bucket (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    for (const kind of [LOG, BUCKET]) {
      await limiter(page, kind);
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await request(page, '3 3 4 9 14 15');
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(axeFindings(results)).toEqual([]);
    }
  });
}
