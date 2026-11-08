import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtAlpha, loadFactor, readNumber } from '../_hashing/hashing';

export interface Cell {
  uid: number;
  key: number;
}

export interface RobinState {
  m: number;
  slots: (Cell | null)[];
  nextUid: number;
  /** The keys in the table, in the order they were inserted, for the comparison readout. */
  order: number[];
}

export type Policy = 'robin' | 'linear';

export interface RobinSettings {
  [key: string]: Scalar;
  m: number;
  policy: Policy;
}

export interface RobinExtra {
  /** The key in hand: being inserted, or displaced by a richer one. */
  hand?: { text: string; uid?: number; error?: boolean };
  formula?: string;
  /** The slot being looked at. */
  at?: number;
}

type S = RobinState;
type X = RobinExtra;
type Op = OpSpec<S, RobinSettings, X>;
type RStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: RobinSettings = { m: 11, policy: 'robin' };

export function init(settings: RobinSettings): S {
  return { m: settings.m, slots: Array(settings.m).fill(null), nextUid: 1, order: [] };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (j: number) => `cell-${j}`;

export const home = (k: number, m: number) => k % m;
/** How far slot j is from k's home slot, going forward: its probe distance. */
export const dist = (k: number, j: number, m: number) => (((j - home(k, m)) % m) + m) % m;

export const count = (s: S) => s.slots.filter(Boolean).length;
export const distances = (s: S): number[] =>
  s.slots.flatMap((c, j) => (c ? [dist(c.key, j, s.m)] : []));

/** The slots after inserting `keys` in order, under `policy`, into an empty table of m. */
export function build(keys: number[], m: number, policy: Policy): (number | null)[] {
  const t: (number | null)[] = Array(m).fill(null);
  for (const k0 of keys) {
    let k = k0;
    let d = 0;
    for (let i = 0; i < m; i++) {
      const j = (home(k, m) + d) % m;
      const there = t[j];
      if (there === null || there === undefined) {
        t[j] = k;
        break;
      }
      if (there === k) break;
      if (policy === 'robin' && dist(there, j, m) < d) {
        t[j] = k;
        k = there;
        d = dist(k, j, m);
      }
      d++;
    }
  }
  return t;
}

const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

function readouts(s: S, policy: Policy): Record<string, Scalar> {
  const ds = distances(s);
  const n = ds.length;
  const other: Policy = policy === 'robin' ? 'linear' : 'robin';
  const shadow = build(s.order, s.m, other);
  const sds = shadow.flatMap((k, j) => (k === null ? [] : [dist(k, j, s.m)]));
  const sum = ds.reduce((a, b) => a + b, 0);
  return {
    n,
    m: s.m,
    α: loadFactor(n, s.m),
    'max d': maxOf(ds),
    'sum d': sum,
    'avg d': n ? Math.round((sum / n) * 100) / 100 : 0,
    [other === 'linear' ? 'linear max d' : 'robin max d']: maxOf(sds),
    [other === 'linear' ? 'linear sum d' : 'robin sum d']: sds.reduce((a, b) => a + b, 0),
  };
}

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
  policy: Policy;
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): RStep {
  return {
    state: c.s,
    marks,
    say,
    lines,
    vars: { ...c.vars, ...readouts(c.s, c.policy) },
    level,
    extra: { ...c.extra },
  };
}

