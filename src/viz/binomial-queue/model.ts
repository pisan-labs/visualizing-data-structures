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
 * A binomial queue (CLRS: binomial heap), a min-heap. Nodes keep the CLRS fields: key, degree,
 * parent, child (the leftmost child, of the highest degree) and sibling (the next node to the
 * right, or the next root in the root list). A key has its own identity (`vid`), apart from
 * the node holding it, so decrease-key can move keys between nodes the way CLRS exchanges them.
 */
export interface BNode {
  uid: number;
  key: number;
  vid: number;
  degree: number;
  parent: number | null;
  child: number | null;
  sibling: number | null;
}

export interface BinState {
  nodes: Record<number, BNode>;
  /** The root list, linked by `sibling`, in increasing degree. */
  head: number | null;
  /** A second root list waiting to be united with the first. Only set during an operation. */
  other: number | null;
  nextUid: number;
  nextVid: number;
}

export interface BinSettings {
  [key: string]: Scalar;
  /** logical: each tree drawn as a tree. internal: the child and sibling pointers. */
  view: 'logical' | 'internal';
}

export interface BinExtra {
  /** A key handed back, drawn in a box left of the forest. */
  out?: { key: number; label: string };
  /** An argument that was refused. */
  arg?: { label: string; text: string };
  /** The pointers of union (prev, x, next) and of the root scans (x, y). */
  ptr?: Record<string, number | null>;
  /** What the second root list is, drawn beside it: "H2", "new", "children". */
  otherLabel?: string;
  /** N of each list before a union, for the binary sum. */
  sum?: { a: number; b: number };
}

type S = BinState;
type X = BinExtra;
type Op = OpSpec<S, BinSettings, X>;
type BinStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const MAX_KEYS = 31;
export const MAX_LIST = 15;

export const defaults: BinSettings = { view: 'logical' };

