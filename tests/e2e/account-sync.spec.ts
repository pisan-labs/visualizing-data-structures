/**
 * Accounts slice 2: "New since your last visit" on the home page, preferences and progress that
 * follow the account, the email opt-in, and "Delete my StepWise data". Every Supabase endpoint
 * is mocked (./supabase-mock.ts); nothing reaches a real host.
 */
import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { axeFindings, settled } from './helpers';
import {
  accountsOn,
  mockSupabase,
  row,
  storedSession,
  stubTurnstile,
  USER,
  type Mock,
  type PrefRow,
} from './supabase-mock';
// The release list itself (it imports nothing), so these tests follow each new release.
import { releases, releasesSince } from '../../src/releases';

const LATEST = releases.at(-1)!.id;
const header = (page: Page) => page.locator('header.site');
const signIn = (page: Page) => header(page).getByRole('button', { name: 'Sign in' });
const accountMenu = (page: Page) => header(page).locator('summary', { hasText: 'Account' });
const card = (page: Page) => page.getByRole('region', { name: 'New since your last visit' });
const stored = (page: Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(`stepwise:${k}`), key);
const callsTo = (mock: Mock, pathname: string, method?: string) =>
  mock.calls.filter((c) => c.url.pathname === pathname && (!method || c.method === method));

/** Uncaught errors in the page; a test expects none. */
function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** No sideways scrolling, also with the wide font CI falls back to. */
async function fits(page: Page) {
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.addStyleTag({
    content: ":root { --font: 'DejaVu Sans', Verdana, sans-serif !important; }",
  });
  expect(await overflow(page)).toBeLessThanOrEqual(0);
}

async function axe(page: Page, selector: string) {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axeFindings(results)).toEqual([]);
}

/** localStorage entries set once, before the app first starts (not again on reload). */
async function storeOnce(page: Page, entries: Record<string, unknown>) {
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('test:stored')) return;
    sessionStorage.setItem('test:stored', '1');
    for (const [k, v] of Object.entries(e))
      localStorage.setItem(`stepwise:${k}`, JSON.stringify(v));
  }, entries);
}

