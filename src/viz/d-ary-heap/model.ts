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
import { nodeShapeId } from '../../layouts/binary-tree';
import { cellId, heapEdgeId } from '../../layouts/heap';

/** One key in the heap. The uid follows the key wherever it moves, in the tree and the array. */
export interface HeapItem {
  uid: number;
  key: number;
}

export interface DHeapState {
  /** The array, in order: items[0] is the root. Positions here are always 0-based. */
  items: HeapItem[];
  nextUid: number;
}

export interface DHeapSettings {
  [key: string]: Scalar;
  /** Children per node, 2 to 5. */
  d: number;
  /** max: the largest key is on top (CLRS). min: the smallest is. */
  order: 'max' | 'min';
  /** one: A[1..n] (CLRS). zero: A[0..n − 1]. */
  index: 'one' | 'zero';
}

export interface DHeapExtra {
  /** A key handed back, drawn in a box beside the root. */
  out?: { key: number; label: string; from?: number };
  /** An argument that was refused. */
  arg?: { label: string; text: string };
  /** Bottom-up build: positions before this one (0-based) have not been sifted down yet. */
  todo?: number;
}

type S = DHeapState;
type X = DHeapExtra;
type Op = OpSpec<S, DHeapSettings, X>;
type HStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const CAPACITY = 31;

export const defaults: DHeapSettings = { d: 3, order: 'max', index: 'one' };

export function init(): S {
  return { items: [], nextUid: 1 };
}

export const arity = (st: DHeapSettings) => Math.min(5, Math.max(2, Math.round(Number(st.d) || 3)));
export const parentOf = (p: number, d: number) => Math.floor((p - 1) / d);
export const childrenOf = (p: number, d: number, n: number) => {
  const out: number[] = [];
  for (let j = 1; j <= d; j++) if (d * p + j < n) out.push(d * p + j);
  return out;
};

/** Edges on the longest root-to-leaf path: the depth of the last position. */
export function heightOf(n: number, d: number): number {
  if (n === 0) return -1;
  let h = 0;
  for (let p = n - 1; p > 0; p = parentOf(p, d)) h++;
  return h;
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const node = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cmp = (a: number, b: number) =>
  a < b ? `${a} < ${b}` : a > b ? `${a} > ${b}` : `${a} = ${b}`;

// ---------------------------------------------------------------------------------------------
// Arguments

const INT = /^-?\d+$/;

export function parseKey(raw: Value): number | Error {
  const t = String(raw).trim();
  if (!INT.test(t)) return new Error(`Keys are whole numbers from ${MIN_KEY} to ${MAX_KEY}.`);
  const k = Number(t);
  if (k < MIN_KEY || k > MAX_KEY)
    return new Error(`Keep keys between ${MIN_KEY} and ${MAX_KEY} so they fit in the nodes.`);
  return k;
}

export function parseKeyList(raw: Value): number[] | Error {
  const tokens = String(raw)
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length === 0) return new Error('Type the keys to build from, such as 5 3 8 1.');
  if (tokens.length > CAPACITY)
    return new Error(
      `The array holds at most ${CAPACITY} keys, and the list has ${tokens.length}.`,
    );
  const keys: number[] = [];
  for (const t of tokens) {
    const k = parseKey(t);
    if (k instanceof Error)
      return new Error(tokens.length > 1 ? `"${t}": ${k.message}` : k.message);
    keys.push(k);
  }
  return keys;
}

export function parseIndex(raw: Value): number | Error {
  const t = String(raw).trim();
  if (!INT.test(t) || Math.abs(Number(t)) > 999)
    return new Error('An index is a whole number, such as 3.');
  return Number(t);
}

// ---------------------------------------------------------------------------------------------
// Conventions

export interface Conv {
  d: number;
  max: boolean;
  base: 0 | 1;
  ix(p: number): number;
  beats(a: number, b: number): boolean;
  /** "parent(7) = ⌊(7 − 2)/3⌋ + 1 = 2" */
  parentOf(p: number): string;
  /** "A[5..7]": the children of position p (0-based), clipped to n. */
  kids(p: number, n: number): string;
  kind: string;
  top: string;
  largest: string;
  bigger: string;
  best: string;
  extract: string;
  build: string;
  /** What moving a key toward the root is called: increase-key or decrease-key. */
  better: string;
}

