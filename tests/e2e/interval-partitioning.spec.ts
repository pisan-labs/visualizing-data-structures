import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const form = (page: Page) => page.locator('form.controls');

async function press(page: Page, name: string) {
  await form(page).getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function option(page: Page, label: string) {
  const panel = page.locator('details.options');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  await page.getByLabel(label).check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/interval-partitioning/');
  await expect(
    page.getByRole('heading', { name: 'Interval partitioning', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('ten lectures need three rooms, the depth', async ({ page }) => {
  await press(page, 'Schedule');
  await toEnd(page);
  await expect(narration(page)).toContainText('3 rooms. At time 9, 3 lectures');
  await expect(stage(page)).toHaveAttribute('aria-label', /L1 from 9 to 11 in room 1/);
  await expect(stage(page).locator('text', { hasText: 'depth 3' })).toBeVisible();
});

test('touching ends clash with closed times', async ({ page }) => {
  await form(page).getByLabel('Lectures', { exact: true }).fill('9-10 10-11 11-12 12-13');
  await press(page, 'Load lectures');
  await press(page, 'Schedule');
  await toEnd(page);
  await expect(narration(page)).toContainText('1 room.');
  await option(page, 'Clashes with it: times are [start, finish]');
  await expect(page.locator('.code')).toContainText('min(H).free < l.start');
  await press(page, 'Schedule');
  await toEnd(page);
  await expect(narration(page)).toContainText('2 rooms.');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/interval-partitioning/#practice=99&n=3');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
});

for (const theme of ['dark', 'contrast']) {
  test(`no axe violations mid-schedule (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Schedule');
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
