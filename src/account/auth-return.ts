import type { AuthReturn } from './backend';

/**
 * Signing in leaves the page (Google) or comes back in a new one (the emailed link). Google
 * returns through Supabase to the page's address with `?code=` (or
 * `?error=...&error_description=...`); the platform's emailed link opens the page with
 * `?token_hash=...&type=email&email_hint=...`. Neither keeps the hash, which holds the reader's
 * work. So the hash is put aside in sessionStorage before leaving (or once a link is sent), and
 * the app reads the return before it routes: it takes the sign-in parameters out of the address
 * and puts the hash back.
 */

/** Parameters added on the way back. Errors may come in the query and the hash. */
const QUERY_KEYS = ['code', 'error', 'error_code', 'error_description', 'sb_flow_id', 'token_hash'];
/** And with a token_hash, the link's other two. */
const TOKEN_KEYS = ['type', 'email_hint'];
const HASH_ERROR_KEYS = ['error', 'error_code', 'error_description', 'sb'];

/**
 * The sign-in a return carries, and the address without its parameters. Returns `ret: null`,
 * and the address unchanged, when the address is not a sign-in return.
 */
export function readAuthReturn(
  search: string,
  hash: string,
): { ret: AuthReturn | null; search: string; hash: string } {
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const errorIn = (p: URLSearchParams) =>
    p.has('error') || p.has('error_description') || p.has('error_code');
  let ret: AuthReturn | null = null;
  for (const p of [q, h]) {
    if (!ret && errorIn(p)) {
      ret = {
        kind: 'error',
        code: p.get('error_code') ?? p.get('error') ?? '',
        // Shown to the reader: keep it short, since anyone can write it into a link.
        description: (p.get('error_description') ?? '').slice(0, 160),
      };
    }
  }
  const tokenHash = q.get('token_hash');
  if (!ret && tokenHash) {
    ret = {
      kind: 'token',
      tokenHash,
      type: q.get('type') ?? 'email',
      // Shown to the reader: keep it short, since anyone can write it into a link.
      emailHint: (q.get('email_hint') ?? '').slice(0, 120),
    };
  }
  const code = q.get('code');
  if (!ret && code) {
    const flowId = q.get('sb_flow_id');
    ret = flowId ? { kind: 'code', code, flowId } : { kind: 'code', code };
  }
  if (!ret) return { ret: null, search, hash };
  for (const k of QUERY_KEYS) q.delete(k);
  if (ret.kind === 'token') for (const k of TOKEN_KEYS) q.delete(k);
  if (errorIn(h)) for (const k of HASH_ERROR_KEYS) h.delete(k);
  const qs = q.toString();
  const hs = h.toString();
  return { ret, search: qs ? `?${qs}` : '', hash: hs ? `#${hs}` : '' };
}

const STASH = 'stepwise:auth-return';
/** A put-aside hash older than this is not restored (the reader gave up and came back later). */
const STASH_MS = 60 * 60 * 1000;

interface Stash {
  path: string;
  hash: string;
  at: number;
}

/** Put the page and its hash aside before leaving to sign in. */
export function stashReturn(path: string, hash: string): void {
  try {
    sessionStorage.setItem(STASH, JSON.stringify({ path, hash, at: Date.now() }));
  } catch {
    // Without sessionStorage the reader comes back to the page without its work in the address.
  }
}

/** The page and hash put aside in this tab, once; null if none, too old or not ours. */
export function takeStash(now = Date.now()): { path: string; hash: string } | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STASH);
    sessionStorage.removeItem(STASH);
  } catch {
    return null;
  }
  try {
    const s = JSON.parse(raw ?? 'null') as Partial<Stash> | null;
    if (!s || typeof s.path !== 'string' || typeof s.hash !== 'string') return null;
    if (typeof s.at !== 'number' || now - s.at > STASH_MS || now < s.at) return null;
    // Only a path on this site, and only a hash.
    if (!s.path.startsWith('/') || s.path.startsWith('//')) return null;
    if (s.hash && !s.hash.startsWith('#')) return null;
    return { path: s.path, hash: s.hash };
  } catch {
    return null;
  }
}
