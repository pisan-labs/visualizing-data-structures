import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum, MAX_KEY, readNumber, shuffle } from '../hash-chaining/hashing';

export interface Item {
  uid: number;
  key: number;
}

export interface BucketState {
  /** Number of buckets. */
  B: number;
  /** Slots per bucket. */
  b: number;
  /** buckets[i][s]: slot s of bucket i. */
  buckets: (Item | null)[][];
  /** The shared overflow area, in the order keys arrived. */
  overflow: Item[];
  nextUid: number;
}

export interface BucketSettings {
  [key: string]: Scalar;
  B: number;
  b: number;
  /** area: keys that do not fit go to a shared overflow area. report: the insert fails. */
  overflow: 'area' | 'report';
}

export interface BucketExtra {
  /** The key being worked on, in a box at the top left. `uid` when it will be stored. */
  arg?: { text: string; uid?: number; error?: boolean };
  formula?: string;
  /** The bucket being worked on. */
  bucket?: number;
}

type S = BucketState;
type X = BucketExtra;
type Op = OpSpec<S, BucketSettings, X>;
type BStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: BucketSettings = { B: 5, b: 2, overflow: 'area' };

export function init(settings: BucketSettings): S {
  return {
    B: settings.B,
    b: settings.b,
    buckets: Array.from({ length: settings.B }, () => Array(settings.b).fill(null)),
    overflow: [],
    nextUid: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const slotId = (i: number, s: number) => `b${i}-${s}`;
export const ovId = (p: number) => `ov-${p}`;
export const bucketId = (i: number) => `bucket-${i}`;

export const sizeOf = (s: S) =>
  s.buckets.reduce((a, bk) => a + bk.filter(Boolean).length, 0) + s.overflow.length;
const isFull = (bk: (Item | null)[]) => bk.every(Boolean);

function readouts(s: S): Record<string, Scalar> {
  const n = sizeOf(s);
  return {
    n,
    slots: s.B * s.b,
    α: Math.round((n / (s.B * s.b)) * 100) / 100,
    overflow: s.overflow.length,
  };
}

export function summary(s: S): string {
  const n = sizeOf(s);
  const o = s.overflow.length;
  return `n = ${n} in ${s.B * s.b} bucket slots (α = ${fmtNum(n / (s.B * s.b))})${
    o ? `, ${o} in the overflow area` : ''
  }.`;
}

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
): BStep {
  return {
    state: c.s,
    marks,
    say,
    lines,
    vars: { ...c.vars, ...readouts(c.s) },
    level,
    extra: { ...c.extra, ...more },
  };
}

function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The table is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function copy(s: S): S {
  return {
    ...s,
    buckets: s.buckets.map((bk) => [...bk]),
    overflow: [...s.overflow],
  };
}

/** The hash step every operation starts with. */
function hashStep(c: Ctx, name: string, k: number, then: string, lines: string[]) {
  const i = k % c.s.B;
  c.extra.formula = `h(${k}) = ${k} mod ${c.s.B} = ${i}`;
  c.extra.bucket = i;
  c.vars.i = i;
  c.vars.probes = 0;
  return {
    i,
    step: step(c, `${name}: h(${k}) = ${k} mod ${c.s.B} = ${i}. ${then}`, lines, 2, [
      mark(bucketId(i), 'active'),
    ]),
  };
}

// ---------------------------------------------------------------------------------------------
// insert

function* insertKey(s: S, raw: Value, settings: BucketSettings): Generator<BStep, S, void> {
  const k = readNumber(raw);
  if (k instanceof Error) return yield* badArg(s, 'insert', raw, k, 'ins.sig');
  const uid = s.nextUid;
  const c: Ctx = { s, extra: { arg: { text: String(k), uid } }, vars: { k } };
  const pre = k % s.B;
  const { i, step: h } = hashStep(
    c,
    `insert(${k})`,
    k,
    `Look through the ${plural(s.b, 'slot')} of bucket ${pre} for a free one, checking that ${k} is not already there.`,
    ['ins.sig', 'ins.hash'],
  );
  yield h;
  const bk = s.buckets[i]!;
  let free = -1;
  let probes = 0;
  for (let t = 0; t < s.b; t++) {
    const item = bk[t] ?? null;
    probes++;
    c.vars.probes = probes;
    if (item && item.key === k) {
      yield step(
        c,
        `Slot ${t} of bucket ${i} holds ${k} already, so nothing changes.`,
        ['ins.scan', 'ins.dup'],
        1,
        [mark(slotId(i, t), 'found')],
      );
      return s;
    }
    if (!item && free < 0) free = t;
    yield step(
      c,
      item
        ? `Slot ${t} of bucket ${i} holds ${item.key}.`
        : free === t
          ? `Slot ${t} of bucket ${i} is free. Remember it, and check the rest of the bucket for ${k}.`
          : `Slot ${t} of bucket ${i} is free too.`,
      ['ins.scan'],
      item ? 2 : 3,
      [mark(slotId(i, t), 'compare')],
    );
  }
  if (free >= 0) {
    const next = copy(s);
    next.buckets[i]![free] = { uid, key: k };
    next.nextUid = uid + 1;
    c.s = next;
    c.extra.arg = undefined;
    yield step(
      c,
      `${k} is not in bucket ${i}, and slot ${free} is free: ${k} goes there after ${plural(probes, 'probe')}. ${summary(next)}`,
      ['ins.free', 'ins.store'],
      1,
      [mark(slotId(i, free), 'new'), mark(`v${uid}`, 'done')],
    );
    return next;
  }
  if (settings.overflow === 'report') {
    c.extra.arg = { text: String(k), error: true };
    yield step(
      c,
      `Bucket ${i} is full. This table has no overflow area, so it reports an overflow: ${k} is not stored. The other buckets may have room, but ${k} can only go in bucket ${i}.`,
      ['ins.free', 'ins.full', 'ins.report'],
      1,
      [mark(bucketId(i), 'error'), mark('arg-box', 'error')],
    );
    return s;
  }
  yield step(
    c,
    s.overflow.length
      ? `Bucket ${i} is full. Keys that do not fit go to the overflow area, so check it for ${k} first.`
      : `Bucket ${i} is full. Keys that do not fit go to the overflow area, which is empty.`,
    ['ins.free', 'ins.full'],
    2,
    [mark(bucketId(i), 'compare')],
  );
  for (let p = 0; p < s.overflow.length; p++) {
    const item = s.overflow[p]!;
    probes++;
    c.vars.probes = probes;
    if (item.key === k) {
      yield step(
        c,
        `Overflow slot ${p} holds ${k} already, so nothing changes.`,
        ['ins.full', 'ins.ovscan'],
        1,
        [mark(ovId(p), 'found')],
      );
      return s;
    }
    yield step(c, `Overflow slot ${p} holds ${item.key}.`, ['ins.full', 'ins.ovscan'], 3, [
      mark(ovId(p), 'compare'),
    ]);
  }
  const next = copy(s);
  const at = next.overflow.length;
  next.overflow.push({ uid, key: k });
  next.nextUid = uid + 1;
  c.s = next;
  c.extra.arg = undefined;
  yield step(
    c,
    `${k} goes at the end of the overflow area, slot ${at}, after ${plural(probes, 'probe')}. A search for ${k} will look there once it finds bucket ${i} full. ${summary(next)}`,
    ['ins.append'],
    1,
    [mark(ovId(at), 'new'), mark(`v${uid}`, 'done')],
  );
  return next;
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    return yield* insertKey(s, raw!, settings);
  },
};

