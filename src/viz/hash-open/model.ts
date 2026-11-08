import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  fmtAlpha,
  loadFactor,
  MAX_KEY,
  primeBelow,
  readNumber,
  shuffle,
} from '../_hashing/hashing';

/** A slot's content. `del` marks a tombstone: a key was deleted here. */
export interface Cell {
  uid: number;
  key: number;
  del?: boolean;
}

export interface OpenState {
  m: number;
  slots: (Cell | null)[];
  nextUid: number;
}

export type Probing = 'linear' | 'quadratic' | 'triangular' | 'double';

export interface OpenSettings {
  [key: string]: Scalar;
  m: number;
  probe: Probing;
  /** Double hashing's step: 1 + (k mod (m − 1)) as in CLRS, or R − (k mod R) for a prime R < m. */
  h2: 'clrs' | 'prime';
}

export interface OpenExtra {
  /** The key being worked on, in a box at the top left. `uid` when it will be stored. */
  arg?: { text: string; uid?: number; error?: boolean };
  /** The current probe computation, drawn next to the key. */
  formula?: string;
  /** Probe numbers i by slot, for the slots probed so far in this operation. */
  probed?: Record<number, number[]>;
  /** The first tombstone passed by insert, which it will reuse. */
  reuse?: number;
}

type S = OpenState;
type X = OpenExtra;
type Op = OpSpec<S, OpenSettings, X>;
type OpenStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: OpenSettings = { m: 11, probe: 'linear', h2: 'clrs' };