export function conv(st: DHeapSettings): Conv {
  const d = arity(st);
  const max = st.order !== 'min';
  const base: 0 | 1 = st.index === 'zero' ? 0 : 1;
  const ix = (p: number) => p + base;
  return {
    d,
    max,
    base,
    ix,
    beats: (a, b) => (max ? a > b : a < b),
    parentOf: (p) =>
      base === 1
        ? `parent(${ix(p)}) = ⌊(${ix(p)} − 2)/${d}⌋ + 1 = ${ix(parentOf(p, d))}`
        : `parent(${p}) = ⌊(${p} − 1)/${d}⌋ = ${parentOf(p, d)}`,
    kids: (p, n) => {
      const cs = childrenOf(p, d, n);
      if (cs.length === 0) return 'none';
      return cs.length === 1 ? `A[${ix(cs[0]!)}]` : `A[${ix(cs[0]!)}..${ix(cs[cs.length - 1]!)}]`;
    },
    kind: `${d}-ary ${max ? 'max' : 'min'}-heap`,
    top: max ? 'max' : 'min',
    largest: max ? 'largest' : 'smallest',
    bigger: max ? 'bigger' : 'smaller',
    best: max ? 'largest' : 'smallest',
    extract: max ? 'extractMax' : 'extractMin',
    build: max ? 'buildMaxHeap' : 'buildMinHeap',
    better: max ? 'increase-key' : 'decrease-key',
  };
}

// ---------------------------------------------------------------------------------------------
// A working copy of the heap.

class Work {
  items: HeapItem[];
  nextUid: number;
  comparisons = 0;
  swaps = 0;
  levels = 0;

  constructor(s: S) {
    this.items = s.items.map((x) => ({ ...x }));
    this.nextUid = s.nextUid;
  }

  get n(): number {
    return this.items.length;
  }

  at(p: number): HeapItem {
    return this.items[p]!;
  }

  snap(): S {
    return { items: this.items.map((x) => ({ ...x })), nextUid: this.nextUid };
  }

  swap(p: number, q: number): void {
    const a = this.items[p]!;
    this.items[p] = this.items[q]!;
    this.items[q] = a;
    this.swaps += 1;
  }
}

interface Ctx {
  W: Work;
  K: Conv;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): HStep {
  const state = c.W.snap();
  const n = state.items.length;
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      N: n,
      d: c.K.d,
      height: heightOf(n, c.K.d),
      ...c.vars,
      comparisons: c.W.comparisons,
      swaps: c.W.swaps,
    },
    level,
    extra: { ...c.extra },
  };
}

function ctx(s: S, settings: DHeapSettings, vars: Record<string, Scalar> = {}): Ctx {
  return { W: new Work(s), K: conv(settings), extra: {}, vars };
}

function* refuse(
  s: S,
  settings: DHeapSettings,
  say: string,
  lines: string[],
  arg: { label: string; text: string },
): Generator<HStep, S, void> {
  const c = ctx(s, settings);
  c.extra.arg = arg;
  yield step(c, say, lines, 1, [mark('arg-box', 'error')]);
  return s;
}

const summary = (n: number, d: number) => `N = ${n}, height = ${heightOf(n, d)}.`;
const LOOP_VARS = ['i', 'parent', 'c', 'largest', 'smallest'];
function forget(c: Ctx, names: string[] = LOOP_VARS): void {
  for (const k of names) delete c.vars[k];
}

// ---------------------------------------------------------------------------------------------
// Sift up: one comparison per level. Sift down: up to d comparisons per level.

function* siftUp(c: Ctx, start: number, done: string): Generator<HStep, number, void> {
  const { W, K } = c;
  let p = start;
  for (;;) {
    const x = W.at(p);
    c.vars.i = K.ix(p);
    if (p === 0) {
      delete c.vars.parent;
      yield step(
        c,
        `i = ${K.ix(0)}: ${x.key} is at the root, so it stops there.${done}`,
        ['up.loop'],
        2,
        [node(x.uid, 'done')],
      );
      return p;
    }
    const q = parentOf(p, K.d);
    const y = W.at(q);
    c.vars.parent = K.ix(q);
    W.comparisons += 1;
    yield step(
      c,
      `Compare ${x.key} with its parent: ${K.parentOf(p)}, and A[${K.ix(q)}] = ${y.key}.`,
      ['up.loop', 'f.parent'],
      3,
      [node(x.uid, 'active'), node(y.uid, 'compare'), mark(heapEdgeId(p), 'active')],
    );
    if (!K.beats(x.key, y.key)) {
      yield step(
        c,
        `${cmp(y.key, x.key)}, so ${x.key} stays at A[${K.ix(p)}]: its parent is ${K.max ? 'at least as big' : 'no bigger'}. One comparison per level on the way up.${done}`,
        ['up.loop'],
        2,
        [node(x.uid, 'done'), node(y.uid, 'compare')],
      );
      return p;
    }
    W.swap(p, q);
    W.levels += 1;
    c.vars.i = K.ix(q);
    yield step(
      c,
      `${cmp(x.key, y.key)}: ${x.key} is ${K.bigger} than its parent, so swap them. ${x.key} moves up to A[${K.ix(q)}].`,
      ['up.swap', 'up.next'],
      2,
      [node(x.uid, 'active'), node(y.uid, 'visit'), mark(heapEdgeId(p), 'active')],
    );
    p = q;
  }
}

