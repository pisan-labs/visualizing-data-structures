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

/**
 * A Fibonacci heap as in CLRS chapter 19, a min-heap. Each list of siblings, and the root
 * list, is a circular doubly linked list in CLRS; here a list is an array in list order, and
 * its last element links back to its first. A node's child pointer is its first child. Keys
 * have their own identity (`vid`) apart from nodes.
 */
export interface FNode {
  uid: number;
  key: number;
  vid: number;
  mark: boolean;
  parent: number | null;
  /** In sibling-list order. degree = children.length. */
  children: number[];
}

export interface FibState {
  nodes: Record<number, FNode>;
  /** The root list, in list order (it is circular: the last root links back to the first). */
  roots: number[];
  min: number | null;
  /** A second root list waiting to be joined, during union. */
  other: number[];
  otherMin: number | null;
  nextUid: number;
  nextVid: number;
}

export interface FibSettings {
  [key: string]: Scalar;
  view: 'logical' | 'internal';
}

export interface FibExtra {
  out?: { text: string; label: string };
  arg?: { label: string; text: string };
  /** The degree table of consolidate: the uid of the root filed under each degree. */
  table?: (number | null)[];
  /** The slot of the table being looked at. */
  slot?: number;
  /** The pointers of consolidate (w, x, y) or decrease-key (x, y, z). */
  ptr?: Record<string, number | null>;
  /** H.min is not the minimum yet (consolidate has not finished, or an insert is comparing). */
  minPending?: boolean;
  otherLabel?: string;
}

type S = FibState;
type X = FibExtra;
type Op = OpSpec<S, FibSettings, X>;
type FibStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const MAX_KEYS = 31;
export const MAX_LIST = 15;
export const NEG_INF = -Infinity;

export const defaults: FibSettings = { view: 'logical' };

export function init(): S {
  return { nodes: {}, roots: [], min: null, other: [], otherMin: null, nextUid: 1, nextVid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const nodeMark = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);
export const show = (k: number) => (k === NEG_INF ? '−∞' : String(k));

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
  if (tokens.length === 0) return new Error('Type the keys of the second heap, such as 5 3 8.');
  if (tokens.length > MAX_LIST)
    return new Error(`Keep the second heap to ${MAX_LIST} keys; the list has ${tokens.length}.`);
  const keys: number[] = [];
  for (const t of tokens) {
    const k = parseKey(t);
    if (k instanceof Error)
      return new Error(tokens.length > 1 ? `"${t}": ${k.message}` : k.message);
    keys.push(k);
  }
  return keys;
}

export function parseFibInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key first.');
  if (/[\s,]/.test(t)) {
    const keys = parseKeyList(t);
    return keys instanceof Error ? keys : keys.join(' ');
  }
  return parseKey(t);
}

// ---------------------------------------------------------------------------------------------
// Pure helpers, shared with the view and the tests.

type Nodes = Record<number, FNode>;

export function subtreeSize(nodes: Nodes, u: number): number {
  return 1 + nodes[u]!.children.reduce((sum, c) => sum + subtreeSize(nodes, c), 0);
}

export function countNodes(nodes: Nodes, roots: number[]): number {
  return roots.reduce((sum, r) => sum + subtreeSize(nodes, r), 0);
}

export const marked = (nodes: Nodes) => Object.values(nodes).filter((n) => n.mark).length;

/** D(n): an upper bound on the degree of any node, ⌊log_φ n⌋. */
export function maxDegree(n: number): number {
  return n <= 1 ? 0 : Math.floor(Math.log(n) / Math.log((1 + Math.sqrt(5)) / 2));
}

