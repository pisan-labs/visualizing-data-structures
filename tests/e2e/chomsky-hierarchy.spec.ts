import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Grammar or language', { exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const svgText = (page: Page, text: string | RegExp) =>
  stage(page).locator('text', { hasText: text });

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
  await page.goto('/chomsky-hierarchy/');
  await expect(
    page.getByRole('heading', { name: 'The Chomsky hierarchy', exact: true }),
  ).toBeVisible();
});

test('the map shows each level with its machine and grammar form', async ({ page }) => {
  for (const title of ['All languages', 'Recursively enumerable', 'Decidable', 'Regular'])
    await expect(svgText(page, new RegExp(`^${title}$`))).toHaveCount(1);
  await expect(svgText(page, /^pushdown automaton/)).toHaveCount(1);
  await expect(svgText(page, /A\s→\sγ/)).toHaveCount(1);
});

test('Classify rules out regular at S → aSb and lands on context-free', async ({ page }) => {
  await fast(page);
  await type(page, 'S -> aSb | eps', 'Classify');
  await toEnd(page);
  await expect(narration(page)).toContainText('G is a context-free grammar');
  await expect(narration(page)).toContainText('That is an upper bound');
  await expect(stage(page)).toHaveAttribute('aria-label', /L\(G\) is in context-free/);
  await expect(svgText(page, /^L\(G\)$/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('S → aSb is not: b comes after the variable S');
  await expect(stage(page).locator('text.role-error', { hasText: /^aSb$/ })).toHaveCount(1);
});

test('an unrestricted grammar is caught by a rule that shrinks the string', async ({ page }) => {
  await fast(page);
  await type(page, 'S -> aSBC | abc; CB -> BC; bB -> bb; bC -> bc; cC -> c', 'Classify');
  await toEnd(page);
  await expect(narration(page)).toContainText('so G is unrestricted');
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('cC → c is not: its right side is shorter');
});

test('Place puts aⁿbⁿ in the context-free ring, with a claim for each side', async ({ page }) => {
  await fast(page);
  await type(page, 'anbn', 'Place');
  await toEnd(page);
  await expect(narration(page)).toContainText('aⁿbⁿ is context-free but not regular');
  await expect(svgText(page, /^aⁿbⁿ$/)).toHaveCount(1);
  await expect(svgText(page, '✓ Context-free')).toHaveCount(1);
  await expect(svgText(page, '✗ Not regular')).toHaveCount(1);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('pumping length p');
  await expect(stage(page).locator('rect.role-error')).toHaveCount(1);
});

test('the options rename the levels and hide the decidable band', async ({ page }) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('By type (Type 3 to Type 0)').check();
  await page.getByLabel('Show the decidable languages').uncheck();
  await page.getByText('Options', { exact: true }).click();
  await expect(svgText(page, /^Type 3$/)).toHaveCount(1);
  await expect(svgText(page, /^Type 0$/)).toHaveCount(1);
  await expect(svgText(page, /^Decidable$/)).toHaveCount(0);
  await fast(page);
  await type(page, 'halt', 'Place');
  await toEnd(page);
  await expect(narration(page)).toContainText('Type 0 (recursively enumerable)');
});

test('input it cannot use is refused, saying why', async ({ page }) => {
  await type(page, 'banana', 'Place');
  await expect(page.getByRole('alert')).toContainText('neither a grammar nor a language');
  await type(page, 'S -> a | ', 'Classify');
  await expect(page.getByRole('alert')).toContainText('has an empty alternative');
});

test('the panel sits beside the map on a wide screen and under it on a phone', async ({
  page,
}, info) => {
  await fast(page);
  await type(page, 'ww', 'Place');
  await toEnd(page);
  await expect
    .poll(async () => {
      const map = await stage(page).locator('rect').first().boundingBox();
      const title = await svgText(page, /^ww = /).boundingBox();
      if (!map || !title) return 'not drawn';
      if (title.x > map.x + map.width - 2) return 'beside';
      if (title.y > map.y + map.height - 2) return 'under';
      return 'overlapping';
    })
    .toBe(info.project.name === 'phone' ? 'under' : 'beside');
  // Region names stay large enough to read on both screens.
  await expect
    .poll(async () => (await svgText(page, /^Regular$/).boundingBox())?.height ?? 0)
    .toBeGreaterThan(11);
});

test('the whole map has no accessibility violations', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'The whole map' }).first().click();
  await expect(svgText(page, /^co-HALT$/)).toHaveCount(1);
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('concept page links load and play examples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page
    .getByRole('link', { name: 'A context-free grammar for a regular language' })
    .first()
    .click();
  await expect(
    page.getByText('Loaded "A context-free grammar for a regular language"'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).not.toBeEmpty();
});

test('a practice set grades an answer and plays it', async ({ page }) => {
  await page.goto('/chomsky-hierarchy/#practice=97531&n=5');
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
    await first.getByRole('button', { name: 'Check' }).click();
    await expect(feedback).toContainText('Yes.');
  }
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(narration(page)).not.toBeEmpty();
});
