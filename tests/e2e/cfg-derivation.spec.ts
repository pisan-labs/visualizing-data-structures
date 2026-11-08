import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { axeFindings, settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Word or grammar', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const AMBIGUOUS = 'E -> E+E | E*E | (E) | a';
const PRECEDENCE = 'E -> E+T | T; T -> T*F | F; F -> (E) | a';

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
  await page.goto('/cfg-derivation/');
  await expect(
    page.getByRole('heading', { name: 'Grammars, derivations and parse trees', exact: true }),
  ).toBeVisible();
});

test('a leftmost derivation of aabb plays one rule per step and grows the tree', async ({
  page,
}) => {
  await fast(page);
  await type(page, 'aabb', 'Derive');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'that is a leftmost derivation of aabb in 3 steps, and the tree has 3 inner nodes',
  );
  await expect(stage(page).locator('text', { hasText: /^⇒ aabb$/ })).toHaveCount(1);
  const back = page.getByRole('button', { name: 'Step back' });
  await back.click();
  await back.click();
  await expect(narration(page)).toContainText('Use S → aSb on the leftmost S: S ⇒ aSb.');
  await expect(stage(page)).toHaveAttribute('aria-label', /step 1 of 3: the form is aSb\./);
  // The root S and the new S; a and b are squares.
  await expect(stage(page).locator('circle')).toHaveCount(2);
  await back.click();
  await expect(narration(page)).toContainText('found a leftmost derivation of aabb in 3 steps');
});

test('a word not in the language: the search runs out of forms', async ({ page }) => {
  await fast(page);
  await type(page, 'aab', 'Derive');
  await toEnd(page);
  await expect(narration(page)).toContainText('No leftmost derivation gives aab.');
  await expect(narration(page)).toContainText('so aab is not in the language');
  await expect(stage(page).locator('text', { hasText: 'not in the language' })).toHaveCount(1);
});

test('Ambiguity draws two parse trees for a+a*a, and one with precedence', async ({ page }) => {
  await fast(page);
  await type(page, AMBIGUOUS, 'Load');
  await type(page, 'a+a*a', 'Ambiguity');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Two parse trees for one word, so the grammar is ambiguous.',
  );
  await expect(stage(page).locator('text', { hasText: /^tree 2$/ })).toHaveCount(1);
  await expect(stage(page)).toHaveAttribute('aria-label', /A second parse tree is drawn/);
  await type(page, PRECEDENCE, 'Load');
  await type(page, 'a+a*a', 'Ambiguity');
  await toEnd(page);
  await expect(narration(page)).toContainText('so a+a*a has exactly one parse tree');
});

test('the rightmost setting replaces the rightmost variable', async ({ page }) => {
  await fast(page);
  await type(page, PRECEDENCE, 'Load');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('The rightmost (rightmost derivation)').check();
  await page.getByText('Options', { exact: true }).click();
  await page
    .getByRole('group', { name: 'Show the code for' })
    .getByRole('button', { name: 'derive' })
    .click();
  await expect(page.locator('.code')).toContainText('A = the rightmost variable in α');
  await type(page, 'a+a*a', 'Derive');
  await toEnd(page);
  await expect(narration(page)).toContainText('a rightmost derivation of a+a*a in 8 steps');
  await expect(stage(page).locator('text', { hasText: /^⇒ E\+T\*F$/ })).toHaveCount(1);
});

test('a grammar it cannot read is refused with the rule named', async ({ page }) => {
  await type(page, 'S -> aSb |', 'Load');
  await expect(page.getByRole('alert')).toContainText('"S -> aSb |" has an empty alternative');
  await type(page, 'aSb', 'Derive');
  await expect(page.getByRole('alert')).toContainText('capitals are variables');
});

test('the tree sits beside the derivation on a wide screen and under it on a phone', async ({
  page,
}, info) => {
  await fast(page);
  await type(page, 'aaabbb', 'Derive');
  await toEnd(page);
  const box = (text: string | RegExp) =>
    stage(page).locator('text', { hasText: text }).first().boundingBox();
  await expect
    .poll(async () => {
      const form = await box('leftmost derivation of aaabbb');
      const root = await stage(page).locator('circle').first().boundingBox();
      if (!form || !root) return 'not drawn';
      if (root.x > form.x + form.width && root.y < form.y + 40) return 'beside';
      if (root.y > form.y + 60) return 'under';
      return 'overlapping';
    })
    .toBe(info.project.name === 'phone' ? 'under' : 'beside');
  // Symbol cells stay large enough to read.
  await expect
    .poll(async () => (await stage(page).locator('rect').first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(18);
});

test('two trees have no accessibility violations', async ({ page }) => {
  await fast(page);
  await type(page, AMBIGUOUS, 'Load');
  await type(page, 'a+a*a', 'Ambiguity');
  await toEnd(page);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'The dangling else' }).first().click();
  await expect(page.getByText('Loaded "The dangling else"')).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/cfg-derivation/#practice=13579&n=5');
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
  await expect(stage(page)).toHaveAttribute('aria-label', /Grammar with start variable/);
});