export function init(): S {
  return { nodes: {}, head: null, other: null, nextUid: 1, nextVid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const nodeMark = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** "B₃" */
export const tree = (k: number) => `B${[...String(k)].map((d) => SUB[Number(d)]).join('')}`;
/** "1101₂" */
export const binary = (n: number) => `${n.toString(2)}₂`;

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
  if (tokens.length === 0) return new Error('Type the keys of the second queue, such as 5 3 8.');
  if (tokens.length > MAX_LIST)
    return new Error(`Keep the second queue to ${MAX_LIST} keys; the list has ${tokens.length}.`);
  const keys: number[] = [];
  for (const t of tokens) {
    const k = parseKey(t);
    if (k instanceof Error)
      return new Error(tokens.length > 1 ? `"${t}": ${k.message}` : k.message);
    keys.push(k);
  }
  return keys;
}

export function parseQueueInput(token: string): Value | Error {
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

type Nodes = Record<number, BNode>;

/** Follow sibling pointers from u. */
export function listFrom(nodes: Nodes, u: number | null): number[] {
  const out: number[] = [];
  for (let x = u; x !== null; x = nodes[x]!.sibling) out.push(x);
  return out;
}

export const childrenOf = (nodes: Nodes, u: number) => listFrom(nodes, nodes[u]!.child);

export function countFrom(nodes: Nodes, u: number | null): number {
  let n = 0;
  for (const r of listFrom(nodes, u)) n += 1 + countFrom(nodes, nodes[r]!.child);
  return n;
}

/** The first node holding key k: roots left to right, each tree in preorder. */
export function findKey(nodes: Nodes, head: number | null, k: number): number | null {
  for (const r of listFrom(nodes, head)) {
    if (nodes[r]!.key === k) return r;
    const below = findKey(nodes, nodes[r]!.child, k);
    if (below !== null) return below;
  }
  return null;
}

/** link(y, z) from CLRS: y becomes the leftmost child of z. */
function link(nodes: Nodes, y: number, z: number): void {
  const Y = nodes[y]!;
  const Z = nodes[z]!;
  Y.parent = z;
  Y.sibling = Z.child;
  Z.child = y;
  Z.degree += 1;
}

/** Merge two root lists by degree (ties: the first list's tree first) and return the head. */
function mergeLists(nodes: Nodes, a: number | null, b: number | null): number | null {
  const all = [
    ...listFrom(nodes, a).map((u) => [u, 0] as const),
    ...listFrom(nodes, b).map((u) => [u, 1] as const),
  ];
  all.sort((p, q) => nodes[p[0]]!.degree - nodes[q[0]]!.degree || p[1] - q[1]);
  all.forEach(([u], i) => {
    nodes[u]!.sibling = all[i + 1]?.[0] ?? null;
  });
  return all[0]?.[0] ?? null;
}

/** CLRS union with no steps, for building the second queue of a merge from its list. */
export function quietUnion(nodes: Nodes, a: number | null, b: number | null): number | null {
  let head = mergeLists(nodes, a, b);
  if (head === null) return null;
  let prev: number | null = null;
  let x = head;
  let next = nodes[x]!.sibling;
  while (next !== null) {
    const sib = nodes[next]!.sibling;
    const dx = nodes[x]!.degree;
    if (dx !== nodes[next]!.degree || (sib !== null && nodes[sib]!.degree === dx)) {
      prev = x;
      x = next;
    } else if (nodes[x]!.key <= nodes[next]!.key) {
      nodes[x]!.sibling = sib;
      link(nodes, next, x);
    } else {
      if (prev === null) head = next;
      else nodes[prev]!.sibling = next;
      link(nodes, x, next);
      x = next;
    }
    next = nodes[x]!.sibling;
  }
  return head;
}

// ---------------------------------------------------------------------------------------------
// A working copy.

class Work {
  nodes: Nodes;
  head: number | null;
  other: number | null;
  nextUid: number;
  nextVid: number;
  comparisons = 0;
  links = 0;

  constructor(s: S) {
    this.nodes = Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, { ...n }]));
    this.head = s.head;
    this.other = s.other;
    this.nextUid = s.nextUid;
    this.nextVid = s.nextVid;
  }

  n(u: number): BNode {
    return this.nodes[u]!;
  }

  snap(): S {
    const nodes = Object.fromEntries(
      Object.entries(this.nodes).map(([k, n]) => [k, { ...n }]),
    ) as Nodes;
    return {
      nodes,
      head: this.head,
      other: this.other,
      nextUid: this.nextUid,
      nextVid: this.nextVid,
    };
  }

  add(key: number): number {
    const uid = this.nextUid;
    this.nextUid += 1;
    this.nodes[uid] = {
      uid,
      key,
      vid: this.nextVid,
      degree: 0,
      parent: null,
      child: null,
      sibling: null,
    };
    this.nextVid += 1;
    return uid;
  }

  roots(): number[] {
    return listFrom(this.nodes, this.head);
  }

  size(): number {
    return countFrom(this.nodes, this.head);
  }
}

interface Ctx {
  W: Work;
  extra: X;
  vars: Record<string, Scalar>;
}

/** "B₃, B₂ and B₀" */
function treesText(W: Work, head: number | null): string {
  const ks = listFrom(W.nodes, head).map((u) => tree(W.n(u).degree));
  if (ks.length === 0) return 'no trees';
  return ks.length === 1 ? ks[0]! : `${ks.slice(0, -1).join(', ')} and ${ks[ks.length - 1]}`;
}

