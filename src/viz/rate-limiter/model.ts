/**
 * Rate limiter: requests arrive at whole seconds, and the limiter lets at most L of them through
 * per W seconds. Four designs, chosen by a setting, run on the same request times:
 *
 * - fixed: the fixed window counter, the obvious design. Time is cut into windows [kW, kW + W),
 *   and a counter lets L requests through in each. Two numbers (the window's start and the
 *   count), but L requests at the end of one window and L at the start of the next all pass:
 *   up to 2L in W seconds, the burst at a window edge.
 * - log: the sliding log. The times of the requests let through in the last W seconds,
 *   (t − W, t], oldest first; a request passes while fewer than L are logged. Exact, and the
 *   memory is one time per request let through: up to L numbers per client.
 * - counter: the sliding window counter. The fixed windows' counts of this window (curr) and the
 *   one before (prev); the last W seconds overlap the previous window by W − (t − start)
 *   seconds, so the estimate is curr + prev · (W − (t − start)) / W, as if the previous window's
 *   requests were spread evenly. A request passes while the estimate is under L. Three numbers.
 * - bucket: the token bucket. It holds at most L tokens and gains L every W seconds (the same
 *   long-run rate); each request takes one, and with less than one token left it is refused.
 *   Two numbers (the tokens and the time of the last refill). It starts full.
 *
 * Exact arithmetic: W is 2, 4, 5 or 10, and the bucket keeps its tokens in units of 1/W (a token
 * is W units, and a second adds L units), so tokens and estimates are whole numbers of units
 * and print as short decimals. The code tabs do the same.
 *
 * Requests arrive in time order, from 0 to MAX_T seconds, at most MAX_SAME at one second.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';

export type Kind = 'fixed' | 'log' | 'counter' | 'bucket';
export const KINDS: readonly Kind[] = ['fixed', 'log', 'counter', 'bucket'];

export const KIND_NAME: Record<Kind, string> = {
  fixed: 'fixed window counter',
  log: 'sliding log',
  counter: 'sliding window counter',
  bucket: 'token bucket',
};

/** The latest time a request may come at, in seconds. */
export const MAX_T = 39;
/** The most requests at one second, so a stack of markers stays on the drawing. */
export const MAX_SAME = 6;
export const MAX_LIMIT = 6;
/** Window lengths offered: each makes 1/W a short decimal. */
export const WINDOWS = ['2', '4', '5', '10'] as const;

export interface RLSettings {
  [key: string]: Scalar;
  limiter: Kind;
  /** L: requests per window, and the bucket's capacity. */
  limit: number;
  /** W, in seconds. */
  window: string;
}

export const defaults: RLSettings = { limiter: 'counter', limit: 3, window: '10' };

export interface Req {
  uid: number;
  t: number;
  /** Let through, refused, or null while it is being checked. */
  ok: boolean | null;
}

export interface RLState {
  /** Every request so far, in time order. */
  reqs: Req[];
  /** fixed and counter: the start of the current window. */
  start: number;
  /** fixed: requests let through in the current window. counter: curr, the same. */
  count: number;
  /** counter: requests let through in the window before the current one. */
  prev: number;
  /** log: the uids of the logged requests, oldest first. */
  log: number[];
  /** bucket: tokens × W. */
  units: number;
  /** bucket: the time of the last refill. */
  last: number;
  nextUid: number;
}

export interface RLExtra {
  /** The request being checked. */
  at?: number;
  /** log: logged requests about to be dropped. */
  drop?: number[];
  /** counter: the estimate, in units of 1/W, once worked out. */
  est?: number;
  /** bucket: the step refilled the bucket. */
  refilled?: boolean;
}

export type RLStep = Step<RLState, RLExtra>;
type Op = OpSpec<RLState, RLSettings, RLExtra>;

export interface Params {
  kind: Kind;
  L: number;
  W: number;
}

export function params(s: RLSettings): Params {
  const kind = KINDS.includes(s.limiter) ? s.limiter : 'counter';
  const L = Math.max(1, Math.min(MAX_LIMIT, Math.round(Number(s.limit) || 3)));
  const w = Number(s.window);
  const W = (WINDOWS as readonly string[]).includes(String(s.window)) ? w : 10;
  return { kind, L, W };
}

