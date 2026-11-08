import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Machines or word', { exact: true });

const STARTS_A = 'start p0; accept p1; p0 a -> p1; p1 a,b -> p1';
const ENDS_B = 'start q0; accept q1; q0 a -> q0; q0 b -> q1; q1 a -> q0; q1 b -> q1';

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

async function operation(page: Page, label: string) {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel(label).check();
  await page.getByText('Options', { exact: true }).click();
}

async function loadExample(page: Page, title: string) {
  await page.getByRole('tab', { name: 'Examples' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Load' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/product-construction/');
  await expect(
    page.getByRole('heading', { name: 'Union and intersection of DFAs', exact: true }),
  ).toBeVisible();
});

test('the starting machines make a union of four pairs', async ({ page }) => {
  await fast(page);
  await press(page, 'Build');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The product is finished: 4 states, every one of the 2 × 2 = 4 pairs. (p0, q0), (p0, q1) and (p1, q1) accept',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /The product so far: \(p0, q0\) \(accepts\): on a to \(p1, q0\), on b to \(p0, q1\); \(p1, q0\): on a to \(p0, q0\)/,
  );
});

test('the operation changes only which pairs accept, and the pseudocode says so', async ({
  page,
}) => {
  await operation(page, 'Intersection, A ∩ B: in both');
  await expect(page.locator('.code')).toContainText('F = {(p, q) : p ∈ F_A and q ∈ F_B}');
  await fast(page);
  await press(page, 'Build');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    '(p0, q1) accepts, and the product accepts exactly the words in both A and B.',
  );
});

test('a missing move gets a dead state first, and the union keeps following B', async ({
  page,
}) => {
  await fast(page);
  await press(page, 'Load', `${STARTS_A} | ${ENDS_B}`);
  await press(page, 'Build');
  await toEnd(page);
  await expect(narration(page)).toContainText('5 of the 3 × 2 = 6 pairs');
  await expect(narration(page)).toContainText('(dead, q1)');
  await page.getByRole('button', { name: 'Back to the previous operation' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText(
    'A has no move from p0 on b. A pair moves only when both machines can',
  );
  // The dead state is drawn dashed, and its pairs come as Build finds them.
  await expect(stage(page).locator('circle.dead-state').first()).toBeVisible();
});

test('a word runs on A, B and the product at once', async ({ page }) => {
  await fast(page);
  await press(page, 'Run', 'abba');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'A is in p0, an accept state, and B is in q0, which does not accept. Only p0 accepts, so (p0, q0) accepts: for a union, one is enough. The product accepts abba.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /Run on abba: 4 of 4 symbols read\. A is in p0, B in q0, so the product is in \(p0, q0\); it accepts\./,
  );
  await expect(stage(page).locator('text', { hasText: '✓ accept' })).toHaveCount(1);
});

test('complementing completes the machine first, then swaps', async ({ page }) => {
  await fast(page);
  await press(page, 'Load', `${STARTS_A} | ${ENDS_B}`);
  await page.locator('details.more > summary').click();
  await press(page, 'Complement A');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Now swap accept and non-accept states: dead and p0 accept, and p1 no longer does.',
  );
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('First make A complete.');
});

test('two machines over different alphabets read both', async ({ page }) => {
  await press(page, 'Load', `p0 a -> p1; p1 a -> p0; accept p1 | ${ENDS_B}`);
  await expect(narration(page)).toContainText('Their alphabets differ, so both now read {a, b}.');
});

test('bad text is explained', async ({ page }) => {
  await press(page, 'Load', STARTS_A);
  await expect(page.getByRole('alert')).toContainText(
    'Type two machines, A and B, with a | between them',
  );
  await press(page, 'Load', `q0 a -> q1; q0 a -> q2 | ${ENDS_B}`);
  await expect(page.getByRole('alert')).toContainText('Machine A is not a DFA');
});

test('every pair of a 3 × 2 grid stays readable', async ({ page }) => {
  await fast(page);
  await loadExample(page, 'Divisible by 6: every pair is reachable');
  await toEnd(page);
  await expect(narration(page)).toContainText('every one of the 3 × 2 = 6 pairs');
  await page.getByRole('button', { name: 'Step back' }).click();
  // State names (pairs on two lines) and table cells: each at least 8 CSS pixels tall. Poll:
  // the step back is still animating.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(→?p\d,q\d|p\d|q\d|✓|–)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await settled(page);
  await expect.poll(async () => (await heights()).length).toBeGreaterThan(40);
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  // CI's default font (DejaVu Sans) is wider: the page must still fit.
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
  await page.goto('/product-construction/#practice=24680&n=4');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Machine A: a DFA with/);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-build (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await press(page, 'Load', `${STARTS_A} | ${ENDS_B}`);
    await press(page, 'Build');
    await toEnd(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