// ---------------------------------------------------------------------------------------------
// search and delete

function* find(
  s: S,
  raw: Value,
  settings: BucketSettings,
  op: 'search' | 'delete',
): Generator<BStep, S, void> {
  const search = op === 'search';
  const pre = search ? 'srch' : 'del';
  const area = settings.overflow === 'area';
  const k = readNumber(raw);
  if (k instanceof Error) return yield* badArg(s, op, raw, k, `${pre}.sig`);
  const c: Ctx = { s, extra: { arg: { text: String(k) } }, vars: { k } };
  const home = k % s.B;
  const { i, step: h } = hashStep(
    c,
    `${op}(${k})`,
    k,
    `Look through the ${plural(s.b, 'slot')} of bucket ${home}.`,
    [`${pre}.sig`, `${pre}.hash`],
  );
  yield h;
  const bk = s.buckets[i]!;
  let probes = 0;
  for (let t = 0; t < s.b; t++) {
    const item = bk[t] ?? null;
    probes++;
    c.vars.probes = probes;
    if (item && item.key === k) {
      if (search) {
        c.vars.found = true;
        yield step(
          c,
          `Slot ${t} of bucket ${i} holds ${k}: found it after ${plural(probes, 'probe')}.`,
          ['srch.scan', 'srch.found'],
          1,
          [mark(slotId(i, t), 'found')],
        );
        return s;
      }
      yield step(
        c,
        `Slot ${t} of bucket ${i} holds ${k}: found it.`,
        ['del.scan', 'del.found'],
        2,
        [mark(slotId(i, t), 'found')],
      );
      return yield* removeFromBucket(c, s, i, t, area);
    }
    yield step(
      c,
      item
        ? `Slot ${t} of bucket ${i} holds ${item.key}, not ${k}.`
        : `Slot ${t} of bucket ${i} is empty.`,
      [`${pre}.scan`],
      2,
      [mark(slotId(i, t), 'compare')],
    );
  }
  const miss = (say: string, lines: string[], marks: Mark[] = []) => {
    if (search) c.vars.found = false;
    return step(c, `${say} ${plural(probes, 'probe')}.`, lines, 1, marks);
  };
  if (!area) {
    yield miss(
      `${k} is not in bucket ${i}, and with no overflow area a key can only be in its own bucket: ${k} is not in the table.`,
      [`${pre}.miss`],
      [mark(bucketId(i), 'compare')],
    );
    return s;
  }
  if (!isFull(bk)) {
    yield miss(
      `${k} is not in bucket ${i}, and the bucket has a free slot, so ${k} never had to overflow: it is not in the table.`,
      [`${pre}.notfull`, `${pre}.miss`],
      [mark(bucketId(i), 'compare')],
    );
    return s;
  }
  yield step(
    c,
    s.overflow.length
      ? `Bucket ${i} is full, so ${k} may have overflowed. Search the overflow area from the start.`
      : `Bucket ${i} is full, so ${k} may have overflowed, but the overflow area is empty.`,
    [`${pre}.notfull`, `${pre}.ovscan`],
    2,
    [mark(bucketId(i), 'compare')],
  );
  for (let p = 0; p < s.overflow.length; p++) {
    const item = s.overflow[p]!;
    probes++;
    c.vars.probes = probes;
    if (item.key === k) {
      if (search) {
        c.vars.found = true;
        yield step(
          c,
          `Overflow slot ${p} holds ${k}: found it after ${plural(probes, 'probe')}.`,
          ['srch.ovscan', 'srch.ovfound'],
          1,
          [mark(ovId(p), 'found')],
        );
        return s;
      }
      const next = copy(s);
      next.overflow.splice(p, 1);
      c.s = next;
      c.extra.arg = undefined;
      yield step(
        c,
        `Overflow slot ${p} holds ${k}: remove it, and the keys after it move up one slot. ${summary(next)}`,
        ['del.ovfound', 'del.ovremove'],
        1,
        [],
      );
      return next;
    }
    yield step(c, `Overflow slot ${p} holds ${item.key}, not ${k}.`, [`${pre}.ovscan`], 2, [
      mark(ovId(p), 'compare'),
    ]);
  }
  yield miss(
    `${k} is not in the overflow area either: it is not in the table.`,
    search ? ['srch.ovscan', 'srch.end'] : ['del.ovscan', 'del.miss'],
  );
  return s;
}