function* siftDown(c: Ctx, start: number, done: string): Generator<HStep, number, void> {
  const { W, K } = c;
  let p = start;
  for (;;) {
    const x = W.at(p);
    const n = W.n;
    const kids = childrenOf(p, K.d, n);
    c.vars.i = K.ix(p);
    delete c.vars.c;
    if (kids.length === 0) {
      c.vars[K.best] = K.ix(p);
      yield step(
        c,
        `siftDown(${K.ix(p)}): ${x.key} has no children, so it stops here.${done}`,
        ['dn.best', 'dn.for', 'dn.check'],
        2,
        [node(x.uid, 'done')],
      );
      return p;
    }
    let b = p;
    c.vars[K.best] = K.ix(b);
    yield step(
      c,
      `siftDown(${K.ix(p)}): the children of A[${K.ix(p)}] = ${x.key} are ${K.kids(p, n)}. Find the ${K.largest} of ${x.key} and its ${plural(kids.length, 'child', 'children')}: ${plural(kids.length, 'comparison')}.`,
      ['dn.best', 'f.child'],
      3,
      [node(x.uid, 'active'), ...kids.map((q) => node(W.at(q).uid, 'compare'))],
    );
    for (const q of kids) {
      const ck = W.at(q).key;
      const bk = W.at(b).key;
      W.comparisons += 1;
      const won = K.beats(ck, bk);
      if (won) b = q;
      c.vars.c = K.ix(q);
      c.vars[K.best] = K.ix(b);
      yield step(
        c,
        `Compare A[${K.ix(q)}] = ${ck} with A[${K.best}] = ${bk}: ${cmp(ck, bk)}, so ${K.best} ${won ? `= ${K.ix(q)}` : `stays ${K.ix(b)}`}.`,
        won ? ['dn.for', 'dn.cmp', 'dn.set'] : ['dn.for', 'dn.cmp'],
        3,
        [node(x.uid, 'active'), node(W.at(q).uid, 'compare'), mark(heapEdgeId(q), 'active')],
      );
    }
    delete c.vars.c;
    const kidMarks = kids.map((q) => node(W.at(q).uid, 'compare'));
    if (b === p) {
      yield step(
        c,
        `No child of ${x.key} is ${K.bigger} than it, so ${x.key} stays at A[${K.ix(p)}].${done}`,
        ['dn.check'],
        2,
        [node(x.uid, 'done'), ...kidMarks],
      );
      return p;
    }
    const y = W.at(b);
    W.swap(p, b);
    W.levels += 1;
    yield step(
      c,
      `The ${K.largest} child is ${y.key} at A[${K.ix(b)}], and ${cmp(y.key, x.key)}, so swap them. ${x.key} moves down to A[${K.ix(b)}]; keep going from there.`,
      ['dn.check', 'dn.swap', 'dn.rec'],
      2,
      [node(x.uid, 'active'), node(y.uid, 'visit'), mark(heapEdgeId(b), 'active')],
    );
    p = b;
  }
}

