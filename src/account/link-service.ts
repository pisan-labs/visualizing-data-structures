/**
 * Magic links go through the HintWise platform's sign-in-link service, which sends the email
 * (through Resend), limits how often one address gets a link, and may ask for a Cloudflare
 * Turnstile check first. Its link comes back to the page with ?token_hash=, which works in any
 * browser. Google sign-in does not use it. See supabase/README.md for the contract.
 */
import { AccountError, type LinkAnswer } from './backend';
import type { AccountConfig } from './config';

/**
 * This browser's id for the service, made once and shared by every HintWise app on this
 * browser's sites (a platform convention, so not under our "stepwise:" prefix). The service uses
 * it to tell repeated requests from one browser apart; it is a random id and says nothing else.
 */
export const BROWSER_ID_KEY = 'hintwise.browserId';

export function browserId(): string {
  try {
    const have = localStorage.getItem(BROWSER_ID_KEY);
    if (have && /^[\w-]{8,100}$/.test(have)) return have;
    const id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, id);
    return id;
  } catch {
    // No storage (a private window): a new id for this request.
    return crypto.randomUUID();
  }
}

export interface LinkRequest {
  email: string;
  /** The page's origin and path only: the service drops a query and a hash. */
  redirectTo: string;
  app: 'stepwise';
  browserId: string;
  turnstileToken?: string;
}

const TIMEOUT_MS = 15_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Ask for a link. Throws AccountError: unreachable, or the service's message when it refuses. */
export async function requestSignInLink(
  config: AccountConfig,
  body: LinkRequest,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<LinkAnswer> {
  let res: Response;
  try {
    res = await fetchFn(`${config.url}/functions/v1/sign-in-link`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AccountError('unreachable');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON: judged by the status alone.
  }
  const d = isRecord(data) ? data : {};
  if (res.ok && d.status === 'sent') return { status: 'sent' };
  if (res.status === 429) {
    const at = typeof d.retryAt === 'string' ? Date.parse(d.retryAt) : NaN;
    // A wait with no time given: a minute, the shortest the service asks for.
    const retryAt = new Date(Number.isFinite(at) ? at : Date.now() + 60_000).toISOString();
    return { status: 'wait', retryAt };
  }
  if (res.status === 403 && d.status === 'challenge' && typeof d.siteKey === 'string' && d.siteKey)
    return { status: 'challenge', siteKey: d.siteKey, failed: d.failed === true };
  const message =
    typeof d.message === 'string' && d.message.trim() ? d.message.trim().slice(0, 200) : '';
  if (message) throw new AccountError('other', message);
  throw new AccountError(res.status >= 500 || res.status === 0 ? 'unreachable' : 'other');
}