/** Delete from slot t of bucket i, then pull a key of bucket i back from the overflow area. */
function* removeFromBucket(
  c: Ctx,
  s: S,
  i: number,
  t: number,
  area: boolean,
): Generator<BStep, S, void> {
  const next = copy(s);
  next.buckets[i]![t] = null;
  c.s = next;
  c.extra.arg = undefined;
  const p = next.overflow.findIndex((x) => x.key % s.B === i);
  if (!area || p < 0) {
    yield step(
      c,
      area
        ? `Empty slot ${t} of bucket ${i}. No key of bucket ${i} is waiting in the overflow area, so that is all. ${summary(next)}`
        : `Empty slot ${t} of bucket ${i}. ${summary(next)}`,
      area ? ['del.clear', 'del.pull'] : ['del.clear'],
      1,
      [mark(slotId(i, t), 'remove')],
    );
    return next;
  }
  yield step(
    c,
    `Empty slot ${t} of bucket ${i}. Bucket ${i} was full, and the overflow area holds ${next.overflow[p]!.key}, which also hashes to ${i}.`,
    ['del.clear', 'del.pull'],
    2,
    [mark(slotId(i, t), 'remove'), mark(ovId(p), 'active')],
  );
  const moved = next.overflow[p]!;
  const done = copy(next);
  done.overflow.splice(p, 1);
  done.buckets[i]![t] = moved;
  c.s = done;
  yield step(
    c,
    `Move ${moved.key} from the overflow area into the free slot, so a search for it can stop at bucket ${i} again. ${summary(done)}`,
    ['del.pull', 'del.move'],
    1,
    [mark(slotId(i, t), 'new'), mark(`v${moved.uid}`, 'done')],
  );
  return done;
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
    const empty: S = { ...init({ B: s.B, b: s.b, overflow: 'area' }), nextUid: s.nextUid };
    const c: Ctx = { s: empty, extra: {}, vars: {} };
    yield step(
      c,
      sizeOf(s)
        ? 'clear(): every slot of every bucket becomes free, and the overflow area is emptied.'
        : 'clear(): the table is already empty.',
      ['clr.set'],
      1,
      [],
    );
    return empty;
  },
};

