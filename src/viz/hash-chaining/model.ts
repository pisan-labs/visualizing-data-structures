import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  fmtAlpha,
  fmtKey,
  hashOf,
  isStringHash,
  loadFactor,
  MAX_KEY,
  readKey,
  shuffle,
  type HashFn,
  type Key,
} from '../_hashing/hashing';

/** One node of a chain. The uid lets the drawing follow the node when the chain changes. */
export interface Entry {
  uid: number;
  key: Key;
  /** Key-value mode: the value, or null when none was given. */
  value: string | null;
}

export interface ChainState {
  m: number;
  /** buckets[i] is the chain of T[i], first node first. */
  buckets: Entry[][];
  nextUid: number;
}

export interface ChainSettings {
  [key: string]: Scalar;
  /** Number of buckets. */
  m: number;
  hash: HashFn;
  /** keys: a set. pairs: a map from keys to values. */
  mode: 'keys' | 'pairs';
  /** Where a new key goes in its chain: first (CLRS) or last. */
  where: 'head' | 'tail';
}

export interface ChainExtra {
  /** The key being worked on, in a box at the top left. `uid` when it becomes a node. */
  arg?: { text: string; uid?: number; error?: boolean };
  /** The hash computation, drawn next to the key. */
  formula?: string;
  /** A node made but not linked in yet, drawn dashed at position `at` of its bucket. */
  pending?: { bucket: number; entry: Entry; at: number; next: number | null };
  /** A node being unlinked: still drawn, and the link before it goes around it. */
  removing?: { bucket: number; uid: number };
}

type S = ChainState;
type X = ChainExtra;
type Op = OpSpec<S, ChainSettings, X>;
type ChainStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: ChainSettings = { m: 7, hash: 'division', mode: 'keys', where: 'head' };

export function init(settings: ChainSettings): S {
  return {
    m: settings.m,
    buckets: Array.from({ length: settings.m }, () => []),
    nextUid: 1,
  };
}

