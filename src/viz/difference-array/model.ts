/**
 * Difference array: many range additions "add x to A[l..r]" on an array, applied as a batch.
 *
 * - The naive approach adds x to every cell from l to r, r − l + 1 writes per update.
 * - The pattern writes each update into a difference array D of n + 1 zeros: +x at D[l], where
 *   the change starts, and −x at D[r + 1], where it stops. Two writes per update, whatever its
 *   length. Then one pass of running sums: run = D[0] + … + D[i] is the total change at i, so
 *   A[i] = A[i] + run. D has a spare cell, D[n], so an update that ends at the last value needs
 *   no special case.
 *
 * Updates are queued with `add` (approach-neutral: nothing is computed yet) and run with `apply`,
 * which uses the approach the settings ask for and clears the queue. The prefix sums of
 * /prefix-sum-hashmap/ and /range-queries/ turn values into running totals; D runs the other
 * way: its running sums are the changes.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a write is one cell of A or D changed by an
 * update; a sum is one step of the final pass (run += D[i], A[i] += run). Adding to every cell
 * takes Σ(r − l + 1) writes; the difference array takes 2q writes and n sums, so it wins only
 * when the updates are many or long. A batch of short updates on a long array is cheaper the
 * naive way, and the page says so.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import { fmt, parseIntsOrInt, plural, plus, readInt, readInts, span } from '../_arr1/kit';

export { fmt, plural };

export const MAX_N = 12;
export const MIN_VALUE = -99;
export const MAX_VALUE = 99;
/** The most updates queued at once, so every chip stays readable. */
export const MAX_UPDATES = 8;

export interface Update {
  l: number;
  r: number;
  x: number;
}

export interface DSettings {
  [key: string]: Scalar;
  approach: Approach;
}

export const defaults: DSettings = { approach: 'pattern' };

export interface DState {
  a: number[];
  /** Updates waiting for `apply`, in order. */
  updates: Update[];
}

/** The page starts with eight zeros and four updates waiting. */
export const START: DState = {
  a: [0, 0, 0, 0, 0, 0, 0, 0],
  updates: [
    { l: 1, r: 6, x: 2 },
    { l: 0, r: 4, x: 3 },
    { l: 3, r: 7, x: -1 },
    { l: 5, r: 7, x: 4 },
  ],
};

export interface DExtra {
  /** The batch being applied. */
  batch: Update[];
  /** Updates finished so far (added to every cell, or written into D). */
  done: number;
  /** The update being applied, by index into batch. */
  cur?: number;
  /** The pattern: the difference array, n + 1 cells. */
  d?: number[];
  /** The pattern's final pass: run[i] = D[0] + … + D[i] once reached. */
  run?: (number | null)[];
}

export type DStep = Step<DState, DExtra>;
type Op = OpSpec<DState, DSettings, DExtra>;

export const init = (): DState => ({ a: [...START.a], updates: START.updates.map((u) => ({ ...u })) });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Text -----

/** "A[1..6] += 2", "A[3..7] −= 1". */
export const updateText = (u: Update): string =>
  `${span(u.l, u.r)} ${u.x < 0 ? '−=' : '+='} ${Math.abs(u.x)}`;

/** "+2", "−1". */
const signed = (x: number) => (x < 0 ? `−${-x}` : `+${x}`);

const len = (u: Update) => u.r - u.l + 1;

// ----- Input -----

const LIMITS = { max: MAX_N, lo: MIN_VALUE, hi: MAX_VALUE, example: '5 3 8 1' };

/** For the input box: a list of values to load, or one whole number (l, r or x). */
export const parseInput = parseIntsOrInt(LIMITS, { lo: MIN_VALUE, hi: MAX_VALUE });

export const readValues = (arg: Value | undefined): number[] | string => readInts(arg, LIMITS);

