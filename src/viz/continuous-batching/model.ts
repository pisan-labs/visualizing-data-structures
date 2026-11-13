/**
 * Continuous batching (iteration-level scheduling, Yu et al. 2022, the Orca paper) against
 * static batching. Requests arrive over time, each with a prompt and a number of tokens to
 * write. The model runs in iterations: in one iteration every request in a slot moves one token
 * forward. A request's first iteration reads its whole prompt (prefill) and writes its first
 * token; each later iteration writes one more.
 *
 *   static       a batch starts when all slots are free, with up to `slots` waiting requests,
 *                and runs until its longest request is done. A slot whose request is done sits
 *                idle; the batch's answers return together when the last one is done.
 *   continuous   at the start of every iteration, each free slot takes the next waiting request,
 *                and a request returns as soon as its own last token is out.
 *
 * Time is counted in iterations: iteration t runs from time t to time t + 1. A request that
 * arrives at time a may start in iteration a. Its wait is start − arrival, and it is done at the
 * end of the iteration that returns it.
 *
 *   add(a, p, n)   a request arriving at time a with p prompt tokens and n tokens to write
 *   tick           one iteration
 *   run            iterations until every request is done
 *
 * Settings
 *   slots    requests a batch holds at once, 2 to 4
 *   policy   'continuous' (the default) or 'static'
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export type Policy = 'continuous' | 'static';

export interface CbSettings {
  [key: string]: Scalar;
  slots: number;
  policy: Policy;
}

export const defaults: CbSettings = { slots: 3, policy: 'continuous' };

/** Iterations the chart holds: every run must be done by then. */
export const HORIZON = 18;
export const MAX_REQS = 6;
export const MAX_PROMPT = 12;
export const MAX_OUT = 8;
export const NAMES = 'ABCDEF';

export interface Req {
  name: string;
  arrive: number;
  prompt: number;
  out: number;
  /** The iteration it entered a slot. */
  start: number | null;
  /** Tokens written so far. */
  made: number;
  /** The time its last token was out. */
  last: number | null;
  /** The time its answer was returned (static: when its batch ended). */
  done: number | null;
}

/** One slot in one iteration: a request's prefill or decode, or idle. */
export type Cell =
  | { req: string; kind: 'prefill' | 'decode' }
  | { req: null; kind: 'idle'; waiting: boolean };

export interface CbState {
  /** In the order added. */
  reqs: Req[];
  /** Iterations run. */
  clock: number;
  /** Who is in each slot now. */
  slots: (string | null)[];
  /** Static batching: the requests of the batch that is running. */
  batch: string[];
  /** When each batch started (static). */
  batches: number[];
  /** chart[t][i]: slot i in iteration t. */
  chart: Cell[][];
  /** Tokens through the model in each iteration: a prompt for a prefill, one for a decode. */
  read: number[];
  /** Requests still waiting after each iteration's slots were filled. */
  queue: number[];
}

type S = CbState;
type Op = OpSpec<S, CbSettings, unknown>;
type CStep = Step<S, unknown>;

export function init(settings: CbSettings): S {
  return {
    reqs: [],
    clock: 0,
    slots: Array<string | null>(settings.slots).fill(null),
    batch: [],
    batches: [],
    chart: [],
    read: [],
    queue: [],
  };
}

const clone = (s: S): S => ({
  ...s,
  reqs: s.reqs.map((r) => ({ ...r })),
  slots: [...s.slots],
  batch: [...s.batch],
  batches: [...s.batches],
  chart: s.chart.map((c) => c.map((x) => ({ ...x }))),
  read: [...s.read],
  queue: [...s.queue],
});

export const reqOf = (s: S, name: string): Req => s.reqs.find((r) => r.name === name)!;

/** Requests that have arrived by time t and not started, first come first served. */
export const waitingAt = (s: S, t: number): Req[] =>
  s.reqs
    .filter((r) => r.start === null && r.arrive <= t)
    .sort((a, b) => a.arrive - b.arrive || a.name.localeCompare(b.name));

export const unfinished = (s: S): Req[] => s.reqs.filter((r) => r.done === null);