/** The first node holding key k: roots in list order, each tree in preorder. */
export function findKey(nodes: Nodes, roots: number[], k: number): number | null {
  for (const r of roots) {
    if (nodes[r]!.key === k) return r;
    const below = findKey(nodes, nodes[r]!.children, k);
    if (below !== null) return below;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// A working copy.

class Work {
  nodes: Nodes;
  roots: number[];
  min: number | null;
  other: number[];
  otherMin: number | null;
  nextUid: number;
  nextVid: number;
  comparisons = 0;
  links = 0;
  cuts = 0;

  constructor(s: S) {
    this.nodes = Object.fromEntries(
      Object.entries(s.nodes).map(([k, n]) => [k, { ...n, children: [...n.children] }]),
    );
    this.roots = [...s.roots];
    this.min = s.min;
    this.other = [...s.other];
    this.otherMin = s.otherMin;
    this.nextUid = s.nextUid;
    this.nextVid = s.nextVid;
  }

  n(u: number): FNode {
    return this.nodes[u]!;
  }

  k(u: number | null): string {
    return u === null ? 'nil' : show(this.n(u).key);
  }

  snap(): S {
    const nodes = Object.fromEntries(
      Object.entries(this.nodes).map(([k, n]) => [k, { ...n, children: [...n.children] }]),
    ) as Nodes;
    return {
      nodes,
      roots: [...this.roots],
      min: this.min,
      other: [...this.other],
      otherMin: this.otherMin,
      nextUid: this.nextUid,
      nextVid: this.nextVid,
    };
  }

  add(key: number): number {
    const uid = this.nextUid;
    this.nextUid += 1;
    this.nodes[uid] = { uid, key, vid: this.nextVid, mark: false, parent: null, children: [] };
    this.nextVid += 1;
    return uid;
  }

  /** Put u into the root list just left of H.min (CLRS adds new roots there). */
  addRoot(u: number): void {
    const at = this.min === null ? this.roots.length : this.roots.indexOf(this.min);
    this.roots.splice(at < 0 ? this.roots.length : at, 0, u);
  }

  size(): number {
    return countNodes(this.nodes, this.roots);
  }
}

interface Ctx {
  W: Work;
  extra: X;
  vars: Record<string, Scalar>;
}

function potential(W: Work) {
  const t = W.roots.length + W.other.length;
  const m = marked(W.nodes);
  return { t, m, phi: t + 2 * m };
}

function step(
  c: Ctx,
  say: string,
  lines: string[],
  level: Level,
  marks: Mark[],
  more: Partial<X> = {},
): FibStep {
  const state = c.W.snap();
  const { t, m, phi } = potential(c.W);
  const extra: X = { ...c.extra, ...more };
  if (extra.table) extra.table = [...extra.table];
  if (extra.ptr) extra.ptr = { ...extra.ptr };
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      N: countNodes(state.nodes, state.roots) + countNodes(state.nodes, state.other),
      Φ: phi,
      't(H)': t,
      'm(H)': m,
      ...c.vars,
      comparisons: c.W.comparisons,
      links: c.W.links,
      cuts: c.W.cuts,
    },
    level,
    extra,
  };
}

function ctx(s: S, vars: Record<string, Scalar> = {}): Ctx {
  return { W: new Work(s), extra: {}, vars };
}

function* refuse(c: Ctx, say: string, line: string, arg: { label: string; text: string }) {
  c.extra.arg = arg;
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
}

function summary(W: Work): string {
  const n = W.size();
  const { t, m, phi } = potential(W);
  return `N = ${n}, t(H) = ${t}, m(H) = ${m}, so Φ = t(H) + 2m(H) = ${phi}.`;
}

// ---------------------------------------------------------------------------------------------
// The pieces CLRS builds the operations from.

/** FIB-HEAP-LINK: y leaves the root list and becomes the first child of x; y is unmarked. */
function link(W: Work, y: number, x: number): void {
  W.roots.splice(W.roots.indexOf(y), 1);
  const Y = W.n(y);
  Y.parent = x;
  Y.mark = false;
  W.n(x).children.unshift(y);
  W.links += 1;
}

/** CUT: x leaves the child list of y and joins the root list, unmarked. */
function cut(W: Work, x: number, y: number): void {
  const Y = W.n(y);
  Y.children.splice(Y.children.indexOf(x), 1);
  const X1 = W.n(x);
  X1.parent = null;
  X1.mark = false;
  W.addRoot(x);
  W.cuts += 1;
}