// ---------------------------------------------------------------------------------------------

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    const key = parseKey(raw!);
    if (key instanceof Error)
      return yield* refuse(s, settings, `insert(${String(raw)}): ${key.message}`, ['ins.sig'], {
        label: 'key',
        text: String(raw),
      });
    const c = ctx(s, settings, { key });
    const { W, K } = c;
    const name = `insert(${key})`;
    if (W.n >= CAPACITY) {
      c.extra.arg = { label: 'key', text: String(key) };
      yield step(
        c,
        `${name}: the array is full (n = ${W.n}). Heap overflow: ${key} is not inserted.`,
        ['ins.full', 'ins.overflow'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    const uid = W.nextUid++;
    W.items.push({ uid, key });
    const p = W.n - 1;
    c.vars.i = K.ix(p);
    yield step(
      c,
      p === 0
        ? `${name}: the heap is empty, so ${key} goes in A[${K.ix(0)}] and is the root.`
        : `${name}: ${key} goes in A[${K.ix(p)}], the first free slot, so the tree stays complete. Its parent is A[${K.ix(parentOf(p, K.d))}].`,
      ['ins.grow', 'ins.store', 'ins.sift'],
      2,
      [node(uid, 'new'), mark(cellId(p), 'new')],
    );
    yield* siftUp(c, p, '');
    forget(c);
    yield step(
      c,
      `${key} is in. Insert took ${plural(W.comparisons, 'comparison')}: at most one per level, and a ${K.d}-ary heap has only ${heightOf(W.n, K.d)} levels below the root. ${summary(W.n, K.d)}`,
      ['ins.sig'],
      1,
      [node(uid, 'done')],
    );
    return W.snap();
  },
};

const extract: Op = {
  label: 'Extract',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx(s, settings);
    const { W, K } = c;
    const name = `${K.extract}()`;
    if (W.n === 0) {
      yield step(
        c,
        `${name}: the heap is empty. Heap underflow: there is nothing to extract.`,
        ['ext.empty'],
        1,
        [mark('empty', 'error')],
      );
      return s;
    }
    const top = W.at(0);
    c.vars[K.top] = top.key;
    c.extra.out = { key: top.key, label: K.top, from: top.uid };
    yield step(
      c,
      `${name}: the ${K.largest} key is at the root, so ${K.top} = A[${K.ix(0)}] = ${top.key}.`,
      ['ext.empty', 'ext.top'],
      2,
      [node(top.uid, 'found'), mark('out', 'found')],
    );
    const last = W.items.pop()!;
    if (W.n > 0) {
      W.items[0] = last;
      yield step(
        c,
        `Move the last key, ${last.key}, into the root and shrink the heap to n = ${W.n}. Now sift it down: at each level it is compared with up to ${K.d} children.`,
        ['ext.last', 'ext.shrink', 'ext.down'],
        2,
        [node(last.uid, 'active'), mark('out', 'found')],
      );
      yield* siftDown(c, 0, '');
    }
    forget(c);
    c.vars.returned = top.key;
    yield step(
      c,
      W.n === 0
        ? `${top.key} was the only key, so the heap is now empty. Return ${top.key}.`
        : `Return ${top.key}. Extract took ${plural(W.comparisons, 'comparison')}: up to ${K.d} per level on the way down. ${summary(W.n, K.d)}`,
      ['ext.return'],
      1,
      [mark('out', 'found')],
    );
    return W.snap();
  },
};

const build: Op = {
  label: 'Build heap',
  arity: 1,
  *run(s, [raw], { settings }) {
    const keys = parseKeyList(raw!);
    const K0 = conv(settings);
    if (keys instanceof Error)
      return yield* refuse(s, settings, `${K0.build}: ${keys.message}`, ['bld.sig'], {
        label: 'list',
        text: String(raw),
      });
    const c = ctx(s, settings);
    const { W, K } = c;
    W.items = keys.map((key) => ({ uid: W.nextUid++, key }));
    const n = keys.length;
    const lastInner = n > 1 ? parentOf(n - 1, K.d) : -1;
    c.extra.todo = lastInner + 1;
    yield step(
      c,
      `${K.build}(${keys.join(' ')}): copy the ${plural(n, 'key')} into the array as they are. ${lastInner < 0 ? 'One key is already a heap.' : `Every slot after A[${K.ix(lastInner)}], the parent of the last slot, is a leaf. Sift down from there back to the root.`}`,
      ['bld.n', 'bld.copy'],
      2,
      W.items.map((x) => node(x.uid, 'new')),
    );
    for (let p = lastInner; p >= 0; p--) {
      c.extra.todo = p;
      forget(c);
      c.vars.i = K.ix(p);
      const x = W.at(p);
      yield step(
        c,
        `i = ${K.ix(p)}: the subtrees under A[${K.ix(p)}] are heaps already. Sift ${x.key} down.`,
        ['bld.loop', 'bld.down'],
        2,
        [node(x.uid, 'active')],
      );
      yield* siftDown(c, p, '');
    }
    delete c.extra.todo;
    forget(c);
    yield step(
      c,
      `The array is a ${K.kind}. Building it took ${plural(W.comparisons, 'comparison')} and ${plural(W.swaps, 'swap')}. ${summary(W.n, K.d)}`,
      ['bld.sig'],
      1,
      [],
    );
    return W.snap();
  },
};