/** An update for an array of n values, or why it cannot be read. */
export function readUpdate(n: number, args: Value[]): Update | string {
  const l = readInt(args[0], 0, n - 1, 'l');
  if (typeof l === 'string') return l;
  const r = readInt(args[1], 0, n - 1, 'r');
  if (typeof r === 'string') return r;
  if (r < l) return `r must be at least l: ${r} is less than ${l}.`;
  const x = readInt(args[2], MIN_VALUE, MAX_VALUE, 'x');
  if (typeof x === 'string') return x;
  return { l, r, x };
}

// ----- What a batch does -----

/** A after a batch, computed straight. */
export function applied(a: readonly number[], batch: readonly Update[]): number[] {
  const out = [...a];
  for (const u of batch) for (let i = u.l; i <= u.r; i++) out[i]! += u.x;
  return out;
}

/** The difference array of a batch on n values: n + 1 cells. */
export function differences(n: number, batch: readonly Update[]): number[] {
  const d = Array(n + 1).fill(0);
  for (const u of batch) {
    d[u.l] += u.x;
    d[u.r + 1] -= u.x;
  }
  return d;
}

/** What each approach costs: Σ(r − l + 1) writes against 2q writes and n sums. */
export const totals = (n: number, batch: readonly Update[]): Totals => ({
  naive: batch.reduce((t, u) => t + len(u), 0),
  pattern: 2 * batch.length + n,
});

// ----- Steps -----

function refuse(s: DState, why: string, id = 'a-name'): DStep {
  return {
    state: s,
    marks: [mark(id, 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.a.length, queued: s.updates.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const vs = readValues(arg);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} The array stays as it was.`);
      return s;
    }
    const next: DState = { a: vs, updates: [] };
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(vs.length, 'value')} into A: ${vs.map(fmt).join(', ')}. No updates are queued: add some with Add update, as l r x.`,
      lines: [],
      level: 1,
      vars: { n: vs.length, queued: 0 },
    };
    return next;
  },
};

const add: Op = {
  label: 'Add update',
  arity: 3,
  *run(s, args) {
    const n = s.a.length;
    if (s.updates.length >= MAX_UPDATES) {
      yield refuse(
        s,
        `${MAX_UPDATES} updates are queued already, the most this page draws. Press Apply updates first.`,
      );
      return s;
    }
    const u = readUpdate(n, args);
    if (typeof u === 'string') {
      yield refuse(s, `${u} A has ${plural(n, 'value')}, A[0] to A[${n - 1}].`);
      return s;
    }
    const next: DState = { a: s.a, updates: [...s.updates, u] };
    yield {
      state: next,
      marks: [mark(`u-${s.updates.length}`, 'new')],
      say: `Queued update ${next.updates.length}: ${updateText(u)}, adding ${fmt(u.x)} to ${plural(len(u), 'value')}. Add more, or press Apply updates to run ${next.updates.length === 1 ? 'it' : `all ${next.updates.length}`}.`,
      lines: ['queue'],
      level: 1,
      vars: { n, queued: next.updates.length },
    };
    return next;
  },
};

function done(a: readonly number[], q: number): string {
  return `Done: after ${plural(q, 'update')}, A = ${a.map(fmt).join(', ')}.`;
}