function step(
  c: Ctx,
  say: string,
  lines: string[],
  level: Level,
  marks: Mark[],
  more: Partial<X> = {},
): BinStep {
  const state = c.W.snap();
  const n = countFrom(state.nodes, state.head) + countFrom(state.nodes, state.other);
  const extra: X = { ...c.extra, ...more };
  if (extra.ptr) extra.ptr = { ...extra.ptr };
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      N: n,
      binary: n.toString(2),
      trees: listFrom(state.nodes, state.head).length + listFrom(state.nodes, state.other).length,
      ...c.vars,
      comparisons: c.W.comparisons,
      links: c.W.links,
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

const summary = (W: Work) => {
  const n = W.size();
  return n === 0 ? 'N = 0: no trees.' : `N = ${n} = ${binary(n)}: ${treesText(W, W.head)}.`;
};

// ---------------------------------------------------------------------------------------------
// union: merge the root lists by degree, then link trees of equal degree, CLRS cases 1 to 4.

function* union(c: Ctx): Generator<BinStep, void, void> {
  const { W } = c;
  const a = countFrom(W.nodes, W.head);
  const b = countFrom(W.nodes, W.other);
  c.extra.sum = { a, b };
  if (W.other === null) return;
  const sum = `${binary(a)} + ${binary(b)} = ${binary(a + b)}`;
  W.head = mergeLists(W.nodes, W.head, W.other);
  W.other = null;
  c.extra.otherLabel = undefined;
  yield step(
    c,
    `union: merge the two root lists by degree, the way merge sort merges two sorted lists. Trees of the same degree are now side by side. In binary, ${sum}, so the result will have ${treesOfSize(a + b)}.`,
    ['un.sig', 'un.merge', 'un.init', 'un.next'],
    2,
    W.roots().map((u) => nodeMark(u, 'visit')),
  );
  let prev: number | null = null;
  let x = W.head!;
  let next = W.n(x).sibling;
  const ptr = (more: Record<string, number | null> = {}) => ({ prev, x, next, ...more });
  c.extra.ptr = ptr();
  while (next !== null) {
    const X1 = W.n(x);
    const N1 = W.n(next);
    const sib = N1.sibling;
    const k = X1.degree;
    c.extra.ptr = ptr();
    if (k !== N1.degree) {
      yield step(
        c,
        `x is a ${tree(k)} and next is a ${tree(N1.degree)}: different degrees, nothing to link. Move along: prev = x, x = next.`,
        ['un.loop', 'un.sib', 'un.case1', 'un.skip1'],
        3,
        [nodeMark(x, 'active'), nodeMark(next, 'compare')],
      );
      prev = x;
      x = next;
    } else if (sib !== null && W.n(sib).degree === k) {
      yield step(
        c,
        `Three ${tree(k)} trees in a row: two from the lists and one carried in, like 1 + 1 + 1 = 11 in binary. Keep the first one, and link the next two.`,
        ['un.loop', 'un.sib', 'un.case1', 'un.case2', 'un.skip2'],
        2,
        [nodeMark(x, 'done'), nodeMark(next, 'compare'), nodeMark(sib, 'compare')],
      );
      prev = x;
      x = next;
    } else {
      W.comparisons += 1;
      W.links += 1;
      const case3 = X1.key <= N1.key;
      const [top, below] = case3 ? [x, next] : [next, x];
      const T = W.n(top);
      const B = W.n(below);
      const was = `${tree(k)}s`;
      if (case3) {
        X1.sibling = sib;
        link(W.nodes, next, x);
      } else {
        if (prev === null) W.head = next;
        else W.n(prev).sibling = next;
        link(W.nodes, x, next);
        x = next;
      }
      c.extra.ptr = { prev, x, next: W.n(x).sibling };
      const cmp = case3 ? `${T.key} ≤ ${B.key}` : `${B.key} > ${T.key}`;
      yield step(
        c,
        `Two ${was}: link them. ${cmp}, so the tree rooted at ${B.key} becomes the leftmost child of ${T.key}. Together they make a ${tree(k + 1)}: a carry into the next binary digit.`,
        case3
          ? [
              'un.loop',
              'un.sib',
              'un.case1',
              'un.case2',
              'un.case3',
              'un.link3a',
              'un.link3b',
              'lk.sig',
              'lk.p',
              'lk.sib',
              'lk.child',
              'lk.deg',
            ]
          : [
              'un.loop',
              'un.sib',
              'un.case1',
              'un.case2',
              'un.case3',
              'un.case4',
              'un.head4',
              'un.link4',
              'lk.sig',
              'lk.p',
              'lk.sib',
              'lk.child',
              'lk.deg',
            ],
        2,
        [nodeMark(top, 'active'), nodeMark(below, 'visit')],
      );
    }
    next = W.n(x).sibling;
  }
  c.extra.ptr = undefined;
}

/** "a B₃, a B₂ and a B₀" for a queue of n keys. */
function treesOfSize(n: number): string {
  const ks: string[] = [];
  for (let k = 0; 1 << k <= n; k++) if (n & (1 << k)) ks.push(`a ${tree(k)}`);
  if (ks.length === 0) return 'no trees';
  ks.reverse();
  return ks.length === 1 ? ks[0]! : `${ks.slice(0, -1).join(', ')} and ${ks[ks.length - 1]}`;
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
      yield* refuse(
        c,
        `insert(${String(raw)}): ${key.message} The queue is unchanged.`,
        'ins.sig',
        {
          label: 'key',
          text: String(raw),
        },
      );
      return s;
    }
    const { W } = c;
    c.vars.key = key;
    if (W.size() >= MAX_KEYS) {
      yield* refuse(
        c,
        `insert(${key}): this page keeps queues to ${MAX_KEYS} keys so they stay readable. ${key} is not inserted.`,
        'ins.sig',
        { label: 'key', text: String(key) },
      );
      return s;
    }
    const n = W.size();
    const u = W.add(key);
    W.other = u;
    c.extra.otherLabel = 'new';
    yield step(
      c,
      `insert(${key}): make a queue of one node, a ${tree(0)}, and unite it with this one. That is adding 1 in binary: ${binary(n)} + 1 = ${binary(n + 1)}.`,
      ['ins.sig', 'ins.new'],
      2,
      [nodeMark(u, 'new')],
    );
    yield* union(c);
    yield step(c, `${key} is in. ${summary(W)}`, ['ins.union'], 1, [nodeMark(u, 'done')]);
    return W.snap();
  },
};

