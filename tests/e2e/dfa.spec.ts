import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled, showMe } from './helpers';

const narration = (page: Page) => page.locator('.narration p');
const stage = (page: Page) => page.locator('.stage > svg');
const input = (page: Page) => page.getByLabel('Machine or word', { exact: true });

const STARTS_AB = 'start q0; accept q2; q0 a -> q1; q1 b -> q2; q2 a,b -> q2';
const BUGGY =
  'start q0; accept q2; q0 a -> q1; q0 b -> q0; q1 a -> q0; q1 b -> q2; q2 a -> q1; q2 b -> q0';

async function fast(page: Page) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
}

async function op(page: Page, name: string, value: string) {
  await input(page).fill(value);
  await page.getByRole('button', { name, exact: true }).click();
}

async function toEnd(page: Page) {
  // Playback can disable the button between the check and the click; jumping also pauses.
  const next = page.getByRole('button', { name: 'Forward to the next operation' });
  while (!(await next.isDisabled())) await next.click({ force: true });
}

/** The centre of a state's name on screen (the tape's head label is monospace; names are not). */
async function centre(page: Page, q: string) {
  const box = await stage(page)
    .locator('text.shape:not(.mono)', { hasText: new RegExp(`^${q}$`) })
    .first()
    .boundingBox();
  return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dfa/');
  await expect(
    page.getByRole('heading', { name: 'Deterministic finite automaton (DFA)', exact: true }),
  ).toBeVisible();
});

test('a run reads one symbol per step and ends in a verdict', async ({ page }) => {
  await fast(page);
  await op(page, 'Run', '1101');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The input is used up and the machine is in q2, an accept state, so it accepts 1101.',
  );
  await expect(stage(page)).toHaveAttribute('aria-label', /Run on 1101: accepted, ending in q2\./);
  await expect(stage(page).locator('text', { hasText: '✓ accept' })).toHaveCount(1);
  await expect(page.locator('.vars')).toContainText(/steps\s*=?\s*4/);
  // Step back into the run: one move per symbol, with δ in the variables.
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(narration(page)).toContainText('Read 1: δ(q1, 1) = q2. Move to q2.');
  await expect(page.locator('.vars')).toContainText('δ(q1, 1) = q2');
});

test('a missing move rejects, and the dead state can be drawn', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', STARTS_AB);
  await op(page, 'Run', 'ba');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Read b: there is no move from q0 on b. A missing move rejects, so the machine rejects ba',
  );
  await expect(page.locator('.code')).toContainText('if δ(q, c) is undefined');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Draw the dead state they lead to').check();
  await page.getByText('Options', { exact: true }).click();
  await expect(page.locator('.code')).not.toContainText('is undefined');
  await op(page, 'Run', 'aab');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'The input is used up and the machine is in dead, which is not an accept state',
  );
});

test('a test batch marks the word that disagrees', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', BUGGY);
  await op(page, 'Test', '+ab +aab -ba -eps');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'Done: 3 of 4 words do what they should. aab is rejected but should be accepted.',
  );
  await expect(stage(page)).toHaveAttribute(
    'aria-label',
    /aab \(should accept, rejected, a mismatch\)/,
  );
  await expect(stage(page).locator('text', { hasText: '✗' })).toHaveCount(1);
  await expect(stage(page).locator('text', { hasText: '✓' })).toHaveCount(3);
});

test('machines that are not DFAs, and bad input, are explained', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', 'q0 a -> q1; q0 a -> q2');
  await toEnd(page);
  await expect(narration(page)).toContainText(
    'This is not a DFA: q0 has 2 moves on a (to q1 and q2), and a DFA has at most one.',
  );
  await op(page, 'Run', 'a#b');
  await expect(page.getByRole('alert')).toContainText('"a#b" is not a word');
  await op(page, 'Run', 'ab');
  await toEnd(page);
  await expect(narration(page)).toContainText('"a" is not in the alphabet');
});

test('the diagram runs across a laptop and down a phone, and stays readable', async ({
  page,
}, info) => {
  await fast(page);
  await op(page, 'Run', '0110100101');
  await toEnd(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step back' }).click();
  // State names, move labels and tape symbols: at least 9 CSS pixels tall. Poll: stepping
  // back animates, and fading copies measure smaller.
  const heights = () =>
    stage(page)
      .locator('text.shape')
      .evaluateAll((els) =>
        els
          .filter((e) => /^(q[0-2]|[01]|0,1)$/.test(e.textContent ?? ''))
          .map((e) => e.getBoundingClientRect().height),
      );
  await expect.poll(async () => Math.min(...(await heights()))).toBeGreaterThanOrEqual(9);
  const q0 = (await centre(page, 'q0'))!;
  const q1 = (await centre(page, 'q1'))!;
  if (info.project.name === 'phone') expect(q1.y - q0.y).toBeGreaterThan(20);
  else expect(q1.x - q0.x).toBeGreaterThan(20);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a practice question is graded and shown on the drawing', async ({ page }) => {
  await page.goto('/dfa/#practice=24680&n=4');
  await expect(page.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = page.locator('.question').first();
  await first.getByRole('button', { name: 'Check' }).click();
  const feedback = first.locator('.feedback');
  await expect(feedback).toContainText('Not quite. The answer is');
  const answer = ((await feedback.textContent()) ?? '').match(/The answer is (.+?)\./)![1]!;
  await first.getByRole('button', { name: 'Try again' }).click();
  const radio = first.getByRole('radio', { name: answer, exact: true });
  if (await radio.count()) await radio.check();
  else await first.getByRole('textbox').fill(answer);
  await first.getByRole('button', { name: 'Check' }).click();
  await expect(feedback).toContainText('Yes.');
  await showMe(page, first.getByRole('button', { name: 'Show me' }));
  await expect(stage(page)).toHaveAttribute('aria-label', /(Run on|Test of) /);
});

test('the concept page plays an example', async ({ page }) => {
  await page.getByRole('tab', { name: 'Learn' }).click();
  await showMe(page, page.getByRole('link', { name: 'Show me' }).first());
  await expect(narration(page)).toContainText('1101');
});

test('a stuck run and a test table pass axe', async ({ page }) => {
  await fast(page);
  await op(page, 'Load', STARTS_AB);
  await op(page, 'Run', 'ba');
  await toEnd(page);
  await settled(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await op(page, 'Load', BUGGY);
  await op(page, 'Test', '+ab +aab -ba -eps');
  await toEnd(page);
  await settled(page);
  expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
