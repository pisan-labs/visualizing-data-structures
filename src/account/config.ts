/**
 * Optional accounts are configured at build time by two public values (see supabase/README.md):
 *
 *   VITE_SUPABASE_URL       the project's API address, https://<ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the project's anon (public) key
 *
 * With either one missing, accounts are off: no account UI anywhere and no request to any
 * Supabase host. The service-role key never belongs here or anywhere in the client.
 *
 * Test override: a script that runs before the app starts may set
 * `window.__STEPWISE_ACCOUNTS__` to `{ url, anonKey }` to turn accounts on (e2e tests point it at
 * a host that `page.route` answers), or to `null` to turn them off whatever the build says.
 * Playwright sets it with `page.addInitScript`. Nothing in the site itself sets it.
 */
export interface AccountConfig {
  url: string;
  anonKey: string;
}

/**
 * Where supabase-js keeps the session in localStorage. The app looks for it to decide, without
 * loading supabase-js, whether a reader is signed in.
 */
export const SESSION_KEY = 'stepwise:auth';

declare global {
  interface Window {
    __STEPWISE_ACCOUNTS__?: Partial<AccountConfig> | null;
  }
}

/** Both values present and the address a real http(s) URL, or null (accounts off). */
export function makeConfig(url: unknown, anonKey: unknown): AccountConfig | null {
  if (typeof url !== 'string' || typeof anonKey !== 'string') return null;
  const u = url.trim().replace(/\/+$/, '');
  const key = anonKey.trim();
  if (!u || !key) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  return { url: u, anonKey: key };
}

/** The test override if one is set, otherwise the build's values. */
export function readConfig(
  env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string },
  override: Partial<AccountConfig> | null | undefined,
): AccountConfig | null {
  if (override === null) return null;
  if (override !== undefined) return makeConfig(override.url, override.anonKey);
  return makeConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
}

let cached: AccountConfig | null | undefined;

/** This page's account settings, or null when accounts are off. Read once per page. */
export function accountConfig(): AccountConfig | null {
  if (cached === undefined) {
    const override = typeof window === 'undefined' ? undefined : window.__STEPWISE_ACCOUNTS__;
    cached = readConfig(import.meta.env, override);
  }
  return cached;
}