export function init(settings: OpenSettings): S {
  return { m: settings.m, slots: Array(settings.m).fill(null), nextUid: 1 };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (j: number) => `cell-${j}`;

export const liveCount = (s: S) => s.slots.filter((c) => c && !c.del).length;
export const delCount = (s: S) => s.slots.filter((c) => c?.del).length;

function readouts(s: S): Record<string, Scalar> {
  const n = liveCount(s);
  return { n, m: s.m, α: loadFactor(n, s.m), deleted: delCount(s) };
}

export function summary(s: S): string {
  const n = liveCount(s);
  const d = delCount(s);
  return `n = ${n}, ${fmtAlpha(n, s.m)}${d ? `, ${d} ${d === 1 ? 'tombstone' : 'tombstones'}` : ''}.`;
}

// ---------------------------------------------------------------------------------------------
// Probe sequences

export interface ProbeSeq {
  /** h(k) = k mod m, where probing starts. */
  home: number;
  /** Double hashing's step h2(k); null for the other methods. */
  step: number | null;
  /** Slot of probe i. */
  at(i: number): number;
  /** "j = (9 + 2²) mod 11 = 2" for probe i. */
  say(i: number): string;
  /** "h(42, 2) = (9 + 2²) mod 11 = 2", for the drawing. */
  short(i: number): string;
  /** How the first step introduces the hash, e.g. "h(42) = 42 mod 11 = 9". */
  intro: string;
}

export function secondHash(k: number, m: number, kind: OpenSettings['h2']) {
  if (kind === 'prime') {
    const R = primeBelow(m);
    const v = R - (k % R);
    return { value: v, say: `h2(${k}) = ${R} − (${k} mod ${R}) = ${v}` };
  }
  const d = Math.max(1, m - 1);
  const v = 1 + (k % d);
  return { value: v, say: `h2(${k}) = 1 + (${k} mod ${d}) = ${v}` };
}

export function probeSeq(k: number, m: number, settings: OpenSettings): ProbeSeq {
  const home = k % m;
  const intro = `h(${k}) = ${k} mod ${m} = ${home}`;
  const mod = (x: number) => ((x % m) + m) % m;
  switch (settings.probe) {
    case 'quadratic':
      return {
        home,
        step: null,
        intro,
        at: (i) => mod(home + i * i),
        say: (i) => `j = (${home} + ${i}²) mod ${m} = ${mod(home + i * i)}`,
        short: (i) => `h(${k}, ${i}) = (${home} + ${i}²) mod ${m} = ${mod(home + i * i)}`,
      };
    case 'triangular': {
      const t = (i: number) => (i * (i + 1)) / 2;
      return {
        home,
        step: null,
        intro,
        at: (i) => mod(home + t(i)),
        say: (i) =>
          `j = (${home} + ${i}·${i + 1}/2) mod ${m} = (${home} + ${t(i)}) mod ${m} = ${mod(home + t(i))}`,
        short: (i) => `h(${k}, ${i}) = (${home} + ${t(i)}) mod ${m} = ${mod(home + t(i))}`,
      };
    }
    case 'double': {
      const h2 = secondHash(k, m, settings.h2);
      return {
        home,
        step: h2.value,
        intro: `${intro}, and the step is ${h2.say}`,
        at: (i) => mod(home + i * h2.value),
        say: (i) => `j = (${home} + ${i}·${h2.value}) mod ${m} = ${mod(home + i * h2.value)}`,
        short: (i) =>
          `h(${k}, ${i}) = (${home} + ${i}·${h2.value}) mod ${m} = ${mod(home + i * h2.value)}`,
      };
    }
    default:
      return {
        home,
        step: null,
        intro,
        at: (i) => mod(home + i),
        say: (i) => `j = (${home} + ${i}) mod ${m} = ${mod(home + i)}`,
        short: (i) => `h(${k}, ${i}) = (${home} + ${i}) mod ${m} = ${mod(home + i)}`,
      };
  }
}

/** The distinct slots probe numbers 0..m-1 reach, in order. */
export function reachable(seq: ProbeSeq, m: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < m; i++) {
    const j = seq.at(i);
    if (!out.includes(j)) out.push(j);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Steps

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(
  c: Ctx,
  say: string,
  lines: string[],
  level: Level,
  marks: Mark[],
  more: Partial<X> = {},
): OpenStep {
  const extra: X = { ...c.extra, ...more };
  if (extra.probed)
    extra.probed = Object.fromEntries(Object.entries(extra.probed).map(([j, is]) => [j, [...is]]));
  return { state: c.s, marks, say, lines, vars: { ...c.vars, ...readouts(c.s) }, level, extra };
}

function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The table is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Describe what a probe found, for narration. */
function content(cell: Cell | null): string {
  if (!cell) return 'empty';
  return cell.del ? 'DEL, a tombstone' : `taken by ${cell.key}`;
}

function setSlot(s: S, j: number, cell: Cell | null, nextUid = s.nextUid): S {
  const slots = s.slots.map((x, i) => (i === j ? cell : x));
  return { m: s.m, slots, nextUid };
}

/** Narration for an insert that found no slot. */
function failure(seq: ProbeSeq, s: S, settings: OpenSettings, k: number): string {
  const reach = reachable(seq, s.m);
  const free = s.slots.map((c, j) => (c === null ? j : -1)).filter((j) => j >= 0);
  if (free.length === 0)
    return `Every slot holds a key, so there is no room for ${k}: the table is full. Open addressing can never hold more than m keys.`;
  const missed = free.filter((j) => !reach.includes(j));
  const list = (xs: number[]) => xs.join(', ');
  const why =
    settings.probe === 'double'
      ? `Its step ${seq.step} and m = ${s.m} share a factor, so the sequence cycles through only ${reach.length} of the ${s.m} slots.`
      : `Probing with ${settings.probe === 'quadratic' ? 'i²' : 'i(i+1)/2'} reaches only ${reach.length} of the ${s.m} slots from slot ${seq.home}.`;
  return `All ${s.m} probes are used up and ${k} is not stored, although ${plural(free.length, 'slot is', 'slots are')} still empty (${list(missed)}). ${why} The probe sequence visited ${list(reach)} and never reaches the empty ones.`;
}

// ---------------------------------------------------------------------------------------------
// insert

function* insertKey(s: S, raw: Value, settings: OpenSettings): Generator<OpenStep, S, void> {
  const k = readNumber(raw);
  if (k instanceof Error) return yield* badArg(s, 'insert', raw, k, 'ins.sig');
  const m = s.m;
  const seq = probeSeq(k, m, settings);
  const uid = s.nextUid;
  const probed: Record<number, number[]> = {};
  const c: Ctx = { s, extra: { arg: { text: String(k), uid }, probed }, vars: { k } };
  let reuse: number | null = null;
  const h2 = settings.probe === 'double' ? ['h2'] : [];

  yield step(
    c,
    `insert(${k}): ${seq.intro}. Probe the slots h(${k}, 0), h(${k}, 1), … until one is empty, checking that ${k} is not already there.`,
    [...h2, 'ins.sig', 'ins.init'],
    2,
    [],
  );

  for (let i = 0; i < m; i++) {
    const j = seq.at(i);
    const again = (probed[j] ?? []).length > 0;
    (probed[j] ??= []).push(i);
    c.vars.i = i;
    c.vars.j = j;
    c.vars.probes = i + 1;
    c.extra.formula = seq.short(i);
    const cell = s.slots[j] ?? null;
    const head = `Probe ${i}: ${seq.say(i)}.`;
    if (cell === null) {
      const at = reuse ?? j;
      c.s = setSlot(s, at, { uid, key: k }, uid + 1);
      c.extra.arg = undefined;
      c.extra.reuse = undefined;
      c.vars.j = at;
      const lines =
        reuse === null
          ? ['ins.loop', 'ins.probe', 'ins.empty', 'ins.store']
          : ['ins.loop', 'ins.probe', 'ins.empty', 'ins.reuse', 'ins.store'];
      yield step(
        c,
        reuse === null
          ? `${head} T[${j}] is empty, so ${k} goes here after ${plural(i + 1, 'probe')}. ${summary(c.s)}`
          : `${head} T[${j}] is empty, so ${k} is not in the table. Reuse the first tombstone passed, slot ${reuse}: ${k} goes there after ${plural(i + 1, 'probe')}. ${summary(c.s)}`,
        lines,
        1,
        [mark(cellId(at), 'new'), mark(`v${uid}`, 'done')],
      );
      return c.s;
    }
    if (cell.del) {
      const first = reuse === null;
      if (first) reuse = j;
      c.extra.reuse = reuse ?? undefined;
      yield step(
        c,
        first
          ? `${head} T[${j}] is DEL, a tombstone. Remember it, in case ${k} turns out to be new, and keep probing: ${k} could be further along.`
          : `${head} T[${j}] is another tombstone; slot ${reuse} is already remembered. Keep probing.`,
        first
          ? ['ins.loop', 'ins.probe', 'ins.empty', 'ins.del', 'ins.mark']
          : ['ins.loop', 'ins.probe', 'ins.empty', 'ins.del'],
        again ? 3 : 2,
        [mark(cellId(j), 'compare')],
      );
      continue;
    }
    if (cell.key === k) {
      c.extra.arg = { text: String(k) };
      yield step(
        c,
        `${head} T[${j}] holds ${k} already, so nothing changes.`,
        ['ins.loop', 'ins.probe', 'ins.empty', 'ins.del', 'ins.eq', 'ins.dup'],
        1,
        [mark(cellId(j), 'found')],
      );
      return s;
    }
    yield step(
      c,
      again
        ? `${head} Slot ${j} again: this probe sequence is going round the same slots.`
        : `${head} T[${j}] is ${content(cell)}, so keep probing.`,
      ['ins.loop', 'ins.probe', 'ins.empty', 'ins.del', 'ins.eq'],
      again ? 3 : 2,
      [mark(cellId(j), 'compare')],
    );
  }

  if (reuse !== null) {
    c.s = setSlot(s, reuse, { uid, key: k }, uid + 1);
    c.extra.arg = undefined;
    c.extra.reuse = undefined;
    c.vars.j = reuse;
    yield step(
      c,
      `All ${m} probes are used up without an empty slot, so ${k} is not in the table. It goes in the first tombstone passed, slot ${reuse}. ${summary(c.s)}`,
      ['ins.after', 'ins.reuseEnd'],
      1,
      [mark(cellId(reuse), 'new'), mark(`v${uid}`, 'done')],
    );
    return c.s;
  }
  c.extra.arg = { text: String(k), error: true };
  c.extra.formula = undefined;
  yield step(c, failure(seq, s, settings, k), ['ins.after', 'ins.full'], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    return yield* insertKey(s, raw!, settings);
  },
};

// ---------------------------------------------------------------------------------------------
// search and delete share the probing loop

function* find(
  s: S,
  raw: Value,
  settings: OpenSettings,
  op: 'search' | 'delete',
): Generator<OpenStep, S, void> {
  const pre = op === 'search' ? 'srch' : 'del';
  const k = readNumber(raw);
  if (k instanceof Error) return yield* badArg(s, op, raw, k, `${pre}.sig`);
  const m = s.m;
  const seq = probeSeq(k, m, settings);
  const probed: Record<number, number[]> = {};
  const c: Ctx = { s, extra: { arg: { text: String(k) }, probed }, vars: { k } };
  yield step(
    c,
    `${op}(${k}): ${seq.intro}. Probe the same sequence insert would have used, until ${k} turns up or an empty slot proves it is not there.`,
    [...(settings.probe === 'double' ? ['h2'] : []), `${pre}.sig`],
    2,
    [],
  );
  for (let i = 0; i < m; i++) {
    const j = seq.at(i);
    const again = (probed[j] ?? []).length > 0;
    (probed[j] ??= []).push(i);
    c.vars.i = i;
    c.vars.j = j;
    c.vars.probes = i + 1;
    c.extra.formula = seq.short(i);
    const cell = s.slots[j] ?? null;
    const head = `Probe ${i}: ${seq.say(i)}.`;
    if (cell === null) {
      if (op === 'search') c.vars.found = false;
      yield step(
        c,
        `${head} T[${j}] is empty. If ${k} were in the table, insert would have put it here or earlier, so ${k} is not there. ${plural(i + 1, 'probe')}.`,
        [`${pre}.loop`, `${pre}.probe`, `${pre}.empty`, `${pre}.miss`],
        1,
        [mark(cellId(j), 'compare')],
      );
      return s;
    }
    if (!cell.del && cell.key === k) {
      if (op === 'search') {
        c.vars.found = true;
        yield step(
          c,
          `${head} T[${j}] holds ${k}: found it after ${plural(i + 1, 'probe')}.`,
          ['srch.loop', 'srch.probe', 'srch.empty', 'srch.eq', 'srch.found'],
          1,
          [mark(cellId(j), 'found')],
        );
        return s;
      }
      yield step(
        c,
        `${head} T[${j}] holds ${k}: found it.`,
        ['del.loop', 'del.probe', 'del.empty', 'del.eq'],
        2,
        [mark(cellId(j), 'found')],
      );
      c.s = setSlot(s, j, { ...cell, del: true });
      c.extra.arg = undefined;
      yield step(
        c,
        `T[${j}] = DEL. Making the slot empty would break the probe sequences of keys stored after it, so it keeps a tombstone: search skips it, and insert may reuse it. ${summary(c.s)}`,
        ['del.eq', 'del.mark'],
        1,
        [mark(cellId(j), 'remove')],
      );
      return c.s;
    }
    yield step(
      c,
      cell.del
        ? `${head} T[${j}] is DEL, a tombstone. A deleted key used to be here, so ${k} could be further along: keep probing.`
        : again
          ? `${head} Slot ${j} again: the probe sequence is going round the same slots.`
          : `${head} T[${j}] holds ${cell.key}, not ${k}: keep probing.`,
      [`${pre}.loop`, `${pre}.probe`, `${pre}.empty`, `${pre}.eq`],
      again ? 3 : 2,
      [mark(cellId(j), 'compare')],
    );
  }
  if (op === 'search') c.vars.found = false;
  c.extra.formula = undefined;
  yield step(
    c,
    `All ${m} probes are used up without finding ${k} or an empty slot, so ${k} is not in the table.`,
    [`${pre}.end`],
    1,
    [],
  );
  return s;
}

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw], { settings }) {
    return yield* find(s, raw!, settings, 'search');
  },
};

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    return yield* find(s, raw!, settings, 'delete');
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { m: s.m, slots: Array(s.m).fill(null), nextUid: s.nextUid };
    const c: Ctx = { s: empty, extra: {}, vars: {} };
    yield step(
      c,
      liveCount(s) || delCount(s)
        ? 'clear(): every slot becomes empty, tombstones included.'
        : 'clear(): every slot is already empty.',
      ['clr.loop', 'clr.set'],
      1,
      [],
    );
    return empty;
  },
};

