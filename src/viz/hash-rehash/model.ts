import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum, MAX_KEY, nextPrime, readNumber, shuffle } from '../hash-chaining/hashing';

export interface Cell {
  uid: number;
  key: number;
}

export interface Table {
  m: number;
  slots: (Cell | null)[];
}

export interface RehashState {
  table: Table;
  /** The new, bigger table while a rehash is filling it. */
  fresh?: Table;
  nextUid: number;
  /** Keys added so far, and the total cost of those inserts (stores plus moves). */
  inserts: number;
  total: number;
}

export type Threshold = '0.5' | '0.75' | '1.0';

export interface RehashSettings {
  [key: string]: Scalar;
  /** Starting table size. */
  m0: number;
  /** Grow when the load factor would pass this. */
  threshold: Threshold;
  /** New size: the next prime at least twice as big, or exactly twice as big. */
  grow: 'prime' | 'double';
}

export interface RehashExtra {
  arg?: { text: string; uid?: number; error?: boolean };
  formula?: string;
  /** Probe numbers by slot of the table being probed (`fresh` while moving keys). */
  probed?: Record<number, number[]>;
  /** Which table the probe notes belong to. */
  probing?: 'table' | 'fresh';
}

type S = RehashState;
type X = RehashExtra;
type Op = OpSpec<S, RehashSettings, X>;
type RStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MAX_M = 97;

export const defaults: RehashSettings = { m0: 5, threshold: '0.75', grow: 'prime' };

