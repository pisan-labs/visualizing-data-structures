import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Word or grammar', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const CONVERSION = 'S -> ASA | aB; A -> B | S; B -> b | eps';
const CLASSIC = 'S -> AB | BC; A -> BA | a; B -> CC | b; C -> AB | a';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function type(page: Page, text: string, op: string) {
  await input(page).fill(text);
  await button(page, op).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/cyk/');
  await expect(page.getByRole('heading', { name: 'CYK parsing', exact: true })).toBeVisible();
});

test('aabb fills the triangle and is accepted, with a parse tree', async ({ page }) => {
  await fast(page);
  await type(page, 'aabb', 'Parse');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'S₀ is in table(1, 4) = { S₀, S }, the cell for the whole word, so aabb is in the language.',
  );
  await expect(page.locator('.vars')).toContainText('10');
  await expect(stage(page).locator('text', { hasText: /^Parse tree$/ })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /10 of 10 cells filled/);
});

test('aab fills the whole table too, and is rejected', async ({ page }) => {
  await fast(page);
  await type(page, 'aab', 'Parse');
  await toEnd(page);
  await expect(narration(page)).toContainText('so aab is not in the language');
  await expect(stage(page).locator('rect.role-error')).toHaveCount(1);
  await expect(stage(page).locator('text', { hasText: /^Parse tree$/ })).toHaveCount(0);
});

test('Load shows each stage of the conversion, with removed rules crossed out', async ({
  page,
}) => {
  await fast(page);
  await type(page, CONVERSION, 'Load');
  await toEnd(page);
  const back = page.getByRole('button', { name: 'Step back' });
  // The last step is stage 11; stage 2 is nine steps back.
  for (let i = 0; i < 9; i++) await back.click();
  await expect(narration(page)).toContainText('Remove the ε-rule B → ε.');
  await expect(
    stage(page).locator('text', { hasText: 'Stage 2 of 11: remove an ε-rule' }),
  ).toHaveCount(1);
  await expect(stage(page).locator('line.role-remove')).toHaveCount(1);
  await expect(stage(page).locator('text.role-new')).toHaveCount(2);
  await back.click();
  await expect(narration(page)).toContainText('Add a new start variable: S₀ → S.');
  await back.click();
  await expect(narration(page)).toContainText('Converting takes 11 stages, following Sipser.');
});

test('with only the result, Load converts in one step', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Show only the result').check();
  await page.getByText('Options', { exact: true }).click();
  await type(page, CONVERSION, 'Load');
  await expect(narration(page)).toContainText('converted them in 11 stages');
  await expect(stage(page).locator('text', { hasText: /^Rules in CNF/ })).toHaveCount(1);
});

test('every detail shows each split; the readouts count cells and splits', async ({ page }) => {
  await type(page, CLASSIC, 'Load');
  await page.getByRole('combobox', { name: 'Detail' }).selectOption('3');
  await fast(page);
  await type(page, 'baa', 'Parse');
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText('splits tried');
  await expect(stage(page)).toHaveAttribute('aria-label', /6 of 6 cells filled/);
  // Back from the verdict: the top cell, its two splits, the second cell of length 2 and its
  // split, then the first cell of length 2 and its only split.
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 7; i++) await back.click();
  await expect(narration(page)).toContainText('table(1, 2), split "b" + "a"');
  await expect(stage(page).locator('rect.role-compare')).toHaveCount(2);
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'aaaaabbbbb', 'Parse');
  await expect(page.getByRole('alert')).toContainText('Keep words to 8 symbols');
  await type(page, 'S -> a | ', 'Load');
  await expect(page.getByRole('alert')).toContainText('has an empty alternative');
});

test('the rules sit beside the table on a wide screen and under it on a phone', async ({
  page,
}, info) => {
  await type(page, CLASSIC, 'Load');
  await type(page, 'baaba', 'Parse');
  const box = (text: string | RegExp) =>
    stage(page).locator('text', { hasText: text }).first().boundingBox();
  await expect
    .poll(async () => {
      const rules = await box(/^Rules in CNF/);
      const top = await stage(page).locator('rect').first().boundingBox();
      if (!rules || !top) return 'not drawn';
      if (rules.x > top.x + top.width && rules.y < top.y + 200) return 'beside';
      if (rules.y > top.y + 150) return 'under';
      return 'overlapping';
    })
    .toBe(info.project.name === 'phone' ? 'under' : 'beside');
  // Cells stay large enough to read on both screens.
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(24);
});

test('a finished table with its tree has no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, 'aabb', 'Parse');
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Every stage of the conversion' }).first().click();
  await expect(page.getByText('Loaded "Every stage of the conversion"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/cyk/#practice=97531&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite|Yes\./);
  if ((await feedback.textContent())?.includes('Not quite')) {
    const answer = ((await feedback.textContent()) ?? '').match(
      /The answer is (.+?)\.(?:\s|$)/,
    )?.[1];
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = answer ? first.getByRole('radio', { name: answer, exact: true }) : null;
    if (radio && (await radio.count())) await radio.check();
    else await first.getByRole('textbox').fill(answer ?? '');
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Grammar after stage/);
});