// ---------------------------------------------------------------------------------------------
// fill: the "all colliding keys" preset, which needs B to pick its keys

export function collidingKeys(rng: Rng, B: number, count: number): number[] {
  const home = rng.int(0, B - 1);
  const pool: number[] = [];
  for (let k = home; k <= MAX_KEY; k += B) if (k > 0) pool.push(k);
  return shuffle(rng.next, pool).slice(0, count);
}

const fill: Op = {
  label: 'Fill',
  arity: 2,
  *run(s, [, count], { settings, rng }) {
    const n = Math.max(1, Math.min(30, Math.round(Number(count) || 0)));
    const keys = collidingKeys(rng, s.B, n);
    const home = keys[0]! % s.B;
    const c: Ctx = { s, extra: {}, vars: {} };
    yield step(
      c,
      `Insert ${keys.length} keys that all hash to bucket ${home} (each leaves remainder ${home} when divided by ${s.B}): ${keys.join(', ')}.`,
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

export function pseudocode(settings: BucketSettings): PseudoBlock[] {
  const area = settings.overflow === 'area';
  const head = (pre: string, sig: string, plain: string) => [
    L(`${pre}.sig`, 0, sig, plain),
    L(`${pre}.hash`, 1, 'i = h(k)', 'Hash k to find its bucket, i.'),
    L(`${pre}.scan`, 1, 'for each slot t of bucket i', 'Look at every slot of bucket i:'),
  ];
  const insert = [
    ...head('ins', 'insert(k)', 'To insert k:'),
    L('ins.dup', 2, 'if B[i][t] == k: return', 'if it holds k, k is already there: stop.'),
    L('ins.free', 1, 'if bucket i has a free slot t', 'If the bucket has a free slot,'),
    L('ins.store', 2, 'B[i][t] = k; return', 'put k in the first free slot.'),
    ...(area
      ? [
          L(
            'ins.full',
            1,
            'for each key x in the overflow area',
            'The bucket is full. For each overflow key,',
          ),
          L('ins.ovscan', 2, 'if x == k: return', 'if it is k, k is already there: stop.'),
          L(
            'ins.append',
            1,
            'append k to the overflow area',
            'Put k at the end of the overflow area.',
          ),
        ]
      : [
          L('ins.full', 1, 'else', 'The bucket is full:'),
          L('ins.report', 2, 'error "overflow"', 'report an overflow and do not store k.'),
        ]),
  ];
  const search = [
    ...head('srch', 'search(k)', 'To search for k:'),
    L('srch.found', 2, 'if B[i][t] == k: return found', 'if it holds k, found it.'),
    ...(area
      ? [
          L(
            'srch.notfull',
            1,
            'if bucket i has a free slot',
            'If the bucket has room, k never overflowed,',
          ),
          L('srch.miss', 2, 'return nil', 'so it is not in the table.'),
          L(
            'srch.ovscan',
            1,
            'for each key x in the overflow area',
            'Otherwise try every overflow key:',
          ),
          L('srch.ovfound', 2, 'if x == k: return found', 'if it is k, found it.'),
          L('srch.end', 1, 'return nil', 'k is not there either.'),
        ]
      : [L('srch.miss', 1, 'return nil', 'k can only be in bucket i, so it is not in the table.')]),
  ];
  const del = [
    ...head('del', 'delete(k)', 'To delete k:'),
    L('del.found', 2, 'if B[i][t] == k', 'if it holds k,'),
    ...(area
      ? [
          L('del.clear', 3, 'B[i][t] = nil', 'empty that slot,'),
          L(
            'del.pull',
            3,
            'if some x in the overflow area has h(x) == i',
            'and if a key of bucket i is waiting in the overflow area,',
          ),
          L('del.move', 4, 'move x into B[i][t]', 'move it into the free slot.'),
          L(
            'del.notfull',
            1,
            'if bucket i has a free slot: return',
            'If the bucket has room, k is not there.',
          ),
          L(
            'del.ovscan',
            1,
            'for each slot p of the overflow area',
            'Otherwise try every overflow slot:',
          ),
          L('del.ovfound', 2, 'if overflow[p] == k', 'if it holds k,'),
          L('del.ovremove', 3, 'remove overflow[p]; return', 'remove it; later slots move up.'),
          L('del.miss', 1, 'return', 'k is not in the table.'),
        ]
      : [
          L('del.clear', 3, 'B[i][t] = nil; return', 'empty that slot and stop.'),
          L('del.miss', 1, 'return', 'k can only be in bucket i, so it is not in the table.'),
        ]),
  ];
  return [
    { op: 'insert', lines: insert },
    { op: 'search', lines: search },
    { op: 'delete', lines: del },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To clear the table:'),
        L(
          'clr.set',
          1,
          'free every slot; empty the overflow area',
          'Free every slot and empty the overflow area.',
        ),
      ],
    },
  ];
}

export function initialSay(state: S, settings: BucketSettings): string {
  return `An empty table of ${state.B} buckets with ${plural(state.b, 'slot')} each, and h(k) = k mod ${state.B}. ${
    settings.overflow === 'area'
      ? 'A key whose bucket is full goes to the shared overflow area below.'
      : 'A key whose bucket is full is refused: the table reports an overflow.'
  }`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  const n = sizeOf(state);
  if (n === 0) return `Empty table of ${state.B} buckets with ${state.b} slots each.`;
  const parts = state.buckets
    .map((bk, i) => {
      const keys = bk.filter(Boolean).map((x) => x!.key);
      return keys.length ? `bucket ${i}: ${keys.join(', ')}` : '';
    })
    .filter(Boolean);
  const ov = state.overflow.map((x) => x.key);
  return `Table of ${state.B} buckets with ${state.b} slots each, holding ${n} ${n === 1 ? 'key' : 'keys'}. ${parts.join('; ')}.${
    ov.length ? ` Overflow area: ${ov.join(', ')}.` : ' The overflow area is empty.'
  }`;
}