// ---------------------------------------------------------------------------------------------
// The "All colliding keys" preset: keys that share a home slot for the current m

export function collidingKeys(rng: Rng, m: number, count: number): number[] {
  const home = rng.int(0, m - 1);
  const pool: number[] = [];
  for (let k = home; k <= MAX_KEY; k += m) if (k > 0) pool.push(k);
  return shuffle(rng.next, pool).slice(0, Math.min(count, m));
}

/** The preset used to run as this one operation; it stays so links saved with it still open. */
const fill: Op = {
  label: 'Fill',
  arity: 2,
  *run(s, [, count], { settings, rng }) {
    const n = Math.max(1, Math.min(31, Math.round(Number(count) || 0)));
    const keys = collidingKeys(rng, s.m, n);
    const home = keys[0]! % s.m;
    const c: Ctx = { s, extra: {}, vars: {} };
    yield step(
      c,
      `Insert ${keys.length} keys that all start probing at slot ${home} (each leaves remainder ${home} when divided by ${s.m}): ${keys.join(', ')}.`,
      [],
      1,
      [],
    );
    let state = s;
    for (const k of keys) state = yield* insertKey(state, k, settings);
    return state;
  },
};

export const ops = { insert, search, delete: del, clear, fill };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

/** The probe formula as it appears in the pseudocode. */
export function formulaText(settings: OpenSettings): { text: string; plain: string } {
  switch (settings.probe) {
    case 'quadratic':
      return {
        text: 'j = (h(k) + i²) mod m',
        plain: 'slot j is i² places past the home slot h(k), wrapping around;',
      };
    case 'triangular':
      return {
        text: 'j = (h(k) + i(i+1)/2) mod m',
        plain: 'slot j is 1 + 2 + … + i places past the home slot h(k), wrapping around;',
      };
    case 'double':
      return {
        text: 'j = (h(k) + i·h2(k)) mod m',
        plain: 'slot j is i steps of size h2(k) past the home slot h(k), wrapping around;',
      };
    default:
      return {
        text: 'j = (h(k) + i) mod m',
        plain: 'slot j is i places past the home slot h(k), wrapping around;',
      };
  }
}

