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
import { cellId, heapEdgeId, parentPos } from '../../layouts/heap';

/** One key in the heap. The uid follows the key wherever it moves, in the tree and the array. */
export interface HeapItem {
  uid: number;
  key: number;
}

export interface HeapState {
  /** The array, in order: items[0] is the root. Positions here are always 0-based. */
  items: HeapItem[];
  nextUid: number;
}

export interface HeapSettings {
  [key: string]: Scalar;
  /** max: the largest key is on top (CLRS). min: the smallest is. */
  order: 'max' | 'min';
  /** one: A[1..n], parent(i) = ⌊i/2⌋ (CLRS). zero: A[0..n − 1], parent(i) = ⌊(i − 1)/2⌋. */
  index: 'one' | 'zero';
  /** How build turns a list into a heap. */
  build: 'bottom-up' | 'insert';
}

export interface HeapExtra {
  /** A key handed back or removed, drawn in a box above the tree. */
  out?: { key: number; label: string; from?: number };
  /** An argument that was refused, drawn in a box above the tree. */
  arg?: { label: string; text: string };
  /** The position (0-based) of the key being sifted. Heap order may be broken next to it. */
  focus?: number;
  /** Bottom-up build: positions before this one (0-based) have not been sifted down yet. */
  todo?: number;
}

type S = HeapState;
type X = HeapExtra;
type Op = OpSpec<S, HeapSettings, X>;
type HeapStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
/** The array's capacity. More keys would not be readable on a phone anyway. */
export const CAPACITY = 31;

export const defaults: HeapSettings = { order: 'max', index: 'one', build: 'bottom-up' };

export function init(): S {
  return { items: [], nextUid: 1 };
}

export const heightOf = (n: number) => (n === 0 ? -1 : Math.floor(Math.log2(n)));

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const node = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);

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
// Conventions: max or min, 1-based or 0-based. Everything the narration says goes through here.

export interface Conv {
  max: boolean;
  base: 0 | 1;
  /** The index a learner sees for 0-based position p. */
  ix(p: number): number;
  /** a belongs above b: a > b in a max-heap, a < b in a min-heap. */
  beats(a: number, b: number): boolean;
  /** "parent(6) = ⌊6/2⌋ = 3" */
  parentOf(p: number): string;
  /** "left(2) = 2·2 = 4" */
  leftOf(p: number): string;
  rightOf(p: number): string;
  /** "A[1..6]" or "A[0..5]" for n keys. */
  range(n: number): string;
  kind: string;
  /** max or min */
  top: string;
  largest: string;
  larger: string;
  bigger: string;
  /** The variable CLRS uses in heapify: largest or smallest. */
  best: string;
  heapify: string;
  extract: string;
  peek: string;
  build: string;
}

export function conv(st: HeapSettings): Conv {
  const max = st.order !== 'min';
  const base: 0 | 1 = st.index === 'zero' ? 0 : 1;
  const ix = (p: number) => p + base;
  return {
    max,
    base,
    ix,
    beats: (a, b) => (max ? a > b : a < b),
    parentOf: (p) =>
      base === 1
        ? `parent(${ix(p)}) = ⌊${ix(p)}/2⌋ = ${ix(parentPos(p))}`
        : `parent(${ix(p)}) = ⌊(${ix(p)} − 1)/2⌋ = ${ix(parentPos(p))}`,
    leftOf: (p) =>
      base === 1
        ? `left(${ix(p)}) = 2·${ix(p)} = ${ix(2 * p + 1)}`
        : `left(${p}) = 2·${p} + 1 = ${2 * p + 1}`,
    rightOf: (p) =>
      base === 1
        ? `right(${ix(p)}) = 2·${ix(p)} + 1 = ${ix(2 * p + 2)}`
        : `right(${p}) = 2·${p} + 2 = ${2 * p + 2}`,
    range: (n) => `A[${base}..${n - 1 + base}]`,
    kind: max ? 'max-heap' : 'min-heap',
    top: max ? 'max' : 'min',
    largest: max ? 'largest' : 'smallest',
    larger: max ? 'larger' : 'smaller',
    bigger: max ? 'bigger' : 'smaller',
    best: max ? 'largest' : 'smallest',
    heapify: max ? 'maxHeapify' : 'minHeapify',
    extract: max ? 'extractMax' : 'extractMin',
    peek: max ? 'maximum' : 'minimum',
    build: max ? 'buildMaxHeap' : 'buildMinHeap',
  };
}

