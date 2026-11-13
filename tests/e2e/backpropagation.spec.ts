import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, emptyStart, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Expression', { exact: true }).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** Open Options, pick settings by their labels, and close it again. */
async function options(page: Page, ...labels: string[]) {
  const summary = page.locator('summary', { hasText: 'Options' });
  await summary.click();
  for (const l of labels) await page.getByLabel(l, { exact: true }).click();
  await summary.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(emptyStart('backpropagation'));
  await expect(page.getByRole('heading', { name: 'Backpropagation' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('backward adds up the shares of a value used twice', async ({ page }) => {
  await op(page, 'Load', '(a*b + c) * a; a=2, b=-3, c=4');
  await op(page, 'Backward');
  await toEnd(page);
  await expect(narration(page)).toContainText('−2 + (−6) = −8');
  await expect(stage(page).locator('text', { hasText: 'n1 = a × b' })).toBeVisible();
  await expect(page.locator('.vars')).toContainText(/chain-rule steps\s*6/);
});

test('the overwrite bug, forgetting to zero, and a refused expression', async ({ page }) => {
  await options(page, 'Overwrite its gradient (grad = ..., the classic bug)');
  await op(page, 'Load', '(a*b + c) * a; a=2, b=-3, c=4');
  await op(page, 'Backward');
  await toEnd(page);
  await expect(narration(page)).toContainText('the true gradient is −2 + (−6) = −8');
  await options(
    page,
    'Add up its gradients (grad += ...)',
    'Zero the gradients before each backward pass',
  );
  await op(page, 'Backward');
  await toEnd(page);
  await expect(narration(page)).toContainText('the sum of 2 passes');
  await page.getByLabel('Expression', { exact: true }).fill('a b');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('write a*b, not a b')).toBeVisible();
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/backpropagation/#practice=24680&n=5');
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
  test(`no axe violations on the finished gradients (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await op(page, 'Load', 'tanh(w1*x1 + w2*x2 + b); w1=0.5, x1=1, w2=0.25, x2=-2, b=0.5');
    await op(page, 'Backward');
    await toEnd(page);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
