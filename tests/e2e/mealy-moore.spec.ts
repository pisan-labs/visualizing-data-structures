import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Machine or word', { exact: true });

const PARITY = 'start e; e / 0; o / 1; e 0 -> e; e 1 -> o; o 0 -> o; o 1 -> e';

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
  await page.getByRole('button', { name, exact: true }).click();
}

async function option(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/mealy-moore/');
  await expect(
    page.getByRole('heading', { name: 'Mealy and Moore machines', exact: true }),
  ).toBeVisible();
});

test('the 101 detector writes one symbol per input symbol', async ({ page }) => {
  await fast(page);
  await press(page, 'Run', '110101');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The input is used up, and the Mealy machine wrote 000101: 6 symbols, one per input symbol.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Run on 110101: 6 of 6 symbols read; the Mealy machine is in q1 and has written 000101\./,
  );
});

test('Mealy to Moore splits q1, and the Moore output lags by one', async ({ page }) => {
  await fast(page);
  await press(page, 'Convert');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    "Done: a Moore machine with 4 states for the Mealy machine's 3: q1 is entered with different outputs, so it splits.",
  );
  // Back to the split itself.
  const back = page.getByRole('button', { name: 'Step back' });
  for (let i = 0; i < 12; i++) {
    if ((await narration(page).textContent())?.includes('splits into 2')) break;
    await back.click();
  }
  await expect(narration(page)).toContainText(
    "One Moore state writes only one output, so q1 splits into 2: q1 writes 0 and q1' writes 1.",
  );
  await press(page, 'Run', '110101');
  await toEnd(page);
  await expect(narration(page)).toContainText('Mealy wrote 000101 and Moore wrote 0000101.');
  await expect(stage(page).locator('text', { hasText: 'Moore output' })).toHaveCount(1);
  await expect(stage(page).locator('text', { hasText: 'Mealy output' })).toHaveCount(1);
});

test('the Moore output setting drops the start output, and the pseudocode follows', async ({
  page,
}) => {
  const moore = page.locator('.code li', { hasText: 'if M is Moore: write λ(q)' });
  await expect(moore).toHaveCount(2);
  await option(page, 'One symbol per input symbol: n symbols');
  await expect(moore).toHaveCount(1);
  await fast(page);
  await press(page, 'Convert');
  await press(page, 'Run', '110101');
  await toEnd(page);
  await expect(narration(page)).toContainText('Mealy wrote 000101 and Moore wrote 000101.');
});

test('Moore to Mealy keeps the states', async ({ page }) => {
  await fast(page);
  await press(page, 'Load', PARITY);
  await expect(narration(page)).toContainText('Loaded a Moore machine with 2 states');
  await press(page, 'Convert');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    "Done: a Mealy machine with the same 2 states and 4 moves. e's own output, 0, is gone",
  );
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText(
    'o on 1 goes to e, which writes 0. So in the Mealy machine this move writes 0: 1/0.',
  );
});

test('the round trip gives a bigger Mealy machine', async ({ page }) => {
  await fast(page);
  await press(page, 'Convert');
  await page.locator('details.more > summary').click();
  await press(page, 'Convert back');
  await toEnd(page);
  await expect(narration(page)).toContainText('converting does not minimize');
});

test('bad machine text is explained', async ({ page }) => {
  await press(page, 'Load', 'q0 a -> q1 / 1');
  await expect(page.getByRole('alert')).toContainText('q1 has no move on a.');
  await press(page, 'Load', 'q0 a -> q0 / 1; q0 / 1');
  await expect(page.getByRole('alert')).toContainText('Use one or the other.');
  await press(page, 'Run', '0120');
  await expect(narration(page)).toContainText('"2" is not in the alphabet {0, 1}');
});

test('both machines and three tapes stay readable', async ({ page }) => {
  await fast(page);
  await press(page, 'Convert');
  await press(page, 'Run', '110101');
  await toEnd(page);
  await page.getByRole('button', { name: 'Step back' }).click();
  // State names, outputs and tape cells: each at least 8 CSS pixels tall. Poll: the step back
  // is still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(q\d'*|[01])$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(25);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
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

test('"Show me" links load an example and play it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/mealy-moore/#practice=24680&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /(Mealy|Moore) machine with/);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-conversion and mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await press(page, 'Convert');
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const scan = async () =>
      (
        await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes.length}`);
    expect(await scan()).toEqual([]);
    await press(page, 'Run', '1101');
    await toEnd(page);
    await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    expect(await scan()).toEqual([]);
  });
}