export const nid = (uid: number) => `n${uid}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export const sizeOf = (s: S) => s.buckets.reduce((a, b) => a + b.length, 0);
export const longestOf = (s: S) => s.buckets.reduce((a, b) => Math.max(a, b.length), 0);
const showValue = (v: string | null) => (v === null ? 'no value' : v);

/** n, α and the longest chain, as one sentence. */
export function summary(s: S): string {
  const n = sizeOf(s);
  return `n = ${n}, ${fmtAlpha(n, s.m)}, longest chain ${longestOf(s)}.`;
}

function readouts(s: S): Record<string, Scalar> {
  const n = sizeOf(s);
  return { n, m: s.m, α: loadFactor(n, s.m), longest: longestOf(s) };
}

function withBucket(s: S, i: number, chain: Entry[], nextUid = s.nextUid): S {
  const buckets = s.buckets.map((b, j) => (j === i ? chain : b));
  return { m: s.m, buckets, nextUid };
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
): ChainStep {
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

/** A step that reports a bad argument and changes nothing. */
function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The table is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

/** The first step of every operation: hash the key and name its bucket. */
function hashStep(
  c: Ctx,
  name: string,
  k: Key,
  fn: HashFn,
  lines: string[],
  then: string,
): { i: number; step: ChainStep } {
  const h = hashOf(k, c.s.m, fn);
  c.extra.formula = h.short;
  c.vars.i = h.index;
  return {
    i: h.index,
    step: step(c, `${name}: ${h.say}. ${then}`, lines, 2, [mark(`T${h.index}`, 'active')]),
  };
}

// ---------------------------------------------------------------------------------------------
// insert

function* insertKey(s: S, raw: Value, settings: ChainSettings): Generator<ChainStep, S, void> {
  const a = readKey(raw, settings.hash);
  if (a instanceof Error) return yield* badArg(s, 'insert', raw, a, 'ins.sig');
  const pairs = settings.mode === 'pairs';
  const k = a.key;
  const v = pairs ? a.value : null;
  const uid = s.nextUid;
  const name = pairs ? `insert(${fmtKey(k)}, ${showValue(v)})` : `insert(${fmtKey(k)})`;
  const ignored =
    !pairs && a.value !== null
      ? ` This table stores keys only, so the value ${a.value} is ignored (see Options).`
      : '';
  const c: Ctx = {
    s,
    extra: { arg: { text: String(k), uid } },
    vars: pairs ? { k, v: showValue(v) } : { k },
  };
  const tail = settings.where === 'tail';
  const pre = hashOf(k, s.m, settings.hash).index;
  const chain = s.buckets[pre]!;
  const first = chain.length
    ? `Walk its chain first, to check that ${fmtKey(k)} is not already there.`
    : `Bucket ${pre} is empty, so ${fmtKey(k)} cannot be there yet.`;
  const { i, step: h } = hashStep(c, name, k, settings.hash, ['ins.hash', 'ins.init'], first);
  yield { ...h, say: h.say + ignored };

  let compares = 0;
  c.vars.compares = 0;
  for (let p = 0; p < chain.length; p++) {
    const e = chain[p]!;
    compares++;
    c.vars.compares = compares;
    if (e.key === k) {
      if (pairs) {
        const updated = chain.map((x, j) => (j === p ? { ...x, value: v } : x));
        c.s = withBucket(s, i, updated);
        c.extra.arg = undefined;
        yield step(
          c,
          `${fmtKey(e.key)} = ${fmtKey(k)}, so ${fmtKey(k)} is already a key. Its value changes from ${showValue(e.value)} to ${showValue(v)}; no new node. ${summary(c.s)}`,
          ['ins.loop', 'ins.eq', 'ins.update'],
          1,
          [mark(nid(e.uid), 'found')],
        );
        return c.s;
      }
      yield step(
        c,
        `${fmtKey(e.key)} = ${fmtKey(k)}, so ${fmtKey(k)} is already in bucket ${i}. A set keeps one copy, so nothing changes.`,
        ['ins.loop', 'ins.eq', 'ins.dup'],
        1,
        [mark(nid(e.uid), 'found')],
      );
      return s;
    }
    const nxt = chain[p + 1];
    yield step(
      c,
      nxt
        ? `${fmtKey(e.key)} ≠ ${fmtKey(k)}, so move on to ${fmtKey(nxt.key)}.`
        : `${fmtKey(e.key)} ≠ ${fmtKey(k)}, and that was the last node: ${fmtKey(k)} is not in bucket ${i}.`,
      ['ins.loop', 'ins.eq', 'ins.next'],
      2,
      [mark(nid(e.uid), 'compare')],
    );
  }

  const entry: Entry = { uid, key: k, value: v };
  c.extra.arg = undefined;
  const made = pairs
    ? `a node for ${fmtKey(k)} with value ${showValue(v)}`
    : `a node for ${fmtKey(k)}`;
  if (!tail) {
    const old = chain[0];
    yield step(
      c,
      old
        ? `Make ${made} and point its next at the current first node, ${fmtKey(old.key)}.`
        : `Make ${made}. Its next is T[${i}], which is nil, because the bucket is empty.`,
      ['ins.new', 'ins.link'],
      2,
      [mark(nid(uid), 'new'), mark(`${nid(uid)}.next`, 'active')],
      { pending: { bucket: i, entry, at: 0, next: old?.uid ?? null } },
    );
    c.s = withBucket(s, i, [entry, ...chain], uid + 1);
    yield step(
      c,
      `T[${i}] = the new node: ${fmtKey(k)} is now first in bucket ${i}. ${summary(c.s)}`,
      ['ins.head'],
      1,
      [mark(`T${i}.head`, 'active'), mark(nid(uid), 'done')],
    );
    return c.s;
  }

  const last = chain[chain.length - 1];
  yield step(
    c,
    `Make ${made}. Its next is nil, because it will be the last node.`,
    ['ins.new'],
    2,
    [mark(nid(uid), 'new')],
    { pending: { bucket: i, entry, at: chain.length, next: null } },
  );
  c.s = withBucket(s, i, [...chain, entry], uid + 1);
  if (!last) {
    yield step(
      c,
      `Bucket ${i} was empty, so T[${i}] = the new node. ${summary(c.s)}`,
      ['ins.empty', 'ins.first'],
      1,
      [mark(`T${i}.head`, 'active'), mark(nid(uid), 'done')],
    );
  } else {
    yield step(
      c,
      `${fmtKey(last.key)} was last, so ${fmtKey(last.key)}.next = the new node. ${fmtKey(k)} is now at the end of bucket ${i}. ${summary(c.s)}`,
      ['ins.empty', 'ins.else', 'ins.append'],
      1,
      [mark(`${nid(last.uid)}.next`, 'active'), mark(nid(uid), 'done')],
    );
  }
  return c.s;
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
    const a = readKey(raw!, settings.hash);
    if (a instanceof Error) return yield* badArg(s, 'search', raw!, a, 'srch.sig');
    const pairs = settings.mode === 'pairs';
    const k = a.key;
    const c: Ctx = { s, extra: { arg: { text: String(k) } }, vars: { k } };
    const pre = hashOf(k, s.m, settings.hash).index;
    const chain = s.buckets[pre]!;
    const { i, step: h } = hashStep(
      c,
      `search(${fmtKey(k)})`,
      k,
      settings.hash,
      ['srch.hash', 'srch.init'],
      chain.length
        ? `Walk bucket ${pre}'s chain, comparing keys.`
        : `Bucket ${pre} is empty, so there is nothing to compare.`,
    );
    yield h;
    let compares = 0;
    c.vars.compares = 0;
    for (let p = 0; p < chain.length; p++) {
      const e = chain[p]!;
      compares++;
      c.vars.compares = compares;
      if (e.key === k) {
        c.vars.found = true;
        if (pairs) c.vars.returned = showValue(e.value);
        const tries = `${compares} ${compares === 1 ? 'comparison' : 'comparisons'}`;
        yield step(
          c,
          pairs
            ? `${fmtKey(e.key)} = ${fmtKey(k)}: found it in bucket ${i} after ${tries}. Its value is ${showValue(e.value)}.`
            : `${fmtKey(e.key)} = ${fmtKey(k)}: found it in bucket ${i} after ${tries}.`,
          ['srch.loop', 'srch.eq', 'srch.found'],
          1,
          [mark(nid(e.uid), 'found')],
        );
        return s;
      }
      const nxt = chain[p + 1];
      yield step(
        c,
        nxt
          ? `${fmtKey(e.key)} ≠ ${fmtKey(k)}, so x = x.next, which is ${fmtKey(nxt.key)}.`
          : `${fmtKey(e.key)} ≠ ${fmtKey(k)}, so x = x.next, which is nil.`,
        ['srch.loop', 'srch.eq', 'srch.next'],
        2,
        [mark(nid(e.uid), 'compare')],
      );
    }
    c.vars.found = false;
    yield step(
      c,
      chain.length
        ? `x is nil, so ${fmtKey(k)} is not in the table. That took ${compares} ${compares === 1 ? 'comparison' : 'comparisons'}: the whole chain.`
        : `T[${i}] is nil, so ${fmtKey(k)} is not in the table. No comparisons at all.`,
      ['srch.loop', 'srch.miss'],
      1,
      [mark(`T${i}`, 'active')],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// delete

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const a = readKey(raw!, settings.hash);
    if (a instanceof Error) return yield* badArg(s, 'delete', raw!, a, 'del.sig');
    const k = a.key;
    const c: Ctx = { s, extra: { arg: { text: String(k) } }, vars: { k } };
    const pre = hashOf(k, s.m, settings.hash).index;
    const chain = s.buckets[pre]!;
    const { i, step: h } = hashStep(
      c,
      `delete(${fmtKey(k)})`,
      k,
      settings.hash,
      ['del.hash', 'del.init'],
      chain.length
        ? `Walk bucket ${pre}'s chain with x, and keep prev one node behind.`
        : `Bucket ${pre} is empty.`,
    );
    yield h;
    let compares = 0;
    c.vars.compares = 0;
    let at = -1;
    for (let p = 0; p < chain.length; p++) {
      const e = chain[p]!;
      compares++;
      c.vars.compares = compares;
      if (e.key === k) {
        at = p;
        yield step(
          c,
          `${fmtKey(e.key)} = ${fmtKey(k)}: found it${p === 0 ? ', first in its chain' : `, and prev is ${fmtKey(chain[p - 1]!.key)}`}.`,
          ['del.loop'],
          2,
          [mark(nid(e.uid), 'found'), ...(p > 0 ? [mark(nid(chain[p - 1]!.uid), 'visit')] : [])],
        );
        break;
      }
      const nxt = chain[p + 1];
      yield step(
        c,
        `${fmtKey(e.key)} ≠ ${fmtKey(k)}, so prev = ${fmtKey(e.key)} and x = ${nxt ? fmtKey(nxt.key) : 'nil'}.`,
        ['del.loop', 'del.next'],
        2,
        [mark(nid(e.uid), 'visit')],
      );
    }
    if (at < 0) {
      yield step(
        c,
        `x is nil, so ${fmtKey(k)} is not in the table. There is nothing to delete.`,
        ['del.loop', 'del.miss'],
        1,
        [mark(`T${i}`, 'active')],
      );
      return s;
    }
    const x = chain[at]!;
    const after = chain[at + 1];
    const nextName = after ? fmtKey(after.key) : 'nil';
    c.extra.arg = undefined;
    if (at === 0) {
      yield step(
        c,
        `x is the first node, so T[${i}] = x.next, which is ${nextName}. The bucket now starts after ${fmtKey(k)}.`,
        ['del.miss', 'del.check', 'del.head'],
        2,
        [mark(`T${i}.head`, 'active'), mark(nid(x.uid), 'remove')],
        { removing: { bucket: i, uid: x.uid } },
      );
    } else {
      const prev = chain[at - 1]!;
      yield step(
        c,
        `prev.next = x.next: ${fmtKey(prev.key)} now points at ${nextName}, so the chain skips ${fmtKey(k)}.`,
        ['del.miss', 'del.check', 'del.else', 'del.bypass'],
        2,
        [mark(`${nid(prev.uid)}.next`, 'active'), mark(nid(x.uid), 'remove')],
        { removing: { bucket: i, uid: x.uid } },
      );
    }
    c.s = withBucket(
      s,
      i,
      chain.filter((e) => e.uid !== x.uid),
    );
    yield step(
      c,
      `Nothing points at ${fmtKey(k)}'s node any more, so it is gone. ${summary(c.s)}`,
      at === 0 ? ['del.head'] : ['del.bypass'],
      1,
      [],
    );
    return c.s;
  },
};