export function init(settings: RehashSettings): S {
  return {
    table: { m: settings.m0, slots: Array(settings.m0).fill(null) },
    nextUid: 1,
    inserts: 0,
    total: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (j: number) => `cell-${j}`;
export const freshId = (j: number) => `new-cell-${j}`;

export const countOf = (t: Table) => t.slots.filter(Boolean).length;
/** Keys in the table, counting any already moved into the new one. */
export const sizeOf = (s: S) => countOf(s.table) + (s.fresh ? countOf(s.fresh) : 0);

export function growTo(m: number, settings: RehashSettings): number {
  return settings.grow === 'double' ? 2 * m : nextPrime(2 * m);
}

function readouts(s: S, settings: RehashSettings): Record<string, Scalar> {
  const n = sizeOf(s);
  const m = s.table.m;
  return {
    n,
    m,
    α: Math.round((n / m) * 100) / 100,
    max: Number(settings.threshold),
    total: s.total,
    inserts: s.inserts,
    amortized: s.inserts ? Math.round((s.total / s.inserts) * 100) / 100 : 0,
  };
}

interface Ctx {
  s: S;
  settings: RehashSettings;
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
): RStep {
  const extra: X = { ...c.extra, ...more };
  if (extra.probed)
    extra.probed = Object.fromEntries(Object.entries(extra.probed).map(([j, is]) => [j, [...is]]));
  return {
    state: c.s,
    marks,
    say,
    lines,
    vars: { ...c.vars, ...readouts(c.s, c.settings) },
    level,
    extra,
  };
}

function* badArg(
  s: S,
  settings: RehashSettings,
  name: string,
  raw: Value,
  err: Error,
  line: string,
): Generator<RStep, S, void> {
  const c: Ctx = { s, settings, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The table is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Linear probing: the first slot of k's sequence that is empty or holds k. */
function probe(t: Table, k: number): { j: number; probes: number; slots: number[] } | null {
  const slots: number[] = [];
  for (let i = 0; i < t.m; i++) {
    const j = (k + i) % t.m;
    slots.push(j);
    const c = t.slots[j];
    if (c === null || c === undefined || c.key === k) return { j, probes: i + 1, slots };
  }
  return null;
}

function withSlot(t: Table, j: number, cell: Cell | null): Table {
  return { m: t.m, slots: t.slots.map((x, i) => (i === j ? cell : x)) };
}

// ---------------------------------------------------------------------------------------------
// insert

function* insertKey(s: S, raw: Value, settings: RehashSettings): Generator<RStep, S, void> {
  const k = readNumber(raw);
  if (k instanceof Error) return yield* badArg(s, settings, 'insert', raw, k, 'ins.sig');
  const uid = s.nextUid;
  const c: Ctx = { s, settings, extra: { arg: { text: String(k), uid } }, vars: { k } };
  const m = s.table.m;
  const home = k % m;
  const probed: Record<number, number[]> = {};
  c.extra.probed = probed;
  c.extra.probing = 'table';
  c.vars.cost = 0;

  yield step(
    c,
    `insert(${k}): h(${k}) = ${k} mod ${m} = ${home}. First make sure ${k} is new: probe from slot ${home} until ${k} or an empty slot turns up.`,
    ['ins.sig', 'ins.search'],
    2,
    [mark(cellId(home), 'active')],
  );

  // The duplicate check: linear probing in the current table.
  let free = -1;
  for (let i = 0; i < m; i++) {
    const j: number = (k + i) % m;
    (probed[j] ??= []).push(i);
    c.extra.formula = `h(${k}, ${i}) = (${home} + ${i}) mod ${m} = ${j}`;
    const cell: Cell | null = s.table.slots[j] ?? null;
    if (cell && cell.key === k) {
      yield step(
        c,
        `Slot ${j} holds ${k} already, so nothing changes and nothing is paid.`,
        ['ins.search', 'ins.dup'],
        1,
        [mark(cellId(j), 'found')],
      );
      return s;
    }
    if (!cell) {
      free = j;
      yield step(c, `Slot ${j} is empty, so ${k} is new.`, ['ins.search'], 3, [
        mark(cellId(j), 'compare'),
      ]);
      break;
    }
    yield step(c, `Slot ${j} holds ${cell.key}; keep probing.`, ['ins.search'], 3, [
      mark(cellId(j), 'compare'),
    ]);
  }

  const n = sizeOf(s);
  const limit = Number(settings.threshold);
  const after = (n + 1) / m;
  const over = n + 1 > limit * m;
  const target = growTo(m, settings);
  let state = s;
  let moved = 0;
  if (over && target <= MAX_M) {
    yield step(
      c,
      `Adding ${k} would make n = ${n + 1} and α = ${n + 1}/${m} ≈ ${fmtNum(after)}, above the threshold ${settings.threshold}. Grow first: ${
        settings.grow === 'double'
          ? `the new size is 2 × ${m} = ${target}`
          : `the new size is the first prime at least 2 × ${m} = ${2 * m}, which is ${target}`
      }.`,
      ['ins.check', 'ins.size'],
      2,
      [mark('table-label', 'active')],
      { probed: undefined, formula: undefined },
    );
    const r = yield* rehash(c, state, target);
    state = r.state;
    moved = r.moved;
  } else if (over) {
    yield step(
      c,
      `Adding ${k} would push α above ${settings.threshold}, but this demo stops growing at ${MAX_M} slots, so the table stays at m = ${m}.`,
      ['ins.check'],
      2,
      [],
    );
  } else if (free >= 0) {
    yield step(
      c,
      `n + 1 = ${n + 1} keys make α = ${n + 1}/${m} ≈ ${fmtNum(after)}, not above ${settings.threshold}, so no need to grow.`,
      ['ins.check'],
      3,
      [],
    );
  }

  // Store k: in the free slot found, or in the new table after a rehash.
  const t = state.table;
  const spot = probe(t, k);
  if (!spot || t.slots[spot.j]) {
    c.extra.arg = { text: String(k), error: true };
    yield step(
      c,
      `Every slot is taken and the table cannot grow, so ${k} is not stored.`,
      ['ins.store'],
      1,
      [mark('arg-box', 'error')],
    );
    return state;
  }
  const cost = 1 + moved;
  const table = withSlot(t, spot.j, { uid, key: k });
  const done: S = {
    table,
    nextUid: Math.max(uid, state.nextUid) + 1,
    inserts: s.inserts + 1,
    total: s.total + cost,
  };
  c.s = done;
  c.vars.cost = cost;
  c.extra.arg = undefined;
  c.extra.probing = 'table';
  c.extra.probed = Object.fromEntries(spot.slots.map((j, i) => [j, [i]]));
  c.extra.formula = `h(${k}) = ${k} mod ${t.m} = ${k % t.m}`;
  const where =
    spot.probes === 1 ? `slot ${spot.j}` : `slot ${spot.j}, after ${plural(spot.probes, 'probe')}`;
  yield step(
    c,
    moved
      ? `Now insert ${k} into the new table: h(${k}) = ${k} mod ${t.m} = ${k % t.m}, so it goes in ${where}. This insert cost ${cost}: ${plural(moved, 'move')} and 1 store. ${totals(done)}`
      : `${k} goes in ${where}. This insert cost 1. ${totals(done)}`,
    ['ins.store'],
    1,
    [mark(cellId(spot.j), 'new'), mark(`v${uid}`, 'done')],
  );
  return done;
}

function totals(s: S): string {
  return `${s.inserts} ${s.inserts === 1 ? 'insert has' : 'inserts have'} cost ${s.total} in total, ${fmtNum(s.total / s.inserts)} each on average.`;
}

/** Move every key of the old table into a new table of size target, one at a time. */
function* rehash(
  c: Ctx,
  s: S,
  target: number,
): Generator<RStep, { state: S; moved: number }, void> {
  let old: Table = s.table;
  let fresh: Table = { m: target, slots: Array(target).fill(null) };
  c.s = { ...s, fresh };
  c.extra.probing = 'fresh';
  c.extra.probed = {};
  c.extra.formula = undefined;
  const keys = s.table.slots.map((x, j) => [x, j] as const).filter(([x]) => x !== null);
  yield step(
    c,
    `Make a new, empty table T' with m = ${target} slots. Every key has to move, because its slot depends on m: k mod ${s.table.m} and k mod ${target} are different numbers.`,
    ['ins.new'],
    2,
    [mark('fresh-label', 'new')],
  );
  let moved = 0;
  for (const [cell, from] of keys) {
    const x = cell!;
    const spot = probe(fresh, x.key)!;
    old = withSlot(old, from, null);
    fresh = withSlot(fresh, spot.j, x);
    moved++;
    c.s = { ...s, table: old, fresh };
    c.extra.probed = Object.fromEntries(spot.slots.map((j, i) => [j, [i]]));
    c.extra.formula = `h(${x.key}) = ${x.key} mod ${target} = ${x.key % target}`;
    c.vars.moved = moved;
    const bumped =
      spot.probes > 1
        ? `; slots ${spot.slots.slice(0, -1).join(', ')} are taken, so it goes in slot ${spot.j}`
        : ', which is free';
    yield step(
      c,
      `Move ${x.key} from slot ${from}: h(${x.key}) = ${x.key} mod ${target} = ${x.key % target}${bumped}.`,
      ['ins.loop', 'ins.move'],
      2,
      [mark(freshId(spot.j), 'new'), mark(`v${x.uid}`, 'active')],
    );
  }
  const next: S = { ...s, table: fresh, fresh: undefined };
  c.s = next;
  c.extra.probed = undefined;
  c.extra.probing = 'table';
  c.extra.formula = undefined;
  delete c.vars.moved;
  yield step(
    c,
    `All ${plural(moved, 'key')} have moved. Free the old table: T = T', and m = ${target}. α is now ${sizeOf(next)}/${target} ≈ ${fmtNum(sizeOf(next) / target)}.`,
    ['ins.swap'],
    2,
    [mark('table-label', 'active')],
  );
  return { state: next, moved };
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    return yield* insertKey(s, raw!, settings);
  },
};

// ---------------------------------------------------------------------------------------------
// search

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = readNumber(raw!);
    if (k instanceof Error) return yield* badArg(s, settings, 'search', raw!, k, 'srch.sig');
    const m = s.table.m;
    const home = k % m;
    const probed: Record<number, number[]> = {};
    const c: Ctx = {
      s,
      settings,
      extra: { arg: { text: String(k) }, probed, probing: 'table' },
      vars: { k },
    };
    yield step(
      c,
      `search(${k}): h(${k}) = ${k} mod ${m} = ${home}. Probe from slot ${home}.`,
      ['srch.sig'],
      2,
      [mark(cellId(home), 'active')],
    );
    for (let i = 0; i < m; i++) {
      const j: number = (k + i) % m;
      (probed[j] ??= []).push(i);
      c.vars.probes = i + 1;
      c.extra.formula = `h(${k}, ${i}) = (${home} + ${i}) mod ${m} = ${j}`;
      const cell: Cell | null = s.table.slots[j] ?? null;
      if (!cell) {
        c.vars.found = false;
        yield step(
          c,
          `Slot ${j} is empty, so ${k} is not in the table. ${plural(i + 1, 'probe')}.`,
          ['srch.loop', 'srch.empty'],
          1,
          [mark(cellId(j), 'compare')],
        );
        return s;
      }
      if (cell.key === k) {
        c.vars.found = true;
        yield step(
          c,
          `Slot ${j} holds ${k}: found it after ${plural(i + 1, 'probe')}.`,
          ['srch.loop', 'srch.found'],
          1,
          [mark(cellId(j), 'found')],
        );
        return s;
      }
      yield step(c, `Slot ${j} holds ${cell.key}; keep probing.`, ['srch.loop'], 2, [
        mark(cellId(j), 'compare'),
      ]);
    }
    c.vars.found = false;
    yield step(c, `Every slot holds another key: ${k} is not in the table.`, ['srch.end'], 1, []);
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const empty: S = { ...init(settings), nextUid: s.nextUid };
    const c: Ctx = { s: empty, settings, extra: {}, vars: {} };
    yield step(
      c,
      `clear(): start again with an empty table of ${settings.m0} slots, and reset the cost counters.`,
      ['clr.set'],
      1,
      [],
    );
    return empty;
  },
};

// ---------------------------------------------------------------------------------------------
// fill: the "all colliding keys" preset. Keys collide in the table they meet when they arrive.

export function collidingKeys(rng: Rng, settings: RehashSettings, count: number): number[] {
  // Every table size the first `count` inserts will see, so the keys can share a remainder.
  const sizes = new Set<number>();
  let m = settings.m0;
  for (let n = 0; n < count; n++) {
    if (n + 1 > Number(settings.threshold) * m && growTo(m, settings) <= MAX_M)
      m = growTo(m, settings);
    sizes.add(m);
  }
  const final = m;
  const home = rng.int(0, final - 1);
  const pool: number[] = [];
  for (let k = home; k <= MAX_KEY; k += final) if (k > 0) pool.push(k);
  return shuffle(rng.next, pool).slice(0, count);
}

const fill: Op = {
  label: 'Fill',
  arity: 2,
  *run(s, [, count], { settings, rng }) {
    const n = Math.max(1, Math.min(30, Math.round(Number(count) || 0)));
    const keys = collidingKeys(rng, settings, n);
    const c: Ctx = { s, settings, extra: {}, vars: {} };
    yield step(
      c,
      `Insert ${keys.length} keys that share a remainder modulo the size the table will end up with: ${keys.join(', ')}. They collide in the final table, so its probe sequences get long.`,
      [],
      1,
      [],
    );
    let state = s;
    for (const k of keys) state = yield* insertKey(state, k, settings);
    return state;
  },
};

export const ops = { insert, search, clear, fill };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RehashSettings): PseudoBlock[] {
  const size =
    settings.grow === 'double'
      ? L('ins.size', 2, "m' = 2m", 'The new size is twice the old one.')
      : L(
          'ins.size',
          2,
          "m' = next prime ≥ 2m",
          'The new size is the first prime at least twice the old one.',
        );
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert k:'),
        L(
          'ins.search',
          1,
          'j = slot(T, k)',
          'Probe from h(k) to k or the first empty slot (that is slot()).',
        ),
        L('ins.dup', 1, 'if T[j] == k: return', 'If k is already there, stop.'),
        L(
          'ins.check',
          1,
          `if (n + 1) / m > ${settings.threshold}`,
          `If one more key would push α above ${settings.threshold},`,
        ),
        size,
        L('ins.new', 2, "T' = empty table, size m'", 'make an empty table of that size,'),
        L('ins.loop', 2, 'for each key x in T', 'and for every key in the old table,'),
        L('ins.move', 3, "T'[slot(T', x)] = x", 'probe for it in the new table and put it there.'),
        L('ins.swap', 2, "T = T'; m = m'", 'Then use the new table.'),
        L(
          'ins.store',
          1,
          'T[slot(T, k)] = k',
          'Store k in the first empty slot of its probe sequence.',
        ),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To search for k:'),
        L(
          'srch.loop',
          1,
          'for j = h(k), h(k)+1, …',
          'Probe slots from h(k) onwards, wrapping around:',
        ),
        L('srch.empty', 2, 'if T[j] == nil: return nil', 'an empty slot means k is not there,'),
        L('srch.found', 2, 'if T[j] == k: return j', 'and a slot holding k means found.'),
        L('srch.end', 1, 'return nil', 'Every slot was taken: k is not there.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To clear:'),
        L(
          'clr.set',
          1,
          'T = empty table, size m0',
          'Start again with an empty table of the starting size.',
        ),
      ],
    },
  ];
}

export function initialSay(state: S, settings: RehashSettings): string {
  return `An empty table with m = ${state.table.m} slots, using linear probing and h(k) = k mod m. When one more key would push α above ${settings.threshold}, the table grows to ${
    settings.grow === 'double' ? 'twice its size' : 'the first prime at least twice its size'
  } and every key moves.`;
}

export function initialVars(state: S, settings: RehashSettings) {
  return readouts(state, settings);
}

export function describe(state: S): string {
  const list = (t: Table) =>
    t.slots
      .map((c, j) => (c ? `${j}: ${c.key}` : ''))
      .filter(Boolean)
      .join(', ');
  const n = countOf(state.table);
  const main = n
    ? `Table with ${state.table.m} slots and ${n} ${n === 1 ? 'key' : 'keys'}: ${list(state.table)}.`
    : `Empty table with ${state.table.m} slots.`;
  if (!state.fresh) return main;
  const f = countOf(state.fresh);
  return `Rehashing. Old ${main.charAt(0).toLowerCase()}${main.slice(1)} New table with ${state.fresh.m} slots${
    f ? `: ${list(state.fresh)}` : ', still empty'
  }.`;
}
