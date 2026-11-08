import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Automaton', { exact: true });

const DIV3 =
  'start q0; accept q0; q0 0 -> q0; q0 1 -> q1; q1 0 -> q2; q1 1 -> q0; q2 0 -> q1; q2 1 -> q2';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

async function load(page: Page, text: string) {
  await input(page).fill(text);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
}

async function convert(page: Page) {
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await toEnd(page);
}

async function option(page: Page, label: string) {
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
  await page.goto('/dfa-to-regex/');
  await expect(
    page.getByRole('heading', { name: 'DFA to regular expression', exact: true }),
  ).toBeVisible();
});

test('the starting DFA ends with one expression from s to f', async ({ page }) => {
  await fast(page);
  await convert(page);
  await expect(narration(page)).toContainText(
    'The label on s → f is the answer: b*aa*b(ba*b∪a)*ba*∪b*aa*.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /states s and f, start s, accept f\./);
  await expect(stage(page)).toHaveAttribute('aria-label', /The answer: b\*aa\*b\(ba\*b∪a\)\*/);
});

test('the finest detail reads R1 to R4 before writing the new label', async ({ page }) => {
  await fast(page);
  await page.getByRole('combobox', { name: 'Detail' }).selectOption('3');
  await loadExample(page, 'Contains a b: two states, two rips');
  // The example opens on its Load step; then s and f, the merge, and the pick of q1.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText(
    'Pair s, q2: R1 = ε (s → q1), R2 = a (the loop), R3 = b (q1 → q2), and R4 = ∅: there is no arrow s → q2 yet.',
  );
  for (const tag of ['R1', 'R2', 'R3', 'R4'])
    await expect(stage(page).locator('text', { hasText: new RegExp(`^${tag}$`) })).toHaveCount(1);
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(narration(page)).toContainText(
    'New label s → q2: R1(R2)*R3 ∪ R4 = εa*b∪∅, and Rε = R and R ∪ ∅ = R leave a*b.',
  );
});

test('the order changes the size of the answer, not its language', async ({ page }) => {
  await fast(page);
  await load(page, DIV3);
  await convert(page);
  await expect(narration(page)).toContainText('Its size is 43');
  await option(page, 'Fewest paths through it first (arrows in × out)');
  await expect(page.locator('.code')).toContainText('q = state with fewest in × out');
  await convert(page);
  await expect(narration(page)).toContainText('the answer: (1(01*0)*1∪0)*.');
  await expect(narration(page)).toContainText('Its size is 10');
});

test('with simplifying off, the rule is written exactly', async ({ page }) => {
  await option(page, 'Not at all: the rule exactly as written');
  await expect(page.locator('.code')).not.toContainText('simplify with');
  await fast(page);
  await load(page, 'start q1; accept q2; q1 a -> q1; q1 b -> q2; q2 a,b -> q2');
  await convert(page);
  await expect(narration(page)).toContainText('the answer: (εa*b∪∅)(a∪b)*ε∪∅.');
});

test('an NFA and a DFA of seven states are refused', async ({ page }) => {
  await load(page, 'q0 a -> q1; q0 a -> q2; accept q2');
  await expect(page.getByRole('alert')).toContainText('That is an NFA: q0 has 2 moves on a');
  await load(
    page,
    'q0 a -> q1; q1 a -> q2; q2 a -> q3; q3 a -> q4; q4 a -> q5; q5 a -> q6; accept q6',
  );
  await expect(page.getByRole('alert')).toContainText('Use at most 6 states here');
});

test('the diagram and the label table stay readable mid-run', async ({ page }) => {
  await fast(page);
  await loadExample(page, 'Divisible by 3 in binary: name order');
  await toEnd(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
  // State names, tags and table labels: each at least 8 CSS pixels tall. Wait for the last step
  // back to finish animating: mid-tween the old step's labels are on screen too, so a count
  // taken then is not this step's.
  await settled(page);
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(s|f|q\d|R\d|[01*()∪]+)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  // At this step: s, q2 and f, and four labels in the table.
  expect((await heights()).length).toBeGreaterThanOrEqual(7);
  expect(Math.min(...(await heights()))).toBeGreaterThanOrEqual(8);
  // No horizontal scroll, with CI's wider default font too.
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
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
  await page.goto('/dfa-to-regex/#practice=24680&n=4');
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\. /)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /The GNFA: states/);
});

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no axe violations mid-run (${theme})`, async ({ page }) => {
    await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
    await fast(page);
    await page.getByRole('combobox', { name: 'Detail' }).selectOption('3');
    await convert(page);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Step back' }).click();
    await settled(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
  });
}
