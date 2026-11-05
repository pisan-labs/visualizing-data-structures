import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const vars = (page: Page) => page.locator('.vars');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value?: string) {
  if (value !== undefined) await page.getByLabel('Key', { exact: true }).fill(value);
  const button = page.getByRole('button', { name, exact: true });
  // Less common operations sit under "More operations".
  if (!(await button.isVisible())) await page.getByText('More operations').click();
  await button.click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function stepUntil(page: Page, text: string) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 60; i++) {
    if (((await narration(page).textContent()) ?? '').includes(text)) return;
    await back.click();
  }
  throw new Error(`no step says "${text}"`);
}

async function load(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/fibonacci-heap/');
  await expect(page.getByRole('heading', { name: 'Fibonacci heap' })).toBeVisible();
});

test('inserts are lazy and extractMin consolidates with the degree table', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '27 14 9 33 21 45 6 38 17 50 12 29 41');
  await toEnd(page);
  await expect(vars(page)).toContainText(/t\(H\)\s*13/);
  await expect(vars(page)).toContainText(/links\s*0/);
  await op(page, 'Extract min');
  await toEnd(page);
  await expect(narration(page)).toContainText('Return 6');
  await expect(vars(page)).toContainText(/t\(H\)\s*2/);
  await expect(vars(page)).toContainText(/links\s*10/);
  await stepUntil(page, 'consolidate: make a table A');
  await expect(stage(page).locator('rect[class*="live"]')).toHaveCount(6);
});

test('a cascading cut, with marked nodes drawn as dashed rings', async ({ page }) => {
  await load(page, 'A cascading cut');
  await fast(page);
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  await next.click();
  await next.click();
  await expect(vars(page)).toContainText(/m\(H\)\s*2/);
  await expect(stage(page).locator('circle.ghost')).toHaveCount(2);
  await next.click();
  await expect(narration(page)).toContainText('N = 16, t(H) = 6, m(H) = 0');
  await expect(vars(page)).toContainText(/cuts\s*3/);
  await stepUntil(page, 'cascadingCut(17): 17 was marked');
  await expect(page.locator('.code li.active')).toContainText(['cut(H, y, z)']);
});

test('delete lowers the key to −∞ and extracts it', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '30 10 20 40 50');
  await toEnd(page);
  await op(page, 'Extract min');
  await toEnd(page);
  await op(page, 'Delete', '50');
  await toEnd(page);
  await expect(narration(page)).toContainText('50 is gone');
  await stepUntil(page, 'now holds −∞');
  await expect(stage(page).locator('text', { hasText: '−∞' }).first()).toBeVisible();
});

test('decreaseKey refuses a bigger key', async ({ page }) => {
  await fast(page);
  await op(page, 'Insert', '30 10');
  await toEnd(page);
  await op(page, 'Decrease key', '30 40');
  await expect(narration(page)).toContainText('decreaseKey only lowers a key');
});

test('the internal view draws pointers and the circular root list', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('As pointers: child and sibling lists (internal view)').check();
  await load(page, 'The same heap, as pointers');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /38, marked, is a leaf/);
  await expect(stage(page).locator('circle.ghost')).toHaveCount(1);
});

test('a practice set grades an answer and shows it on the heap', async ({ page }) => {
  await page.goto('/fibonacci-heap/#practice=11235&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer === '(nothing)' ? '' : answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /A Fibonacci heap with \d+ keys/);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Lazy inserts, then one big tidy-up' }).first().click();
  await expect(page.getByText('Loaded "Lazy inserts, then one big tidy-up"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText(/extractMin|consolidate|Remove|A\[/);
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-consolidate and no sideways scroll (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await load(page, 'Lazy inserts, then one big tidy-up');
    await fast(page);
    await toEnd(page);
    await stepUntil(page, 'link the two');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