function* badArg(s: S, policy: Policy, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { hand: { text: String(raw), error: true } }, vars: {}, policy };
  yield step(c, `${name}(${String(raw)}): ${err.message} The table is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const setSlot = (s: S, j: number, cell: Cell | null): S => ({
  ...s,
  slots: s.slots.map((x, q) => (q === j ? cell : x)),
});

const summary = (s: S) =>
  `n = ${count(s)}, ${fmtAlpha(count(s), s.m)}, longest probe distance ${maxOf(distances(s))}.`;

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [raw], { settings }) {
    const policy = settings.policy;
    const k = readNumber(raw!);
    if (k instanceof Error) return yield* badArg(s0, policy, 'insert', raw!, k, 'ins.sig');
    const m = s0.m;
    const uid = s0.nextUid;
    const c: Ctx = {
      s: s0,
      extra: { hand: { text: String(k), uid } },
      vars: { k, probes: 0, swaps: 0 },
      policy,
    };
    const robin = policy === 'robin';
    if (count(s0) === m && !s0.slots.some((x) => x?.key === k)) {
      c.extra.hand = { text: String(k), error: true };
      yield step(
        c,
        `insert(${k}): all ${m} slots hold keys, so there is no room for ${k}: the table is full.`,
        ['ins.sig', 'ins.full'],
        1,
        [mark('arg-box', 'error')],
      );
      return s0;
    }
    let cell: Cell = { uid, key: k };
    let d = 0;
    let j = home(k, m);
    let swapped = false;
    c.extra.formula = `h(${k}) = ${k} mod ${m} = ${j}, d = 0`;
    yield step(
      c,
      robin
        ? `insert(${k}): its home slot is h(${k}) = ${k} mod ${m} = ${j}. Walk forward from there, counting the probe distance d. A key that is closer to its home than the one in hand gives up its slot.`
        : `insert(${k}): its home slot is h(${k}) = ${k} mod ${m} = ${j}. Walk forward until an empty slot (plain linear probing).`,
      ['ins.sig', 'ins.init'],
      2,
      [mark(cellId(j), 'compare')],
    );
    c.s = { ...c.s, nextUid: uid + 1 };
    for (let i = 0; i < m; i++) {
      const there = c.s.slots[j] ?? null;
      c.vars.probes = i + 1;
      c.vars.d = d;
      c.extra.at = j;
      c.extra.formula = `${cell.key}: slot ${j}, d = ${d}`;
      if (!there) {
        c.s = { ...setSlot(c.s, j, cell), order: [...c.s.order, k] };
        c.extra.hand = undefined;
        yield step(
          c,
          `Slot ${j} is empty: ${cell.key} goes there with probe distance ${d}${swapped ? `, and ${k} is in` : ''}. ${summary(c.s)}`,
          ['ins.loop', 'ins.empty', 'ins.store'],
          1,
          [mark(cellId(j), 'new'), mark(`v${cell.uid}`, 'done')],
        );
        return c.s;
      }
      const td = dist(there.key, j, m);
      if (!swapped && there.key === k) {
        c.extra.hand = { text: String(k) };
        c.s = s0;
        yield step(
          c,
          `Slot ${j} holds ${k} already, so nothing changes.`,
          ['ins.loop', 'ins.empty', 'ins.dup'],
          1,
          [mark(cellId(j), 'found')],
        );
        return s0;
      }
      if (robin && td < d) {
        // Take from the rich: the key in hand is further from home.
        c.s = setSlot(c.s, j, cell);
        c.vars.swaps = Number(c.vars.swaps) + 1;
        const from = cell.key;
        cell = there;
        c.extra.hand = { text: String(there.key), uid: there.uid };
        swapped = true;
        yield step(
          c,
          `Slot ${j} holds ${there.key}, only ${td} from its home, but ${from} is ${d} from home. ${from} is poorer, so it takes the slot, and ${there.key} carries on looking from distance ${td}.`,
          ['ins.loop', 'ins.empty', 'ins.rich', 'ins.swap'],
          2,
          [mark(cellId(j), 'active'), mark(`v${there.uid}`, 'remove')],
        );
        d = td;
      } else {
        yield step(
          c,
          robin
            ? td === d
              ? `Slot ${j} holds ${there.key}, ${td} from its home: the same as ${cell.key}'s ${d}. ${there.key} keeps the slot. Move on.`
              : `Slot ${j} holds ${there.key}, ${td} from its home, further than ${cell.key}'s ${d}. ${there.key} keeps the slot. Move on.`
            : `Slot ${j} holds ${there.key}. Move on.`,
          robin
            ? ['ins.loop', 'ins.empty', 'ins.rich', 'ins.next']
            : ['ins.loop', 'ins.empty', 'ins.next'],
          2,
          [mark(cellId(j), 'compare')],
        );
      }
      d++;
      j = (j + 1) % m;
    }
    return c.s;
  },
};

