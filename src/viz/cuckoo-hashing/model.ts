import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { nextPrime, readNumber } from '../_hashing/hashing';

export interface Cell {
  uid: number;
  key: number;
}

export interface CuckooState {
  m: number;
  /** T[0] and T[1]: the two tables, m slots each. */
  t: [(Cell | null)[], (Cell | null)[]];
  nextUid: number;
  rehashes: number;
}

export interface CuckooSettings {
  [key: string]: Scalar;
  m: number;
}

export interface CuckooExtra {
  /** The key with no slot: the one being inserted, or the one just kicked out. */
  hand?: { text: string; uid?: number; error?: boolean };
  formula?: string;
  /** Keys waiting to go back in during a rehash. */
  queue?: Cell[];
}

type S = CuckooState;
type X = CuckooExtra;
type Op = OpSpec<S, CuckooSettings, X>;
type CStep = Step<S, X>;
type Level = 1 | 2 | 3;
type Side = 0 | 1;

export const defaults: CuckooSettings = { m: 11 };
/** The tables never grow past this; a rehash that would is refused. */
export const MAX_M = 97;
/** A safety net: the cycle rule always stops a walk long before this. */
const MAX_KICKS = 1000;

export function init(settings: CuckooSettings): S {
  return {
    m: settings.m,
    t: [Array(settings.m).fill(null), Array(settings.m).fill(null)],
    nextUid: 1,
    rehashes: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (side: Side, j: number) => `t${side + 1}-${j}`;

/** h1(k) = k mod m and h2(k) = ⌊k/m⌋ mod m, the textbook pair. */
export const h = (side: Side, k: number, m: number) => (side === 0 ? k % m : Math.floor(k / m) % m);
export function hashSay(side: Side, k: number, m: number): string {
  return side === 0
    ? `h1(${k}) = ${k} mod ${m} = ${k % m}`
    : `h2(${k}) = ⌊${k}/${m}⌋ mod ${m} = ${Math.floor(k / m)} mod ${m} = ${Math.floor(k / m) % m}`;
}
const both = (k: number, m: number) => `${hashSay(0, k, m)}, ${hashSay(1, k, m)}`;

export const keysOf = (s: S): number[] => [...s.t[0], ...s.t[1]].filter(Boolean).map((c) => c!.key);
export const count = (s: S) => keysOf(s).length;

function readouts(s: S): Record<string, Scalar> {
  const n = count(s);
  return { n, m: s.m, 'load n/2m': Math.round((n / (2 * s.m)) * 100) / 100, rehashes: s.rehashes };
}

function put(s: S, side: Side, j: number, cell: Cell | null): S {
  const t: S['t'] = [s.t[0], s.t[1]];
  t[side] = t[side].map((c, q) => (q === j ? cell : c));
  return { ...s, t };
}

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): CStep {
  return {
    state: c.s,
    marks,
    say,
    lines,
    vars: { ...c.vars, ...readouts(c.s) },
    level,
    extra: { ...c.extra },
  };
}

function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { hand: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The tables are unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

/**
 * The cuckoo walk: put `cell` in its T1 nest, kicking out whatever is there to its other nest,
 * and so on. Returns the cell left with no slot when the walk would loop forever (the key that
 * started it is nestless for the third time), or null when everyone has a slot.
 * `level` is the detail level of the kick steps; the walk's last step is the caller's.
 */
function* walk(
  c: Ctx,
  start: Cell,
  level: Level,
  lines: { place: string; kick: string },
): Generator<CStep, Cell | null, void> {
  let cell = start;
  let side: Side = 0;
  let nestless = 1;
  for (let kicks = 0; kicks < MAX_KICKS; kicks++) {
    const m = c.s.m;
    const j = h(side, cell.key, m);
    const name = `T${side + 1}[${j}]`;
    const there = c.s.t[side][j];
    c.extra.formula = hashSay(side, cell.key, m);
    c.s = put(c.s, side, j, cell);
    if (!there) {
      c.extra.hand = undefined;
      // The caller narrates the last placement.
      c.vars.slot = name;
      c.vars.placed = cell.key;
      return null;
    }
    c.vars.kicks = Number(c.vars.kicks ?? 0) + 1;
    c.extra.hand = { text: String(there.key), uid: there.uid };
    if (there.uid === start.uid) nestless++;
    const other: Side = side === 0 ? 1 : 0;
    const back = there.uid === start.uid;
    yield step(
      c,
      `${hashSay(side, cell.key, m)}. ${name} holds ${there.key}, so ${cell.key} takes the slot and kicks ${there.key} out. ${
        back
          ? `${there.key} is the key we started with: it is homeless for the ${nestless === 2 ? 'second' : 'third'} time. `
          : ''
      }${there.key} must go to its other nest in T${other + 1}.`,
      [lines.kick],
      level,
      [
        mark(cellId(side, j), 'active'),
        mark(`v${cell.uid}`, 'new'),
        mark(`v${there.uid}`, 'remove'),
      ],
    );
    if (nestless === 3) return there;
    cell = there;
    side = other;
  }
  return cell;
}

/** Every key, T1 slots in order, then T2 slots, then `extra`. */
const collect = (s: S, extra: Cell): Cell[] =>
  [...s.t[0], ...s.t[1]].filter((x): x is Cell => x !== null).concat(extra);

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [raw]) {
    const k = readNumber(raw!);
    if (k instanceof Error) return yield* badArg(s0, 'insert', raw!, k, 'ins.sig');
    const m = s0.m;
    const uid = s0.nextUid;
    const c: Ctx = { s: s0, extra: { hand: { text: String(k), uid } }, vars: { k, kicks: 0 } };
    const a = h(0, k, m);
    const b = h(1, k, m);
    c.extra.formula = `h1 = ${a}, h2 = ${b}`;
    const found: Side | null = s0.t[0][a]?.key === k ? 0 : s0.t[1][b]?.key === k ? 1 : null;
    if (found !== null) {
      c.extra.hand = { text: String(k) };
      yield step(
        c,
        `insert(${k}): ${both(k, m)}. ${found === 0 ? `T1[${a}]` : `T2[${b}]`} holds ${k} already, so nothing changes.`,
        ['ins.sig', 'ins.look'],
        1,
        [mark(cellId(found, found === 0 ? a : b), 'found')],
      );
      return s0;
    }
    yield step(
      c,
      `insert(${k}): ${both(k, m)}. ${k} is in neither nest, so put it in T1[${a}].`,
      ['ins.sig', 'ins.look'],
      2,
      [mark(cellId(0, a), 'compare'), mark(cellId(1, b), 'compare')],
    );
    c.s = { ...c.s, nextUid: uid + 1 };
    const left = yield* walk(c, { uid, key: k }, 2, { place: 'ins.place', kick: 'ins.kick' });
    if (left === null) {
      const kicks = Number(c.vars.kicks);
      yield step(
        c,
        kicks
          ? `${c.extra.formula}. ${c.vars.slot} is empty, so ${c.vars.placed} settles there. Every key has a slot after ${kicks} ${kicks === 1 ? 'kick' : 'kicks'}.`
          : `${c.extra.formula}. ${c.vars.slot} is empty, so ${k} goes there. No kicks.`,
        ['ins.loop', 'ins.place'],
        1,
        [mark(`v${uid}`, 'done')],
      );
      return c.s;
    }
    // A cycle: grow the tables and put every key back.
    c.extra.hand = { text: String(left.key), uid: left.uid, error: true };
    yield step(
      c,
      `${left.key} has been homeless three times: the walk is going round in a cycle and would kick forever. Rehash: new hash functions and bigger tables, then insert every key again.`,
      ['ins.cycle', 'ins.rehash'],
      2,
      [mark('arg-box', 'error')],
    );
    return yield* rehash(c, left);
  },
};