/** What one iteration did, for narration. */
export interface Iteration {
  t: number;
  /** Requests that took a slot: [name, slot]. */
  joined: [string, number][];
  newBatch: boolean;
  ran: { name: string; kind: 'prefill' | 'decode' }[];
  /** Requests whose last token came out. */
  ended: string[];
  /** Requests whose answers returned at the end of the iteration. */
  returned: string[];
  idle: number;
  waiting: string[];
}

/** Fill the free slots at the start of iteration `s.clock`: the scheduler's decision. */
export function admit(s: S, settings: CbSettings): { state: S; joined: [string, number][] } {
  const t = s.clock;
  const waiting = waitingAt(s, t);
  const joined: [string, number][] = [];
  if (settings.policy === 'static' && s.batch.length > 0) return { state: s, joined };
  if (!waiting.length || !s.slots.includes(null)) return { state: s, joined };
  const out = clone(s);
  out.slots.forEach((who, i) => {
    if (who !== null || !waiting.length) return;
    const r = waiting.shift()!;
    out.slots[i] = r.name;
    reqOf(out, r.name).start = t;
    joined.push([r.name, i]);
  });
  if (settings.policy === 'static') {
    out.batch = joined.map(([n]) => n);
    out.batches.push(t);
  }
  return { state: out, joined };
}

/** Run iteration `s.clock` on the slots as they are (after `admit`). */
export function runIteration(s: S, settings: CbSettings) {
  const out = clone(s);
  const t = s.clock;
  const waiting = waitingAt(s, t).map((r) => r.name);
  const cells: Cell[] = [];
  const ran: Iteration['ran'] = [];
  const ended: string[] = [];
  let read = 0;
  out.slots.forEach((who, i) => {
    if (who === null) {
      cells.push({ req: null, kind: 'idle', waiting: waiting.length > 0 });
      return;
    }
    const r = reqOf(out, who);
    r.made++;
    const kind = r.made === 1 ? 'prefill' : 'decode';
    read += kind === 'prefill' ? r.prompt : 1;
    cells.push({ req: who, kind });
    ran.push({ name: who, kind });
    if (r.made === r.out) {
      r.last = t + 1;
      out.slots[i] = null;
      ended.push(who);
      if (settings.policy === 'continuous') r.done = t + 1;
    }
  });
  let returned = settings.policy === 'continuous' ? ended : [];
  if (settings.policy === 'static' && out.batch.length) {
    const batch = out.batch.map((n) => reqOf(out, n));
    if (batch.every((r) => r.last !== null)) {
      for (const r of batch) r.done = t + 1;
      returned = out.batch;
      out.batch = [];
    }
  }
  out.chart.push(cells);
  out.read.push(read);
  out.queue.push(waiting.length);
  out.clock = t + 1;
  const idle = cells.filter((c) => c.req === null).length;
  return { state: out, ran, ended, returned, idle, waiting };
}

/** Iterations until every request is done, from s, with nothing more added. */
export function finishTime(s: S, settings: CbSettings): number {
  let state = s;
  while (unfinished(state).length) {
    state = runIteration(admit(state, settings).state, settings).state;
    if (state.clock > 200) break;
  }
  return state.clock;
}

/** A request as numbers: when it arrives, its prompt, how many tokens it writes. */
export type Spec = [arrive: number, prompt: number, out: number];

/** Every setting a page can have, to check that requests fit the chart in each. */
export const ALL_SETTINGS: CbSettings[] = [2, 3, 4].flatMap((slots) =>
  (['continuous', 'static'] as const).map((policy) => ({ slots, policy })),
);

/** The requests from `specs`, added in order to an empty server. */
export function withRequests(settings: CbSettings, specs: readonly Spec[]): S {
  const s = init(settings);
  specs.forEach(([arrive, prompt, out], i) =>
    s.reqs.push({ name: NAMES[i]!, arrive, prompt, out, start: null, made: 0, last: null, done: null }),
  );
  return s;
}

/**
 * The longest start of `specs` that Add accepts whatever the settings: each prefix must be done
 * by HORIZON in every setting. Presets and practice use it.
 */