test.describe('new since your last visit', () => {
  test('a first visit records the latest release and shows nothing', async ({ page }) => {
    const mock = await mockSupabase(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => stored(page, 'last-release')).toBe(JSON.stringify(LATEST));
    await expect(card(page)).toHaveCount(0);
    expect(mock.calls).toEqual([]);
  });

  test('lists the releases since the last one seen, with their pages, until dismissed', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await storeOnce(page, { 'last-release': '2026-11-08-wave-7' });
    await page.goto('/');
    await expect(card(page)).toBeVisible();
    const items = card(page).locator('.releases > li');
    // Newest first: every release after wave 7.
    const since = releasesSince('2026-11-08-wave-7');
    await expect(items).toHaveCount(since.length);
    await expect(items.nth(0)).toContainText(since[0]!.title);
    const features = items.filter({ hasText: 'Sign in, Present tools, worksheets and more' });
    const wave8 = items.filter({ hasText: '12 new pages, and the older pages reviewed' });
    await expect(wave8.getByRole('link')).toHaveCount(12);
    await expect(wave8.getByRole('link', { name: 'Two pointers' })).toHaveAttribute(
      'href',
      '/two-pointers/',
    );
    await expect(features.getByRole('link')).toHaveCount(0);
    await axe(page, 'section.new-since');
    await fits(page);

    await card(page).getByRole('button', { name: 'Dismiss what is new' }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#main')).toBeFocused();
    expect(await stored(page, 'last-release')).toBe(JSON.stringify(LATEST));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('folds a long list of new pages behind its count', async ({ page }) => {
    await storeOnce(page, { 'last-release': '2026-11-01-start' });
    await page.goto('/');
    const wave7 = card(page).locator('.releases > li').filter({ hasText: '62 new pages' });
    await expect(wave7).toContainText('62 new pages');
    const fold = wave7.locator('summary', { hasText: 'The 62 new pages' });
    await expect(fold).toBeVisible();
    await expect(wave7.getByRole('link', { name: 'Timsort' })).toBeHidden();
    await fold.click();
    await expect(wave7.getByRole('link')).toHaveCount(62);
    await expect(wave7.getByRole('link', { name: 'Timsort' })).toBeVisible();
    await axe(page, 'section.new-since');
    await fits(page);
  });
});

test.describe('signed out, accounts on', () => {
  test('settings stay in the browser and nothing is sent', async ({ page }) => {
    await accountsOn(page);
    const mock = await mockSupabase(page);
    await page.goto('/');
    await header(page).getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await expect.poll(() => stored(page, 'theme')).toBe('"dark"');
    await expect.poll(() => stored(page, 'last-release')).toBe(JSON.stringify(LATEST));
    await page.waitForTimeout(4000);
    expect(mock.calls).toEqual([]);
    expect(mock.chunks).toEqual([]);
  });
});

const prefRow = (fields: Partial<PrefRow> = {}): PrefRow => ({
  prefs: { theme: { value: 'dark', at: '2026-11-10T12:00:00.000Z' } },
  progress: {
    version: 1,
    pages: {
      'stack-array': {
        lessons: { 'the-idea': { done: true, at: '2026-11-10T12:00:00.000Z' } },
        checks: {},
        practice: {},
      },
    },
  },
  last_release: '2026-11-09-wave-8',
  notify_new_pages: true,
  updated_at: '2026-11-10T12:00:00.000123+00:00',
  ...fields,
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await accountsOn(page);
    await storedSession(page);
  });

  test('merges the account and the browser on sign-in, and writes back what the account lacked', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    // This browser: a theme set before times were kept, a speed chosen later than the account's
    // theme, an older release seen.
    await storeOnce(page, {
      theme: 'light',
      speed: 2,
      'pref-times': { speed: '2026-11-10T13:00:00.000Z' },
      'last-release': '2026-11-08-wave-7',
    });
    const mock = await mockSupabase(page, { preferences: prefRow() });
    await page.goto('/');
    // The account's later theme applies, and its release (wave 8): what came after it is new.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(card(page).locator('.releases > li')).toHaveCount(
      releasesSince('2026-11-09-wave-8').length,
    );
    await expect(card(page)).toContainText('Sign in, Present tools, worksheets and more');
    // The account's progress shows on the home page.
    await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
    await expect(page.getByText('Kept in this browser and in your account.')).toBeVisible();
    // The speed goes up to the account, on top of the copy read.
    await expect.poll(() => callsTo(mock, '/rest/v1/preferences', 'PATCH').length).toBe(1);
    const [patch] = callsTo(mock, '/rest/v1/preferences', 'PATCH');
    expect(patch!.url.searchParams.get('owner')).toBe(`eq.${USER.id}`);
    expect(patch!.url.searchParams.get('updated_at')).toBe('eq.2026-11-10T12:00:00.000123+00:00');
    expect(patch!.body).toMatchObject({
      prefs: {
        theme: { value: 'dark', at: '2026-11-10T12:00:00.000Z' },
        speed: { value: 2, at: '2026-11-10T13:00:00.000Z' },
      },
      last_release: '2026-11-09-wave-8',
      notify_new_pages: true,
    });
    expect(await stored(page, 'theme')).toBe('"dark"');
    expect(await stored(page, 'last-release')).toBe('"2026-11-09-wave-8"');
    expect(errors).toEqual([]);
  });

  test('writes a change back a few seconds later, never at once', async ({ page }) => {
    const mock = await mockSupabase(page, { preferences: prefRow() });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => callsTo(mock, '/rest/v1/preferences', 'GET').length).toBe(1);
    const before = callsTo(mock, '/rest/v1/preferences', 'PATCH').length;
    await header(page).getByRole('combobox', { name: 'Theme' }).selectOption('contrast');
    const changed = Date.now();
    await page.waitForTimeout(1500);
    expect(callsTo(mock, '/rest/v1/preferences', 'PATCH')).toHaveLength(before);
    await expect
      .poll(() => callsTo(mock, '/rest/v1/preferences', 'PATCH').length, { timeout: 10_000 })
      .toBe(before + 1);
    expect(Date.now() - changed).toBeGreaterThanOrEqual(2500);
    const patch = callsTo(mock, '/rest/v1/preferences', 'PATCH').at(-1)!;
    expect((patch.body as PrefRow).prefs).toMatchObject({ theme: { value: 'contrast' } });
    expect(mock.preferences?.prefs).toMatchObject({ theme: { value: 'contrast' } });
  });

  test('a speed from the account applies to the open page', async ({ page }) => {
    await mockSupabase(page, {
      preferences: prefRow({
        prefs: { speed: { value: 4, at: '2026-11-10T12:00:00.000Z' } },
      }),
    });
    await page.goto('/stack-array/');
    await expect(page.getByRole('combobox', { name: 'Speed' })).toHaveValue('4');
  });

  test('the account menu turns email about new pages on and off', async ({ page }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page, { preferences: prefRow({ notify_new_pages: false }) });
    await page.goto('/');
    await accountMenu(page).click();
    const box = header(page).getByRole('checkbox', {
      name: 'Email me when StepWise adds new pages (at most once a day)',
    });
    await expect(box).not.toBeChecked();
    await expect(header(page)).toContainText('You can turn this off here at any time.');
    await expect(header(page)).toContainText(
      'Your settings and progress are kept in your account too.',
    );
    await box.check();
    await expect.poll(() => mock.preferences?.notify_new_pages).toBe(true);
    await expect(box).toBeChecked();
    await axe(page, 'details.account-menu');
    await fits(page);
    await box.uncheck();
    await expect.poll(() => mock.preferences?.notify_new_pages).toBe(false);
    // Read back on the next visit.
    await box.check();
    await expect.poll(() => mock.preferences?.notify_new_pages).toBe(true);
    await page.reload();
    await accountMenu(page).click();
    await expect(box).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('a database without the preferences table leaves everything in the browser, quietly', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page, { noPreferences: true });
    await page.goto('/');
    await expect.poll(() => callsTo(mock, '/rest/v1/preferences').length).toBe(1);
    await header(page).getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await page.waitForTimeout(4000);
    // Tried once, then left alone; no error notice.
    expect(callsTo(mock, '/rest/v1/preferences')).toHaveLength(1);
    await expect(page.locator('.notice.error')).toHaveCount(0);
    await accountMenu(page).click();
    await expect(header(page)).toContainText(
      'Your settings and progress are kept in this browser.',
    );
    await expect(
      header(page).getByRole('checkbox', {
        name: 'Email me when StepWise adds new pages (at most once a day)',
      }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('Delete my StepWise data asks first, deletes, clears this browser and signs out', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await storeOnce(page, { theme: 'dark', library: [] });
    const theirs = row({
      viz: 'bst',
      title: 'Someone else’s',
      owner: '0000000b-0000-4000-8000-000000000000',
      example: { format: 1, viz: 'bst', ops: [] },
    });
    const mock = await mockSupabase(page, {
      preferences: prefRow(),
      rows: [row({ viz: 'stack-array', title: 'Mine', example: { format: 1 } }), theirs],
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
    await accountMenu(page).click();
    await header(page).getByRole('button', { name: 'Delete my StepWise data' }).click();
    const ask = page.getByRole('dialog', { name: 'Delete my StepWise data' });
    await expect(ask).toBeVisible();
    for (const text of [
      'your saved examples',
      'your preferences: settings, progress, the last release you saw and the email choice',
      'your lesson lists',
      'signs you out here',
      'builder@hintwise.org',
    ])
      await expect(ask).toContainText(text);
    const keep = ask.getByRole('button', { name: 'Keep my data' });
    await expect(keep).toBeFocused();
    await axe(page, 'dialog.ask');
    await fits(page);

    // Keep: nothing happens.
    await keep.click();
    await expect(ask).toBeHidden();
    expect(callsTo(mock, '/rest/v1/rpc/delete_my_data')).toEqual([]);

    await accountMenu(page).click();
    await header(page).getByRole('button', { name: 'Delete my StepWise data' }).click();
    await ask.getByRole('button', { name: 'Delete my data' }).click();
    await expect(ask.getByRole('status')).toHaveText(
      'Your StepWise data is deleted, and you are signed out.',
    );
    await expect(ask).toContainText('shared with other HintWise apps');
    await expect(ask.getByRole('link', { name: 'builder@hintwise.org' })).toHaveAttribute(
      'href',
      'mailto:builder@hintwise.org',
    );
    expect(callsTo(mock, '/rest/v1/rpc/delete_my_data', 'POST')).toHaveLength(1);
    expect(mock.rows).toEqual([theirs]);
    expect(mock.preferences).toBeUndefined();
    for (const key of ['theme', 'progress', 'last-release', 'pref-times'])
      expect(await stored(page, key), key).toBeNull();
    expect(await stored(page, 'library')).toBe('[]');
    expect(await page.evaluate(() => localStorage.getItem('stepwise:auth'))).toBeNull();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: 'Your progress' })).toHaveCount(0);
    await axe(page, 'dialog.ask');

    await ask.getByRole('button', { name: 'Close' }).click();
    await expect(signIn(page)).toBeFocused();
    // Nothing goes back up afterwards.
    const writes = mock.calls.length;
    await page.waitForTimeout(4000);
    expect(mock.calls.slice(writes).filter((c) => c.method !== 'GET')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a delete that fails says so and changes nothing', async ({ page }) => {
    await storeOnce(page, { theme: 'dark' });
    const mock = await mockSupabase(page, { preferences: prefRow() });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.route('**/rest/v1/rpc/delete_my_data', (r) => r.abort('internetdisconnected'));
    await accountMenu(page).click();
    await header(page).getByRole('button', { name: 'Delete my StepWise data' }).click();
    const ask = page.getByRole('dialog', { name: 'Delete my StepWise data' });
    await ask.getByRole('button', { name: 'Delete my data' }).click();
    await expect(ask.getByRole('status')).toContainText('Could not reach the account server.', {
      timeout: 20_000,
    });
    expect(mock.preferences).toBeDefined();
    expect(await stored(page, 'theme')).toBe('"dark"');
    await ask.getByRole('button', { name: 'Keep my data' }).click();
    await expect(accountMenu(page)).toBeVisible();
  });
});