// ---------------------------------------------------------------------------------------------
// clear

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { m: s.m, buckets: s.buckets.map(() => []), nextUid: s.nextUid };
    const c: Ctx = { s: empty, extra: {}, vars: {} };
    yield step(
      c,
      sizeOf(s)
        ? `clear(): set every T[i] to nil. All ${sizeOf(s)} nodes are gone, and n = 0.`
        : 'clear(): set every T[i] to nil. The table was already empty.',
      ['clr.loop', 'clr.set'],
      1,
      [],
    );
    return empty;
  },
};

// ---------------------------------------------------------------------------------------------
// The "All colliding keys" preset: keys that share a bucket under the current settings

/** Keys that all land in one bucket under these settings. */
export function collidingKeys(
  rng: Rng,
  settings: ChainSettings,
  count: number,
): { keys: Key[]; bucket: number } {
  const m = settings.m;
  const fn = settings.hash;
  const bucket = rng.int(0, m - 1);
  let pool: Key[];
  if (fn === 'sum') {
    // Anagrams have the same character sum, so they collide whatever m is.
    pool = anagrams(shuffle(rng.next, ['a', 'e', 'i', 'o', 'r', 's', 't', 'n']).slice(0, 4));
    const h = hashOf(pool[0]!, m, fn).index;
    return { keys: shuffle(rng.next, pool).slice(0, count), bucket: h };
  }
  if (isStringHash(fn)) {
    pool = [];
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (const a of letters)
      for (const b of letters) {
        const w = a + b;
        if (hashOf(w, m, fn).index === bucket) pool.push(w);
      }
  } else {
    pool = [];
    for (let k = 1; k <= MAX_KEY; k++) if (hashOf(k, m, fn).index === bucket) pool.push(k);
  }
  const keys = shuffle(rng.next, pool).slice(0, count);
  if (typeof keys[0] === 'number') (keys as number[]).sort((x, y) => x - y);
  return { keys, bucket };
}