export function pseudocode(settings: OpenSettings): PseudoBlock[] {
  const f = formulaText(settings);
  const h2 =
    settings.probe === 'double'
      ? [
          settings.h2 === 'prime'
            ? L(
                'h2',
                0,
                'h2(k) = R − (k mod R)',
                'The step size comes from a second hash (R is a prime below m).',
              )
            : L(
                'h2',
                0,
                'h2(k) = 1 + (k mod (m − 1))',
                'The step size comes from a second hash, never 0.',
              ),
        ]
      : [];
  return [
    {
      op: 'insert',
      lines: [
        ...h2,
        L('ins.sig', 0, 'insert(k)', 'To insert k:'),
        L('ins.init', 1, 'd = nil', 'No tombstone seen yet.'),
        L('ins.loop', 1, 'for i = 0 to m − 1', 'For each probe i,'),
        L('ins.probe', 2, f.text, f.plain),
        L('ins.empty', 2, 'if T[j] == nil', 'if slot j is empty,'),
        L(
          'ins.reuse',
          3,
          'if d ≠ nil: j = d',
          'use the first tombstone instead, if there was one,',
        ),
        L('ins.store', 3, 'T[j] = k; return j', 'store k there and stop.'),
        L('ins.del', 2, 'if T[j] == DEL', 'If slot j holds a tombstone,'),
        L('ins.mark', 3, 'if d == nil: d = j', 'remember it if it is the first one.'),
        L('ins.eq', 2, 'else if T[j] == k', 'If slot j holds k,'),
        L('ins.dup', 3, 'return j', 'k is already there: stop.'),
        L('ins.after', 1, 'if d ≠ nil', 'Every probe is used up. If a tombstone was seen,'),
        L('ins.reuseEnd', 2, 'T[d] = k; return d', 'store k in the first one.'),
        L('ins.full', 1, 'error "no free slot"', 'Otherwise k cannot be stored.'),
      ],
    },
    {
      op: 'search',
      lines: [
        ...h2,
        L('srch.sig', 0, 'search(k)', 'To search for k:'),
        L('srch.loop', 1, 'for i = 0 to m − 1', 'For each probe i,'),
        L('srch.probe', 2, f.text, f.plain),
        L('srch.empty', 2, 'if T[j] == nil', 'if slot j is empty,'),
        L('srch.miss', 3, 'return nil', 'k is not in the table.'),
        L('srch.eq', 2, 'if T[j] == k', 'If slot j holds k (a tombstone never does),'),
        L('srch.found', 3, 'return j', 'found it.'),
        L('srch.end', 1, 'return nil', 'Every probe is used up: k is not there.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        ...h2,
        L('del.sig', 0, 'delete(k)', 'To delete k:'),
        L('del.loop', 1, 'for i = 0 to m − 1', 'For each probe i,'),
        L('del.probe', 2, f.text, f.plain),
        L('del.empty', 2, 'if T[j] == nil', 'if slot j is empty,'),
        L('del.miss', 3, 'return', 'k is not there: stop.'),
        L('del.eq', 2, 'if T[j] == k', 'If slot j holds k,'),
        L('del.mark', 3, 'T[j] = DEL; return', 'leave a tombstone there and stop.'),
        L('del.end', 1, 'return', 'Every probe is used up: k is not there.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To clear the table:'),
        L('clr.loop', 1, 'for j = 0 to m − 1', 'For every slot,'),
        L('clr.set', 2, 'T[j] = nil', 'make it empty.'),
      ],
    },
  ];
}

const METHOD: Record<Probing, string> = {
  linear: 'linear probing, h(k, i) = (h(k) + i) mod m',
  quadratic: 'quadratic probing, h(k, i) = (h(k) + i²) mod m',
  triangular: 'quadratic probing with triangular numbers, h(k, i) = (h(k) + i(i+1)/2) mod m',
  double: 'double hashing, h(k, i) = (h(k) + i·h2(k)) mod m',
};

export function initialSay(state: S, settings: OpenSettings): string {
  return `An empty table with m = ${state.m} slots. Every key lives in a slot of its own, found by ${METHOD[settings.probe]}, with h(k) = k mod ${state.m}.`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  const n = liveCount(state);
  if (n === 0 && delCount(state) === 0) return `Empty table with ${state.m} slots.`;
  const parts = state.slots
    .map((c, j) => (c ? `${j}: ${c.del ? 'DEL' : c.key}` : ''))
    .filter(Boolean);
  return `Table with ${state.m} slots and ${n} ${n === 1 ? 'key' : 'keys'}. ${parts.join(', ')}. The other slots are empty.`;
}