/** Adding to every cell. */
function* naive(s: DState): Generator<DStep, DState, void> {
  const batch = s.updates;
  const n = s.a.length;
  const tot = totals(n, batch);
  const work = new Work(['writes', 'sums']);
  const a = [...s.a];
  let k = 0;
  let i = 0;
  const vars = (): Record<string, Scalar> => ({ update: k + 1, i, ...workVars(work, tot) });
  const extra = (cur?: number): DExtra => ({ batch, done: k, ...(cur === undefined ? {} : { cur }) });

  yield {
    state: s,
    marks: [],
    say: `Apply ${plural(batch.length, 'update')} by adding x to every cell from l to r: ${plural(tot.naive, 'write')} in all, one per cell covered.`,
    lines: ['sig'],
    level: 2,
    vars: { update: 0, i: 0, ...workVars(work, tot) },
    extra: extra(),
  };

  for (k = 0; k < batch.length; k++) {
    const u = batch[k]!;
    for (i = u.l; i <= u.r; i++) {
      const was = a[i]!;
      a[i] = was + u.x;
      work.add('writes');
      const first = i === u.l;
      const last = i === u.r;
      yield {
        state: { a: [...a], updates: batch },
        marks: [mark(`a-${i}`, 'new'), mark(`u-${k}`, 'active'), mark('br-cur', 'active')],
        say: `${first ? `Update ${k + 1}, ${updateText(u)}: ` : ''}A[${i}] = ${plus(was, u.x)} = ${fmt(a[i]!)}.${
          last ? ` That was the last cell of update ${k + 1}: ${plural(len(u), 'write')}.` : ''
        }`,
        lines: ['loop', 'inner', 'write'],
        level: 2,
        vars: vars(),
        extra: extra(k),
      };
    }
  }

  const end: DState = { a, updates: [] };
  yield {
    state: end,
    marks: [],
    say: `${done(a, batch.length)} Adding to every cell took ${work.tally()}; a difference array takes ${plural(2 * batch.length, 'write')} and ${plural(n, 'sum')}.`,
    lines: [],
    level: 1,
    vars: { update: batch.length, i: n - 1, ...workVars(work, tot) },
    extra: { batch, done: batch.length },
  };
  return end;
}

/** The difference array: two writes per update, then one pass of running sums. */
function* pattern(s: DState): Generator<DStep, DState, void> {
  const batch = s.updates;
  const n = s.a.length;
  const tot = totals(n, batch);
  const work = new Work(['writes', 'sums']);
  const a = [...s.a];
  const d: number[] = Array(n + 1).fill(0);
  const run: (number | null)[] = Array(n).fill(null);
  let k = 0;
  let r = 0;
  const extra = (cur?: number, withRun = false): DExtra => ({
    batch,
    done: k,
    ...(cur === undefined ? {} : { cur }),
    d: [...d],
    ...(withRun ? { run: [...run] } : {}),
  });
  const vars = (i: number): Record<string, Scalar> => ({ i, run: r, ...workVars(work, tot) });

  yield {
    state: s,
    marks: [mark('d-name', 'new')],
    say: `Apply ${plural(batch.length, 'update')} with a difference array: D starts as ${n + 1} zeros, one more than A has values. Each update writes two cells of D, then one pass of running sums adds every change to A.`,
    lines: ['sig', 'init'],
    level: 2,
    vars: vars(0),
    extra: extra(),
  };

  for (k = 0; k < batch.length; k++) {
    const u = batch[k]!;
    d[u.l]! += u.x;
    work.add('writes');
    yield {
      state: s,
      marks: [mark(`d-${u.l}`, 'new'), mark(`u-${k}`, 'active'), mark('br-cur', 'active')],
      say: `Update ${k + 1}, ${updateText(u)}: D[${u.l}] ${u.x < 0 ? '−=' : '+='} ${Math.abs(u.x)}, now ${fmt(d[u.l]!)}. From A[${u.l}] on, everything changes by ${signed(u.x)}.`,
      lines: ['loop', 'start'],
      level: 2,
      vars: vars(0),
      extra: extra(k),
    };
    d[u.r + 1]! -= u.x;
    work.add('writes');
    const spare = u.r + 1 === n;
    yield {
      state: s,
      marks: [mark(`d-${u.r + 1}`, 'new'), mark(`u-${k}`, 'active'), mark('br-cur', 'active')],
      say: `D[${u.r + 1}] ${u.x < 0 ? '+=' : '−='} ${Math.abs(u.x)}, now ${fmt(d[u.r + 1]!)}${
        spare
          ? `, in the spare cell past the end: the update runs to the last value, so nothing needs to stop. No value of A reads D[${n}], but writing there saves a special case.`
          : `: from A[${u.r + 1}] on, the ${signed(u.x)} stops.`
      } Two writes, though the update covers ${plural(len(u), 'value')}.`,
      lines: ['stop'],
      level: 2,
      vars: vars(0),
      extra: extra(k),
    };
  }

  for (let i = 0; i < n; i++) {
    const was = r;
    r += d[i]!;
    run[i] = r;
    const before = a[i]!;
    a[i] = before + r;
    work.add('sums');
    yield {
      state: { a: [...a], updates: batch },
      marks: [mark(`d-${i}`, 'active'), mark(`run-${i}`, 'new'), mark(`a-${i}`, 'new')],
      say: `${i === 0 ? 'One pass of running sums. ' : ''}run = ${plus(was, d[i]!)} = ${fmt(r)}, the total change at A[${i}]. A[${i}] = ${plus(before, r)} = ${fmt(a[i]!)}.`,
      lines: [...(i === 0 ? ['zero'] : []), 'pass', 'run', 'write'],
      level: 2,
      vars: vars(i),
      extra: extra(undefined, true),
    };
  }

  const end: DState = { a, updates: [] };
  yield {
    state: end,
    marks: [],
    say: `${done(a, batch.length)} The difference array took ${work.tally()}; adding to every cell takes ${plural(tot.naive, 'write')}.${
      tot.pattern > tot.naive
        ? ' On this batch, adding to every cell is cheaper: the updates are too few or too short to pay for the pass.'
        : tot.pattern === tot.naive
          ? ' On this batch the two cost the same.'
          : ''
    }`,
    lines: [],
    level: 1,
    vars: vars(n - 1),
    extra: { ...extra(undefined, true), done: batch.length },
  };
  return end;
}