function* consolidate(c: Ctx): Generator<FibStep, void, void> {
  const { W } = c;
  const n = W.size();
  const D = maxDegree(n);
  const table: (number | null)[] = Array(D + 1).fill(null);
  c.extra.table = table;
  c.extra.minPending = true;
  yield step(
    c,
    `consolidate: make a table A with one slot per degree, 0 to D(n) = ⌊log_φ ${n}⌋ = ${D}, all nil. Then file every tree under its degree; two trees of one degree get linked. This is the work the inserts put off.`,
    ['con.sig', 'con.table'],
    2,
    W.roots.map((u) => nodeMark(u, 'visit')),
  );
  const list = [...W.roots];
  for (const w of list) {
    let x = w;
    let d = W.n(x).children.length;
    c.extra.ptr = { w, x };
    c.extra.slot = d;
    yield step(
      c,
      `w = ${W.k(w)}, a root of degree ${d}. Look in A[${d}].`,
      ['con.loop', 'con.x'],
      3,
      [nodeMark(w, 'active'), mark(`slot-${d}`, 'active')],
    );
    while (table[d] !== null) {
      let y = table[d]!;
      const held = W.k(y);
      W.comparisons += 1;
      const swap = W.n(x).key > W.n(y).key;
      if (swap) [x, y] = [y, x];
      const what = swap
        ? `${W.k(x)} < ${W.k(y)}, so ${W.k(y)} becomes a child of ${W.k(x)} (x and y trade names first, so that x is the smaller root)`
        : `${W.k(x)} ≤ ${W.k(y)}, so ${W.k(y)} becomes a child of ${W.k(x)}`;
      link(W, y, x);
      table[d] = null;
      d += 1;
      if (d >= table.length) table.push(null);
      c.extra.ptr = { w, x, y };
      c.extra.slot = d;
      yield step(
        c,
        `A[${d - 1}] already holds ${held}, another tree of degree ${d - 1}: link the two. ${what}. Now ${W.k(x)} has degree ${d}: A[${d - 1}] = nil, and look in A[${d}].`,
        [
          'con.while',
          'con.y',
          'con.swap',
          'con.link',
          'con.clear',
          'con.inc',
          'lk.sig',
          'lk.remove',
          'lk.child',
          'lk.unmark',
        ],
        2,
        [nodeMark(x, 'active'), nodeMark(y, 'visit'), mark(`slot-${d - 1}`, 'compare')],
      );
    }
    table[d] = x;
    c.extra.ptr = { w, x };
    yield step(c, `A[${d}] is free: file ${W.k(x)} there.`, ['con.while', 'con.file'], 3, [
      nodeMark(x, 'done'),
      mark(`slot-${d}`, 'new'),
    ]);
  }
  // Rebuild the root list from A and find the minimum.
  W.roots = table.filter((u): u is number => u !== null);
  W.min = null;
  for (const r of W.roots) {
    if (W.min === null) W.min = r;
    else {
      W.comparisons += 1;
      if (W.n(r).key < W.n(W.min).key) W.min = r;
    }
  }
  c.extra.ptr = undefined;
  c.extra.slot = undefined;
  c.extra.minPending = false;
  yield step(
    c,
    `Every degree has at most one tree now. Read the root list back out of A, in order of degree, and the smallest root is the new H.min: ${W.k(W.min)}.`,
    ['con.rebuild', 'con.min'],
    2,
    W.min === null ? [] : [nodeMark(W.min, 'found')],
  );
  c.extra.table = undefined;
}