export function init(settings: RLSettings): RLState {
  const { L, W } = params(settings);
  return { reqs: [], start: 0, count: 0, prev: 0, log: [], units: L * W, last: 0, nextUid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Text -----

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A number of units of 1/W as a short decimal: 24 units with W = 10 is "2.4". */
export const dec = (units: number, W: number): string => String(Math.round((units / W) * 100) / 100);

/** "a", "a and b", "a, b and c". */
export const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export const windowText = (start: number, W: number) => `[${start}, ${start + W})`;

/** A whole number with a true minus sign: "−2". */
export const fmt = (v: number) => (v < 0 ? `−${-v}` : String(v));

/** The last W seconds before t, as an interval: "(2, 12]". */
export const lastW = (t: number, W: number) => `(${fmt(t - W)}, ${t}]`;

// ----- Input -----

/** A request time: a whole number of seconds from 0 to MAX_T. */
export function readTime(raw: Value | undefined): number | Error {
  const t = String(raw ?? '').trim();
  if (!/^\d+$/.test(t)) return new Error(`A time is a whole number of seconds, from 0 to ${MAX_T}.`);
  const v = Number(t);
  return v > MAX_T ? new Error(`Keep times between 0 and ${MAX_T} seconds.`) : v;
}

// ----- Reading the state -----

export const reqById = (s: RLState, uid: number): Req => {
  const r = s.reqs.find((x) => x.uid === uid);
  if (!r) throw new Error(`no request ${uid}`);
  return r;
};

export const passed = (s: RLState) => s.reqs.filter((r) => r.ok === true);
export const refused = (s: RLState) => s.reqs.filter((r) => r.ok === false);

/** Requests let through in (from, to]. */
export const passedIn = (s: RLState, from: number, to: number) =>
  s.reqs.filter((r) => r.ok === true && r.t > from && r.t <= to).length;

/** The most requests let through in any W seconds, (p − W, p]. */
export function busiest(s: RLState, W: number): number {
  let best = 0;
  for (const r of passed(s)) best = Math.max(best, passedIn(s, r.t - W, r.t));
  return best;
}

/** How many numbers the limiter keeps. */
export function memory(s: RLState, kind: Kind): number {
  return kind === 'log' ? s.log.length : kind === 'counter' ? 3 : 2;
}

export const busiestKey = (W: number) => `busiest ${W} s`;

/** The variables: the request's time, the limiter's own, then the tallies. */
export function readouts(s: RLState, p: Params, x: RLExtra = {}): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  const now = x.at === undefined ? undefined : reqById(s, x.at);
  if (now) out.t = now.t;
  if (p.kind === 'fixed') {
    out.window = windowText(s.start, p.W);
    out.count = s.count;
  } else if (p.kind === 'log') {
    out['log size'] = s.log.length;
  } else if (p.kind === 'counter') {
    out.window = windowText(s.start, p.W);
    out.prev = s.prev;
    out.curr = s.count;
    if (x.est !== undefined) out.estimate = Number(dec(x.est, p.W));
  } else {
    out.tokens = Number(dec(s.units, p.W));
    out['last refill'] = s.last;
  }
  out.passed = passed(s).length;
  out.refused = refused(s).length;
  out['requests checked'] = s.reqs.filter((r) => r.ok !== null).length;
  out['memory kept'] = memory(s, p.kind);
  out[busiestKey(p.W)] = busiest(s, p.W);
  return out;
}

// ----- Steps -----

function step(
  s: RLState,
  p: Params,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[],
  extra: RLExtra = {},
): RLStep {
  return { state: s, marks, say, lines, level, vars: readouts(s, p, extra), extra };
}

function decide(s: RLState, uid: number, ok: boolean): RLState {
  return { ...s, reqs: s.reqs.map((r) => (r.uid === uid ? { ...r, ok } : r)) };
}

/** After a pass: a note when the last W seconds now hold more than L requests let through. */
function overNote(s: RLState, p: Params, t: number): string {
  const n = passedIn(s, t - p.W, t);
  if (n <= p.L) return '';
  const why =
    p.kind === 'fixed'
      ? 'the burst at a window edge'
      : p.kind === 'counter'
        ? 'the estimate let in more than the limit'
        : 'a bucket that saved its tokens lets a burst through on top of the steady rate';
  return ` That makes ${n} let through in the last ${p.W} seconds, ${lastW(t, p.W)}, more than ${p.L}: ${why}.`;
}

/** Marks for the request being checked and the rolling window under the time line. */
const checking = (uid: number): Mark[] => [mark(`r-${uid}`, 'active'), mark('roll', 'active')];

function* fixedRun(s: RLState, uid: number, t: number, p: Params): Generator<RLStep, RLState> {
  const { L, W } = p;
  const w = Math.floor(t / W) * W;
  const fresh = w !== s.start;
  let c: RLState = fresh ? { ...s, start: w, count: 0 } : s;
  yield step(
    c,
    p,
    fresh
      ? `A request at ${t}. It is past the counter's window ${windowText(s.start, W)}, so start the window that holds it, ${windowText(w, W)}, with count = 0.`
      : c.count === 0
        ? `A request at ${t}, in the current window ${windowText(w, W)}. Nothing has passed in it yet.`
        : `A request at ${t}, in the current window ${windowText(w, W)}. ${plural(c.count, 'request has', 'requests have')} passed in it so far.`,
    fresh ? ['fx.new', 'fx.reset'] : ['fx.new'],
    2,
    [...checking(uid), mark(`band-${w}`, 'active'), mark('m-count', fresh ? 'new' : 'active')],
    { at: uid },
  );
  let say: string;
  if (c.count < L) {
    c = decide({ ...c, count: c.count + 1 }, uid, true);
    say = `count = ${c.count - 1} < ${L}: let it through, and count = ${c.count}.${overNote(c, p, t)}`;
  } else {
    c = decide(c, uid, false);
    say = `count = ${L}, the limit: refuse it. The count starts over at ${w + W}, whatever happened just before.`;
  }
  const ok = c.reqs.at(-1)!.ok;
  yield step(
    c,
    p,
    say,
    ['fx.check', ok ? 'fx.pass' : 'fx.refuse'],
    1,
    [mark(`r-${uid}`, ok ? 'found' : 'error'), mark('m-count', ok ? 'new' : 'error')],
    { at: uid },
  );
  return c;
}

function* logRun(s: RLState, uid: number, t: number, p: Params): Generator<RLStep, RLState> {
  const { L, W } = p;
  const drop = s.log.filter((u) => reqById(s, u).t <= t - W);
  const times = (us: number[]) => us.map((u) => String(reqById(s, u).t));
  const first = s.log[0];
  yield step(
    s,
    p,
    drop.length
      ? `A request at ${t}. Drop the logged times at or before ${t} − ${W} = ${t - W}: ${and(times(drop))} ${drop.length === 1 ? 'has' : 'have'} left the last ${W} seconds.`
      : first === undefined
        ? `A request at ${t}. The log is empty: nothing to drop.`
        : t < W
          ? `A request at ${t}. Every logged time is within the last ${W} seconds: nothing to drop.`
          : `A request at ${t}. The oldest logged time, ${reqById(s, first).t}, is after ${t} − ${W} = ${t - W}: nothing to drop.`,
    drop.length ? ['lg.loop', 'lg.drop'] : ['lg.loop'],
    2,
    [...checking(uid), ...drop.map((u) => mark(`log-${u}`, 'remove'))],
    { at: uid, drop },
  );
  let c: RLState = { ...s, log: s.log.filter((u) => !drop.includes(u)) };
  let say: string;
  if (c.log.length < L) {
    c = decide({ ...c, log: [...c.log, uid] }, uid, true);
    say = `The log holds ${c.log.length - 1} < ${L}: let it through and log ${t}.${overNote(c, p, t)}`;
  } else {
    c = decide(c, uid, false);
    const oldest = reqById(c, c.log[0]!).t;
    say = `The log holds ${L}, the limit: refuse it, and log nothing. The next request can pass once ${oldest} leaves, at ${oldest + W}.`;
  }
  const ok = c.reqs.at(-1)!.ok;
  yield step(
    c,
    p,
    say,
    ['lg.check', ok ? 'lg.pass' : 'lg.refuse'],
    1,
    [mark(`r-${uid}`, ok ? 'found' : 'error'), ...(ok ? [mark(`log-${uid}`, 'new')] : [])],
    { at: uid },
  );
  return c;
}

function* counterRun(s: RLState, uid: number, t: number, p: Params): Generator<RLStep, RLState> {
  const { L, W } = p;
  const w = Math.floor(t / W) * W;
  let c: RLState = s;
  let say: string;
  let lines: string[];
  if (w === s.start) {
    say = `A request at ${t}, in the current window ${windowText(w, W)}: prev = ${s.prev}, curr = ${s.count}.`;
    lines = ['ct.win'];
  } else if (w === s.start + W) {
    c = { ...s, start: w, prev: s.count, count: 0 };
    say = `A request at ${t} starts the window ${windowText(w, W)}. The count of ${windowText(s.start, W)} becomes the previous window's: prev = ${s.count}, curr = 0.`;
    lines = ['ct.win', 'ct.next', 'ct.set'];
  } else {
    c = { ...s, start: w, prev: 0, count: 0 };
    say = `A request at ${t} starts the window ${windowText(w, W)}. Nothing passed in the window before it, ${windowText(w - W, W)}: prev = 0, curr = 0.`;
    lines = ['ct.win', 'ct.skip', 'ct.set'];
  }
  yield step(
    c,
    p,
    say,
    lines,
    2,
    [
      ...checking(uid),
      mark(`band-${w}`, 'active'),
      mark('m-curr', 'active'),
      mark('m-prev', 'compare'),
    ],
    { at: uid },
  );

  const e = t - w;
  const overlap = W - e;
  const est = c.count * W + c.prev * overlap;
  const share = dec(overlap, W);
  yield step(
    c,
    p,
    c.prev === 0
      ? `Nothing passed in the previous window, so the estimate is just curr = ${c.count}.`
      : overlap === W
        ? `The last ${W} seconds, ${lastW(t, W)}, cover all of the previous window, so count all ${c.prev} of its requests: estimate = ${c.count} + ${c.prev} = ${dec(est, W)}.`
        : `The last ${W} seconds, ${lastW(t, W)}, still cover ${overlap} of the previous window's ${W} seconds, so count ${share} of its ${c.prev}: estimate = ${c.count} + ${c.prev} × ${share} = ${dec(est, W)}.`,
    ['ct.est'],
    2,
    [
      mark(`r-${uid}`, 'active'),
      mark('overlap', 'compare'),
      mark('m-prev', 'compare'),
      mark('m-curr', 'active'),
      mark('m-est', 'active'),
    ],
    { at: uid, est },
  );

  let fin: string;
  if (est < L * W) {
    c = decide({ ...c, count: c.count + 1 }, uid, true);
    fin = `${dec(est, W)} < ${L}: let it through, and curr = ${c.count}.${overNote(c, p, t)}`;
  } else {
    c = decide(c, uid, false);
    const exact = passedIn(c, t - W, t);
    fin =
      exact < L
        ? `${dec(est, W)} ≥ ${L}: refuse it. Only ${plural(exact, 'request')} really passed in ${lastW(t, W)}, so a sliding log would let it through: the estimate assumes the previous window's requests were spread evenly.`
        : `${dec(est, W)} ≥ ${L}: refuse it.`;
  }
  const ok = c.reqs.at(-1)!.ok;
  yield step(
    c,
    p,
    fin,
    ['ct.check', ok ? 'ct.pass' : 'ct.refuse'],
    1,
    [mark(`r-${uid}`, ok ? 'found' : 'error'), mark('m-est', ok ? 'found' : 'error')],
    { at: uid, est },
  );
  return c;
}

function* bucketRun(s: RLState, uid: number, t: number, p: Params): Generator<RLStep, RLState> {
  const { L, W } = p;
  const dt = t - s.last;
  const add = dt * L;
  const full = L * W;
  const units = Math.min(full, s.units + add);
  const capped = s.units + add > full;
  let c: RLState = { ...s, units, last: t };
  const rate = dec(L, W);
  yield step(
    c,
    p,
    dt === 0
      ? `A request at ${t}. No time has passed since the last refill: tokens stay at ${dec(units, W)}.`
      : capped
        ? `A request at ${t}. ${dt} s since the last refill at ${s.last} adds ${dt} × ${rate} = ${dec(add, W)} tokens, but the bucket holds at most ${L}: tokens = min(${L}, ${dec(s.units, W)} + ${dec(add, W)}) = ${dec(units, W)}.`
        : `A request at ${t}. ${dt} s since the last refill at ${s.last} adds ${dt} × ${rate} = ${dec(add, W)} tokens: tokens = ${dec(s.units, W)} + ${dec(add, W)} = ${dec(units, W)}.`,
    ['tb.refill', 'tb.last'],
    2,
    [...checking(uid), mark('m-tokens', 'active'), mark('m-last', 'new')],
    { at: uid, refilled: true },
  );
  let say: string;
  if (units >= W) {
    c = decide({ ...c, units: units - W }, uid, true);
    say = `tokens = ${dec(units, W)} ≥ 1: take one and let it through. ${dec(c.units, W)} left.${overNote(c, p, t)}`;
  } else {
    c = decide(c, uid, false);
    say = `tokens = ${dec(units, W)} < 1: refuse it. The bucket has a whole token again at ${t + Math.ceil((W - units) / L)}.`;
  }
  const ok = c.reqs.at(-1)!.ok;
  yield step(
    c,
    p,
    say,
    ['tb.check', ok ? 'tb.pass' : 'tb.refuse'],
    1,
    [mark(`r-${uid}`, ok ? 'found' : 'error'), mark('m-tokens', ok ? 'new' : 'error')],
    { at: uid },
  );
  return c;
}

function* refuseInput(s: RLState, p: Params, why: string): Generator<RLStep, RLState> {
  yield step(s, p, `Nothing to do. ${why}`, [], 1, []);
  return s;
}

const request: Op = {
  label: 'Request',
  arity: 1,
  *run(s, [raw], { settings }) {
    const p = params(settings);
    const t = readTime(raw);
    if (t instanceof Error) return yield* refuseInput(s, p, t.message);
    const lastT = s.reqs.at(-1)?.t;
    if (lastT !== undefined && t < lastT)
      return yield* refuseInput(
        s,
        p,
        `Requests arrive in time order: the last came at ${lastT}, so the next comes at ${lastT} or later.`,
      );
    if (s.reqs.filter((r) => r.t === t).length >= MAX_SAME)
      return yield* refuseInput(
        s,
        p,
        `At most ${MAX_SAME} requests at the same second, so the picture stays readable.`,
      );
    const uid = s.nextUid;
    const arrived: RLState = { ...s, reqs: [...s.reqs, { uid, t, ok: null }], nextUid: uid + 1 };
    if (p.kind === 'fixed') return yield* fixedRun(arrived, uid, t, p);
    if (p.kind === 'log') return yield* logRun(arrived, uid, t, p);
    if (p.kind === 'counter') return yield* counterRun(arrived, uid, t, p);
    return yield* bucketRun(arrived, uid, t, p);
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const p = params(settings);
    const fresh: RLState = { ...init(settings), nextUid: s.nextUid };
    yield step(
      fresh,
      p,
      `Clear: forget every request and start the ${KIND_NAME[p.kind]} afresh${p.kind === 'bucket' ? ', with a full bucket at time 0' : ''}.`,
      ['clr.set'],
      1,
      [],
    );
    return fresh;
  },
};

export const ops: Record<string, Op> = { request, clear };

// ----- Pseudocode -----

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RLSettings): PseudoBlock[] {
  const { kind } = params(settings);
  const clr: PseudoBlock = {
    op: 'clear',
    lines: [
      Ln('clr.sig', 0, 'clear()', 'To start over:'),
      Ln(
        'clr.set',
        1,
        kind === 'log'
          ? 'log = []'
          : kind === 'bucket'
            ? 'tokens = L; last = 0'
            : kind === 'counter'
              ? 'start = 0; prev = 0; curr = 0'
              : 'start = 0; count = 0',
        kind === 'log'
          ? 'Forget every logged time.'
          : kind === 'bucket'
            ? 'Fill the bucket, as at time 0.'
            : 'Go back to the first window, with nothing counted.',
      ),
    ],
  };
  const blocks: Record<Kind, PseudoLine[]> = {
    fixed: [
      Ln('fx.sig', 0, 'allow(t)   // fixed window counter', 'When a request comes at time t:'),
      Ln('fx.new', 1, 'if t ≥ start + W', 'if t is past the current window,'),
      Ln(
        'fx.reset',
        2,
        'start = ⌊t / W⌋ · W; count = 0',
        'move to the window that holds t, with nothing counted yet.',
      ),
      Ln('fx.check', 1, 'if count < L', 'If fewer than L requests have passed in this window,'),
      Ln('fx.pass', 2, 'count = count + 1; return pass', 'count this one and let it through.'),
      Ln('fx.refuse', 1, 'return refuse', 'Otherwise turn it away.'),
    ],
    log: [
      Ln('lg.sig', 0, 'allow(t)   // sliding log', 'When a request comes at time t:'),
      Ln(
        'lg.loop',
        1,
        'while log ≠ [] and log.first ≤ t − W',
        'while the oldest logged time is W or more seconds ago,',
      ),
      Ln('lg.drop', 2, 'log.removeFirst()', 'drop it: it has left the last W seconds.'),
      Ln(
        'lg.check',
        1,
        'if size(log) < L',
        'If fewer than L requests passed in the last W seconds,',
      ),
      Ln('lg.pass', 2, 'log.append(t); return pass', 'log its time and let it through.'),
      Ln('lg.refuse', 1, 'return refuse', 'Otherwise turn it away, and log nothing.'),
    ],
    counter: [
      Ln('ct.sig', 0, 'allow(t)   // sliding window counter', 'When a request comes at time t:'),
      Ln('ct.win', 1, 'w = ⌊t / W⌋ · W', 'find the start of the fixed window that holds t.'),
      Ln(
        'ct.next',
        1,
        'if w == start + W: prev = curr; curr = 0',
        'If it is the next window, this window’s count becomes the previous one’s;',
      ),
      Ln(
        'ct.skip',
        1,
        'else if w > start + W: prev = 0; curr = 0',
        'if a whole window went by in between, both counts start at 0.',
      ),
      Ln('ct.set', 1, 'start = w', 'The window that holds t is now the current one.'),
      Ln(
        'ct.est',
        1,
        'est = curr + prev · (W − (t − start)) / W',
        'Estimate the requests in the last W seconds: all of this window’s, and the share of the previous window’s that the last W seconds still cover.',
      ),
      Ln('ct.check', 1, 'if est < L', 'If the estimate is under L,'),
      Ln('ct.pass', 2, 'curr = curr + 1; return pass', 'count this one and let it through.'),
      Ln('ct.refuse', 1, 'return refuse', 'Otherwise turn it away.'),
    ],
    bucket: [
      Ln('tb.sig', 0, 'allow(t)   // token bucket', 'When a request comes at time t:'),
      Ln(
        'tb.refill',
        1,
        'tokens = min(L, tokens + (t − last) · L / W)',
        'add the tokens that dripped in since the last refill, L every W seconds, but never more than L in the bucket;',
      ),
      Ln('tb.last', 1, 'last = t', 'remember when this refill happened.'),
      Ln('tb.check', 1, 'if tokens ≥ 1', 'If there is a whole token,'),
      Ln('tb.pass', 2, 'tokens = tokens − 1; return pass', 'take it and let the request through.'),
      Ln('tb.refuse', 1, 'return refuse', 'Otherwise turn it away.'),
    ],
  };
  return [{ op: 'request', lines: blocks[kind] }, clr];
}