const apply: Op = {
  label: 'Apply updates',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.updates.length === 0) {
      yield refuse(s, 'No updates are queued. Add one with Add update, as l r x, such as 1 4 3.');
      return s;
    }
    return approachOf(settings) === 'naive' ? yield* naive(s) : yield* pattern(s);
  },
};

export const ops: Record<string, Op> = { apply, add, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: DSettings): PseudoBlock[] {
  const lines =
    approachOf(settings) === 'naive'
      ? [
          L(
            'sig',
            0,
            'applyAll(A, updates)   // add to every cell',
            'To apply every update to A, one cell at a time:',
          ),
          L('loop', 1, 'for each (l, r, x) in updates', 'for each update,'),
          L('inner', 2, 'for i = l to r', 'go through every cell it covers'),
          L('write', 3, 'A[i] = A[i] + x', 'and add x to it.'),
        ]
      : [
          L(
            'sig',
            0,
            'applyAll(A, updates)   // difference array',
            'To apply every update to A with a difference array:',
          ),
          L('init', 1, 'D = n + 1 zeros', 'Start D with one zero per value, and one spare.'),
          L('loop', 1, 'for each (l, r, x) in updates', 'For each update,'),
          L('start', 2, 'D[l] = D[l] + x', 'note that the change starts at l,'),
          L('stop', 2, 'D[r + 1] = D[r + 1] − x', 'and stops after r.'),
          L('zero', 1, 'run = 0', 'Then, with a running sum from 0,'),
          L('pass', 1, 'for i = 0 to n − 1', 'go through A once:'),
          L('run', 2, 'run = run + D[i]', 'the running sum of D is the total change at i,'),
          L('write', 2, 'A[i] = A[i] + run', 'so add it to A[i].'),
        ];
  return [
    { op: 'apply', lines },
    { op: 'add', lines: [L('queue', 0, 'updates.append((l, r, x))', 'Queue the update for later.')] },
  ];
}

// ----- Start -----

export function describe(s: DState): string {
  const q = s.updates.length;
  return `A holds ${plural(s.a.length, 'value')}: ${s.a.map(fmt).join(', ')}. ${
    q ? `${plural(q, 'update')} queued: ${s.updates.map(updateText).join(', ')}.` : 'No updates queued.'
  }`;
}

export function initialSay(s: DState): string {
  return `A holds ${plural(s.a.length, 'zero')}, and ${plural(s.updates.length, 'update')} wait: each adds x to every value from A[l] to A[r]. Press Apply updates. Add your own as l r x with Add update, or type values and press Load.`;
}

export const initialVars = (s: DState) => ({ n: s.a.length, queued: s.updates.length });