function* extractMin(c: Ctx, name: string): Generator<FibStep, number | null, void> {
  const { W } = c;
  if (W.min === null) {
    yield step(c, `${name}: the heap is empty, so there is nothing to extract.`, ['ex.sig'], 1, [
      mark('empty', 'error'),
    ]);
    return null;
  }
  const z = W.min;
  const Z = W.n(z);
  const key = Z.key;
  c.extra.out = { text: show(key), label: 'min' };
  c.extra.ptr = { z };
  const kids = [...Z.children];
  if (kids.length) {
    // The children join the root list where z is, and a root is never marked.
    const at = W.roots.indexOf(z);
    W.roots.splice(at, 0, ...kids);
    for (const k of kids) {
      W.n(k).parent = null;
      W.n(k).mark = false;
    }
    Z.children = [];
  }
  yield step(
    c,
    kids.length
      ? `${name}: z = H.min = ${show(key)}. Its ${kids.length === 1 ? 'child' : `${kids.length} children`}, ${kids.map((k) => W.k(k)).join(', ')}, ${kids.length === 1 ? 'joins' : 'join'} the root list. A root is never marked, so any marks go.`
      : `${name}: z = H.min = ${show(key)}. It has no children to move.`,
    ['ex.sig', 'ex.z', 'ex.kids'],
    2,
    [nodeMark(z, 'found'), mark('out', 'found'), ...kids.map((k) => nodeMark(k, 'new'))],
  );
  const i = W.roots.indexOf(z);
  const right = W.roots.length > 1 ? W.roots[(i + 1) % W.roots.length]! : null;
  W.roots.splice(i, 1);
  delete W.nodes[z];
  W.min = right;
  c.extra.ptr = undefined;
  if (right === null) {
    c.extra.minPending = false;
    yield step(
      c,
      `Remove ${show(key)}. It was the only node, so the heap is now empty.`,
      ['ex.remove', 'ex.empty'],
      2,
      [mark('out', 'found')],
    );
    return key;
  }
  c.extra.minPending = true;
  yield step(
    c,
    `Remove ${show(key)} from the root list. For now H.min points at its right neighbor, ${W.k(right)}, which need not be the smallest.`,
    ['ex.remove', 'ex.right'],
    2,
    [nodeMark(right, 'compare'), mark('out', 'found')],
  );
  yield* consolidate(c);
  return key;
}

/** Lower x's key to k, cutting as CLRS does. Returns the steps' result: false if refused. */
function* decreaseTo(c: Ctx, x: number, k: number, name: string): Generator<FibStep, void, void> {
  const { W } = c;
  const X1 = W.n(x);
  const old = X1.key;
  X1.key = k;
  // Until the last line of decreaseKey runs, H.min may not be the smallest root.
  c.extra.minPending = W.min !== null && W.min !== x && k < W.n(W.min).key;
  c.extra.ptr = { x };
  yield step(
    c,
    `${name}: the node holding ${show(old)} now holds ${show(k)}.${k === NEG_INF ? '' : ' (A real program keeps a pointer to the node; here we find it by its key.)'}`,
    ['dk.sig', 'dk.err', 'dk.set', 'dk.y'],
    2,
    [nodeMark(x, 'active')],
  );
  const y = X1.parent;
  if (y !== null) {
    W.comparisons += 1;
    if (X1.key < W.n(y).key) {
      c.extra.ptr = { x, y };
      cut(W, x, y);
      yield step(
        c,
        `${show(k)} < ${W.k(y)}, its parent: heap order is broken. Cut ${show(k)} from ${W.k(y)} and make it a root, unmarked.`,
        ['dk.if', 'dk.cut', 'cut.sig', 'cut.remove', 'cut.add', 'cut.unmark'],
        2,
        [nodeMark(x, 'new'), nodeMark(y, 'compare')],
      );
      yield* cascadingCut(c, y);
    } else {
      yield step(
        c,
        `${show(k)} ≥ ${W.k(y)}, its parent: heap order still holds, so nothing is cut.`,
        ['dk.if'],
        2,
        [nodeMark(x, 'done'), nodeMark(y, 'compare')],
      );
    }
  }
  c.extra.ptr = { x };
  W.comparisons += 1;
  if (W.min === null || X1.key < W.n(W.min).key) {
    const was = W.k(W.min);
    W.min = x;
    c.extra.minPending = false;
    yield step(c, `${show(k)} < ${was}, the old minimum, so H.min = ${show(k)}.`, ['dk.min'], 2, [
      nodeMark(x, 'found'),
    ]);
  }
  c.extra.ptr = undefined;
}