const update: Op = {
  label: 'Update key',
  arity: 2,
  *run(s, [rawI, rawK], { settings }) {
    const K = conv(settings);
    const i = parseIndex(rawI!);
    const key = parseKey(rawK!);
    const name = `updateKey(${String(rawI)}, ${String(rawK)})`;
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, ['upd.sig'], {
        label: 'i',
        text: String(rawI),
      });
    if (key instanceof Error)
      return yield* refuse(s, settings, `${name}: ${key.message}`, ['upd.sig'], {
        label: 'key',
        text: String(rawK),
      });
    const p = i - K.base;
    const n = s.items.length;
    if (p < 0 || p >= n)
      return yield* refuse(
        s,
        settings,
        `${name}: there is no A[${i}]. ${n === 0 ? 'The heap is empty.' : `The heap holds A[${K.base}..${n - 1 + K.base}].`}`,
        ['upd.range', 'upd.error'],
        { label: 'i', text: String(i) },
      );
    const c = ctx(s, settings, { i, key });
    const { W } = c;
    const item = W.at(p);
    const old = item.key;
    c.vars.old = old;
    if (key === old) {
      yield step(
        c,
        `${name}: A[${i}] is ${old} already, so nothing changes.`,
        ['upd.range', 'upd.old', 'upd.set'],
        1,
        [node(item.uid, 'found')],
      );
      return s;
    }
    item.key = key;
    const up = K.beats(key, old);
    yield step(
      c,
      up
        ? `${name}: A[${i}] changes from ${old} to ${key}. That is ${K.better}: the key can only clash with its parent, so sift it up, one comparison per level.`
        : `${name}: A[${i}] changes from ${old} to ${key}. The key moved away from the top, so it can only clash with its children: sift it down, up to ${K.d} comparisons per level.`,
      ['upd.range', 'upd.old', 'upd.set', up ? 'upd.up' : 'upd.down'],
      2,
      [node(item.uid, 'active')],
    );
    if (up) yield* siftUp(c, p, '');
    else yield* siftDown(c, p, '');
    forget(c);
    yield step(
      c,
      `A[${i}] is now ${key}, and the heap is in order again after ${plural(W.comparisons, 'comparison')}. ${summary(W.n, K.d)}`,
      ['upd.sig'],
      1,
      [node(item.uid, 'done')],
    );
    return W.snap();
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx({ items: [], nextUid: s.nextUid }, settings);
    yield step(c, 'clear(): set n = 0. The heap is empty.', ['clr.reset'], 1, []);
    return c.W.snap();
  },
};

