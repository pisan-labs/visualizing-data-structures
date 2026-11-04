import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function call(page: Page, n: string) {
  await page.getByLabel('n', { exact: true }).fill(n);
  await page.getByRole('button', { name: 'Call factorial', exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

/** Answer the first practice question by reading the answer a wrong try reveals. */
async function answerFirst(page: Page) {
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  return first;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/factorial/');
  await expect(page.getByRole('heading', { name: 'Factorial' })).toBeVisible();
});

test('a call pushes frames to the base case and the products come back', async ({ page }) => {
  await fast(page);
  await call(page, '4');
  await toEnd(page);
  await expect(narration(page)).toContainText('4! = 24');
  await expect(page.locator('.vars')).toContainText(/result\s*24/);
  await expect(stage(page)).toHaveAttribute('aria-label', /returned 24 after 5 calls/);
  // Step back into the run: the frames are on the stack, newest on top.
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step back' }).click();
  await expect(stage(page).locator('text', { hasText: 'call stack' })).toBeVisible();
  await expect(
    stage(page).locator('text', { hasText: /^waits: 4 \* factorial\(3\)$/ }),
  ).toBeVisible();
});

test('a missing base case ends in a stack overflow', async ({ page }) => {
  await loadExample(page, 'Forgetting the base case');
  await toEnd(page);
  await expect(narration(page)).toContainText('RecursionError');
  await expect(page.locator('.narration')).toHaveClass(/error/);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Stack overflow!');
  await expect(stage(page).locator('text', { hasText: 'no room: overflow' })).toBeVisible();
});

test('the tail setting changes the code and keeps one frame when reused', async ({ page }) => {
  await fast(page);
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Tail call with an accumulator, frame reused').check();
  await expect(page.locator('.code')).toContainText('return factorial(n - 1, n * acc)');
  await call(page, '5');
  await toEnd(page);
  await expect(narration(page)).toContainText('straight to main');
  await expect(page.locator('.vars')).toContainText(/result\s*120/);
});

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Show me' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText('factorial(4)');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/factorial/#practice=24680&n=5');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.question')).toHaveCount(5);
  const first = await answerFirst(page);
  await first.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(narration(page)).toContainText('factorial');
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations deep in the recursion (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await loadExample(page, 'A deep stack');
    for (let i = 0; i < 11; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