function* cascadingCut(c: Ctx, y: number): Generator<FibStep, void, void> {
  const { W } = c;
  for (;;) {
    const z = W.n(y).parent;
    c.extra.ptr = { y, z };
    if (z === null) {
      yield step(
        c,
        `cascadingCut(${W.k(y)}): ${W.k(y)} is a root, so the cascade stops. Roots do not need marks.`,
        ['cc.sig', 'cc.z', 'cc.if'],
        2,
        [nodeMark(y, 'done')],
      );
      return;
    }
    const Y = W.n(y);
    if (!Y.mark) {
      Y.mark = true;
      yield step(
        c,
        `cascadingCut(${W.k(y)}): ${W.k(y)} has just lost a child and was not marked, so mark it. If it loses a second child, it will be cut too.`,
        ['cc.sig', 'cc.z', 'cc.if', 'cc.unmarked', 'cc.mark'],
        2,
        [nodeMark(y, 'active')],
      );
      return;
    }
    cut(W, y, z);
    yield step(
      c,
      `cascadingCut(${W.k(y)}): ${W.k(y)} was marked, so this is the second child it has lost. Cut it from ${W.k(z)} too, and carry on up at ${W.k(z)}.`,
      [
        'cc.sig',
        'cc.z',
        'cc.if',
        'cc.unmarked',
        'cc.else',
        'cc.cut',
        'cc.rec',
        'cut.sig',
        'cut.remove',
        'cut.add',
        'cut.unmark',
      ],
      2,
      [nodeMark(y, 'new'), nodeMark(z, 'compare')],
    );
    y = z;
  }
}

// ---------------------------------------------------------------------------------------------
// Operations

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const c = ctx(s);
    const key = parseKey(raw!);
    if (key instanceof Error) {
      yield* refuse(c, `insert(${String(raw)}): ${key.message} The heap is unchanged.`, 'ins.sig', {
        label: 'key',
        text: String(raw),
      });
      return s;
    }
    const { W } = c;
    c.vars.key = key;
    if (W.size() >= MAX_KEYS) {
      yield* refuse(
        c,
        `insert(${key}): this page keeps heaps to ${MAX_KEYS} keys so they stay readable. ${key} is not inserted.`,
        'ins.sig',
        { label: 'key', text: String(key) },
      );
      return s;
    }
    const u = W.add(key);
    W.addRoot(u);
    const old = W.min;
    yield step(
      c,
      old === null
        ? `insert(${key}): the heap is empty. ${key} becomes a one-node tree and the whole root list.`
        : `insert(${key}): make a one-node tree and add it to the root list, just left of H.min. No linking, no tidying: a Fibonacci heap is lazy.`,
      ['ins.sig', 'ins.node', 'ins.add'],
      2,
      [nodeMark(u, 'new')],
      { minPending: true },
    );
    if (old === null) W.min = u;
    else {
      W.comparisons += 1;
      if (key < W.n(old).key) W.min = u;
    }
    yield step(
      c,
      old === null
        ? `H.min = ${key}. ${summary(W)}`
        : key < W.n(old).key
          ? `${key} < ${W.k(old)}, so H.min moves to ${key}. ${summary(W)}`
          : `${key} ≥ ${W.k(old)}, so H.min stays at ${W.k(old)}. ${summary(W)}`,
      ['ins.min'],
      1,
      [nodeMark(u, 'done'), ...(W.min === null ? [] : [nodeMark(W.min, 'found')])],
    );
    return W.snap();
  },
};

const findmin: Op = {
  label: 'Minimum',
  arity: 0,
  *run(s) {
    const c = ctx(s);
    const { W } = c;
    if (W.min === null) {
      yield step(c, 'minimum(): the heap is empty, so there is no minimum.', ['fm.sig'], 1, [
        mark('empty', 'error'),
      ]);
      return s;
    }
    c.vars.returned = W.n(W.min).key;
    yield step(
      c,
      `minimum(): H.min points straight at it: ${W.k(W.min)}. No search, O(1).`,
      ['fm.sig', 'fm.ret'],
      1,
      [nodeMark(W.min, 'found'), mark('out', 'found')],
      { out: { text: W.k(W.min), label: 'min' } },
    );
    return s;
  },
};

const deletemin: Op = {
  label: 'Extract min',
  arity: 0,
  *run(s) {
    const c = ctx(s);
    const key = yield* extractMin(c, 'extractMin()');
    if (key === null) return s;
    c.vars.returned = key;
    c.extra.minPending = false;
    yield step(c, `Return ${show(key)}. ${summary(c.W)}`, ['ex.ret'], 1, [mark('out', 'found')]);
    return c.W.snap();
  },
};

