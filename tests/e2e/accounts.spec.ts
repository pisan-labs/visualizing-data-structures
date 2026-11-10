/**
 * Optional accounts (src/account). Every Supabase endpoint is mocked (./supabase-mock.ts); the
 * site is pointed at a host that cannot resolve, so nothing here reaches a real Supabase.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { axeFindings, settled } from './helpers';
import {
  accountsOn,
  HOST,
  mockSupabase,
  row,
  SESSION,
  OTHER,
  storedSession,
  stubTurnstile,
  TURNSTILE,
  USER,
  type Mock,
} from './supabase-mock';

const header = (page: Page) => page.locator('header.site');
const signIn = (page: Page) => header(page).getByRole('button', { name: 'Sign in' });
const accountMenu = (page: Page) => header(page).locator('summary', { hasText: 'Account' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Sign in' });
const stage = (page: Page) => page.locator('.stage > svg');
const accountList = (page: Page) => page.getByRole('list', { name: 'Saved in your account' });

const stackExample = (ops: [string, number][]) => ({
  format: 1,
  viz: 'stack-array',
  settings: {},
  seed: 1,
  ops,
});

async function examplesTab(page: Page) {
  await page.getByRole('tab', { name: 'Examples' }).click();
}

async function push(page: Page, values: string) {
  await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
  await page.getByLabel('Value').fill(values);
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  const last = values.split(' ').pop();
  await expect(page.locator('.narration p')).toContainText(`${last} is now the top`, {
    timeout: 15_000,
  });
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

/** Uncaught errors in the page; a test expects none. */
function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const callsTo = (mock: Mock, pathname: string) =>
  mock.calls.filter((c) => c.url.pathname === pathname);