/** Scan the roots for the smallest key. Yields one step per comparison. */
function* scanMin(c: Ctx, line: string[]): Generator<BinStep, [number | null, number], void> {
  const { W } = c;
  const roots = W.roots();
  let best = roots[0]!;
  let bestPrev: number | null = null;
  let prev: number | null = roots[0]!;
  c.extra.ptr = { x: best, y: best };
  yield step(c, `Start with the first root, ${W.n(best).key}, as the smallest so far.`, line, 3, [
    nodeMark(best, 'found'),
  ]);
  for (const r of roots.slice(1)) {
    W.comparisons += 1;
    const better = W.n(r).key < W.n(best).key;
    const was = W.n(best).key;
    if (better) {
      best = r;
      bestPrev = prev;
    }
    c.extra.ptr = { x: r, y: best };
    yield step(
      c,
      better
        ? `${W.n(r).key} < ${was}: the root of the ${tree(W.n(r).degree)} is the smallest so far.`
        : `${W.n(r).key} ≥ ${was}: keep ${was}.`,
      line,
      3,
      [nodeMark(r, 'compare'), nodeMark(best, 'found')],
    );
    prev = r;
  }
  c.extra.ptr = undefined;
  return [bestPrev, best];
}

const findmin: Op = {
  label: 'Find min',
  arity: 0,
  *run(s) {
    const c = ctx(s);
    const { W } = c;
    if (W.head === null) {
      yield step(c, 'findMin(): the queue is empty, so there is no minimum.', ['fm.sig'], 1, [
        mark('empty', 'error'),
      ]);
      return s;
    }
    const [, best] = yield* scanMin(c, ['fm.init', 'fm.loop', 'fm.cmp', 'fm.set']);
    const k = W.n(best).key;
    c.vars.returned = k;
    const t = W.roots().length;
    yield step(
      c,
      `The minimum is ${k}, the root of the ${tree(W.n(best).degree)}. Heap order puts every tree's minimum at its root, so findMin only looks at the ${t} ${t === 1 ? 'root' : 'roots'}: at most ⌊log₂ n⌋ + 1.`,
      ['fm.ret'],
      1,
      [nodeMark(best, 'found'), mark('out', 'found')],
      { out: { key: k, label: 'min' } },
    );
    return s;
  },
};