const union: Op = {
  label: 'Union with',
  arity: 1,
  *run(s, [raw]) {
    const c = ctx(s);
    const keys = parseKeyList(raw!);
    if (keys instanceof Error) {
      yield* refuse(c, `union(${String(raw)}): ${keys.message} The heap is unchanged.`, 'un.sig', {
        label: 'list',
        text: String(raw),
      });
      return s;
    }
    const { W } = c;
    if (W.size() + keys.length > MAX_KEYS) {
      yield* refuse(
        c,
        `union(${keys.join(' ')}): the result would have more than ${MAX_KEYS} keys, more than this page draws readably. The heap is unchanged.`,
        'un.sig',
        { label: 'list', text: keys.join(' ') },
      );
      return s;
    }
    // H2 is built by inserting the keys: lazily, a root list of single nodes.
    for (const k of keys) {
      const u = W.add(k);
      const at = W.otherMin === null ? W.other.length : W.other.indexOf(W.otherMin);
      W.other.splice(at, 0, u);
      if (W.otherMin === null || k < W.n(W.otherMin).key) W.otherMin = u;
    }
    c.extra.otherLabel = 'H2';
    yield step(
      c,
      `union(${keys.join(' ')}): H2 is the Fibonacci heap you get by inserting ${keys.length === 1 ? 'that key' : 'those keys'}: ${keys.length === 1 ? 'one root' : `${keys.length} roots`}, nothing linked. Its minimum is ${W.k(W.otherMin)}.`,
      ['un.sig', 'un.h2'],
      2,
      W.other.map((u) => nodeMark(u, 'new')),
    );
    const m1 = W.min;
    const m2 = W.otherMin!;
    W.roots.push(...W.other);
    W.other = [];
    W.otherMin = null;
    c.extra.otherLabel = undefined;
    if (m1 !== null) W.comparisons += 1;
    W.min = m1 === null || W.n(m2).key < W.n(m1).key ? m2 : m1;
    yield step(
      c,
      `Splice H2's root list into H's: one pointer change in each circular list. The smaller of the two minimums, ${W.k(W.min)}, is H.min. No links: O(1). ${summary(W)}`,
      ['un.cat', 'un.min'],
      1,
      [nodeMark(W.min, 'found')],
    );
    return W.snap();
  },
};

function* findForKey(c: Ctx, name: string, rawK: Value, line: string) {
  const k = parseKey(rawK);
  if (k instanceof Error) {
    yield* refuse(c, `${name}: ${k.message} The heap is unchanged.`, line, {
      label: 'key',
      text: String(rawK),
    });
    return null;
  }
  const u = findKey(c.W.nodes, c.W.roots, k);
  if (u === null) {
    yield* refuse(c, `${name}: no node holds ${k}. The heap is unchanged.`, line, {
      label: 'key',
      text: String(k),
    });
    return null;
  }
  return u;
}

const decrease: Op = {
  label: 'Decrease key',
  arity: 2,
  *run(s, [rawK, rawNew]) {
    const c = ctx(s);
    const name = `decreaseKey(${String(rawK)}, ${String(rawNew)})`;
    const k2 = parseKey(rawNew!);
    if (k2 instanceof Error) {
      yield* refuse(c, `${name}: ${k2.message} The heap is unchanged.`, 'dk.sig', {
        label: 'key',
        text: String(rawNew),
      });
      return s;
    }
    const u = yield* findForKey(c, name, rawK!, 'dk.sig');
    if (u === null) return s;
    const { W } = c;
    if (k2 > W.n(u).key) {
      yield* refuse(
        c,
        `${name}: ${k2} > ${W.k(u)}, and decreaseKey only lowers a key. The heap is unchanged.`,
        'dk.err',
        { label: 'key', text: String(k2) },
      );
      return s;
    }
    c.vars.key = k2;
    yield* decreaseTo(c, u, k2, name);
    yield step(
      c,
      `Done. ${summary(W)}`,
      ['dk.sig'],
      1,
      W.min === null ? [] : [nodeMark(W.min, 'found')],
    );
    return W.snap();
  },
};

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [rawK]) {
    const c = ctx(s);
    const name = `delete(${String(rawK)})`;
    const u = yield* findForKey(c, name, rawK!, 'del.sig');
    if (u === null) return s;
    const { W } = c;
    const k = W.n(u).key;
    c.vars.key = k;
    yield step(
      c,
      `${name}: lower its key to −∞, so that it becomes the minimum, then extract the minimum.`,
      ['del.sig', 'del.dec'],
      2,
      [nodeMark(u, 'remove')],
    );
    yield* decreaseTo(c, u, NEG_INF, `decreaseKey(${k}, −∞)`);
    yield* extractMin(c, 'extractMin()');
    c.extra.out = { text: String(k), label: 'deleted' };
    c.extra.minPending = false;
    yield step(c, `${k} is gone. ${summary(W)}`, ['del.ex'], 1, [mark('out', 'found')]);
    return W.snap();
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const c = ctx(s);
    c.W.nodes = {};
    c.W.roots = [];
    c.W.min = null;
    yield step(
      c,
      s.roots.length === 0
        ? 'clear(): the heap was already empty.'
        : 'clear(): H.min = nil and n = 0. Every tree is gone.',
      ['clr.min'],
      1,
      [],
    );
    return c.W.snap();
  },
};