export function fitting(specs: readonly Spec[]): Spec[] {
  const out: Spec[] = [];
  for (const x of specs.slice(0, MAX_REQS)) {
    const next = [...out, x];
    if (ALL_SETTINGS.some((st) => finishTime(withRequests(st, next), st) > HORIZON)) break;
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Readouts

export const idleCells = (s: S): number =>
  s.chart.reduce((t, col) => t + col.filter((c) => c.req === null).length, 0);
export const idleWaiting = (s: S): number =>
  s.chart.reduce((t, col) => t + col.filter((c) => c.req === null && c.waiting).length, 0);
export const made = (s: S): number => s.reqs.reduce((t, r) => t + r.made, 0);
export const wait = (r: Req): number | null => (r.start === null ? null : r.start - r.arrive);
export const totalWait = (s: S): number => s.reqs.reduce((t, r) => t + (wait(r) ?? 0), 0);

/** Tokens written per iteration, two decimals. */
export const throughput = (s: S): string => (s.clock ? (made(s) / s.clock).toFixed(2) : '0');

export function vars(s: S): Record<string, Scalar> {
  return {
    time: s.clock,
    'tokens written': made(s),
    'tokens per iteration': throughput(s),
    'idle slot-iterations': idleCells(s),
    'idle while a request waits': idleWaiting(s),
    waiting: waitingAt(s, s.clock).length,
    done: s.reqs.filter((r) => r.done !== null).length,
    'total wait': totalWait(s),
  };
}

// ---------------------------------------------------------------------------------------------
// Words

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function list(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const rowMarks = (name: string, role: Mark['role']): Mark[] => [
  mark(`tr-${name}`, role),
  ...['arrive', 'prompt', 'out', 'start', 'done', 'wait'].map((c) => mark(`td-${name}-${c}`, role)),
];

function refuse(s: S, say: string): CStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s) };
}

const whole = (v: Value | undefined): number =>
  typeof v === 'number' ? v : /^\s*\d+\s*$/.test(String(v ?? '')) ? Number(v) : NaN;

/** Narration for one iteration. */
export function iterationSay(it: Iteration, s: S, settings: CbSettings): string {
  const parts: string[] = [];
  if (it.joined.length) {
    const who = it.joined.map(([n, i]) => `${n} into slot ${i + 1}`);
    parts.push(
      it.newBatch
        ? `A new batch starts: ${list(who)}. No one else joins until all of ${it.joined.length === 1 ? 'it is' : 'them are'} done.`
        : `${list(who)}.`,
    );
  }
  const pre = it.ran.filter((r) => r.kind === 'prefill').map((r) => r.name);
  const dec = it.ran.filter((r) => r.kind === 'decode').map((r) => r.name);
  if (pre.length)
    parts.push(
      `${list(pre)} ${pre.length === 1 ? 'reads its prompt' : 'read their prompts'} (${pre.map((n) => `${reqOf(s, n).prompt} tokens`).join(', ')}) and ${pre.length === 1 ? 'writes its' : 'write their'} first token.`,
    );
  if (dec.length)
    parts.push(`${list(dec)} ${dec.length === 1 ? 'writes one more token' : 'each write one more token'}.`);
  if (!it.ran.length) parts.push('Every slot is idle: no request is here yet.');
  if (settings.policy === 'continuous') {
    if (it.returned.length)
      parts.push(
        `${list(it.returned)} ${it.returned.length === 1 ? 'is' : 'are'} done at time ${it.t + 1}; the slot is free for the next iteration.`,
      );
  } else {
    const held = it.ended.filter((n) => !it.returned.includes(n));
    if (held.length)
      parts.push(
        `${list(held)} ${held.length === 1 ? 'has' : 'have'} written ${held.length === 1 ? 'its' : 'their'} last token, but the slot stays idle until the whole batch is done.`,
      );
    if (it.returned.length)
      parts.push(
        `The batch is done: ${list(it.returned)} return together at time ${it.t + 1}.`,
      );
  }
  if (it.waiting.length && it.idle)
    parts.push(
      `${plural(it.idle, 'slot')} idle while ${list(it.waiting)} ${it.waiting.length === 1 ? 'waits' : 'wait'}.`,
    );
  else if (it.waiting.length) parts.push(`${list(it.waiting)} ${it.waiting.length === 1 ? 'waits' : 'wait'}.`);
  return `Iteration ${it.t}: ${parts.join(' ')}`;
}