function* rehash(c: Ctx, left: Cell): Generator<CStep, S, void> {
  const keys = collect(c.s, left);
  let m = c.s.m;
  for (;;) {
    const grown = nextPrime(m + 1);
    if (grown > MAX_M) {
      // Give up: leave the key out. (Never reached with keys up to 999 and m ≤ 13.)
      c.extra.hand = { text: String(left.key), error: true };
      yield step(
        c,
        `The tables cannot grow past ${MAX_M}, so ${left.key} is left out.`,
        ['ins.rehash'],
        1,
        [mark('arg-box', 'error')],
      );
      return c.s;
    }
    m = grown;
    c.s = {
      m,
      t: [Array(m).fill(null), Array(m).fill(null)],
      nextUid: c.s.nextUid,
      rehashes: c.s.rehashes + 1,
    };
    c.extra.hand = undefined;
    c.extra.queue = keys;
    c.extra.formula = `m = ${m}: h1(k) = k mod ${m}, h2(k) = ⌊k/${m}⌋ mod ${m}`;
    yield step(
      c,
      `Rehash with m = ${m}, the next prime: h1(k) = k mod ${m} and h2(k) = ⌊k/${m}⌋ mod ${m}. Insert the ${keys.length} keys again, one at a time.`,
      ['ins.rehash'],
      2,
      [],
    );
    let failed = false;
    for (const [q, cell] of keys.entries()) {
      c.extra.hand = { text: String(cell.key), uid: cell.uid };
      c.extra.queue = keys.slice(q + 1);
      const before = Number(c.vars.kicks);
      const out = yield* walk(c, cell, 3, { place: 'ins.place', kick: 'ins.kick' });
      const kicked = Number(c.vars.kicks) - before;
      if (out) {
        failed = true;
        break;
      }
      yield step(
        c,
        kicked
          ? `${c.extra.formula}. ${c.vars.placed} settles in ${c.vars.slot}: ${cell.key} is back in after ${kicked} ${kicked === 1 ? 'kick' : 'kicks'}.`
          : `${c.extra.formula}. ${c.vars.slot} is empty: ${cell.key} goes there.`,
        ['ins.rehash'],
        3,
        [mark(`v${cell.uid}`, 'done')],
      );
    }
    c.extra.queue = undefined;
    if (!failed) {
      c.extra.formula = `m = ${m}`;
      yield step(
        c,
        `Every key has a slot in the new tables of ${m}. ${c.s.rehashes} ${c.s.rehashes === 1 ? 'rehash' : 'rehashes'} so far.`,
        ['ins.rehash'],
        1,
        keys.map((x) => mark(`v${x.uid}`, 'done')),
      );
      return c.s;
    }
    yield step(c, `Another cycle with m = ${m}. Grow again.`, ['ins.cycle', 'ins.rehash'], 2, []);
  }
}

