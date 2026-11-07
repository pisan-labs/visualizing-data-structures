import { expect, test, type Page } from '@playwright/test';
import { showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Word or rules', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const WALK = 'q0 0,1,_ -> q0 R';
const INCREMENT = 'q0 0,1 -> q0 R; q0 _ -> q1 L; q1 1 -> q1 0 L; q1 0,_ -> accept 1 R';

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

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/turing-machine/');
  await expect(page.getByRole('heading', { name: 'Turing machine', exact: true })).toBeVisible();
});

test('the starting machine accepts 0011 and rejects 001', async ({ page }) => {
  await fast(page);
  await type(page, '0011', 'Run');
  await toEnd(page);
  await expect(narration(page)).toContainText('The machine accepts 0011 after 13 moves.');
  await expect(stage(page)).toHaveAttribute('aria-label', /Status: accept after 13 moves\./);
  await type(page, '001', 'Run');
  await toEnd(page);
  await expect(narration(page)).toContainText('no rule covers that');
  await expect(stage(page).locator('rect.role-error')).toHaveCount(1);
});

test('a run that never halts stops at the cap and says why', async ({ page }) => {
  await fast(page);
  await type(page, WALK, 'Load');
  await type(page, '01', 'Run');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Still running after 500 moves: it may never halt, and no program can tell in general. That is the halting problem.',
  );
  await button(page, 'Step').click();
  await toEnd(page);
  await expect(page.locator('.vars')).toContainText('501');
});

test('Start and Step make one move at a time, with the configurations in the trace', async ({
  page,
}) => {
  await type(page, '01', 'Start');
  await expect(stage(page).locator('text', { hasText: /^q0 01$/ })).toHaveCount(1);
  await button(page, 'Step').click();
  await expect(narration(page)).toContainText('q0 reads 0: write x, move right, go to q1.');
  await expect(stage(page).locator('text', { hasText: /^x q1 1$/ })).toHaveCount(1);
  await expect(page.locator('.code li.active')).toHaveCount(5);
});

test('a one-way tape loses the carry; a two-way tape keeps it', async ({ page }) => {
  await fast(page);
  await type(page, INCREMENT, 'Load');
  await type(page, '111', 'Run');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The tape holds 1 0 0 from cell 0/);
  await option(page, 'Infinite both ways');
  await expect(page.locator('.code')).toContainText('if D = L: head = head − 1');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /The tape holds 1 0 0 0 from cell -1/);
});

test('S moves need the setting', async ({ page }) => {
  await type(page, 'q0 0 -> q1 1 S; q1 1 -> q0 0 S', 'Load');
  await expect(narration(page)).toContainText('Turn on L/R/S moves in Options');
  await option(page, 'L, R and S (stay put)');
  await expect(narration(page)).toContainText('Loaded 2 rules');
  await page
    .getByRole('group', { name: 'Show the code for' })
    .getByRole('button', { name: 'run' })
    .click();
  await expect(page.locator('.code')).toContainText('if D = S: head stays');
});

test('rules it cannot read are refused with the item named', async ({ page }) => {
  await type(page, 'q0 1 -> q1 0 X', 'Load');
  await expect(page.getByRole('alert')).toContainText('"X" in "q0 1 -> q1 0 X" is not a move');
  await type(page, '0_1', 'Run');
  await expect(page.getByRole('alert')).toContainText('blank');
});

test('the table sits beside the tape on a wide screen and under it on a phone', async ({
  page,
}, info) => {
  await type(page, '0011', 'Start');
  const box = (text: string | RegExp) =>
    stage(page).locator('text', { hasText: text }).first().boundingBox();
  await expect
    .poll(async () => {
      const table = await box('δ(q, a): next state, write, move');
      const trace = await box('Configurations (u q v)');
      if (!table || !trace) return 'not drawn';
      if (table.x > trace.x + 200 && table.y < trace.y) return 'beside';
      if (table.y > trace.y + 100) return 'under';
      return 'overlapping';
    })
    .toBe(info.project.name === 'phone' ? 'under' : 'beside');
  // Tape cells stay large enough to read on both screens.
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(28);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'The carry falls off a one-way tape' }).first().click();
  await expect(page.getByText('Loaded "The carry falls off a one-way tape"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/turing-machine/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite|Yes\./);
  if ((await feedback.textContent())?.includes('Not quite')) {
    const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)?.[1];
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = answer ? first.getByRole('radio', { name: answer, exact: true }) : null;
    if (radio && (await radio.count())) await radio.check();
    else await first.getByRole('textbox').fill(answer ?? '');
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /Turing machine with/);
});