/** One iteration as steps: the scheduler's choice (level 3), then the iteration (level 2). */
function* iterate(s: S, settings: CbSettings, level: 1 | 2): Generator<CStep, { state: S; it: Iteration }> {
  const t = s.clock;
  const { state: admitted, joined } = admit(s, settings);
  const newBatch = settings.policy === 'static' && joined.length > 0;
  if (joined.length) {
    yield {
      state: admitted,
      marks: [
        ...joined.flatMap(([n, i]) => [...rowMarks(n, 'new'), mark(`slot-${i}`, 'new')]),
        mark(`now`, 'active'),
      ],
      say: newBatch
        ? `Time ${t}: every slot is free, so a new batch starts with ${list(joined.map(([n]) => n))}, first come first served.`
        : `Time ${t}: ${list(joined.map(([n, i]) => `${n} takes slot ${i + 1}`))}, first come first served.`,
      lines: newBatch ? ['t-free', 't-batch'] : ['t-fill'],
      level: 3,
      vars: vars(admitted),
    };
  }
  const r = runIteration(admitted, settings);
  const it: Iteration = {
    t,
    joined,
    newBatch,
    ran: r.ran,
    ended: r.ended,
    returned: r.returned,
    idle: r.idle,
    waiting: r.waiting,
  };
  const lines = ['t-run'];
  if (r.ended.length) lines.push('t-end');
  if (settings.policy === 'static' && r.returned.length) lines.push('t-return');
  yield {
    state: r.state,
    marks: [
      ...admitted.slots.flatMap((who, i) => (who === null ? [] : [mark(`c-${t}-${i}`, 'active')])),
      ...r.returned.flatMap((n) => rowMarks(n, 'found')),
      ...(r.idle && r.waiting.length
        ? admitted.slots.flatMap((who, i) => (who === null ? [mark(`c-${t}-${i}`, 'error')] : []))
        : []),
    ],
    say: iterationSay(it, r.state, settings),
    lines,
    level,
    vars: vars(r.state),
  };
  return { state: r.state, it };
}

// ---------------------------------------------------------------------------------------------
// Operations

const addOp: Op = {
  label: 'Add',
  arity: 3,
  *run(s, args, { settings }) {
    const [a, p, n] = args.map(whole) as [number, number, number];
    const how = `Type three whole numbers: when it arrives, its prompt length (1 to ${MAX_PROMPT}) and how many tokens it writes (1 to ${MAX_OUT}), such as 0 5 3.`;
    if (![a, p, n].every(Number.isInteger)) {
      yield refuse(s, how);
      return s;
    }
    if (s.reqs.length >= MAX_REQS) {
      yield refuse(s, `This toy holds ${MAX_REQS} requests, A to F. Start again to try others.`);
      return s;
    }
    if (a < s.clock || a >= HORIZON) {
      yield refuse(
        s,
        a < s.clock
          ? `It is time ${s.clock} already: a new request arrives at ${s.clock} or later.`
          : `This chart runs to time ${HORIZON}: a request arrives at ${HORIZON - 1} at the latest.`,
      );
      return s;
    }
    if (p < 1 || p > MAX_PROMPT || n < 1 || n > MAX_OUT) {
      yield refuse(s, how);
      return s;
    }
    const name = NAMES[s.reqs.length]!;
    const state = (() => {
      const t = clone(s);
      t.reqs.push({ name, arrive: a, prompt: p, out: n, start: null, made: 0, last: null, done: null });
      return t;
    })();
    const end = finishTime(state, settings);
    if (end > HORIZON) {
      yield refuse(
        s,
        `With ${name} the requests would not all be done until time ${end}, and this chart ends at ${HORIZON}. Try a shorter request, more slots, or continuous batching.`,
      );
      return s;
    }
    yield {
      state,
      marks: rowMarks(name, 'new'),
      say: `Request ${name} arrives at time ${a} with a prompt of ${plural(p, 'token')} and will write ${plural(n, 'token')}.${a <= s.clock ? '' : ` Until then it is not in the queue.`} Press Next iteration or Run to the end.`,
      lines: ['a-sig'],
      level: 1,
      vars: vars(state),
    };
    return state;
  },
};

function nothingLeft(s: S): string | null {
  if (!s.reqs.length) return 'No requests yet. Type when one arrives, its prompt and its length, such as 0 5 3, and press Add.';
  if (!unfinished(s).length) return 'Every request is done. Add another to keep going.';
  return null;
}