// ---------------------------------------------------------------------------------------------
// search and delete: at most two probes

function* find(s: S, raw: Value, op: 'search' | 'delete'): Generator<CStep, S, void> {
  const pre = op === 'search' ? 'srch' : 'del';
  const k = readNumber(raw);
  if (k instanceof Error) return yield* badArg(s, op, raw, k, `${pre}.sig`);
  const m = s.m;
  const c: Ctx = { s, extra: { hand: { text: String(k) } }, vars: { k } };
  for (const side of [0, 1] as Side[]) {
    const j = h(side, k, m);
    const cell = s.t[side][j];
    c.vars.probes = side + 1;
    c.extra.formula = hashSay(side, k, m);
    const name = `T${side + 1}[${j}]`;
    if (cell?.key === k) {
      if (op === 'search') {
        c.vars.found = name;
        yield step(
          c,
          `${op}(${k}): ${hashSay(side, k, m)}. ${name} holds ${k}: found after ${side + 1} ${side ? 'probes' : 'probe'}.`,
          ['srch.sig', side ? 'srch.t2' : 'srch.t1', 'srch.found'],
          1,
          [mark(cellId(side, j), 'found')],
        );
        return s;
      }
      c.s = put(s, side, j, null);
      c.extra.hand = { text: String(k), uid: cell.uid };
      yield step(
        c,
        `${op}(${k}): ${hashSay(side, k, m)}. ${name} holds ${k}; empty the slot. No tombstone is needed: search never walks past a slot.`,
        ['del.sig', side ? 'del.t2' : 'del.t1', 'del.clear'],
        1,
        [mark(cellId(side, j), 'remove')],
      );
      return c.s;
    }
    if (side === 0)
      yield step(
        c,
        `${op}(${k}): a key can only be in one of two places. ${hashSay(0, k, m)}, and ${name} ${cell ? `holds ${cell.key}` : 'is empty'}.`,
        [`${pre}.sig`, `${pre}.t1`],
        2,
        [mark(cellId(0, j), 'compare')],
      );
  }
  const j = h(1, k, m);
  const cell = s.t[1][j];
  if (op === 'search') c.vars.found = false;
  yield step(
    c,
    `${hashSay(1, k, m)}, and T2[${j}] ${cell ? `holds ${cell.key}` : 'is empty'}. ${k} is in neither of its two nests, so it is not in the table: 2 probes, always.`,
    [`${pre}.t2`, `${pre}.miss`],
    1,
    [mark(cellId(1, j), 'compare')],
  );
  return s;
}

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    return yield* find(s, raw!, 'search');
  },
};
const remove: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw]) {
    return yield* find(s, raw!, 'delete');
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s0) {
    const s: S = { ...init({ m: s0.m }), nextUid: s0.nextUid, rehashes: s0.rehashes };
    yield step(
      { s, extra: {}, vars: {} },
      'clear(): both tables are empty again.',
      ['clr.sig'],
      1,
      [],
    );
    return s;
  },
};