/** "30 < 45", "50 > 45" or "45 = 45". */
function cmp(a: number, b: number): string {
  return a < b ? `${a} < ${b}` : a > b ? `${a} > ${b}` : `${a} = ${b}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "8", "8 and 5": a node's children's keys. */
function childKeys(items: HeapItem[], p: number): number[] {
  return [2 * p + 1, 2 * p + 2].filter((q) => q < items.length).map((q) => items[q]!.key);
}

// ---------------------------------------------------------------------------------------------
// A working copy of the heap. Operations change it freely and yield snapshots.

class Work {
  items: HeapItem[];
  nextUid: number;
  comparisons = 0;
  swaps = 0;

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

function step(
  c: Ctx,
  say: string,
  lines: string[],
  level: Level,
  marks: Mark[],
  more: Partial<X> = {},
): HeapStep {
  const state = c.W.snap();
  const n = state.items.length;
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      N: n,
      height: heightOf(n),
      ...c.vars,
      comparisons: c.W.comparisons,
      swaps: c.W.swaps,
    },
    level,
    extra: { ...c.extra, ...more },
  };
}

function ctx(s: S, settings: HeapSettings, vars: Record<string, Scalar> = {}): Ctx {
  return { W: new Work(s), K: conv(settings), extra: {}, vars };
}

/** A step that refuses an argument and changes nothing. */
function* refuse(
  s: S,
  settings: HeapSettings,
  say: string,
  line: string | string[],
  arg?: { label: string; text: string },
): Generator<HeapStep, S, void> {
  const c = ctx(s, settings);
  if (arg) c.extra.arg = arg;
  yield step(
    c,
    say,
    typeof line === 'string' ? [line] : line,
    1,
    arg ? [mark('arg-box', 'error')] : [],
  );
  return s;
}

const summary = (n: number) => `N = ${n}, height = ${heightOf(n)}.`;

const LOOP_VARS = ['i', 'l', 'r', 'parent', 'largest', 'smallest'];

/** Drop the variables of a finished sift, so the panel shows no stale values. */
function forget(c: Ctx, names: string[] = LOOP_VARS): void {
  for (const k of names) delete c.vars[k];
}

// ---------------------------------------------------------------------------------------------
// Sift up and sift down. Every comparison is a level-3 step; every swap, and the step where
// the key stops, is a level-2 step whose narration says why, so level 2 reads on its own.

function* siftUp(c: Ctx, start: number, done: string): Generator<HeapStep, number, void> {
  const { W, K } = c;
  let p = start;
  for (;;) {
    const x = W.at(p);
    c.extra.focus = p;
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
    const q = parentPos(p);
    const y = W.at(q);
    c.vars.parent = K.ix(q);
    W.comparisons += 1;
    yield step(
      c,
      `Compare ${x.key} with its parent: ${K.parentOf(p)}, and A[${K.ix(q)}] = ${y.key}.`,
      ['up.loop'],
      3,
      [node(x.uid, 'active'), node(y.uid, 'compare'), mark(heapEdgeId(p), 'active')],
    );
    if (!K.beats(x.key, y.key)) {
      const why = K.max ? 'its parent is at least as big' : 'its parent is no bigger';
      yield step(
        c,
        `A[${K.ix(q)}] = ${cmp(y.key, x.key)}, so ${x.key} stays at A[${K.ix(p)}]: ${why}.${done}`,
        ['up.loop'],
        2,
        [node(x.uid, 'done'), node(y.uid, 'compare')],
      );
      return p;
    }
    W.swap(p, q);
    c.extra.focus = q;
    c.vars.i = K.ix(q);
    yield step(
      c,
      `A[${K.ix(q)}] = ${cmp(y.key, x.key)}: the parent is ${K.max ? 'smaller' : 'bigger'}, so swap them. ${x.key} moves up to A[${K.ix(q)}], and i = ${K.ix(q)}.`,
      ['up.swap', 'up.next'],
      2,
      [node(x.uid, 'active'), node(y.uid, 'visit'), mark(heapEdgeId(p), 'active')],
    );
    p = q;
  }
}

function* siftDown(c: Ctx, start: number, done: string): Generator<HeapStep, number, void> {
  const { W, K } = c;
  let p = start;
  for (;;) {
    const x = W.at(p);
    const n = W.n;
    const l = 2 * p + 1;
    const r = 2 * p + 2;
    c.extra.focus = p;
    c.vars.i = K.ix(p);
    c.vars.l = K.ix(l);
    c.vars.r = K.ix(r);
    const call = `${K.heapify}(${K.ix(p)})`;
    if (l >= n) {
      c.vars[K.best] = K.ix(p);
      yield step(
        c,
        `${call}: ${K.leftOf(p)} is past the last slot, A[${K.ix(n - 1)}], so ${x.key} has no children. It stops here.${done}`,
        ['hfy.lr', 'hfy.cmpL', 'hfy.else', 'hfy.cmpR', 'hfy.check'],
        2,
        [node(x.uid, 'done')],
      );
      return p;
    }
    let b = p;
    const lk = W.at(l).key;
    W.comparisons += 1;
    if (K.beats(lk, x.key)) b = l;
    c.vars[K.best] = K.ix(b);
    const lone = r >= n ? ` A[${K.ix(r)}] is past the last slot, so there is no right child.` : '';
    yield step(
      c,
      `${call}: l = ${K.leftOf(p)} and r = ${K.rightOf(p)}. Compare A[${K.ix(l)}] = ${lk} with A[${K.ix(p)}] = ${x.key}: ${cmp(lk, x.key)}, so ${K.best} = ${K.ix(b)}.${lone}`,
      ['hfy.lr', 'hfy.cmpL', b === l ? 'hfy.setL' : 'hfy.else', ...(r >= n ? ['hfy.cmpR'] : [])],
      3,
      [node(x.uid, 'active'), node(W.at(l).uid, 'compare')],
    );
    if (r < n) {
      const rk = W.at(r).key;
      const bk = W.at(b).key;
      W.comparisons += 1;
      const won = K.beats(rk, bk);
      if (won) b = r;
      c.vars[K.best] = K.ix(b);
      yield step(
        c,
        `Compare A[${K.ix(r)}] = ${rk} with A[${K.best}] = ${bk}: ${cmp(rk, bk)}, so ${K.best} ${won ? `= ${K.ix(r)}` : `stays ${K.ix(b)}`}.`,
        won ? ['hfy.cmpR', 'hfy.setR'] : ['hfy.cmpR'],
        3,
        [node(x.uid, 'active'), node(W.at(r).uid, 'compare')],
      );
    }
    const kids = childKeys(W.items, p);
    const has = kids.length === 1 ? `one child, ${kids[0]}` : `children ${kids[0]} and ${kids[1]}`;
    const kidMarks = [l, r].filter((q) => q < n).map((q) => node(W.at(q).uid, 'compare'));
    if (b === p) {
      const none = kids.length === 1 ? `It is not ${K.bigger}` : `Neither is ${K.bigger}`;
      yield step(
        c,
        `A[${K.ix(p)}] = ${x.key} has ${has}. ${none} than ${x.key}, so ${K.best} = i and ${x.key} stays at A[${K.ix(p)}].${done}`,
        ['hfy.check'],
        2,
        [node(x.uid, 'done'), ...kidMarks],
      );
      return p;
    }
    const y = W.at(b);
    W.swap(p, b);
    c.extra.focus = b;
    yield step(
      c,
      `A[${K.ix(p)}] = ${x.key} has ${has}. ${kids.length === 1 ? 'That child' : `The ${K.larger}`} is ${y.key} at A[${K.ix(b)}], and ${cmp(y.key, x.key)}, so swap them. ${x.key} moves down to A[${K.ix(b)}]; keep going from there.`,
      ['hfy.check', 'hfy.swap', 'hfy.rec'],
      2,
      [node(x.uid, 'active'), node(y.uid, 'visit'), mark(heapEdgeId(b), 'active')],
    );
    p = b;
  }
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    const key = parseKey(raw!);
    if (key instanceof Error)
      return yield* refuse(
        s,
        settings,
        `insert(${String(raw)}): ${key.message} The heap is unchanged.`,
        'ins.sig',
        {
          label: 'key',
          text: String(raw),
        },
      );
    const c = ctx(s, settings, { key });
    const { W, K } = c;
    const name = `insert(${key})`;
    if (W.n >= CAPACITY) {
      c.extra.arg = { label: 'key', text: String(key) };
      yield step(
        c,
        `${name}: n = ${W.n}, which is the capacity of the array. Heap overflow: ${key} is not inserted.`,
        ['ins.full', 'ins.overflow'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    const uid = W.nextUid;
    W.nextUid += 1;
    W.items.push({ uid, key });
    const p = W.n - 1;
    c.extra.focus = p;
    c.vars.i = K.ix(p);
    yield step(
      c,
      p === 0
        ? `${name}: the heap is empty, so ${key} goes in A[${K.ix(0)}] and is the root.`
        : `${name}: ${key} goes in A[${K.ix(p)}], the first free slot, and n = ${W.n}. The tree stays complete: a new leaf always fills the bottom row from the left.`,
      K.base === 1 ? ['ins.grow', 'ins.store', 'ins.sift'] : ['ins.store', 'ins.grow', 'ins.sift'],
      2,
      [node(uid, 'new'), mark(cellId(p), 'new')],
    );
    yield* siftUp(c, p, ` ${summary(W.n)}`);
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// extract

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
        `${name}: n = 0, so the heap is empty. Heap underflow: there is nothing to extract.`,
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
      `${name}: the ${K.largest} key is always at the root, so ${K.top} = A[${K.ix(0)}] = ${top.key}.`,
      ['ext.empty', 'ext.top'],
      2,
      [node(top.uid, 'found'), mark('out', 'found')],
    );
    const last = W.items.pop()!;
    if (W.n === 0) {
      c.vars.returned = top.key;
      yield step(
        c,
        `${top.key} was the only key, so there is nothing to move into the root: the heap is now empty. Return ${top.key}.`,
        ['ext.last', 'ext.shrink', 'ext.return'],
        1,
        [mark('out', 'found')],
      );
      return W.snap();
    }
    W.items[0] = last;
    c.extra.focus = 0;
    yield step(
      c,
      `Move the last key, A[${K.ix(W.n)}] = ${last.key}, into the root and shrink the heap to n = ${W.n}. The tree is complete again, but ${last.key} may be ${K.max ? 'smaller' : 'bigger'} than a child, so sift it down.`,
      ['ext.last', 'ext.shrink', 'ext.heapify'],
      2,
      [node(last.uid, 'active'), mark('out', 'found')],
    );
    yield* siftDown(c, 0, '');
    forget(c);
    c.vars.returned = top.key;
    delete c.extra.focus;
    yield step(
      c,
      `Return ${K.top} = ${top.key}. The heap has ${plural(W.n, 'key')} left: ${summary(W.n)}`,
      ['ext.return'],
      1,
      [mark('out', 'found')],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// peek

const peek: Op = {
  label: 'Peek',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx(s, settings);
    const { W, K } = c;
    if (W.n === 0) {
      yield step(
        c,
        `${K.peek}(): the heap is empty, so there is no ${K.largest} key to look at.`,
        ['peek.empty'],
        1,
        [mark('empty', 'error')],
      );
      return s;
    }
    const top = W.at(0);
    c.vars.returned = top.key;
    yield step(
      c,
      `${K.peek}(): the ${K.largest} key is at the root, A[${K.ix(0)}] = ${top.key}. Nothing moves and nothing is compared.`,
      ['peek.empty', 'peek.return'],
      1,
      [node(top.uid, 'found'), mark('out', 'found')],
      { out: { key: top.key, label: 'returned', from: top.uid } },
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// build

const build: Op = {
  label: 'Build heap',
  arity: 1,
  *run(s, [raw], { settings }) {
    const keys = parseKeyList(raw!);
    const K0 = conv(settings);
    if (keys instanceof Error)
      return yield* refuse(
        s,
        settings,
        `${K0.build}: ${keys.message} The heap is unchanged.`,
        'bld.sig',
        { label: 'list', text: String(raw) },
      );
    const c = ctx(s, settings);
    const { W, K } = c;
    W.items = [];
    const list = keys.join(' ');
    const n = keys.length;
    if (settings.build === 'insert') {
      yield step(
        c,
        `${K.build}(${list}) by repeated insertion: start from an empty heap and insert the ${plural(n, 'key')} one at a time, each with a sift-up.`,
        ['bld.empty'],
        2,
        [],
      );
      for (let k = 0; k < n; k++) {
        const key = keys[k]!;
        const uid = W.nextUid;
        W.nextUid += 1;
        W.items.push({ uid, key });
        const p = W.n - 1;
        forget(c);
        c.vars.key = key;
        c.vars.i = K.ix(p);
        c.extra.focus = p;
        yield step(
          c,
          `Key ${k + 1} of ${n}: ${key} goes in A[${K.ix(p)}], the next free slot.`,
          ['bld.loop', 'bld.add', 'bld.sift'],
          2,
          [node(uid, 'new')],
        );
        yield* siftUp(c, p, '');
      }
    } else {
      for (const key of keys) {
        W.items.push({ uid: W.nextUid, key });
        W.nextUid += 1;
      }
      const lastInner = Math.floor(n / 2) - 1;
      c.extra.todo = lastInner + 1;
      const start =
        lastInner < 0
          ? 'With one key, A is already a heap.'
          : `The slots after A[${K.ix(lastInner)}] hold leaves, and a leaf on its own is already a heap. So i starts at ${K.base === 1 ? `⌊n/2⌋ = ${K.ix(lastInner)}` : `⌊n/2⌋ − 1 = ${lastInner}`} and works back to the root.`;
      yield step(
        c,
        `${K.build}(${list}): copy the ${plural(n, 'key')} into ${K.range(n)} in the order given. The tree is complete, but the keys are not in heap order yet. ${start}`,
        ['bld.n', 'bld.copy'],
        2,
        W.items.map((x) => node(x.uid, 'new')),
      );
      for (let p = lastInner; p >= 0; p--) {
        c.extra.todo = p;
        c.extra.focus = p;
        forget(c);
        c.vars.i = K.ix(p);
        const x = W.at(p);
        yield step(
          c,
          `i = ${K.ix(p)}: the subtrees under A[${K.ix(p)}] are heaps already. Sift ${x.key} down to make the subtree rooted at A[${K.ix(p)}] a heap too.`,
          ['bld.loop', 'bld.heapify'],
          2,
          [node(x.uid, 'active')],
        );
        yield* siftDown(c, p, '');
      }
      delete c.extra.todo;
    }
    delete c.extra.focus;
    forget(c, [...LOOP_VARS, 'key']);
    const how = settings.build === 'insert' ? 'by repeated insertion' : 'bottom-up';
    yield step(
      c,
      `A is a ${K.kind}. Building it ${how} took ${plural(W.comparisons, 'comparison')} and ${plural(W.swaps, 'swap')}. ${summary(W.n)}`,
      ['bld.sig'],
      1,
      [],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// update-key and delete, both at an index

function* badIndex(
  s: S,
  settings: HeapSettings,
  name: string,
  i: number,
  line: string,
): Generator<HeapStep, S, void> {
  const K = conv(settings);
  const n = s.items.length;
  const has = n === 0 ? 'The heap is empty.' : `The heap holds ${K.range(n)}.`;
  return yield* refuse(
    s,
    settings,
    `${name}: there is no A[${i}]. ${has}`,
    [line, line.replace('range', 'error')],
    {
      label: 'i',
      text: String(i),
    },
  );
}

const update: Op = {
  label: 'Update key',
  arity: 2,
  *run(s, [rawI, rawK], { settings }) {
    const K = conv(settings);
    const i = parseIndex(rawI!);
    const key = parseKey(rawK!);
    const name = `updateKey(${String(rawI)}, ${String(rawK)})`;
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, 'upd.sig', {
        label: 'i',
        text: String(rawI),
      });
    if (key instanceof Error)
      return yield* refuse(s, settings, `${name}: ${key.message}`, 'upd.sig', {
        label: 'key',
        text: String(rawK),
      });
    const p = i - K.base;
    if (p < 0 || p >= s.items.length) return yield* badIndex(s, settings, name, i, 'upd.range');
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
    c.extra.focus = p;
    const up = K.beats(key, old);
    yield step(
      c,
      `${name}: A[${i}] changes from ${old} to ${key}. The key went ${key > old ? 'up' : 'down'}, and in a ${K.kind} that can only break the order with its ${up ? 'parent' : 'children'}. So sift it ${up ? 'up' : 'down'}.`,
      ['upd.range', 'upd.old', 'upd.set', up ? 'upd.up' : 'upd.down'],
      2,
      [node(item.uid, 'active')],
    );
    const done = ` ${summary(W.n)}`;
    if (up) yield* siftUp(c, p, done);
    else yield* siftDown(c, p, done);
    return W.snap();
  },
};

const del: Op = {
  label: 'Delete at index',
  arity: 1,
  *run(s, [rawI], { settings }) {
    const K = conv(settings);
    const i = parseIndex(rawI!);
    const name = `delete(${String(rawI)})`;
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, 'del.sig', {
        label: 'i',
        text: String(rawI),
      });
    const p = i - K.base;
    if (p < 0 || p >= s.items.length) return yield* badIndex(s, settings, name, i, 'del.range');
    const c = ctx(s, settings, { i });
    const { W } = c;
    const gone = W.at(p);
    c.vars.old = gone.key;
    c.extra.out = { key: gone.key, label: 'deleted', from: gone.uid };
    yield step(
      c,
      `${name}: the key to remove is A[${i}] = ${gone.key}.`,
      ['del.range', 'del.old'],
      2,
      [node(gone.uid, 'remove'), mark('out', 'active')],
    );
    const last = W.items.pop()!;
    if (p === W.n) {
      c.vars.returned = gone.key;
      yield step(
        c,
        `A[${i}] is the last slot, so removing it only shrinks the heap to n = ${W.n}. Nothing else moves. Return ${gone.key}. ${summary(W.n)}`,
        ['del.last', 'del.check', 'del.return'],
        1,
        [mark('out', 'found')],
      );
      return W.snap();
    }
    W.items[p] = last;
    c.extra.focus = p;
    const up = K.beats(last.key, gone.key);
    const then =
      last.key === gone.key
        ? `${last.key} equals the key it replaces, so nothing else has to move.`
        : up
          ? `${cmp(last.key, gone.key)}, and the deleted key was ${K.max ? 'no bigger' : 'no smaller'} than its parent, so ${last.key} can only clash with its new parent: sift it up.`
          : `${cmp(last.key, gone.key)}, and the deleted key was ${K.max ? 'at least as big as' : 'no bigger than'} its children, so ${last.key} can only clash with its new children: sift it down.`;
    yield step(
      c,
      `Move the last key, A[${K.ix(W.n)}] = ${last.key}, into the gap at A[${i}] and shrink the heap to n = ${W.n}. ${then}`,
      [
        'del.last',
        'del.check',
        'del.move',
        ...(last.key === gone.key ? [] : [up ? 'del.up' : 'del.down']),
      ],
      2,
      [node(last.uid, 'active'), mark('out', 'active')],
    );
    if (last.key !== gone.key) {
      if (up) yield* siftUp(c, p, '');
      else yield* siftDown(c, p, '');
    }
    delete c.extra.focus;
    forget(c);
    c.vars.i = i;
    c.vars.returned = gone.key;
    yield step(c, `Return ${gone.key}. ${summary(W.n)}`, ['del.return'], 1, [mark('out', 'found')]);
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// clear

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { items: [], nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say:
        s.items.length === 0
          ? 'clear(): the heap was already empty.'
          : 'clear(): n = 0. The heap is empty. Nothing is erased: the old keys may sit in the array, but they are past n, so they are no longer part of the heap.',
      lines: ['clr.reset'],
      vars: { N: 0, height: -1, comparisons: 0, swaps: 0 },
      level: 1,
      extra: {},
    } satisfies HeapStep;
    return empty;
  },
};

export const ops = { insert, extract, peek, build, update, delete: del, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode. It follows the settings: max or min, 1-based or 0-based, and the build method.

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: HeapSettings): PseudoBlock[] {
  const K = conv(st);
  const one = K.base === 1;
  const gt = K.max ? '>' : '<';
  const lt = K.max ? '<' : '>';
  const B = K.best;
  const H = K.heapify;
  const root = one ? 'A[1]' : 'A[0]';
  const lastSlot = one ? 'A[n]' : 'A[n − 1]';
  const within = (v: string) => (one ? `${v} ≤ n` : `${v} < n`);
  const outside = one ? 'i < 1 or i > n' : 'i < 0 or i ≥ n';
  const bigger = K.bigger;
  // Two short lines: one long comment would not fit the code panel on a phone.
  const formulas = one
    ? [
        L('idx', 0, '// parent(i) = ⌊i/2⌋', 'The parent of slot i is slot ⌊i/2⌋;'),
        L('idx2', 0, '// left(i) = 2i, right(i) = 2i + 1', 'its children are slots 2i and 2i + 1.'),
      ]
    : [
        L('idx', 0, '// parent(i) = ⌊(i − 1)/2⌋', 'The parent of slot i is slot ⌊(i − 1)/2⌋;'),
        L('idx2', 0, '// left(i) = 2i + 1', 'its children are slots 2i + 1 and 2i + 2.'),
        L('idx3', 0, '// right(i) = 2i + 2', 'The right child comes right after the left.'),
      ];
  const siftUp = [
    L('up.sig', 0, 'siftUp(i)', 'To sift the key in slot i up:'),
    L(
      'up.loop',
      1,
      `while i > ${one ? 1 : 0} and A[parent(i)] ${lt} A[i]`,
      `while it is not the root and its parent is ${K.max ? 'smaller' : 'bigger'},`,
    ),
    L('up.swap', 2, 'swap A[i] and A[parent(i)]', 'swap it with its parent'),
    L('up.next', 2, 'i = parent(i)', 'and follow it up one level.'),
  ];
  const heapify = [
    L('hfy.sig', 0, `${H}(i)`, 'To sift the key in slot i down:'),
    L('hfy.lr', 1, 'l = left(i); r = right(i)', 'find its two children.'),
    L(
      'hfy.cmpL',
      1,
      `if ${within('l')} and A[l] ${gt} A[i]`,
      `If there is a left child and it is ${bigger},`,
    ),
    L('hfy.setL', 2, `${B} = l`, 'it is the best so far;'),
    L('hfy.else', 1, `else ${B} = i`, 'otherwise slot i is.'),
    L(
      'hfy.cmpR',
      1,
      `if ${within('r')} and A[r] ${gt} A[${B}]`,
      `If there is a right child and it is ${bigger} still,`,
    ),
    L('hfy.setR', 2, `${B} = r`, 'it is the best.'),
    L('hfy.check', 1, `if ${B} ≠ i`, 'If a child beat the key in slot i,'),
    L('hfy.swap', 2, `swap A[i] and A[${B}]`, 'swap them'),
    L('hfy.rec', 2, `${H}(${B})`, 'and keep sifting down from there.'),
  ];
  const grow = L('ins.grow', 1, 'n = n + 1', 'Count one more key.');
  const store = L(
    'ins.store',
    1,
    `${lastSlot} = key`,
    'Put the key in the first free slot: the next leaf.',
  );
  const buildLines =
    st.build === 'insert'
      ? [
          L('bld.sig', 0, `${K.build}(list)`, 'To build a heap from a list, one key at a time:'),
          L('bld.empty', 1, 'n = 0', 'Start with an empty heap.'),
          L('bld.loop', 1, 'for each key in list', 'For each key, in order:'),
          L(
            'bld.add',
            2,
            one ? 'n = n + 1; A[n] = key' : 'A[n] = key; n = n + 1',
            'put it in the first free slot',
          ),
          L('bld.sift', 2, `siftUp(${one ? 'n' : 'n − 1'})`, 'and sift it up.'),
          ...siftUp,
          ...formulas,
        ]
      : [
          L('bld.sig', 0, `${K.build}(list)`, 'To build a heap from a list, bottom-up:'),
          L('bld.n', 1, 'n = length(list)', 'Count the keys'),
          L(
            'bld.copy',
            1,
            `${one ? 'A[1..n]' : 'A[0..n − 1]'} = list`,
            'and copy them into the array as they are.',
          ),
          L(
            'bld.loop',
            1,
            one ? 'for i = ⌊n/2⌋ downto 1' : 'for i = ⌊n/2⌋ − 1 downto 0',
            'From the last node that has a child back to the root,',
          ),
          L('bld.heapify', 2, `${H}(i)`, 'sift each key down.'),
          ...heapify,
          ...formulas,
        ];
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(key)', 'To insert a key:'),
        L('ins.full', 1, 'if n == capacity', 'If the array is full,'),
        L('ins.overflow', 2, 'error "heap overflow"', 'stop: there is no room.'),
        ...(one ? [grow, store] : [store, grow]),
        L('ins.sift', 1, `siftUp(${one ? 'n' : 'n − 1'})`, 'Then sift it up to its place.'),
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
        L('ext.shrink', 1, 'n = n − 1', 'and shrink the heap by one.'),
        L('ext.heapify', 1, `${H}(${one ? 1 : 0})`, 'Sift the new root down.'),
        L('ext.return', 1, `return ${K.top}`, `Hand back the ${K.largest} key.`),
        ...heapify,
        ...formulas,
      ],
    },
    {
      op: 'peek',
      lines: [
        L('peek.sig', 0, `${K.peek}()`, `To look at the ${K.largest} key:`),
        L('peek.empty', 1, 'if n == 0: error "heap is empty"', 'If the heap is empty, stop.'),
        L('peek.return', 1, `return ${root}`, 'Hand back the root and leave it there.'),
      ],
    },
    { op: 'build', lines: buildLines },
    {
      op: 'update',
      lines: [
        L('upd.sig', 0, 'updateKey(i, key)', 'To change the key in slot i:'),
        L('upd.range', 1, `if ${outside}`, 'If there is no slot i,'),
        L('upd.error', 2, 'error "no such slot"', 'stop.'),
        L('upd.old', 1, 'old = A[i]', 'Remember the old key'),
        L('upd.set', 1, 'A[i] = key', 'and write the new one.'),
        L('upd.up', 1, `if key ${gt} old: siftUp(i)`, `If it got ${bigger}, sift it up;`),
        L(
          'upd.down',
          1,
          `elseif key ${lt} old: ${H}(i)`,
          'if it went the other way, sift it down.',
        ),
        ...siftUp,
        ...heapify,
        ...formulas,
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(i)', 'To delete the key in slot i:'),
        L('del.range', 1, `if ${outside}`, 'If there is no slot i,'),
        L('del.error', 2, 'error "no such slot"', 'stop.'),
        L('del.old', 1, 'old = A[i]', 'Remember the key being deleted.'),
        L(
          'del.last',
          1,
          `last = ${lastSlot}; n = n − 1`,
          'Take the last key out and shrink the heap.',
        ),
        L('del.check', 1, one ? 'if i ≤ n' : 'if i < n', 'Unless slot i was the last one,'),
        L('del.move', 2, 'A[i] = last', 'move the last key into the gap.'),
        L(
          'del.up',
          2,
          `if last ${gt} old: siftUp(i)`,
          `If it is ${bigger} than the old key, sift it up;`,
        ),
        L('del.down', 2, `elseif last ${lt} old: ${H}(i)`, 'if not, sift it down.'),
        L('del.return', 1, 'return old', 'Hand back the deleted key.'),
        ...siftUp,
        ...heapify,
        ...formulas,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the heap:'),
        L('clr.reset', 1, 'n = 0', 'say it holds no keys. Nothing is erased.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------

export function initialSay(_s: S, settings: HeapSettings): string {
  const K = conv(settings);
  const formula =
    K.base === 1
      ? 'indexed from 1 as in CLRS, so the parent of A[i] is A[⌊i/2⌋]'
      : 'indexed from 0, so the parent of A[i] is A[⌊(i − 1)/2⌋]';
  return `An empty ${K.kind} in an array A, ${formula}. Insert some keys, or build a heap from a list.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return { N: s.items.length, height: heightOf(s.items.length), comparisons: 0, swaps: 0 };
}

/** Screen-reader summary: the kind of heap, its size and height, and the array. */
export function describe(s: S, settings: HeapSettings): string {
  const K = conv(settings);
  const n = s.items.length;
  if (n === 0) return `An empty ${K.kind}.`;
  const keys = s.items.map((x) => x.key).join(', ');
  return `A ${K.kind} with ${plural(n, 'key')} and height ${heightOf(n)}. The root is ${s.items[0]!.key}. ${K.range(n)} holds ${keys}.`;
}