const deletemin: Op = {
  label: 'Delete min',
  arity: 0,
  *run(s) {
    const c = ctx(s);
    const { W } = c;
    if (W.head === null) {
      yield step(
        c,
        'extractMin(): the queue is empty, so there is nothing to remove.',
        ['ex.empty'],
        1,
        [mark('empty', 'error')],
      );
      return s;
    }
    const [prev, x] = yield* scanMin(c, ['ex.find']);
    const X1 = W.n(x);
    const k = X1.key;
    c.vars.min = k;
    c.extra.out = { key: k, label: 'min' };
    yield step(
      c,
      `The minimum is ${k}, the root of a ${tree(X1.degree)}. Take that tree out of the root list.`,
      ['ex.find', 'ex.remove'],
      2,
      [nodeMark(x, 'found'), mark('out', 'found')],
    );
    if (prev === null) W.head = X1.sibling;
    else W.n(prev).sibling = X1.sibling;
    const kids = listFrom(W.nodes, X1.child).reverse();
    for (const u of kids) W.n(u).parent = null;
    kids.forEach((u, i) => {
      W.n(u).sibling = kids[i + 1] ?? null;
    });
    delete W.nodes[x];
    W.other = kids[0] ?? null;
    c.extra.otherLabel = 'children';
    yield step(
      c,
      kids.length === 0
        ? `Remove ${k}. It was a ${tree(0)}, with no children, so there is nothing to unite.`
        : `Remove ${k}. A ${tree(X1.degree)} has children ${kids
            .map((u) => tree(W.n(u).degree))
            .reverse()
            .join(
              ', ',
            )}, from left to right. Reversed, they are a root list in increasing degree: a queue of their own. Unite it with the rest.`,
      ['ex.remove', 'ex.kids'],
      2,
      [mark('out', 'found')],
    );
    yield* union(c);
    c.vars.returned = k;
    yield step(c, `Return ${k}. ${summary(W)}`, ['ex.union', 'ex.ret'], 1, [mark('out', 'found')]);
    return W.snap();
  },
};

const merge: Op = {
  label: 'Merge with',
  arity: 1,
  *run(s, [raw]) {
    const c = ctx(s);
    const keys = parseKeyList(raw!);
    if (keys instanceof Error) {
      yield* refuse(
        c,
        `mergeWith(${String(raw)}): ${keys.message} The queue is unchanged.`,
        'mw.sig',
        {
          label: 'list',
          text: String(raw),
        },
      );
      return s;
    }
    const { W } = c;
    if (W.size() + keys.length > MAX_KEYS) {
      yield* refuse(
        c,
        `mergeWith(${keys.join(' ')}): the result would have more than ${MAX_KEYS} keys, more than this page draws readably. The queue is unchanged.`,
        'mw.sig',
        { label: 'list', text: keys.join(' ') },
      );
      return s;
    }
    let h2: number | null = null;
    for (const k of keys) h2 = quietUnion(W.nodes, h2, W.add(k));
    W.other = h2;
    c.extra.otherLabel = 'H2';
    yield step(
      c,
      `mergeWith(${keys.join(' ')}): H2 is the binomial queue you get by inserting ${keys.length === 1 ? 'that key' : 'those keys, in that order'}: N2 = ${keys.length} = ${binary(keys.length)}, so it has ${treesText(W, h2)}. Unite it with this queue.`,
      ['mw.sig', 'mw.build'],
      2,
      listFrom(W.nodes, h2).map((u) => nodeMark(u, 'new')),
    );
    yield* union(c);
    yield step(c, `The two queues are one. ${summary(W)}`, ['mw.union'], 1, []);
    return W.snap();
  },
};