// ---------------------------------------------------------------------------------------------
// search and delete

function* find(
  s: S,
  k: number,
  c: Ctx,
  pre: 'srch' | 'del',
): Generator<RStep, number | null, void> {
  const m = s.m;
  const robin = c.policy === 'robin';
  let j = home(k, m);
  for (let d = 0; d < m; d++) {
    const there = s.slots[j] ?? null;
    c.vars.probes = d + 1;
    c.vars.d = d;
    c.extra.at = j;
    c.extra.formula = `${k}: slot ${j}, d = ${d}`;
    if (!there) {
      if (pre === 'srch') c.vars.found = false;
      yield step(
        c,
        `Slot ${j} is empty, so ${k} is not in the table: ${d + 1} ${d ? 'probes' : 'probe'}.`,
        [`${pre}.loop`, `${pre}.empty`],
        1,
        [mark(cellId(j), 'compare')],
      );
      return null;
    }
    if (there.key === k) return j;
    const td = dist(there.key, j, m);
    if (robin && td < d) {
      if (pre === 'srch') c.vars.found = false;
      yield step(
        c,
        `Slot ${j} holds ${there.key}, only ${td} from its home, while ${k} would be ${d} from home here. If ${k} were in the table, insert would have taken this slot from ${there.key}. So ${k} is not there: stop after ${d + 1} probes, without reaching an empty slot.`,
        [`${pre}.loop`, `${pre}.empty`, `${pre}.eq`, `${pre}.early`],
        1,
        [mark(cellId(j), 'compare')],
      );
      return null;
    }
    yield step(
      c,
      robin
        ? `Slot ${j} holds ${there.key} (distance ${td}, not less than ${d}). Keep going.`
        : `Slot ${j} holds ${there.key}. Keep going.`,
      robin
        ? [`${pre}.loop`, `${pre}.empty`, `${pre}.eq`, `${pre}.early`]
        : [`${pre}.loop`, `${pre}.empty`, `${pre}.eq`],
      2,
      [mark(cellId(j), 'compare')],
    );
    j = (j + 1) % m;
  }
  if (pre === 'srch') c.vars.found = false;
  yield step(c, `Every slot has been probed: ${k} is not in the table.`, [`${pre}.end`], 1, []);
  return null;
}

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = readNumber(raw!);
    if (k instanceof Error) return yield* badArg(s, settings.policy, 'search', raw!, k, 'srch.sig');
    const c: Ctx = {
      s,
      extra: { hand: { text: String(k) } },
      vars: { k },
      policy: settings.policy,
    };
    yield step(
      c,
      `search(${k}): start at its home slot, h(${k}) = ${k} mod ${s.m} = ${home(k, s.m)}.`,
      ['srch.sig'],
      2,
      [mark(cellId(home(k, s.m)), 'compare')],
    );
    const j = yield* find(s, k, c, 'srch');
    if (j !== null) {
      c.vars.found = true;
      c.vars.j = j;
      yield step(
        c,
        `Slot ${j} holds ${k}: found it after ${Number(c.vars.probes)} ${c.vars.probes === 1 ? 'probe' : 'probes'}.`,
        ['srch.loop', 'srch.empty', 'srch.eq', 'srch.found'],
        1,
        [mark(cellId(j), 'found')],
      );
    }
    return s;
  },
};