export const ops = { insert, findmin, deletemin, union, decrease, delete: del, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode (CLRS chapter 19)

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const CONSOLIDATE = [
  L('con.sig', 0, 'consolidate(H)', 'To tidy the root list:'),
  L('con.table', 1, 'A[0..D(n)] = nil', 'make a table with a slot per degree.'),
  L('con.loop', 1, 'for each root w', 'For each root,'),
  L('con.x', 2, 'x = w; d = x.degree', 'look at its degree.'),
  L('con.while', 2, 'while A[d] ≠ nil', 'While another tree has that degree,'),
  L('con.y', 3, 'y = A[d]', 'take it out of the table,'),
  L('con.swap', 3, 'if x.key > y.key: swap x, y', 'make x the smaller root,'),
  L('con.link', 3, 'link(H, y, x)', 'hang y under x,'),
  L('con.clear', 3, 'A[d] = nil', 'empty that slot'),
  L('con.inc', 3, 'd = d + 1', 'and try the next degree up.'),
  L('con.file', 2, 'A[d] = x', 'File x under its degree.'),
  L('con.rebuild', 1, 'root list = the trees in A', 'The table holds the new root list;'),
  L('con.min', 1, 'H.min = the smallest of them', 'find the smallest root.'),
  L('lk.sig', 0, 'link(H, y, x)', 'To hang root y under root x:'),
  L('lk.remove', 1, 'remove y from the root list', 'take y out of the root list,'),
  L('lk.child', 1, 'make y a child of x', 'add it to the children of x,'),
  L('lk.unmark', 1, 'y.mark = false', 'and clear its mark.'),
];

const CUTS = [
  L('cut.sig', 0, 'cut(H, x, y)', 'To cut x from its parent y:'),
  L('cut.remove', 1, 'remove x from y.children', 'take x out of the children of y,'),
  L('cut.add', 1, 'add x to the root list', 'make it a root,'),
  L('cut.unmark', 1, 'x.p = nil; x.mark = false', 'with no parent and no mark.'),
  L('cc.sig', 0, 'cascadingCut(H, y)', 'After y loses a child:'),
  L('cc.z', 1, 'z = y.p', 'look at its parent.'),
  L('cc.if', 1, 'if z ≠ nil', 'If y is not a root,'),
  L('cc.unmarked', 2, 'if y.mark == false', 'and this is its first loss,'),
  L('cc.mark', 3, 'y.mark = true', 'mark it and stop;'),
  L('cc.else', 2, 'else', 'if it had lost one already,'),
  L('cc.cut', 3, 'cut(H, y, z)', 'cut it as well'),
  L('cc.rec', 3, 'cascadingCut(H, z)', 'and check its parent.'),
];

const DECREASE = [
  L('dk.sig', 0, 'decreaseKey(H, x, k)', 'To lower the key of node x to k:'),
  L('dk.err', 1, 'if k > x.key: error', 'a bigger key is not allowed.'),
  L('dk.set', 1, 'x.key = k', 'Write the new key.'),
  L('dk.y', 1, 'y = x.p', 'Look at its parent.'),
  L('dk.if', 1, 'if y ≠ nil and x.key < y.key', 'If the parent is now bigger,'),
  L('dk.cut', 2, 'cut(H, x, y); cascadingCut(H, y)', 'cut x loose and check the parent.'),
  L('dk.min', 1, 'if x.key < H.min.key: H.min = x', 'Maybe x is the new minimum.'),
];

const EXTRACT = [
  L('ex.sig', 0, 'extractMin(H)', 'To remove the smallest key:'),
  L('ex.z', 1, 'z = H.min', 'it is the one H.min points at.'),
  L('ex.kids', 1, "move z's children to the root list", 'Its children become roots.'),
  L('ex.remove', 1, 'remove z from the root list', 'Take z out of the root list.'),
  L('ex.empty', 1, 'if z was alone: H.min = nil', 'If that was everything, the heap is empty;'),
  L('ex.right', 1, 'else H.min = z.right', 'otherwise point H.min anywhere for now'),
  L('ex.con', 2, 'consolidate(H)', 'and tidy up the root list.'),
  L('ex.ret', 1, 'return z', 'Hand back z.'),
];

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(H, key)', 'To insert a key:'),
        L('ins.node', 1, 'x = a new node: key', 'make a node with no children,'),
        L('ins.add', 1, 'add x to the root list', 'put it in the root list,'),
        L('ins.min', 1, 'if x.key < H.min.key: H.min = x', 'and keep H.min the smallest root.'),
      ],
    },
    {
      op: 'findmin',
      lines: [
        L('fm.sig', 0, 'minimum(H)', 'To find the smallest key:'),
        L('fm.ret', 1, 'return H.min', 'H.min already points at it.'),
      ],
    },
    { op: 'deletemin', lines: [...EXTRACT, ...CONSOLIDATE] },
    {
      op: 'union',
      lines: [
        L('un.sig', 0, 'union(H, list)', 'To unite with a second heap:'),
        L('un.h2', 1, 'H2 = heapOf(list)', 'build it by inserting the keys,'),
        L('un.cat', 1, 'join the root lists of H and H2', 'splice its root list into ours,'),
        L('un.min', 1, 'H.min = the smaller minimum', 'and keep the smaller minimum.'),
      ],
    },
    { op: 'decrease', lines: [...DECREASE, ...CUTS] },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(H, x)', 'To delete node x:'),
        L('del.dec', 1, 'decreaseKey(H, x, −∞)', 'make it the smallest key of all,'),
        L('del.ex', 1, 'extractMin(H)', 'then extract the minimum.'),
        ...DECREASE,
        ...CUTS,
        ...EXTRACT,
        ...CONSOLIDATE,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear(H)', 'To empty the heap:'),
        L('clr.min', 1, 'H.min = nil; H.n = 0', 'forget every tree.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------

export function initialSay(): string {
  return 'An empty Fibonacci heap: a min-heap kept as a circular list of trees, with H.min pointing at the smallest root. Operations stay lazy until extractMin has to tidy up. Insert some keys.';
}

export function initialVars(): Record<string, Scalar> {
  return { N: 0, Φ: 0, 't(H)': 0, 'm(H)': 0, comparisons: 0, links: 0, cuts: 0 };
}

export function describe(s: S): string {
  const n = countNodes(s.nodes, s.roots);
  if (n === 0 && s.other.length === 0) return 'An empty Fibonacci heap.';
  const parts: string[] = [];
  const walk = (u: number) => {
    const node = s.nodes[u]!;
    const kids = node.children.map((c) => show(s.nodes[c]!.key));
    const m = node.mark ? ', marked,' : '';
    parts.push(
      kids.length
        ? `${show(node.key)}${m} has children ${kids.join(', ')}.`
        : `${show(node.key)}${m} is a leaf.`,
    );
    node.children.forEach(walk);
  };
  s.roots.forEach(walk);
  const m = marked(s.nodes);
  const main =
    n === 0
      ? 'An empty Fibonacci heap.'
      : `A Fibonacci heap with ${n} ${n === 1 ? 'key' : 'keys'} in ${s.roots.length} ${s.roots.length === 1 ? 'tree' : 'trees'}, ${m} marked. The roots, in list order: ${s.roots.map((r) => show(s.nodes[r]!.key)).join(', ')}. H.min is ${s.min === null ? 'nil' : show(s.nodes[s.min]!.key)}. ${parts.join(' ')}`;
  if (s.other.length === 0) return main;
  return `${main} A second heap with roots ${s.other.map((r) => show(s.nodes[r]!.key)).join(', ')} waits to be joined.`;
}