test.describe('accounts off', () => {
  test('shows no account UI and sends nothing anywhere', async ({ page }) => {
    const mock = await mockSupabase(page);
    const lazy: string[] = [];
    page.on('request', (r) => {
      if (/supabase|AccountExamples/i.test(r.url())) lazy.push(r.url());
    });
    await page.goto('/stack-array/');
    await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
    await expect(header(page).getByRole('combobox', { name: 'Theme' })).toBeVisible();
    await expect(signIn(page)).toHaveCount(0);
    await examplesTab(page);
    await expect(page.getByText('Saved in this browser only.')).toBeVisible();
    await expect(page.getByText('Saved in your account')).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
    expect(mock.calls).toEqual([]);
    expect(lazy).toEqual([]);
  });

  test('a #saved= link says plainly that it cannot open', async ({ page }) => {
    const mock = await mockSupabase(page);
    await page.goto('/stack-array/#saved=e0000000-0000-4000-8000-000000000001');
    await expect(page.getByText('accounts are not available here')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
    expect(mock.calls).toEqual([]);
  });
});

test.describe('signed out', () => {
  test.beforeEach(async ({ page }) => {
    await accountsOn(page);
  });

  test('loads nothing until Sign in is opened; the dialog is accessible', async ({ page }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page);
    const lazy: string[] = [];
    page.on('request', (r) => {
      if (/AccountExamples/.test(r.url())) lazy.push(r.url());
    });
    await page.goto('/stack-array/');
    await expect(signIn(page)).toBeVisible();
    await examplesTab(page);
    // Signed out, the panel is as it always was.
    await expect(page.getByText('Saved in this browser only.')).toBeVisible();
    await expect(page.getByText('Saved in your account')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(mock.chunks).toEqual([]);
    expect(mock.calls).toEqual([]);
    expect(lazy).toEqual([]);

    await signIn(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(dialog(page).getByLabel('Email')).toBeVisible();
    await expect(dialog(page)).toContainText('the examples you save');
    // An emailed link works in any browser now (the platform's sign-in-link service).
    await expect(dialog(page)).not.toContainText('works only in the browser');
    await expect(dialog(page)).not.toContainText('Cloudflare');
    // Opening the dialog loads the client, which sends nothing until asked to.
    await expect.poll(() => mock.chunks.length).toBe(1);
    expect(mock.calls).toEqual([]);

    await settled(page);
    const results = await new AxeBuilder({ page })
      .include('dialog.signin')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    await fits(page);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(signIn(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('asks the sign-in-link service for a link that comes back to this page', async ({
    page,
  }) => {
    const mock = await mockSupabase(page);
    const cloudflare: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(TURNSTILE)) cloudflare.push(r.url());
    });
    await page.goto('/stack-array/');
    await push(page, '4 5');
    await expect(page).toHaveURL(/#ex=z/);
    await signIn(page).click();
    await dialog(page).getByLabel('Email').fill(USER.email);
    await dialog(page).getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(dialog(page).getByRole('status')).toContainText(
      `Check your email. We sent a sign-in link to ${USER.email}.`,
    );
    const [sent] = callsTo(mock, '/functions/v1/sign-in-link');
    expect(sent?.method).toBe('POST');
    const browserId = await page.evaluate(() => localStorage.getItem('hintwise.browserId'));
    expect(browserId).toMatch(/^[\w-]{8,100}$/);
    // The page's address only: the service drops a query and a hash.
    expect(sent?.body).toEqual({
      email: USER.email,
      redirectTo: new URL('/stack-array/', page.url()).href,
      app: 'stepwise',
      browserId,
    });
    expect(callsTo(mock, '/auth/v1/otp')).toEqual([]);
    // No check was asked for, so nothing came from Cloudflare.
    expect(cloudflare).toEqual([]);
    await expect(dialog(page).getByLabel('Email')).toHaveValue(USER.email);
    // The hash waits in this tab for the link to come back.
    expect(await page.evaluate(() => sessionStorage.getItem('stepwise:auth-return'))).toContain(
      '#ex=z',
    );
  });

  test('says until when to wait when the service asks to', async ({ page }) => {
    const retryAt = new Date(Date.now() + 3 * 60_000).toISOString();
    await mockSupabase(page, { links: [{ status: 429, body: { status: 'wait', retryAt } }] });
    await page.goto('/stack-array/');
    await signIn(page).click();
    await dialog(page).getByLabel('Email').fill(USER.email);
    const send = dialog(page).getByRole('button', { name: 'Email me a sign-in link' });
    await send.click();
    const time = await page.evaluate(
      (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      retryAt,
    );
    await expect(dialog(page).getByRole('status')).toHaveText(
      `You can ask for another link at ${time}.`,
    );
    await expect(send).toBeDisabled();
    await expect(dialog(page).getByLabel('Email')).toHaveValue(USER.email);
    await fits(page);
  });

  test('shows the service’s own message, and the usual one with no network', async ({ page }) => {
    const mock = await mockSupabase(page, {
      links: [
        { status: 503, body: { status: 'error', message: 'Email sign-in is paused; try Google' } },
      ],
    });
    await page.goto('/stack-array/');
    await signIn(page).click();
    await dialog(page).getByLabel('Email').fill(USER.email);
    const send = dialog(page).getByRole('button', { name: 'Email me a sign-in link' });
    await send.click();
    await expect(dialog(page).getByRole('status')).toHaveText(
      'Email sign-in is paused; try Google',
    );
    await page.route(`${HOST}/functions/v1/sign-in-link`, (r) => r.abort('internetdisconnected'));
    await send.click();
    await expect(dialog(page).getByRole('status')).toHaveText(
      'Could not reach the account server. Try again in a minute; the rest of the page still works.',
    );
    expect(callsTo(mock, '/functions/v1/sign-in-link')).toHaveLength(1);
  });

  test('loads the Turnstile check only when the service asks, then sends with its token', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const challenge = { status: 403, body: { status: 'challenge', siteKey: 'test-site-key' } };
    const mock = await mockSupabase(page, {
      links: [challenge, { ...challenge, body: { ...challenge.body, failed: true } }],
    });
    const loads = await stubTurnstile(page);
    await page.goto('/stack-array/');
    await signIn(page).click();
    await dialog(page).getByLabel('Email').fill(USER.email);
    expect(loads).toEqual([]);
    await dialog(page).getByRole('button', { name: 'Email me a sign-in link' }).click();

    // The check appears, with Cloudflare named in the privacy text while it shows.
    const check = dialog(page).getByRole('button', { name: 'Pass the test check' });
    await expect(check).toBeVisible();
    expect(loads).toEqual([`${TURNSTILE}/turnstile/v0/api.js?render=explicit`]);
    await expect(dialog(page)).toContainText(
      'Nothing on this site tracks you. This check is run by Cloudflare.',
    );
    const stub = () =>
      page.evaluate(
        () =>
          (window as unknown as { __turnstile: { renders: unknown[]; resets: number } })
            .__turnstile,
      );
    expect((await stub()).renders).toEqual([
      expect.objectContaining({ sitekey: 'test-site-key', action: 'sign-in' }),
    ]);
    await settled(page);
    const results = await new AxeBuilder({ page })
      .include('dialog.signin')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    await fits(page);

    // The first token fails the service's check: say so, with the widget reset for another go.
    await check.click();
    await expect(dialog(page)).toContainText('That check did not work; try again.');
    expect((await stub()).resets).toBe(1);
    // The second passes: the same request again, with the new token.
    await check.click();
    await expect(dialog(page).getByRole('status')).toContainText('Check your email.');
    const sent = callsTo(mock, '/functions/v1/sign-in-link');
    expect(sent.map((c) => (c.body as { turnstileToken?: string }).turnstileToken)).toEqual([
      undefined,
      'turnstile-token-1',
      'turnstile-token-2',
    ]);
    for (const c of sent) expect(c.body).toMatchObject({ email: USER.email, app: 'stepwise' });
    await expect(check).toHaveCount(0);
    await expect(dialog(page)).not.toContainText('Cloudflare');
    // Loaded once, and nothing else from Cloudflare.
    expect(loads).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('an emailed link signs in, in any browser, and puts the page back', async ({ page }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('test:stash-set')) return;
      sessionStorage.setItem('test:stash-set', '1');
      sessionStorage.setItem(
        'stepwise:auth-return',
        JSON.stringify({ path: '/stack-array/', hash: '#lesson=idea', at: Date.now() }),
      );
    });
    await page.goto('/stack-array/?token_hash=abc123&type=email&email_hint=r***%40example.com');
    await expect(accountMenu(page)).toBeVisible();
    await expect(page.getByText(`Signed in as ${USER.email}.`)).toBeVisible();
    const [verify] = callsTo(mock, '/auth/v1/verify');
    expect(verify?.method).toBe('POST');
    expect(verify?.body).toMatchObject({ token_hash: 'abc123', type: 'email' });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/stack-array/');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#lesson=idea');
    expect(errors).toEqual([]);
  });

  test('an old emailed link says so', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/stack-array/?token_hash=used&type=email&email_hint=r***%40example.com');
    await expect(
      page.getByText('That sign-in link has expired or was already used. Ask for a new one.'),
    ).toBeVisible();
    await expect(signIn(page)).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
  });

  test('Continue with Google comes back signed in, on the same page with the same work', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page);
    await page.goto('/stack-array/');
    await push(page, '4 5');
    await expect(page).toHaveURL(/#ex=z/);
    await signIn(page).click();
    await dialog(page).getByRole('button', { name: 'Continue with Google' }).click();

    await expect(accountMenu(page)).toBeVisible();
    await expect(page.getByText(`Signed in as ${USER.email}.`)).toBeVisible();
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 4, 5/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/stack-array/');
    expect(url.search).toBe('');
    expect(url.hash).toMatch(/^#ex=z/);

    const [authorize] = callsTo(mock, '/auth/v1/authorize');
    expect(authorize?.url.searchParams.get('provider')).toBe('google');
    expect(authorize?.url.searchParams.get('prompt')).toBe('select_account');
    expect(authorize?.url.searchParams.get('redirect_to')).toBe(
      new URL('/stack-array/', page.url()).href,
    );
    const [token] = callsTo(mock, '/auth/v1/token');
    expect(token?.url.searchParams.get('grant_type')).toBe('pkce');
    expect(token?.body).toMatchObject({ auth_code: 'test-auth-code' });
    expect((token?.body as { code_verifier?: string }).code_verifier).toBeTruthy();
    await expect.poll(() => callsTo(mock, '/rest/v1/rpc/ensure_profile').length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('a sign-in that came back with an error says why', async ({ page }) => {
    await mockSupabase(page);
    await page.goto(
      '/stack-array/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    await expect(
      page.getByText('Sign-in did not work: Email link is invalid or has expired'),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    await expect(signIn(page)).toBeVisible();
  });

  test('a link opened in another browser says to use the one that asked', async ({ page }) => {
    const mock = await mockSupabase(page);
    await page.goto('/stack-array/?code=from-another-browser');
    await expect(
      page.getByText('Open the sign-in link in the same browser you asked for it from.'),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(callsTo(mock, '/auth/v1/token')).toEqual([]);
  });

  test('a #saved= link opens a shared example without signing in', async ({ page }) => {
    const shared = row({
      viz: 'stack-array',
      title: 'Shared stack',
      shared: true,
      example: stackExample([
        ['push', 3],
        ['push', 4],
      ]),
    });
    const kept = row({ viz: 'stack-array', title: 'Private', example: stackExample([]) });
    const errors = pageErrors(page);
    const mock = await mockSupabase(page, { rows: [shared, kept] });
    await page.goto(`/stack-array/#saved=${shared.id}`);
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 3, 4/);
    await expect(page.getByText('Opened "Shared stack"')).toBeVisible();
    await expect(signIn(page)).toBeVisible();
    expect(callsTo(mock, '/rest/v1/rpc/shared_example')[0]?.body).toEqual({ p_id: shared.id });
    // The table itself is never asked.
    expect(callsTo(mock, '/rest/v1/saved_examples')).toEqual([]);

    for (const id of [kept.id, 'e0000000-0000-4000-8000-0000000000ff']) {
      await page.goto('about:blank');
      await page.goto(`/stack-array/#saved=${id}`);
      await expect(page.getByText('That saved example is not available.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Stack (array)' })).toBeVisible();
    }
    const before = mock.calls.length;
    await page.goto('about:blank');
    await page.goto('/stack-array/#saved=not-an-id');
    await expect(page.getByText('That saved example is not available.')).toBeVisible();
    expect(mock.calls.length).toBe(before);
    expect(errors).toEqual([]);
  });
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await accountsOn(page);
    await storedSession(page);
  });

  test('save, list, open, rename, share, copy a link, delete, sign out', async ({ page }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page, {
      rows: [
        row({
          viz: 'stack-array',
          title: 'Three pushes',
          example: stackExample([
            ['push', 7],
            ['push', 8],
            ['push', 9],
          ]),
        }),
        row({ viz: 'bst', title: 'A tree', example: { format: 1, viz: 'bst', ops: [] } }),
        row({
          viz: 'stack-array',
          title: 'Someone else’s',
          owner: '0000000b-0000-4000-8000-000000000000',
          shared: true,
          example: stackExample([]),
        }),
      ],
    });
    await page.goto('/stack-array/');
    await accountMenu(page).click();
    await expect(header(page).getByText(`Signed in as ${USER.email}`)).toBeVisible();
    await accountMenu(page).click();

    await examplesTab(page);
    await expect(page.getByText('Saved in your account, so you can open them')).toBeVisible();
    const list = accountList(page);
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Three pushes');
    const [get] = callsTo(mock, '/rest/v1/saved_examples');
    expect(get?.url.searchParams.get('owner')).toBe(`eq.${USER.id}`);
    expect(get?.url.searchParams.get('viz')).toBe('eq.stack-array');

    // Load.
    await list
      .getByRole('listitem')
      .filter({ hasText: 'Three pushes' })
      .getByRole('button', {
        name: 'Open',
      })
      .click();
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 7, 8, 9/);
    await expect(page.getByText('Opened "Three pushes"')).toBeVisible();

    // Save goes to the account.
    await page.getByPlaceholder('Name this example').fill('Saved from the test');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').first()).toContainText('Saved from the test');
    const post = callsTo(mock, '/rest/v1/saved_examples').find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      viz: 'stack-array',
      title: 'Saved from the test',
      example: {
        viz: 'stack-array',
        ops: [
          ['push', 7],
          ['push', 8],
          ['push', 9],
        ],
      },
    });
    expect(await page.evaluate(() => localStorage.getItem('stepwise:library'))).toBeNull();

    // Rename.
    await list.getByRole('button', { name: 'Rename Saved from the test' }).click();
    const field = list.getByLabel('New name for Saved from the test');
    await expect(field).toBeFocused();
    await field.fill('Renamed in the test');
    await field.press('Enter');
    await expect(list).toContainText('Renamed in the test');
    await expect(list.getByRole('button', { name: 'Rename Renamed in the test' })).toBeFocused();
    const patch = callsTo(mock, '/rest/v1/saved_examples').find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ title: 'Renamed in the test' });

    // Share, and copy its link.
    const saved = mock.rows.find((r) => r.title === 'Renamed in the test')!;
    await list.getByRole('checkbox', { name: 'Shared: Renamed in the test' }).check();
    await expect.poll(() => saved.shared).toBe(true);
    await list.getByRole('button', { name: 'Copy link to Renamed in the test' }).click();
    await expect(page.getByLabel('Link to the shared example')).toHaveValue(
      new URL(`/stack-array/#saved=${saved.id}`, page.url()).href,
    );

    // Copy link on a private example shares it first.
    const three = mock.rows.find((r) => r.title === 'Three pushes')!;
    await list.getByRole('button', { name: 'Copy link to Three pushes' }).click();
    await expect.poll(() => three.shared).toBe(true);
    await expect(list.getByRole('checkbox', { name: 'Shared: Three pushes' })).toBeChecked();

    await settled(page);
    const results = await new AxeBuilder({ page })
      .include('#panel-examples')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);

    // Delete, after a confirmation that can be declined.
    await list.getByRole('button', { name: 'Delete Three pushes' }).click();
    await list.getByRole('button', { name: 'Keep it' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await list.getByRole('button', { name: 'Delete Three pushes' }).click();
    await expect(list).toContainText('This cannot be undone.');
    await list.getByRole('button', { name: 'Delete it' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    expect(mock.rows.some((r) => r.title === 'Three pushes')).toBe(false);
    await fits(page);

    // Sign out: back to the browser-only panel, and only this site's session ends.
    await accountMenu(page).click();
    await header(page).getByRole('button', { name: 'Sign out' }).click();
    await expect(signIn(page)).toBeVisible();
    await expect(page.getByText('Saved in this browser only.')).toBeVisible();
    expect(callsTo(mock, '/auth/v1/logout')[0]?.url.searchParams.get('scope')).toBe('local');
    expect(await page.evaluate(() => localStorage.getItem('stepwise:auth'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('copies the examples saved in this browser into the account, once', async ({ page }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page);
    // Two examples saved in the browser before signing in (another page's counts too).
    await page.addInitScript(() => {
      if (localStorage.getItem('stepwise:library')) return;
      const item = (key: string, viz: string, title: string) => ({
        key,
        title,
        savedAt: '2026-11-09T10:00:00Z',
        example: { format: 1, viz, title, settings: {}, seed: 1, ops: [] },
      });
      localStorage.setItem(
        'stepwise:library',
        JSON.stringify([item('k2', 'stack-array', 'Local stack'), item('k1', 'bst', 'Local tree')]),
      );
    });
    await page.goto('/stack-array/');
    await examplesTab(page);
    await expect(page.getByRole('heading', { name: 'Saved in this browser' })).toBeVisible();
    const copy = page.getByRole('button', {
      name: 'Copy the 2 examples saved in this browser to your account',
    });
    await copy.click();
    await expect(page.getByText('Copied 2 examples to your account.')).toBeVisible();
    await expect(copy).toHaveCount(0);
    await expect(accountList(page)).toContainText('Local stack');
    expect(mock.rows.map((r) => `${r.viz}: ${r.title}`).sort()).toEqual([
      'bst: Local tree',
      'stack-array: Local stack',
    ]);
    await page.reload();
    await examplesTab(page);
    await expect(accountList(page)).toContainText('Local stack');
    await expect(page.getByRole('button', { name: /^Copy the .* to your account$/ })).toHaveCount(
      0,
    );
    expect(mock.rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test('an emailed link for another account asks before switching', async ({ page }) => {
    const errors = pageErrors(page);
    const mock = await mockSupabase(page);
    await page.goto('/stack-array/?token_hash=other-1&type=email&email_hint=o***%40example.org');
    const ask = page.getByRole('dialog', { name: 'Switch accounts?' });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('This sign-in link is for o***@example.org.');
    await expect(ask).toContainText(`You are signed in as ${USER.email}.`);
    expect(new URL(page.url()).search).toBe('');
    await settled(page);
    const results = await new AxeBuilder({ page })
      .include('dialog.ask')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeFindings(results)).toEqual([]);
    await fits(page);
    // Stay: the link is left unused.
    await ask.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(ask).toBeHidden();
    expect(callsTo(mock, '/auth/v1/verify')).toEqual([]);
    await accountMenu(page).click();
    await expect(header(page).getByText(`Signed in as ${USER.email}`)).toBeVisible();

    // The same kind of link again, and this time switch.
    await page.goto('/stack-array/?token_hash=other-2&type=email&email_hint=o***%40example.org');
    await ask.getByRole('button', { name: 'Switch accounts' }).click();
    await expect(page.getByText(`Signed in as ${OTHER.email}.`)).toBeVisible();
    expect(callsTo(mock, '/auth/v1/verify')[0]?.body).toMatchObject({ token_hash: 'other-2' });
    await accountMenu(page).click();
    await expect(header(page).getByText(`Signed in as ${OTHER.email}`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('an emailed link for the same account signs in without asking', async ({ page }) => {
    const mock = await mockSupabase(page);
    await page.goto('/stack-array/?token_hash=again&type=email&email_hint=r***%40example.com');
    await expect(page.getByText(`Signed in as ${USER.email}.`)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Switch accounts?' })).toHaveCount(0);
    expect(callsTo(mock, '/auth/v1/verify')).toHaveLength(1);
  });

  test('an old sign-in link leaves the earlier sign-in in place', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/stack-array/?code=already-used');
    await expect(
      page.getByText('Open the sign-in link in the same browser you asked for it from.'),
    ).toBeVisible();
    await expect(accountMenu(page)).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
  });

  test('a failing account server leaves the rest of the page working', async ({ page }) => {
    test.setTimeout(90_000);
    const mock = await mockSupabase(page, { down: true });
    await page.goto('/stack-array/');
    // The stored session still counts; each call says when it fails.
    await expect(accountMenu(page)).toBeVisible({ timeout: 20_000 });
    await examplesTab(page);
    // supabase-js tries a failed read three more times (1 + 2 + 4 s) before giving up.
    await expect(page.getByRole('alert')).toHaveText(
      'Could not reach the account server. Try again in a minute; the rest of the page still works.',
      { timeout: 30_000 },
    );
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    await page.getByPlaceholder('Name this example').fill('Offline');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.notice.error')).toContainText('Could not reach the account server');

    // Everything else still works.
    await push(page, '1 2');
    await expect(stage(page)).toHaveAttribute('aria-label', /From bottom to top: 1, 2/);
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Overflow at capacity' })
      .getByRole('button', { name: 'Load' })
      .click();
    await expect(page.locator('.narration p')).toContainText('capacity 4');
    expect(mock.calls.length).toBeGreaterThan(0);
    expect(mock.calls.every((c) => c.url.origin === HOST)).toBe(true);
  });
});

/**
 * Pictures of the dialog and the signed-in panel for a person to look at, at device scale 1 on a
 * laptop and a phone. Runs only when ACCOUNT_SHOTS names a folder to write them to.
 */
test('screenshots', async ({ browser }, info) => {
  const dir = process.env.ACCOUNT_SHOTS;
  test.skip(!dir || info.project.name !== 'desktop', 'Set ACCOUNT_SHOTS to a folder to take them');
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
      await mockSupabase(page);
      await page.goto('/stack-array/');
      await signIn(page).click();
      await dialog(page).getByLabel('Email').fill(USER.email);
      await dialog(page).getByRole('button', { name: 'Email me a sign-in link' }).click();
      await expect(dialog(page).getByRole('status')).toContainText('Check your email');
      await page.screenshot({ path: path.join(dir!, `dialog-${name}-${theme}.png`) });
      await context.close();

      const signed = await browser.newContext({
        ...device,
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      const p = await signed.newPage();
      await accountsOn(p);
      await p.addInitScript((session) => {
        localStorage.setItem('stepwise:auth', JSON.stringify(session));
        localStorage.setItem(
          'stepwise:library',
          JSON.stringify([
            {
              key: 'k1',
              title: 'Tried in class on Monday',
              savedAt: '2026-11-09T10:00:00Z',
              example: { format: 1, viz: 'stack-array', settings: {}, seed: 1, ops: [] },
            },
          ]),
        );
      }, SESSION);
      await mockSupabase(p, {
        rows: [
          row({
            viz: 'stack-array',
            title: 'Reverse a word, step by step',
            shared: true,
            example: stackExample([['push', 1]]),
          }),
          row({
            viz: 'stack-array',
            title: 'Overflow with a longer name that has to wrap on a phone screen',
            example: stackExample([]),
          }),
        ],
      });
      await p.goto('/stack-array/');
      await examplesTab(p);
      await expect(accountList(p).getByRole('listitem')).toHaveCount(2);
      await p.locator('#save-heading').scrollIntoViewIfNeeded();
      await p
        .locator('#panel-examples')
        .screenshot({ path: path.join(dir!, `panel-${name}-${theme}.png`) });
      await signed.close();
    }
  }
  expect(fs.readdirSync(dir!).length).toBeGreaterThanOrEqual(8);
});