const remove: Op = {
  label: 'Delete',
  arity: 1,
  *run(s0, [raw], { settings }) {
    const policy = settings.policy;
    const k = readNumber(raw!);
    if (k instanceof Error) return yield* badArg(s0, policy, 'delete', raw!, k, 'del.sig');
    const m = s0.m;
    const c: Ctx = { s: s0, extra: { hand: { text: String(k) } }, vars: { k, shifts: 0 }, policy };
    yield step(
      c,
      `delete(${k}): find it first, starting at h(${k}) = ${k} mod ${m} = ${home(k, m)}.`,
      ['del.sig'],
      2,
      [mark(cellId(home(k, m)), 'compare')],
    );
    const at = yield* find(s0, k, c, 'del');
    if (at === null) return s0;
    const gone = s0.slots[at]!;
    c.s = { ...setSlot(s0, at, null), order: s0.order.filter((x) => x !== k) };
    c.extra.hand = { text: String(k), uid: gone.uid };
    c.extra.formula = `slot ${at} emptied`;
    const robin = policy === 'robin';
    let hole = at;
    const shifted: number[] = [];
    const lines = robin
      ? ['del.loop', 'del.empty', 'del.eq', 'del.clear', 'del.shift']
      : ['del.loop', 'del.empty', 'del.eq', 'del.clear', 'del.scan'];
    // Look at the keys after the hole, and pull back those that may move.
    let j = hole;
    for (let q = 1; q < m; q++) {
      j = (j + 1) % m;
      const next = c.s.slots[j] ?? null;
      if (!next) break;
      const nd = dist(next.key, j, m);
      if (robin) {
        if (nd === 0) break;
      } else {
        // Algorithm R (Knuth): the key may move to the hole unless its home is cyclically in (hole, j].
        const r = home(next.key, m);
        const stays = hole <= j ? r > hole && r <= j : r > hole || r <= j;
        if (stays) {
          c.extra.formula = `${next.key}: home ${r} lies between ${hole} and ${j}`;
          yield step(
            c,
            `${next.key} in slot ${j} has its home at ${r}, after the hole at ${hole}: moving it back would put it before its home. It stays.`,
            lines,
            3,
            [mark(cellId(j), 'compare')],
          );
          continue;
        }
      }
      c.s = setSlot(setSlot(c.s, hole, next), j, null);
      c.vars.shifts = Number(c.vars.shifts) + 1;
      shifted.push(next.key);
      c.extra.formula = `${next.key}: slot ${j} → ${hole}`;
      yield step(
        c,
        robin
          ? `${next.key} in slot ${j} is ${nd} from home, so it moves back one, into slot ${hole}, now ${nd - 1} from home.`
          : `${next.key} in slot ${j} has its home at ${home(next.key, m)}, so it can move back into the hole at ${hole}.`,
        lines,
        2,
        [mark(cellId(hole), 'active'), mark(`v${next.uid}`, 'new')],
      );
      hole = j;
    }
    c.extra.hand = undefined;
    c.extra.formula = undefined;
    const stop = c.s.slots[(hole + 1) % m];
    yield step(
      c,
      `${shifted.length ? `Shifted back: ${shifted.join(', ')}. ` : ''}${
        robin
          ? `The next slot ${stop ? `holds ${stop.key}, already at its home` : 'is empty'}, so the shifting stops. No tombstone: every key is still reachable, and each key that moved is one closer to home.`
          : 'No key after the hole can move back, so the shifting stops. No tombstone needed.'
      } ${summary(c.s)}`,
      robin ? ['del.stop'] : ['del.stop'],
      1,
      [mark(cellId(hole), 'compare')],
    );
    return c.s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s0, _a, { settings }) {
    const s: S = { ...init({ ...settings, m: s0.m }), nextUid: s0.nextUid };
    yield step(
      { s, extra: {}, vars: {}, policy: settings.policy },
      'clear(): every slot is empty again.',
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

export function pseudocode(settings: RobinSettings): PseudoBlock[] {
  const robin = settings.policy === 'robin';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert k:'),
        L('ins.full', 1, 'if n == m: error "table full"', 'Give up if every slot is taken.'),
        L('ins.init', 1, 'x = k; j = h(k); d = 0', 'Start at the home slot of k, distance 0.'),
        L('ins.loop', 1, 'loop', 'Repeat:'),
        L(
          'ins.empty',
          2,
          'if T[j] == nil: T[j] = x; return',
          'if slot j is empty, put the key in hand there and stop;',
        ),
        L(
          'ins.dup',
          2,
          'if T[j] == k: return  // already there',
          'if it holds k, k is already in the table;',
        ),
        ...(robin
          ? [
              L(
                'ins.rich',
                2,
                'if dist(T[j], j) < d',
                'if the key there is closer to its home than d,',
              ),
              L(
                'ins.swap',
                3,
                'swap x and T[j]; d = dist(x, j)',
                'swap: the poorer key takes the slot, and carry the richer one on.',
              ),
            ]
          : []),
        L(
          'ins.next',
          2,
          'j = (j + 1) mod m; d = d + 1',
          'Go to the next slot, one further from home.',
        ),
        L('ins.store', 2, '// stored', 'The key in hand is stored.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To search for k:'),
        L(
          'srch.loop',
          1,
          'for d = 0 to m − 1, j = (h(k) + d) mod m',
          'walk forward from its home slot;',
        ),
        L('srch.empty', 2, 'if T[j] == nil: return nil', 'an empty slot means k is not there;'),
        L('srch.eq', 2, 'if T[j] == k: return j', 'if slot j holds k, stop;'),
        ...(robin
          ? [
              L(
                'srch.early',
                2,
                'if dist(T[j], j) < d: return nil',
                'a key closer to home than d means k would have been placed by now.',
              ),
            ]
          : []),
        L('srch.found', 3, '// found', 'Found it.'),
        L('srch.end', 1, 'return nil', 'Every slot probed: not there.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete k:'),
        L(
          'del.loop',
          1,
          'for d = 0 to m − 1, j = (h(k) + d) mod m',
          'walk forward from its home slot, as search does;',
        ),
        L('del.empty', 2, 'if T[j] == nil: return', 'an empty slot means k is not there;'),
        L('del.eq', 2, 'if T[j] == k: break', 'stop at the slot that holds k;'),
        ...(robin
          ? [
              L(
                'del.early',
                2,
                'if dist(T[j], j) < d: return',
                'a key closer to home than d means k is not there.',
              ),
            ]
          : []),
        L('del.clear', 1, 'T[j] = nil', 'empty its slot,'),
        ...(robin
          ? [
              L(
                'del.shift',
                1,
                'while T[j+1] ≠ nil and dist(T[j+1], j+1) > 0: move it back to j; j = j + 1',
                'and pull each following key back one slot, until an empty slot or a key at home.',
              ),
            ]
          : [
              L(
                'del.scan',
                1,
                'for each key after the hole: move it into the hole if its home is not between them',
                'and move later keys back into the hole when that does not put them before their home (Knuth).',
              ),
            ]),
        L('del.stop', 1, 'return  // no tombstone', 'No tombstone is needed.'),
        L('del.end', 1, 'return', 'Every slot probed: not there.'),
      ],
    },
    {
      op: 'clear',
      lines: [L('clr.sig', 0, 'clear(): T[0 … m − 1] = nil', 'To start again, empty every slot.')],
    },
  ];
}

export function initialSay(state: S, settings: RobinSettings): string {
  return settings.policy === 'robin'
    ? `An empty table of m = ${state.m} slots, with h(k) = k mod ${state.m} and Robin Hood linear probing: a key further from home takes the slot of a key closer to home. The number under a key is its probe distance d.`
    : `An empty table of m = ${state.m} slots, with plain linear probing and h(k) = k mod ${state.m}. The number under a key is its probe distance d.`;
}

export function initialVars(state: S, settings: RobinSettings) {
  return readouts(state, settings.policy);
}

export function describe(state: S): string {
  const n = count(state);
  if (n === 0) return `Empty table with ${state.m} slots.`;
  const parts = state.slots
    .map((c, j) => (c ? `${j}: ${c.key} (d ${dist(c.key, j, state.m)})` : ''))
    .filter(Boolean);
  return `Table with ${state.m} slots and ${n} keys. ${parts.join(', ')}.`;
}