export const ops: Record<string, Op> = { insert, search, delete: remove, clear };

// ---------------------------------------------------------------------------------------------
// pseudocode and text

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert k:'),
        L(
          'ins.look',
          1,
          'if T1[h1(k)] == k or T2[h2(k)] == k: return',
          'stop if k is already in one of its two nests.',
        ),
        L('ins.loop', 1, 'x = k; i = 1', 'Start with k, aimed at table 1.'),
        L(
          'ins.kick',
          1,
          'while Tᵢ[hᵢ(x)] is taken: swap x and Tᵢ[hᵢ(x)]; i = 3 − i',
          'While its slot is taken, take it anyway and carry off the old key to its other table.',
        ),
        L('ins.place', 1, 'Tᵢ[hᵢ(x)] = x', 'Put the key in hand into the empty slot.'),
        L(
          'ins.cycle',
          1,
          'if k is homeless a third time: cycle',
          'If k itself is kicked out twice, the kicks go round forever:',
        ),
        L(
          'ins.rehash',
          2,
          'rehash with bigger tables; insert every key again',
          'grow the tables, change the hash functions, and put every key back.',
        ),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To search for k:'),
        L('srch.t1', 1, 'if T1[h1(k)] == k: return T1', 'look in its table 1 nest,'),
        L('srch.t2', 1, 'if T2[h2(k)] == k: return T2', 'then in its table 2 nest.'),
        L('srch.found', 2, '// found', 'Found it.'),
        L('srch.miss', 1, 'return nil', 'In neither: k is not in the table.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete k:'),
        L(
          'del.t1',
          1,
          'if T1[h1(k)] == k: T1[h1(k)] = nil',
          'empty its table 1 nest if k is there,',
        ),
        L('del.t2', 1, 'else if T2[h2(k)] == k: T2[h2(k)] = nil', 'or else its table 2 nest.'),
        L('del.clear', 2, '// emptied', 'The slot is empty again.'),
        L('del.miss', 1, 'return', 'In neither: nothing to delete.'),
      ],
    },
    {
      op: 'clear',
      lines: [L('clr.sig', 0, 'clear(): empty both tables', 'To start again, empty both tables.')],
    },
  ];
}

export function initialSay(state: S): string {
  return `Two empty tables of m = ${state.m} slots. Key k may live in only two places: T1[h1(k)] with h1(k) = k mod ${state.m}, or T2[h2(k)] with h2(k) = ⌊k/${state.m}⌋ mod ${state.m}.`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  const part = (side: Side) =>
    state.t[side]
      .map((c, j) => (c ? `${j}: ${c.key}` : ''))
      .filter(Boolean)
      .join(', ') || 'empty';
  return `Cuckoo hash table, two tables of ${state.m} slots. T1: ${part(0)}. T2: ${part(1)}.`;
}