const decrease: Op = {
  label: 'Decrease key',
  arity: 2,
  *run(s, [rawK, rawNew]) {
    const c = ctx(s);
    const name = `decreaseKey(${String(rawK)}, ${String(rawNew)})`;
    const k = parseKey(rawK!);
    const k2 = parseKey(rawNew!);
    if (k instanceof Error || k2 instanceof Error) {
      const bad = k instanceof Error ? rawK! : rawNew!;
      const err = (k instanceof Error ? k : k2) as Error;
      yield* refuse(c, `${name}: ${err.message} The queue is unchanged.`, 'dk.sig', {
        label: 'key',
        text: String(bad),
      });
      return s;
    }
    const { W } = c;
    const u = findKey(W.nodes, W.head, k);
    if (u === null) {
      yield* refuse(c, `${name}: no node holds ${k}. The queue is unchanged.`, 'dk.sig', {
        label: 'key',
        text: String(k),
      });
      return s;
    }
    if (k2 > k) {
      yield* refuse(
        c,
        `${name}: ${k2} > ${k}, and decreaseKey only lowers a key (raising one could break heap order below it). The queue is unchanged.`,
        'dk.err',
        { label: 'key', text: String(k2) },
      );
      return s;
    }
    c.vars.key = k2;
    W.n(u).key = k2;
    yield step(
      c,
      `${name}: the node holding ${k} now holds ${k2}. (A real program keeps a pointer to the node; here we find it by its key.) It may now be smaller than its parent.`,
      ['dk.sig', 'dk.err', 'dk.set', 'dk.init'],
      2,
      [nodeMark(u, 'active')],
    );
    let y = u;
    for (;;) {
      const z = W.n(y).parent;
      if (z === null) {
        yield step(
          c,
          `${k2} is at the root of its tree, so it stops. ${summary(W)}`,
          ['dk.loop'],
          2,
          [nodeMark(y, 'done')],
        );
        break;
      }
      W.comparisons += 1;
      if (W.n(y).key >= W.n(z).key) {
        yield step(
          c,
          `Its parent holds ${W.n(z).key} ≤ ${W.n(y).key}, so heap order holds again. ${summary(W)}`,
          ['dk.loop'],
          2,
          [nodeMark(y, 'done'), nodeMark(z, 'compare')],
        );
        break;
      }
      const Y = W.n(y);
      const Z = W.n(z);
      [Y.key, Z.key] = [Z.key, Y.key];
      [Y.vid, Z.vid] = [Z.vid, Y.vid];
      yield step(
        c,
        `${Z.key} < ${Y.key}, its parent: exchange the two keys. ${Z.key} moves up a level.`,
        ['dk.loop', 'dk.swap', 'dk.up'],
        2,
        [nodeMark(z, 'active'), nodeMark(y, 'visit')],
      );
      y = z;
    }
    return W.snap();
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const c = ctx(s);
    c.W.nodes = {};
    c.W.head = null;
    c.W.other = null;
    yield step(
      c,
      s.head === null
        ? 'clear(): the queue was already empty.'
        : 'clear(): head = nil. Every tree is gone.',
      ['clr.head'],
      1,
      [],
    );
    return c.W.snap();
  },
};

