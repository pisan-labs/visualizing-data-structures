import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Input or rules', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const MULTIPLY =
  'mark 1|*,_,_ -> copy -,$,- S,R,S; copy 1,_,_ -> copy 1,1,_ R,R,S; copy *,_,_ -> right R,L,S; right 1,1,_ -> right -,-,1 R,S,R; right _,1,_ -> left L,L,S; left 1,1,_ -> left -,-,1 L,S,R; left *,1,_ -> right R,L,S; right 1|_,$,_ -> accept S,S,S; left 1|*,$,_ -> accept S,S,S';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function press(page: Page, name: string, text?: string) {
  if (text !== undefined) await input(page).fill(text);
  await button(page, name).click();
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

/** Step back until the narration says `text`, at most `max` times. */
async function backTo(page: Page, text: string, max = 40) {
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < max; i++) {
    if ((await narration(page).textContent())?.includes(text)) return;
    await back.click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/multitape-tm/');
  await expect(
    page.getByRole('heading', { name: 'Multi-tape Turing machine', exact: true }),
  ).toBeVisible();
});

test('a run counts the moves of both machines', async ({ page }) => {
  await fast(page);
  await press(page, 'Run', '01=01');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The machine accepts 01=01 after 10 moves. On one tape, the same run takes 266 moves.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /Status: accept after 10 moves\./);
  await expect(stage(page).locator('text', { hasText: /^M: 10 moves$/ })).toHaveCount(1);
  await expect(stage(page).locator('text', { hasText: /^S: 266 moves/ })).toHaveCount(1);
  await press(page, 'Run', '01=10');
  await toEnd(page);
  await expect(narration(page)).toContainText('no rule covers that');
});

test('the simulation scans right, shifts, and scans back', async ({ page }) => {
  await fast(page);
  await press(page, 'Simulate', '01=01');
  await toEnd(page);
  await expect(narration(page)).toContainText('S accepts after 266');
  await backTo(page, 'landed on a #');
  await expect(narration(page)).toContainText('so that tape needs a new cell');
  await page.getByRole('combobox', { name: 'Detail' }).selectOption('3');
  await backTo(page, 'Scanning right');
  await expect(narration(page)).toContainText('Scanning right, S passes the dot for tape');
  await expect(page.locator('.code li.active')).toContainText('scan right to the last #');
});

test('Start and Step simulate one move at a time', async ({ page }) => {
  await fast(page);
  await press(page, 'Start', '01=01');
  await expect(narration(page)).toContainText('16 moves. Press Step');
  await press(page, 'Step');
  await toEnd(page);
  await expect(narration(page)).toContainText('Back at the first #: move 1 of M took S');
  await expect(page.locator('.vars')).toContainText(/M moves\s*=?\s*1(?!\d)/);
});

test('the marks can be underlines, and the pseudocode follows', async ({ page }) => {
  await page
    .getByRole('group', { name: 'Show the code for' })
    .getByRole('button', { name: 'simulate' })
    .click();
  await expect(page.locator('.code')).toContainText('first cells dotted');
  await expect(stage(page).locator('circle.arrowhead')).toHaveCount(2);
  await option(page, 'A line under the symbol');
  await expect(page.locator('.code')).toContainText('first cells underlined');
  await expect(stage(page).locator('circle.arrowhead')).toHaveCount(0);
  await expect(stage(page).locator('text', { hasText: 'a line marks each head' })).toHaveCount(1);
});

test('a three-tape machine multiplies in unary', async ({ page }) => {
  await fast(page);
  await press(page, 'Load', MULTIPLY);
  await expect(narration(page)).toContainText('Loaded a 3-tape machine');
  await press(page, 'Run', '11*111');
  await toEnd(page);
  await expect(stage(page)).toHaveAttribute('aria-label', /tape 3 holds 1 1 1 1 1 1,/);
  await expect(narration(page)).toContainText('accepts 11*111 after 13 moves');
});

test('rules and input it cannot read are refused with the reason', async ({ page }) => {
  await press(page, 'Load', 'q0 1 -> q1 0 R');
  await expect(page.getByRole('alert')).toContainText('2 or 3 tapes');
  await press(page, 'Run', '0#1');
  await expect(page.getByRole('alert')).toContainText('separate the tapes');
  await press(page, 'Run', '0,1,0');
  await expect(narration(page)).toContainText('this machine has 2 tapes');
});

test('the rules sit beside the tapes on a wide screen and under them on a phone', async ({
  page,
}, info) => {
  await press(page, 'Start', '01=01');
  const box = (text: string | RegExp) =>
    stage(page).locator('text', { hasText: text }).first().boundingBox();
  await expect
    .poll(async () => {
      const rules = await box('Rules: state reads');
      const one = await box(/^S, on one tape/);
      if (!rules || !one) return 'not drawn';
      if (rules.x > one.x + 200 && rules.y < one.y) return 'beside';
      if (rules.y > one.y + 100) return 'under';
      return 'overlapping';
    })
    .toBe(info.project.name === 'phone' ? 'under' : 'beside');
  // Tape cells stay large enough to read.
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(20);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  // CI's default font (DejaVu Sans) is wider: the controls must wrap, not overflow.
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Binary addition with two input tapes' }).first().click();
  await expect(page.getByText('Loaded "Binary addition with two input tapes"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/multitape-tm/#practice=24680&n=5');
  await expect(page.locator('.question')).toHaveCount(5);
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText(/Not quite|Yes\./);
  if ((await feedback.textContent())?.includes('Not quite')) {
    const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\.(\s|$)/)?.[1];
    await first.getByRole('button', { name: 'Try again' }).click();
    const radio = answer ? first.getByRole('radio', { name: answer, exact: true }) : null;
    if (radio && (await radio.count())) await radio.check();
    else await first.getByRole('textbox').fill(answer ?? '');
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /-tape Turing machine with/);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-simulation (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await press(page, 'Simulate', '01=01');
    await toEnd(page);
    await backTo(page, 'landed on a #');
    await settled(page);
    const scan = async () =>
      (
        await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes.length}`);
    expect(await scan()).toEqual([]);
  });
}
