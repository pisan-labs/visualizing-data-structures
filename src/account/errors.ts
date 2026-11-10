import { AccountError } from './backend';

/**
 * Turn whatever an account call threw or returned as an error (a Supabase AuthError or
 * PostgrestError, a failed fetch, a timeout) into an AccountError. `status` is the HTTP status
 * when the caller has it (0 when the request never got an answer).
 */
export function toAccountError(raw: unknown, status?: number): AccountError {
  if (raw instanceof AccountError) return raw;
  const e = (raw && typeof raw === 'object' ? raw : {}) as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
  };
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : String(raw ?? '');
  const code = typeof e.code === 'string' ? e.code : '';
  const http = typeof e.status === 'number' ? e.status : (status ?? -1);

  // Named problems first: some of supabase-js's own errors carry status 500.
  if (name === 'AuthPKCECodeVerifierMissingError') return new AccountError('browser');
  if (
    code === 'otp_expired' ||
    code === 'flow_state_expired' ||
    code === 'flow_state_not_found' ||
    code === 'bad_code_verifier' ||
    name === 'AuthPKCEGrantCodeExchangeError'
  )
    return new AccountError('link');
  if (message.includes('saved_examples_limit')) return new AccountError('full');
  // One link per address a minute ("For security purposes, you can only request this after 42
  // seconds."), and a limit for the whole project ("email rate limit exceeded").
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    http === 429 ||
    /rate limit|only request this after/i.test(message)
  ) {
    const after = /after (\d+) seconds?/i.exec(message);
    return new AccountError('rate', undefined, after ? Number(after[1]) : undefined);
  }
  if (
    code === 'email_address_invalid' ||
    ((http === 400 || http === 422) && /email/i.test(message))
  )
    return new AccountError('email');
  // A table or function this build expects is not in the database yet (a migration not applied).
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883')
    return new AccountError('unavailable');
  if (code === 'PGRST116' || code === '22P02') return new AccountError('missing');
  if (code === '23514' || code === '22001' || http === 413) return new AccountError('large');
  if (
    name === 'AuthSessionMissingError' ||
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    code === '42501' ||
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    code === 'bad_jwt' ||
    http === 401 ||
    http === 403
  )
    return new AccountError('expired');
  // Nothing came back: offline, a timeout, a server that is down, a blocked request.
  if (
    name === 'AuthRetryableFetchError' ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /failed to fetch|networkerror|load failed|fetch failed|aborterror|timeouterror|timed out/i.test(
      message,
    ) ||
    http === 0 ||
    http >= 500
  )
    return new AccountError('unreachable');
  return new AccountError('other');
}