/**
 * Pictures for a person to look at, at device scale 1 on a laptop and a phone, light and dark.
 * Runs only when SYNC_SHOTS names a folder to write them to.
 */
test('screenshots', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const dir = process.env.SYNC_SHOTS;
  test.skip(!dir || info.project.name !== 'desktop', 'Set SYNC_SHOTS to a folder to take them');
  const sizes = {
    laptop: { viewport: { width: 1366, height: 768 } },
    phone: { ...devices['Pixel 7'] },
  };
  for (const [name, device] of Object.entries(sizes)) {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        ...device,
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      const page = await context.newPage();
      await accountsOn(page);
      await storedSession(page);
      await storeOnce(page, { 'last-release': '2026-11-01-start' });
      await mockSupabase(page, {
        preferences: prefRow({ prefs: {}, last_release: null, notify_new_pages: true }),
      });
      await page.goto('/');
      await expect(card(page)).toBeVisible();
      await page.waitForLoadState('networkidle');
      await card(page).screenshot({ path: path.join(dir!, `new-since-${name}-${theme}.png`) });
      await accountMenu(page).click();
      await page.screenshot({ path: path.join(dir!, `menu-${name}-${theme}.png`) });
      await header(page).getByRole('button', { name: 'Delete my StepWise data' }).click();
      await page.screenshot({ path: path.join(dir!, `delete-${name}-${theme}.png`) });
      // An emailed link for another account.
      await page.goto('/stack-array/?token_hash=other-1&type=email&email_hint=o***%40example.org');
      await expect(page.getByRole('dialog', { name: 'Switch accounts?' })).toBeVisible();
      await page.screenshot({ path: path.join(dir!, `switch-${name}-${theme}.png`) });
      await context.close();

      // Signed out: the sign-in dialog with a Turnstile check (a stand-in widget).
      const out = await browser.newContext({ ...device, deviceScaleFactor: 1, colorScheme: theme });
      const p = await out.newPage();
      await accountsOn(p);
      await stubTurnstile(p);
      await mockSupabase(p, {
        links: [{ status: 403, body: { status: 'challenge', siteKey: 'k', failed: true } }],
      });
      await p.goto('/stack-array/');
      await signIn(p).click();
      await p.getByRole('dialog', { name: 'Sign in' }).getByLabel('Email').fill(USER.email);
      await p.getByRole('button', { name: 'Email me a sign-in link' }).click();
      await expect(p.getByRole('button', { name: 'Pass the test check' })).toBeVisible();
      await p.screenshot({ path: path.join(dir!, `challenge-${name}-${theme}.png`) });
      await out.close();
    }
  }
  expect(fs.readdirSync(dir!).length).toBeGreaterThanOrEqual(20);
});
