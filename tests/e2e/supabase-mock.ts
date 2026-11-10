import type { Page, Request, Route } from '@playwright/test';
import { answerLists, type ItemRow, type ListRow } from './lists-mock';

/**
 * A pretend Supabase for the accounts e2e tests. The site is pointed at HOST, a name that can
 * never resolve (.test is reserved), and page.route answers every request to it, so no test ever
 * reaches a real Supabase host.
 */
export const HOST = 'https://accounts.stepwise.test';
export const CONFIG = { url: HOST, anonKey: 'test-anon-key' };
export const USER = {
  id: '0000000a-0000-4000-8000-000000000000',
  email: 'reader@example.com',
  aud: 'authenticated',
  role: 'authenticated',
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** A JWT-shaped token that expires in 2100: supabase-js decodes it but never checks a signature. */
export const ACCESS_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
  sub: USER.id,
  exp: 4102444800,
  role: 'authenticated',
})}.c2lnbmF0dXJl`;

export const SESSION = {
  access_token: ACCESS_TOKEN,
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: USER,
};

export interface Row {
  id: string;
  owner: string;
  viz: string;
  title: string;
  notes: string;
  example: unknown;
  shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface MockOptions {
  /** Every request to the host fails as if offline. */
  down?: boolean;
  /** POST /auth/v1/otp answers 429 with this message. */
  rateLimit?: string;
  rows?: Row[];
  /** Lesson lists and their items (./lists-mock.ts). */
  lists?: ListRow[];
  items?: ItemRow[];
}

export interface Mock {
  rows: Row[];
  /** Every request the page sent to HOST. */
  calls: { method: string; url: URL; body: unknown }[];
  /** Requests for the Supabase chunk (assets/supabase-*.js). */
  chunks: string[];
  lists: ListRow[];
  items: ItemRow[];
}

let ids = 0;
export function row(fields: Partial<Row> & Pick<Row, 'viz' | 'title' | 'example'>): Row {
  const at = new Date(Date.UTC(2026, 10, 10, 9, 0, ids)).toISOString();
  return {
    id: `e0000000-0000-4000-8000-${(++ids).toString(16).padStart(12, '0')}`,
    owner: USER.id,
    notes: '',
    shared: false,
    created_at: at,
    updated_at: at,
    ...fields,
  };
}

/** Turn accounts on for the page (the test override the site reads as it starts). */
export async function accountsOn(page: Page): Promise<void> {
  await page.addInitScript((config) => {
    (window as unknown as { __STEPWISE_ACCOUNTS__: unknown }).__STEPWISE_ACCOUNTS__ = config;
  }, CONFIG);
}

/** Start the page with a stored session, as after an earlier sign-in. */
export async function storedSession(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    if (!sessionStorage.getItem('test:session-set')) {
      localStorage.setItem('stepwise:auth', JSON.stringify(session));
      sessionStorage.setItem('test:session-set', '1');
    }
  }, SESSION);
}

const COLUMNS = ['id', 'viz', 'title', 'notes', 'example', 'shared', 'created_at', 'updated_at'];
const pick = (r: Row, cols: string[]) =>
  Object.fromEntries(cols.map((c) => [c, r[c as keyof Row]]));

/** Answer the Supabase auth and REST endpoints the site uses, from an in-memory table. */
export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<Mock> {
  const mock: Mock = {
    rows: options.rows ?? [],
    calls: [],
    chunks: [],
    lists: options.lists ?? [],
    items: options.items ?? [],
  };
  page.on('request', (req: Request) => {
    if (/\/assets\/supabase-[\w-]+\.js$/.test(req.url())) mock.chunks.push(req.url());
  });
  await page.route(`${HOST}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    mock.calls.push({ method: req.method(), url, body });
    if (options.down) return route.abort('internetdisconnected');
    const json = (status: number, data?: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: data === undefined ? '' : JSON.stringify(data),
      });
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          // A wildcard does not cover Authorization, so name what the browser asked for.
          'Access-Control-Allow-Headers': req.headers()['access-control-request-headers'] ?? '*',
        },
      });
    }
    const path = url.pathname;
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '');
    const lists = answerLists(mock, req, url, body, json);
    if (lists) return lists;

    switch (path) {
      case '/auth/v1/user':
        return json(200, USER);
      case '/auth/v1/otp':
        if (options.rateLimit)
          return json(429, { code: 'over_email_send_rate_limit', msg: options.rateLimit });
        return json(200, {});
      case '/auth/v1/logout':
        return json(204);
      case '/auth/v1/token':
        return json(200, SESSION);
      case '/auth/v1/authorize': {
        // Google: straight back to the page with a code, as Supabase does after Google answers.
        const back = new URL(url.searchParams.get('redirect_to') ?? '/');
        back.searchParams.set('code', 'test-auth-code');
        return route.fulfill({ status: 302, headers: { Location: back.toString() } });
      }
      case '/rest/v1/rpc/ensure_profile':
        return json(204);
      case '/rest/v1/rpc/shared_example': {
        const id = (body as { p_id?: string })?.p_id;
        const r = mock.rows.find((x) => x.id === id && x.shared);
        return json(200, r ? [pick(r, ['viz', 'title', 'notes', 'example'])] : []);
      }
      case '/rest/v1/saved_examples':
        break;
      default:
        return json(404, { message: `not mocked: ${path}` });
    }

    // The table, as row-level security leaves it for the signed-in reader.
    const mine = mock.rows.filter((r) => r.owner === USER.id);
    const now = new Date().toISOString();
    if (req.method() === 'GET') {
      const list = mine
        .filter(
          (r) => (!eq('owner') || r.owner === eq('owner')) && (!eq('viz') || r.viz === eq('viz')),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((r) => pick(r, COLUMNS));
      return json(200, list);
    }
    if (req.method() === 'POST') {
      const input = body as Partial<Row>;
      const r = row({
        viz: input.viz!,
        title: input.title!,
        notes: input.notes ?? '',
        example: input.example,
        shared: input.shared ?? false,
        created_at: now,
        updated_at: now,
      });
      mock.rows.push(r);
      return json(201, one ? pick(r, COLUMNS) : [pick(r, COLUMNS)]);
    }
    const target = mine.find((r) => r.id === eq('id'));
    if (req.method() === 'PATCH') {
      if (!target)
        return json(406, { code: 'PGRST116', message: 'no rows', details: '', hint: null });
      Object.assign(target, body as Partial<Row>, { updated_at: now });
      return json(200, one ? pick(target, COLUMNS) : [pick(target, COLUMNS)]);
    }
    if (req.method() === 'DELETE') {
      if (target) mock.rows.splice(mock.rows.indexOf(target), 1);
      return json(200, target ? [{ id: target.id }] : []);
    }
    return json(405, { message: 'method not mocked' });
  });
  return mock;
}