export const ops = { insert, findmin, deletemin, merge, decrease, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const UNION = [
  L('un.sig', 0, 'union(H1, H2)', 'To unite two queues:'),
  L(
    'un.merge',
    1,
    'H = merge root lists by degree',
    'merge their root lists, smallest degree first.',
  ),
  L('un.init', 1, 'prev = nil; x = H.head', 'Start at the first root'),
  L('un.next', 1, 'next = x.sibling', 'and look at the one after it.'),
  L('un.loop', 1, 'while next ≠ nil', 'Until x is the last root:'),
  L('un.sib', 2, 'sib = next.sibling', 'look one tree further too.'),
  L('un.case1', 2, 'if deg(x) ≠ deg(next)', 'Different degrees:'),
  L('un.skip1', 3, 'prev = x; x = next', 'move along.'),
  L('un.case2', 2, 'elseif deg(sib) == deg(x)', 'Three of a degree in a row:'),
  L('un.skip2', 3, 'prev = x; x = next', 'skip the first.'),
  L('un.case3', 2, 'elseif x.key ≤ next.key', 'Two of a degree, x smaller:'),
  L('un.link3a', 3, 'x.sibling = sib', 'take next out of the list'),
  L('un.link3b', 3, 'link(next, x)', 'and hang it under x.'),
  L('un.case4', 2, 'else', 'Two of a degree, next smaller:'),
  L('un.head4', 3, 'unlink x from the list', 'take x out of the list,'),
  L('un.link4', 3, 'link(x, next); x = next', 'hang it under next, go on from next.'),
  L('un.adv', 2, 'next = x.sibling', 'Look at the root after x.'),
  L('un.ret', 1, 'return H', 'Done.'),
  L('un.nil', 0, '// deg(nil) = −1', 'A missing tree has no degree.'),
  L('lk.sig', 0, 'link(y, z)', 'To hang tree y under root z:'),
  L('lk.p', 1, 'y.p = z', 'z becomes the parent of y,'),
  L('lk.sib', 1, 'y.sibling = z.child', 'y goes in front of the children of z'),
  L('lk.child', 1, 'z.child = y', 'as its new leftmost child,'),
  L('lk.deg', 1, 'z.degree = z.degree + 1', 'and z has one more child.'),
];

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(key)', 'To insert a key:'),
        L('ins.new', 1, 'H2 = a queue of one node', 'make a queue with one tree, a B₀,'),
        L('ins.union', 1, 'H = union(H, H2)', 'and unite the two.'),
        ...UNION,
      ],
    },
    {
      op: 'findmin',
      lines: [
        L('fm.sig', 0, 'findMin()', 'To find the smallest key:'),
        L('fm.init', 1, 'y = nil; min = ∞', 'nothing found yet.'),
        L('fm.loop', 1, 'for each root x of H', 'Look at every root:'),
        L('fm.cmp', 2, 'if x.key < min', 'if it is smaller than the best so far,'),
        L('fm.set', 3, 'min = x.key; y = x', 'it is the new best.'),
        L('fm.ret', 1, 'return y', 'Hand back the best root.'),
      ],
    },
    {
      op: 'deletemin',
      lines: [
        L('ex.sig', 0, 'extractMin()', 'To remove the smallest key:'),
        L('ex.empty', 1, 'if H.head == nil: error', 'if the queue is empty, stop.'),
        L('ex.find', 1, 'x = the root with min key', 'Find the smallest root, as findMin does,'),
        L('ex.remove', 1, 'remove x from the root list', 'and take its tree out.'),
        L('ex.kids', 1, "H2 = x's children, reversed", 'Its children, reversed, make a queue.'),
        L('ex.union', 1, 'H = union(H, H2)', 'Unite it with the rest.'),
        L('ex.ret', 1, 'return x.key', 'Hand back the smallest key.'),
        ...UNION,
      ],
    },
    {
      op: 'merge',
      lines: [
        L('mw.sig', 0, 'mergeWith(list)', 'To merge in a second queue:'),
        L('mw.build', 1, 'H2 = queueOf(list)', 'build it by inserting the keys in order,'),
        L('mw.union', 1, 'H = union(H, H2)', 'then unite the two.'),
        ...UNION,
      ],
    },
    {
      op: 'decrease',
      lines: [
        L('dk.sig', 0, 'decreaseKey(x, k)', 'To lower the key of node x to k:'),
        L('dk.err', 1, 'if k > x.key: error', 'a bigger key is not allowed.'),
        L('dk.set', 1, 'x.key = k', 'Write the new key.'),
        L('dk.init', 1, 'y = x; z = y.p', 'Look at its parent.'),
        L('dk.loop', 1, 'while z ≠ nil and y.key < z.key', 'While the key beats its parent,'),
        L('dk.swap', 2, 'swap y.key and z.key', 'exchange the two keys'),
        L('dk.up', 2, 'y = z; z = y.p', 'and go up a level.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the queue:'),
        L('clr.head', 1, 'H.head = nil', 'forget the root list.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------

export function initialSay(): string {
  return 'An empty binomial queue (CLRS calls it a binomial heap): a min-heap kept as a list of binomial trees, at most one of each size. Insert some keys, or merge in a second queue.';
}

export function initialVars(s: S): Record<string, Scalar> {
  const n = countFrom(s.nodes, s.head);
  return {
    N: n,
    binary: n.toString(2),
    trees: listFrom(s.nodes, s.head).length,
    comparisons: 0,
    links: 0,
  };
}

export function describe(s: S): string {
  const n = countFrom(s.nodes, s.head);
  if (n === 0 && s.other === null) return 'An empty binomial queue.';
  const trees = (head: number | null) =>
    listFrom(s.nodes, head)
      .map((r) => `a ${tree(s.nodes[r]!.degree)} rooted at ${s.nodes[r]!.key}`)
      .join(', ');
  const main =
    n === 0
      ? 'An empty binomial queue.'
      : `A binomial queue with ${n} ${n === 1 ? 'key' : 'keys'}, ${binary(n)} in binary: ${trees(s.head)}.`;
  if (s.other === null) return main;
  return `${main} A second root list waits to be united: ${trees(s.other)}.`;
}