export const ops = { insert, extract, update, build, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode follows the order, the indexing and d.

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: DHeapSettings): PseudoBlock[] {
  const K = conv(settings);
  const one = K.base === 1;
  const d = K.d;
  const gt = K.max ? '>' : '<';
  const lt = K.max ? '<' : '>';
  const root = one ? 'A[1]' : 'A[0]';
  const lastSlot = one ? 'A[n]' : 'A[n − 1]';
  const B = K.best;
  const formulas = [
    L(
      'f.parent',
      0,
      one ? `parent(i) = ⌊(i − 2)/${d}⌋ + 1` : `parent(i) = ⌊(i − 1)/${d}⌋`,
      'A node’s parent sits this far toward the front of the array.',
    ),
    L(
      'f.child',
      0,
      one ? `child(i, j) = ${d}(i − 1) + j + 1` : `child(i, j) = ${d}i + j`,
      `Its ${d} children sit side by side, j = 1 to ${d}.`,
    ),
  ];
  const siftUp = [
    L('up.sig', 0, 'siftUp(i)', 'To move a key up:'),
    L(
      'up.loop',
      1,
      `while i > ${one ? 1 : 0} and A[i] ${gt} A[parent(i)]`,
      `While it is not the root and it is ${K.bigger} than its parent,`,
    ),
    L('up.swap', 2, 'swap A[i] and A[parent(i)]', 'swap it with the parent'),
    L('up.next', 2, 'i = parent(i)', 'and carry on from there.'),
  ];
  const siftDown = [
    L('dn.sig', 0, 'siftDown(i)', 'To move a key down:'),
    L('dn.best', 1, `${B} = i`, `Assume it is the ${K.largest} so far.`),
    L('dn.for', 1, `for j = 1 to ${d}`, 'Look at each child in turn:'),
    L(
      'dn.cmp',
      2,
      `c = child(i, j); if c ${one ? '≤ n' : '< n'} and A[c] ${gt} A[${B}]`,
      `if the child exists and is ${K.bigger} than the best so far,`,
    ),
    L('dn.set', 3, `${B} = c`, 'remember it.'),
    L('dn.check', 1, `if ${B} ≠ i`, 'If some child was better,'),
    L('dn.swap', 2, `swap A[i] and A[${B}]`, 'swap with that child'),
    L('dn.rec', 2, `siftDown(${B})`, 'and keep going down.'),
  ];
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(key)', 'To insert a key:'),
        L('ins.full', 1, 'if n == capacity', 'If the array is full,'),
        L('ins.overflow', 2, 'error "heap overflow"', 'stop.'),
        L('ins.grow', 1, 'n = n + 1', 'Make room for one more'),
        L('ins.store', 1, `${lastSlot} = key`, 'and put the key in the first free slot.'),
        L('ins.sift', 1, `siftUp(${one ? 'n' : 'n − 1'})`, 'Then sift it up.'),
        ...siftUp,
        ...formulas,
      ],
    },
    {
      op: 'extract',
      lines: [
        L('ext.sig', 0, `${K.extract}()`, `To remove the ${K.largest} key:`),
        L('ext.empty', 1, 'if n == 0: error "heap underflow"', 'If the heap is empty, stop.'),
        L('ext.top', 1, `${K.top} = ${root}`, `The ${K.largest} key is at the root.`),
        L('ext.last', 1, `${root} = ${lastSlot}`, 'Move the last key to the root'),
        L('ext.shrink', 1, 'n = n − 1', 'and shrink the heap.'),
        L('ext.down', 1, `siftDown(${one ? 1 : 0})`, 'Sift the new root down.'),
        L('ext.return', 1, `return ${K.top}`, `Hand back the ${K.largest} key.`),
        ...siftDown,
        ...formulas,
      ],
    },
    {
      op: 'update',
      lines: [
        L('upd.sig', 0, 'updateKey(i, key)', 'To change the key in slot i:'),
        L(
          'upd.range',
          1,
          one ? 'if i < 1 or i > n' : 'if i < 0 or i ≥ n',
          'If there is no slot i,',
        ),
        L('upd.error', 2, 'error "no such slot"', 'stop.'),
        L('upd.old', 1, 'old = A[i]', 'Remember the old key'),
        L('upd.set', 1, 'A[i] = key', 'and write the new one.'),
        L(
          'upd.up',
          1,
          `if key ${gt} old: siftUp(i)`,
          `If it got ${K.bigger} (${K.better}), sift it up;`,
        ),
        L('upd.down', 1, `elseif key ${lt} old: siftDown(i)`, 'otherwise sift it down.'),
        ...siftUp,
        ...siftDown,
        ...formulas,
      ],
    },
    {
      op: 'build',
      lines: [
        L('bld.sig', 0, `${K.build}(list)`, 'To build a heap from a list:'),
        L('bld.n', 1, 'n = length(list)', 'Count the keys'),
        L('bld.copy', 1, `${one ? 'A[1..n]' : 'A[0..n − 1]'} = list`, 'and copy them in.'),
        L(
          'bld.loop',
          1,
          `for i = parent(${one ? 'n' : 'n − 1'}) downto ${one ? 1 : 0}`,
          'From the last node with a child back to the root,',
        ),
        L('bld.down', 2, 'siftDown(i)', 'sift each key down.'),
        ...siftDown,
        ...formulas,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the heap:'),
        L('clr.reset', 1, 'n = 0', 'say it holds no keys.'),
      ],
    },
  ];
}

export function initialSay(_s: S, settings: DHeapSettings): string {
  const K = conv(settings);
  return `An empty ${K.kind}: every node has up to ${K.d} children, stored side by side in one array. Insert some keys, or build a heap from a list.`;
}

export function initialVars(s: S, settings: DHeapSettings): Record<string, Scalar> {
  const d = arity(settings);
  const n = s.items.length;
  return { N: n, d, height: heightOf(n, d), comparisons: 0, swaps: 0 };
}

export function describe(s: S, settings: DHeapSettings): string {
  const K = conv(settings);
  const n = s.items.length;
  if (n === 0) return `An empty ${K.kind}.`;
  return `A ${K.kind} with ${plural(n, 'key')} and height ${heightOf(n, K.d)}. The root is ${s.items[0]!.key}. The array holds ${s.items.map((x) => x.key).join(', ')}.`;
}