function anagrams(letters: string[]): string[] {
  if (letters.length <= 1) return [letters.join('')];
  return letters.flatMap((c, i) =>
    anagrams([...letters.slice(0, i), ...letters.slice(i + 1)]).map((r) => c + r),
  );
}

/** The preset used to run as this one operation; it stays so links saved with it still open. */
const fill: Op = {
  label: 'Fill',
  arity: 2,
  *run(s, [, count], { settings, rng }) {
    const n = Math.max(1, Math.min(20, Math.round(Number(count) || 0)));
    const { keys, bucket } = collidingKeys(rng, settings, n);
    const why =
      settings.hash === 'sum'
        ? 'They are anagrams, so their character codes add up to the same total'
        : `They all hash to bucket ${bucket} when m = ${settings.m}`;
    const c: Ctx = { s, extra: {}, vars: {} };
    yield step(
      c,
      `Insert ${keys.length} keys chosen to collide: ${keys.map(fmtKey).join(', ')}. ${why}.`,
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

export function pseudocode(settings: ChainSettings): PseudoBlock[] {
  const pairs = settings.mode === 'pairs';
  const tail = settings.where === 'tail';
  const found = pairs
    ? L('ins.update', 3, 'x.value = v; return', 'it is already a key: replace its value and stop.')
    : L('ins.dup', 3, 'return', 'it is already there: stop.');
  const make = pairs
    ? L('ins.new', 1, 'new = node(k, v)', 'k is not there. Make a node for k and its value.')
    : L('ins.new', 1, 'new = node(k)', 'k is not there. Make a node for it.');
  const insert = tail
    ? [
        L('ins.sig', 0, pairs ? 'insert(k, v)' : 'insert(k)', 'To insert k:'),
        L('ins.hash', 1, 'i = h(k)', 'Hash k to find its bucket, i.'),
        L('ins.init', 1, 'last = nil; x = T[i]', 'Start at the first node of bucket i.'),
        L('ins.loop', 1, 'while x ≠ nil', 'While there are nodes left to check,'),
        L('ins.eq', 2, 'if x.key == k', 'if this node holds k,'),
        found,
        L(
          'ins.next',
          2,
          'last = x; x = x.next',
          'remember it as the last node so far and move on.',
        ),
        make,
        L('ins.empty', 1, 'if last == nil', 'If the bucket was empty,'),
        L('ins.first', 2, 'T[i] = new', 'the new node is its first node.'),
        L('ins.else', 1, 'else', 'Otherwise'),
        L('ins.append', 2, 'last.next = new', 'hang the new node after the last one.'),
      ]
    : [
        L('ins.sig', 0, pairs ? 'insert(k, v)' : 'insert(k)', 'To insert k:'),
        L('ins.hash', 1, 'i = h(k)', 'Hash k to find its bucket, i.'),
        L('ins.init', 1, 'x = T[i]', 'Start at the first node of bucket i.'),
        L('ins.loop', 1, 'while x ≠ nil', 'While there are nodes left to check,'),
        L('ins.eq', 2, 'if x.key == k', 'if this node holds k,'),
        found,
        L('ins.next', 2, 'x = x.next', 'move to the next node.'),
        make,
        L('ins.link', 1, 'new.next = T[i]', 'Point it at the old first node.'),
        L('ins.head', 1, 'T[i] = new', 'Make it the first node of bucket i.'),
      ];
  return [
    { op: 'insert', lines: insert },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To search for k:'),
        L('srch.hash', 1, 'i = h(k)', 'Hash k to find its bucket, i.'),
        L('srch.init', 1, 'x = T[i]', 'Start at the first node of bucket i.'),
        L('srch.loop', 1, 'while x ≠ nil', 'While there are nodes left to check,'),
        L('srch.eq', 2, 'if x.key == k', 'if this node holds k,'),
        L(
          'srch.found',
          3,
          pairs ? 'return x.value' : 'return x',
          pairs ? 'hand back its value.' : 'found it.',
        ),
        L('srch.next', 2, 'x = x.next', 'Otherwise move to the next node.'),
        L('srch.miss', 1, 'return nil', 'The chain ran out: k is not in the table.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete k:'),
        L('del.hash', 1, 'i = h(k)', 'Hash k to find its bucket, i.'),
        L(
          'del.init',
          1,
          'prev = nil; x = T[i]',
          'Start at the first node, with nothing behind it.',
        ),
        L('del.loop', 1, 'while x ≠ nil and x.key ≠ k', 'While this node is not k,'),
        L('del.next', 2, 'prev = x; x = x.next', 'step forward, keeping prev one node behind.'),
        L('del.miss', 1, 'if x == nil: return', 'If the chain ran out, k is not there: stop.'),
        L('del.check', 1, 'if prev == nil', 'If k is the first node,'),
        L('del.head', 2, 'T[i] = x.next', 'the bucket now starts at the node after it.'),
        L('del.else', 1, 'else', 'Otherwise'),
        L('del.bypass', 2, 'prev.next = x.next', 'make the node before k point past it.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To clear the table:'),
        L('clr.loop', 1, 'for i = 0 to m − 1', 'For every bucket,'),
        L('clr.set', 2, 'T[i] = nil', 'drop its chain.'),
      ],
    },
  ];
}

export function initialSay(state: S, settings: ChainSettings): string {
  const how = {
    division: 'h(k) = k mod m',
    multiplication: 'h(k) = ⌊m · frac(k · A)⌋',
    sum: 'the sum of the character codes, mod m',
    poly: 'a polynomial in the character codes, mod m',
  }[settings.hash];
  return `An empty hash table with m = ${state.m} buckets. Each bucket T[i] holds a chain of the keys that hash to i; for now every chain is empty (nil). The hash function is ${how}.`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S, settings?: ChainSettings): string {
  const n = sizeOf(state);
  const pairs = settings?.mode === 'pairs';
  const text = (e: Entry) => (pairs ? `${e.key}=${showValue(e.value)}` : String(e.key));
  if (n === 0) return `Empty hash table with ${state.m} buckets.`;
  const used = state.buckets
    .map((b, i) => (b.length ? `bucket ${i}: ${b.map(text).join(' → ')}` : ''))
    .filter(Boolean);
  const empty = state.m - used.length;
  return `Hash table with ${state.m} buckets and ${n} ${n === 1 ? 'key' : 'keys'}. ${used.join('; ')}.${
    empty ? ` ${empty} ${empty === 1 ? 'bucket is' : 'buckets are'} empty.` : ''
  }`;
}
