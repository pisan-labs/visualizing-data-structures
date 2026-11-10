import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled } from './helpers';

const note = (page: Page) => page.locator('.learn-tools .progress-note');
/** The box at the end of a lesson; the lesson's heading describes it. */
const lessonBox = (page: Page, title: string) =>
  page
    .locator('.learn .lesson')
    .filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) })
    .getByRole('checkbox');
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('stepwise:progress') ?? 'null'));

/** Pick each check's right option first: the check counts only when no wrong pick came first. */
async function answerChecks(page: Page) {
  for (const check of await page.locator('.learn .check').all()) {
    await check.getByRole('button', { name: /^(`top = top \+ 1`|top = top \+ 1|2)$/ }).click();
    await expect(check.locator('.result')).toContainText('Yes.');
  }
}

test('lessons are marked read by ticking or by reaching their end', async ({ page }) => {
  await page.goto('/stack-array/');
  await page.getByRole('tab', { name: 'Learn' }).click();
  // Nothing to report yet.
  await expect(note(page)).toHaveCount(0);

  const first = lessonBox(page, 'The operations');
  await first.check();
  await expect(note(page)).toHaveText(/^Your progress here: 1 of 8 lessons read, 0 of 2 checks/);
  await expect(first).toHaveAccessibleName('Read');
  await expect(first).toHaveAccessibleDescription('The operations');

  // Reaching the end of a lesson, and staying a moment, marks it read.
  const last = lessonBox(page, 'Try this');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeChecked({ timeout: 5000 });

  // Unticking sticks: reaching the end again does not mark it read.
  await first.scrollIntoViewIfNeeded();
  await first.uncheck();
  await page.waitForTimeout(2000);
  await expect(first).not.toBeChecked();

  // Stored as one versioned object with a time per item.
  const p = await stored(page);
  expect(p.version).toBe(1);
  expect(p.pages['stack-array'].lessons['the-operations']).toEqual({
    done: false,
    at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
  });
  expect(p.pages['stack-array'].lessons['try-this'].done).toBe(true);
  expect(p.pages['stack-array'].outline.lessons).toHaveLength(8);
});

test('a concept check counts only when the first pick is right', async ({ page }) => {
  await page.goto('/stack-array/');
  await page.getByRole('tab', { name: 'Learn' }).click();
  const check = page.locator('.learn .check').first();
  await check.getByRole('button', { name: 'They run at the same time' }).click();
  await check.getByRole('button', { name: 'top = top + 1' }).click();
  await expect(check.locator('.result')).toContainText('Yes.');
  // (Reading on may have marked a lesson read meanwhile, but no check is recorded.)
  expect((await stored(page))?.pages?.['stack-array']?.checks ?? {}).toEqual({});
  await page.reload();
  await answerChecks(page);
  await expect(note(page)).toContainText('2 of 2 checks right');
});

test('practice results count first tries, and the catalog shows the progress', async ({ page }) => {
  await page.goto('/stack-array/#practice=12345&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Your first tries on this page so far: 0 of 1 right.')).toBeVisible();
  // A second try after seeing the answer does not change it.
  const answer = ((await first.locator('.feedback').textContent()) ?? '').match(
    /The answer is (.+?)\./,
  )![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer === '(nothing)' ? '' : answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(first.locator('.feedback')).toContainText('Yes.');
  await expect(page.getByText('so far: 0 of 1 right.')).toBeVisible();

  await page.getByRole('tab', { name: 'Learn' }).click();
  await expect(note(page)).toContainText('practice 0 of 1 right on the first try');

  await page.goto('/');
  const item = page.locator('li.live', {
    has: page.getByRole('link', { name: 'Stack (array)', exact: true }),
  });
  await expect(item.locator('.mark')).toContainText('Started: ');
  await expect(item.locator('.mark')).toHaveAttribute('title', /practice 0 of 1 right/);
  const overview = page.getByRole('region', { name: 'Your progress' });
  await expect(overview).toContainText(/Data structures:\s*1 of \d+ pages started/);
  await expect(overview).toContainText(/Algorithms:\s*0 of \d+ pages started/);
});

test('a page is finished when every lesson is read and every check is right', async ({ page }) => {
  await page.goto('/stack-array/');
  await page.getByRole('tab', { name: 'Learn' }).click();
  for (const box of await page.locator('.lesson-end input').all()) await box.check();
  await answerChecks(page);
  await expect(note(page)).toHaveText(
    'Your progress here: 8 of 8 lessons read, 2 of 2 checks right.',
  );
  await page.goto('/');
  const item = page.locator('li.live', {
    has: page.getByRole('link', { name: 'Stack (array)', exact: true }),
  });
  await expect(item.locator('.mark')).toContainText('Finished: ');
  await expect(page.getByRole('region', { name: 'Your progress' })).toContainText(
    /1 of \d+ pages started, 1 finished/,
  );
});

test('Reset my progress asks first, then clears every page', async ({ page }) => {
  await page.goto('/stack-array/');
  await page.getByRole('tab', { name: 'Learn' }).click();
  await lessonBox(page, 'The operations').check();
  await page.goto('/');
  const overview = page.getByRole('region', { name: 'Your progress' });
  await overview.getByRole('button', { name: 'Reset my progress' }).click();
  // The safe choice has the focus.
  await expect(overview.getByRole('button', { name: 'Keep my progress' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(overview.getByRole('button', { name: 'Reset my progress' })).toBeVisible();
  await expect(page.locator('li.live .mark')).toHaveCount(1);

  await overview.getByRole('button', { name: 'Reset my progress' }).click();
  await overview.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(overview).toHaveCount(0);
  await expect(page.locator('li.live .mark')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Your progress is reset.');
  const p = await stored(page);
  expect(p.pages).toEqual({});
  expect(p.resetAt).toMatch(/^\d{4}-/);

  await page.goto('/stack-array/');
  await page.getByRole('tab', { name: 'Learn' }).click();
  await expect(lessonBox(page, 'The operations')).not.toBeChecked();
});

test('progress made in another tab shows at once', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/stack-array/');
  await other.getByRole('tab', { name: 'Learn' }).click();
  await lessonBox(other, 'The operations').check();
  await expect(page.locator('li.live .mark')).toHaveCount(1);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`progress has no axe violations (${theme})`, async ({ page }) => {
    await page.goto('/stack-array/');
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await page.getByRole('tab', { name: 'Learn' }).click();
    await lessonBox(page, 'The operations').check();
    await page.getByRole('tab', { name: 'Practice' }).click();
    await page.locator('.question').first().getByRole('button', { name: 'Check' }).click();
    await page.getByRole('tab', { name: 'Learn' }).click();
    await settled(page);
    const learn = await new AxeBuilder({ page })
      .include('.tabs')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(learn)).toEqual([]);

    await page.goto('/');
    await expect(page.locator('li.live .mark')).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset my progress' }).click();
    const home = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(home)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