// ----- Start -----

const TYPE_HINT = `Type the time of a request in seconds (0 to ${MAX_T}) and press Request; several times at once, such as 7 8 9 10, arrive one after another.`;

export function initialSay(_s: RLState, settings: RLSettings): string {
  const { kind, L, W } = params(settings);
  const what: Record<Kind, string> = {
    fixed: `A fixed window counter, the obvious design: cut time into windows of ${W} seconds and let ${L} requests through in each.`,
    log: `A sliding log: keep the time of each request let through in the last ${W} seconds, and let a new one through while fewer than ${L} are logged.`,
    counter: `A sliding window counter: this window's count and the last one's give an estimate of the last ${W} seconds, which must stay under ${L}.`,
    bucket: `A token bucket that holds ${L} tokens and gains ${L} every ${W} seconds. Each request takes a token; with none left, it is refused.`,
  };
  return `${what[kind]} ${TYPE_HINT}`;
}

export function initialVars(s: RLState, settings: RLSettings) {
  return readouts(s, params(settings));
}

export function describe(s: RLState, settings: RLSettings): string {
  const { kind, L, W } = params(settings);
  const head = `A ${KIND_NAME[kind]} allowing ${L} requests per ${W} seconds.`;
  if (!s.reqs.length) return `${head} No requests yet.`;
  const ok = passed(s).map((r) => r.t);
  const no = refused(s).map((r) => r.t);
  const memo =
    kind === 'fixed'
      ? `It keeps the window ${windowText(s.start, W)} and count ${s.count}.`
      : kind === 'log'
        ? `The log holds ${s.log.length ? s.log.map((u) => reqById(s, u).t).join(', ') : 'nothing'}.`
        : kind === 'counter'
          ? `It keeps the window ${windowText(s.start, W)}, prev ${s.prev} and curr ${s.count}.`
          : `The bucket holds ${dec(s.units, W)} tokens, last refilled at ${s.last}.`;
  return `${head} Requests at ${s.reqs.map((r) => r.t).join(', ')}. Let through: ${ok.length ? ok.join(', ') : 'none'}. Refused: ${no.length ? no.join(', ') : 'none'}. ${memo}`;
}