const tickOp: Op = {
  label: 'Next iteration',
  arity: 0,
  *run(s, _args, { settings }) {
    const no = nothingLeft(s);
    if (no) {
      yield refuse(s, no);
      return s;
    }
    const { state } = yield* iterate(s, settings, 1);
    return state;
  },
};

const runOp: Op = {
  label: 'Run to the end',
  arity: 0,
  *run(s, _args, { settings }) {
    const no = nothingLeft(s);
    if (no) {
      yield refuse(s, no);
      return s;
    }
    let state = s;
    while (unfinished(state).length) ({ state } = yield* iterate(state, settings, 2));
    const waits = state.reqs.map((r) => `${r.name} ${wait(r)}`);
    yield {
      state,
      marks: state.reqs.flatMap((r) => [mark(`td-${r.name}-done`, 'found')]),
      say: `All done at time ${state.clock}. ${made(state)} tokens in ${plural(state.clock, 'iteration')}: ${throughput(state)} per iteration. ${plural(idleCells(state), 'slot-iteration')} idle, ${idleWaiting(state)} of them while a request waited. Waits: ${waits.join(', ')}.`,
      lines: ['r-ret'],
      level: 1,
      vars: vars(state),
    };
    return state;
  },
};

export const ops = { add: addOp, tick: tickOp, run: runOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({ id, indent, text, plain });

export function pseudocode(settings: CbSettings): PseudoBlock[] {
  const fill =
    settings.policy === 'continuous'
      ? [
          L(
            't-fill',
            1,
            'for each free slot: take the next waiting request',
            'Every free slot takes the next request in line.',
          ),
        ]
      : [
          L('t-free', 1, 'if every slot is free:', 'Only when the whole batch is done,'),
          L(
            't-batch',
            2,
            'batch = the next waiting requests, one per slot',
            'start a new batch with the next requests in line.',
          ),
        ];
  const end =
    settings.policy === 'continuous'
      ? [
          L(
            't-end',
            1,
            'for each request whose last token is out: return it; free its slot',
            'A request that is done returns at once and frees its slot.',
          ),
        ]
      : [
          L(
            't-end',
            1,
            'for each request whose last token is out: its slot idles',
            'A request that is done leaves its slot idle,',
          ),
          L(
            't-return',
            1,
            'if every request in the batch is done: return them all',
            'and the batch returns together when its longest is done.',
          ),
        ];
  const body = [
    ...fill,
    L(
      't-run',
      1,
      'for each request in a slot: prefill its prompt (first time) or decode one token',
      'each request reads its prompt (the first time) or writes one more token.',
    ),
    ...end,
  ];
  const deeper = body.map((l) => ({ ...l, indent: l.indent + 1 }));
  return [
    {
      op: 'add',
      lines: [
        L('a-sig', 0, 'ADD(arrival, prompt, length)', 'A request joins the line when it arrives.'),
      ],
    },
    {
      op: 'tick',
      lines: [L('t-sig', 0, 'ITERATION(t)', 'One step of the model for everyone in a slot:'), ...body],
    },
    {
      op: 'run',
      lines: [
        L('r-sig', 0, 'RUN()', 'Run the model'),
        L('r-loop', 1, 'for t = now, now + 1, ...:', 'one iteration after another:'),
        ...deeper,
        L('r-ret', 1, 'until every request is done', 'until no request is left.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(_s: S, settings: CbSettings): string {
  return `${plural(settings.slots, 'slot')}, ${settings.policy === 'continuous' ? 'continuous batching: a free slot is filled at the next iteration' : 'static batching: a batch runs until its longest request is done'}. Add requests (when each arrives, its prompt, how many tokens it writes), then press Next iteration or Run to the end.`;
}

export const initialVars = (s: S) => vars(s);

export function describe(s: S, settings: CbSettings): string {
  if (!s.reqs.length) return `${plural(settings.slots, 'slot')}, no requests yet.`;
  const reqs = s.reqs
    .map(
      (r) =>
        `${r.name} arrives ${r.arrive}, writes ${r.out}${r.start === null ? '' : `, starts ${r.start}`}${r.done === null ? '' : `, done ${r.done}`}`,
    )
    .join('; ');
  const now = s.slots.map((w, i) => `slot ${i + 1} ${w ?? 'free'}`).join(', ');
  return `Time ${s.clock}, ${settings.policy} batching. ${now}. ${reqs}.`;
}
