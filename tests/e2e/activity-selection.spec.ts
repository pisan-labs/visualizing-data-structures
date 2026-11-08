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
  await page.goto('/activity-selection/');
  await expect(
    page.getByRole('heading', { name: 'Activity selection', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
});

test('earliest finish first fits four of the eleven', async ({ page }) => {
  await press(page, 'Select');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Earliest finish first chose 4 activities: a1, a4, a8 and a11.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /Chosen: a1, a4, a8, a11\./);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('a11 [12, 16) starts at 12, no earlier than 11');
});

test('shortest first falls short', async ({ page }) => {
  await option(page, 'Shortest first (can be wrong)');
  await expect(page.locator('.code')).toContainText('sort the activities by f - s');
  await form(page).getByLabel('Activities', { exact: true }).fill('1-5 4-7 6-10');
  await press(page, 'Load activities');
  await press(page, 'Select');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Earliest finish first would choose 2. This rule is not safe.',
  );
});

test('refuses an activity that ends before it starts', async ({ page }) => {
  await form(page).getByLabel('Activities', { exact: true }).fill('5-3');
  await press(page, 'Load activities');
  await expect(page.getByRole('alert')).toContainText('the finish must come after the start');
});

test('a practice question is graded and Show me plays the answer', async ({ page }) => {
  await page.goto('/activity-selection/#practice=2024&n=3');
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
  test(`no axe violations mid-selection (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await press(page, 'Select');
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
