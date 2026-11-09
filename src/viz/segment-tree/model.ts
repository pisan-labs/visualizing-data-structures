import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import {
  MAX_VALUE,
  MIN_VALUE,
  plural,
  plus,
  readIndex,
  readList,
  readNumber,
  span,
} from '../_range/kit';

/** The array the page starts with, already built. */
export const START = [5, 3, 8, 1, 9, 2, 7, 4];

/**
 * Nodes are numbered as in most code: the root is 1 and covers A[0..n − 1], and node v covering
 * [lo, hi] has children 2v for [lo, mid] and 2v + 1 for [mid + 1, hi], mid = ⌊(lo + hi)/2⌋.
 */
export interface SegState {
  /** A[0..n − 1]: the values as they are now, every pending add included. Drawn under the tree;
   * the tree itself does not keep A. */
  a: number[];
  /** The value stored in node v (sum or minimum of its range, minus the adds still pending in
   * tags above it). null: no such node, or not built yet. */
  val: (number | null)[];
  /** A pending add that node v still owes its children (0: none). Leaves never have one. */
  lazy: number[];
  /** Nodes computed by the last build, visited by the last query, by the last update or add. */
  buildCost: number;
  queryCost: number;
  updateCost: number;
}

export interface SegSettings {
  [key: string]: Scalar;
  combine: 'sum' | 'min';
}

export interface SegExtra {
  /** What the operation is about: a bracket under A, with a label. */
  range?: { lo: number; hi: number; label: string; role?: MarkRole };
  /** Tags that just moved down: child node -> the parent they slid out of. */
  pushed?: Record<number, number>;
}

type S = SegState;
type X = SegExtra;
type Op = OpSpec<S, SegSettings, X>;
type SegStep = Step<S, X>;

export const defaults: SegSettings = { combine: 'sum' };

export interface SegNode {
  v: number;
  lo: number;
  hi: number;
  depth: number;
}

export const midOf = (lo: number, hi: number) => Math.floor((lo + hi) / 2);

/** Every node of the tree for n values, in preorder. */
export function nodesOf(n: number): SegNode[] {
  const out: SegNode[] = [];
  const walk = (v: number, lo: number, hi: number, depth: number) => {
    out.push({ v, lo, hi, depth });
    if (lo === hi) return;
    const m = midOf(lo, hi);
    walk(2 * v, lo, m, depth + 1);
    walk(2 * v + 1, m + 1, hi, depth + 1);
  };
  if (n > 0) walk(1, 0, n - 1, 0);
  return out;
}

/** Size of the node arrays: enough for every node number, as in code that allocates 4n. */
const slots = (n: number) => 4 * Math.max(1, n);

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const node = (v: number, role: MarkRole) => mark(`node-${v}`, role);
const edge = (v: number, role: MarkRole) => mark(`edge-${v}`, role);
/** "[4, 7]". */
const rg = (lo: number, hi: number) => `[${lo}, ${hi}]`;
/** "+3", "−2". */
export const tagText = (x: number) => (x < 0 ? `−${-x}` : `+${x}`);

/** The tree for values a, built at once. */
export function treeOf(a: readonly number[], combine: SegSettings['combine']): S {
  const n = a.length;
  const val: (number | null)[] = Array(slots(n)).fill(null);
  const build = (v: number, lo: number, hi: number): number => {
    if (lo === hi) return (val[v] = a[lo]!);
    const m = midOf(lo, hi);
    const x = build(2 * v, lo, m);
    const y = build(2 * v + 1, m + 1, hi);
    return (val[v] = combine === 'min' ? Math.min(x, y) : x + y);
  };
  build(1, 0, n - 1);
  return {
    a: [...a],
    val,
    lazy: Array(slots(n)).fill(0),
    buildCost: 2 * n - 1,
    queryCost: 0,
    updateCost: 0,
  };
}

export function init(settings: SegSettings): S {
  return treeOf(START, settings.combine);
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: s.a.length,
    ...more,
    'build cost': s.buildCost,
    'query cost': s.queryCost,
    'update cost': s.updateCost,
  };
}

const copy = (s: S): S => ({ ...s, a: [...s.a], val: [...s.val], lazy: [...s.lazy] });

// ---------------------------------------------------------------------------------------------
// A working copy, the recursion's bookkeeping and the step builder

interface Ctx {
  w: S;
  min: boolean;
  /** Nodes on the recursion stack, root first (each one is waiting for its children). */
  stack: number[];
  /** Marks that stay for the rest of the operation (nodes taken whole, nodes that got an add). */
  keep: Mark[];
  range: NonNullable<X['range']>;
  more: Record<string, Scalar>;
}

/** The edges from the root down to v, as marks. */
function pathTo(v: number, role: MarkRole): Mark[] {
  const out: Mark[] = [];
  for (let u = v; u > 1; u = Math.floor(u / 2)) out.push(edge(u, role));
  return out;
}

function step(
  c: Ctx,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  current: number | null,
  more: { marks?: Mark[]; vars?: Record<string, Scalar>; pushed?: Record<number, number> } = {},
): SegStep {
  const marks = [
    ...c.keep,
    ...c.stack.map((u) => node(u, 'visit')),
    ...(current === null ? [] : [...pathTo(current, 'active'), node(current, 'active')]),
    ...(more.marks ?? []),
  ];
  return {
    state: copy(c.w),
    marks,
    say,
    lines,
    level,
    vars: vars(c.w, { ...c.more, ...more.vars }),
    extra: { range: c.range, pushed: more.pushed },
  };
}

const combine = (c: Ctx, x: number, y: number) => (c.min ? Math.min(x, y) : x + y);
const combineText = (c: Ctx, x: number, y: number) => (c.min ? `min(${x}, ${y})` : plus(x, y));

/** Add x to every value under node v: its value changes, and an inner node keeps a tag. */
function apply(c: Ctx, v: number, lo: number, hi: number, x: number): void {
  c.w.val[v] = c.w.val[v]! + (c.min ? x : x * (hi - lo + 1));
  if (lo < hi) c.w.lazy[v] = c.w.lazy[v]! + x;
}

/** Push node v's tag down to its children, with a step that says so. */
function* push(
  c: Ctx,
  v: number,
  lo: number,
  hi: number,
  lines: string[],
): Generator<SegStep, void, void> {
  const x = c.w.lazy[v]!;
  if (x === 0) return;
  const m = midOf(lo, hi);
  const [l, r] = [2 * v, 2 * v + 1];
  const [ol, or] = [c.w.val[l]!, c.w.val[r]!];
  apply(c, l, lo, m, x);
  apply(c, r, m + 1, hi, x);
  c.w.lazy[v] = 0;
  const grow = (lo2: number, hi2: number) =>
    c.min ? `${tagText(x)}` : `${tagText(x)} × ${hi2 - lo2 + 1}`;
  const inner = [lo < m, m + 1 < hi];
  const tail =
    inner[0] && inner[1]
      ? 'Each now holds the tag for its own children.'
      : inner[0] || inner[1]
        ? `${inner[0] ? rg(lo, m) : rg(m + 1, hi)} now holds the tag for its own children; the other is a leaf.`
        : 'Both are leaves, so the tag stops there.';
  yield step(
    c,
    `Push the tag ${tagText(x)} down first. Node ${rg(lo, m)} goes from ${ol} to ${c.w.val[l]} (${grow(lo, m)}) and node ${rg(m + 1, hi)} from ${or} to ${c.w.val[r]} (${grow(m + 1, hi)}). ${tail}`,
    lines,
    2,
    v,
    {
      marks: [node(l, 'new'), node(r, 'new')],
      pushed: Object.fromEntries([l, r].filter((u) => c.w.lazy[u] !== 0).map((u) => [u, v])),
    },
  );
}

/** A step that refuses the call and changes nothing. The code tabs' script skips these. */
function* refuse(s: S, say: string, line: string): Generator<SegStep, S, void> {
  yield {
    state: s,
    marks: [mark('a-name', 'error')],
    say,
    lines: [line],
    level: 1,
    vars: vars(s),
    extra: {},
  };
  return s;
}

/** Why l..r cannot be used, or null. */
function badRange(n: number, l: number, r: number): string | null {
  const all = `A has ${plural(n, 'value')}, A[0] to A[${n - 1}]`;
  if (l < 0 || l >= n) return `There is no A[${l}]: ${all}.`;
  if (r < 0 || r >= n) return `There is no A[${r}]: ${all}.`;
  if (l > r) return `l = ${l} is after r = ${r}. The range runs from l up to r, so swap them.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Build

function* buildRec(c: Ctx, v: number, lo: number, hi: number): Generator<SegStep, number, void> {
  c.w.buildCost += 1;
  if (lo === hi) {
    const x = c.w.a[lo]!;
    c.w.val[v] = x;
    yield step(c, `Leaf ${rg(lo, hi)} = A[${lo}] = ${x}.`, ['b.leaf', 'b.set'], 3, v, {
      vars: { node: rg(lo, hi) },
    });
    return x;
  }
  const m = midOf(lo, hi);
  c.stack.push(v);
  const x = yield* buildRec(c, 2 * v, lo, m);
  const y = yield* buildRec(c, 2 * v + 1, m + 1, hi);
  c.stack.pop();
  const z = combine(c, x, y);
  c.w.val[v] = z;
  yield step(
    c,
    `Node ${rg(lo, hi)} = ${combineText(c, x, y)} = ${z}: the ${c.min ? 'smaller' : 'sum'} of its children, ${rg(lo, m)} and ${rg(m + 1, hi)}.`,
    ['b.mid', 'b.kids', 'b.combine'],
    2,
    v,
    { vars: { node: rg(lo, hi) }, marks: [node(2 * v, 'done'), node(2 * v + 1, 'done')] },
  );
  return z;
}

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [arg], { settings }) {
    const vs = readList(arg);
    if (typeof vs === 'string')
      return yield* refuse(s, `Nothing built. ${vs} The array stays as it was.`, 'b.sig');
    const n = vs.length;
    const w: S = {
      a: vs,
      val: Array(slots(n)).fill(null),
      lazy: Array(slots(n)).fill(0),
      buildCost: 0,
      queryCost: 0,
      updateCost: 0,
    };
    const c: Ctx = {
      w,
      min: settings.combine === 'min',
      stack: [],
      keep: [],
      range: { lo: 0, hi: n - 1, label: 'build' },
      more: {},
    };
    yield step(
      c,
      `build: A gets ${plural(n, 'value')}. The tree gets 2n − 1 = ${2 * n - 1} nodes: one leaf per value, and above them every range the halving makes. Each node is computed once, from its two children, on the way back up.`,
      ['b.sig'],
      2,
      null,
    );
    yield* buildRec(c, 1, 0, n - 1);
    yield step(
      c,
      `The tree is built: ${plural(w.buildCost, 'node')}, each computed once, O(n). The root holds the ${c.min ? 'minimum' : 'sum'} of all of A.`,
      [],
      1,
      null,
    );
    return copy(w);
  },
};

// ---------------------------------------------------------------------------------------------
// Query

function* queryRec(
  c: Ctx,
  v: number,
  lo: number,
  hi: number,
  l: number,
  r: number,
): Generator<SegStep, number, void> {
  c.w.queryCost += 1;
  const name = rg(lo, hi);
  const q = rg(l, r);
  const here = { vars: { node: name } };
  if (r < lo || hi < l) {
    yield step(
      c,
      `Node ${name}: no overlap with ${q}, so it ${c.min ? 'cannot hold the minimum: return ∞' : 'adds nothing: return 0'}.`,
      ['q.none', 'q.none.ret'],
      2,
      v,
      here,
    );
    return c.min ? Infinity : 0;
  }
  if (l <= lo && hi <= r) {
    const x = c.w.val[v]!;
    c.keep.push(node(v, 'found'));
    yield step(
      c,
      `Node ${name}: full overlap. ${name} lies inside ${q}, so return its value, ${x}, without going further down.`,
      ['q.full', 'q.full.ret'],
      2,
      v,
      here,
    );
    return x;
  }
  yield step(
    c,
    `Node ${name}: partial overlap. Part of ${name} is inside ${q} and part is not, so ask both children.`,
    ['q.part'],
    2,
    v,
    here,
  );
  yield* push(c, v, lo, hi, ['q.push', 'q.p.apply', 'q.p.clear']);
  const m = midOf(lo, hi);
  c.stack.push(v);
  const x = yield* queryRec(c, 2 * v, lo, m, l, r);
  const y = yield* queryRec(c, 2 * v + 1, m + 1, hi, l, r);
  c.stack.pop();
  const z = combine(c, x, y);
  const show = (t: number) => (t === Infinity ? '∞' : String(t));
  yield step(
    c,
    `Node ${name} returns ${c.min ? `min(${show(x)}, ${show(y)})` : plus(x, y)} = ${show(z)}, from its two children.`,
    ['q.mid', 'q.ret'],
    3,
    v,
    here,
  );
  return z;
}

const query: Op = {
  label: 'Query',
  arity: 2,
  *run(s, [rl, rr], { settings }) {
    const name = settings.combine === 'min' ? 'min' : 'sum';
    const l = readIndex(rl);
    const r = readIndex(rr);
    if (typeof l === 'string' || typeof r === 'string')
      return yield* refuse(s, `query(l, r): ${typeof l === 'string' ? l : r}`, 'q.sig');
    const bad = badRange(s.a.length, l, r);
    if (bad) return yield* refuse(s, `query(${l}, ${r}): ${bad}`, 'q.sig');
    const w = copy(s);
    w.queryCost = 0;
    const c: Ctx = {
      w,
      min: settings.combine === 'min',
      stack: [],
      keep: [],
      range: { lo: l, hi: r, label: `${name}(${l}, ${r})` },
      more: { l, r },
    };
    yield step(
      c,
      `query(${l}, ${r}) asks for the ${c.min ? 'smallest value' : 'sum'} of ${span(l, r)}. Start at the root. At each node there are three cases: no overlap with ${rg(l, r)}, full overlap, or partial overlap.`,
      ['q.sig'],
      2,
      null,
    );
    const ans = yield* queryRec(c, 1, 0, w.a.length - 1, l, r);
    const whole = c.keep.map((k) => Number(k.id.slice(5)));
    const ranges = whole.map((v) => {
      const nd = nodesOf(w.a.length).find((x) => x.v === v)!;
      return rg(nd.lo, nd.hi);
    });
    c.range = { lo: l, hi: r, label: `${name}(${l}, ${r}) = ${ans}`, role: 'found' };
    c.more = { l, r, [name]: ans };
    yield step(
      c,
      `query(${l}, ${r}) = ${ans}: ${whole.length === 1 ? `one node, ${ranges[0]}, is taken whole` : `the ${c.min ? 'smallest' : 'sum'} of the ${whole.length} nodes taken whole, ${ranges.join(', ')}`}. ${plural(w.queryCost, 'node')} visited, out of ${2 * w.a.length - 1}: at most four per level, so O(log n).`,
      ['q.ret'],
      1,
      null,
      {
        marks: Array.from({ length: r - l + 1 }, (_, k) => mark(`a-${l + k}`, 'found')),
      },
    );
    return copy(w);
  },
};

// ---------------------------------------------------------------------------------------------
// Point update

function* updateRec(
  c: Ctx,
  v: number,
  lo: number,
  hi: number,
  i: number,
  x: number,
): Generator<SegStep, void, void> {
  c.w.updateCost += 1;
  const name = rg(lo, hi);
  const here = { vars: { node: name } };
  if (lo === hi) {
    const old = c.w.val[v]!;
    c.w.val[v] = x;
    c.keep.push(node(v, 'new'));
    yield step(c, `Leaf ${name}: ${old} becomes ${x}.`, ['u.leaf', 'u.set'], 2, v, here);
    return;
  }
  const m = midOf(lo, hi);
  const left = i <= m;
  yield step(
    c,
    `Node ${name}: ${i} is in its ${left ? 'left' : 'right'} half, ${left ? rg(lo, m) : rg(m + 1, hi)}.`,
    ['u.mid', left ? 'u.left' : 'u.right'],
    2,
    v,
    here,
  );
  yield* push(c, v, lo, hi, ['u.push']);
  c.stack.push(v);
  if (left) yield* updateRec(c, 2 * v, lo, m, i, x);
  else yield* updateRec(c, 2 * v + 1, m + 1, hi, i, x);
  c.stack.pop();
  const [p, q] = [c.w.val[2 * v]!, c.w.val[2 * v + 1]!];
  const old = c.w.val[v]!;
  c.w.val[v] = combine(c, p, q);
  c.keep.push(node(v, 'new'));
  yield step(
    c,
    `Back up: node ${name} = ${combineText(c, p, q)} = ${c.w.val[v]}${old === c.w.val[v] ? ', the same as before' : ` (it was ${old})`}.`,
    ['u.combine'],
    2,
    v,
    here,
  );
}

const update: Op = {
  label: 'Update',
  arity: 2,
  *run(s, [ri, rx], { settings }) {
    const i = readIndex(ri);
    const x = readNumber(rx);
    if (typeof i === 'string') return yield* refuse(s, `update(i, x): ${i}`, 'u.sig');
    if (typeof x === 'string') return yield* refuse(s, `update(${i}, x): ${x}`, 'u.sig');
    const n = s.a.length;
    if (i < 0 || i >= n)
      return yield* refuse(
        s,
        `update(${i}, ${x}): there is no A[${i}]. A has ${plural(n, 'value')}, A[0] to A[${n - 1}].`,
        'u.sig',
      );
    const w = copy(s);
    w.updateCost = 0;
    const old = w.a[i]!;
    w.a[i] = x;
    const c: Ctx = {
      w,
      min: settings.combine === 'min',
      stack: [],
      keep: [mark(`a-${i}`, 'active')],
      range: { lo: i, hi: i, label: `update(${i}, ${x})` },
      more: { i, x },
    };
    yield step(
      c,
      `update(${i}, ${x}): A[${i}] goes from ${old} to ${x}. Walk from the root down to the leaf for ${i}, pushing any tags on the way, then fix every node on the way back up.`,
      ['u.sig'],
      2,
      null,
    );
    yield* updateRec(c, 1, 0, n - 1, i, x);
    yield step(
      c,
      `Done: ${plural(w.updateCost, 'node')} changed, one per level from the root to the leaf: O(log n).`,
      [],
      1,
      null,
    );
    return copy(w);
  },
};

// ---------------------------------------------------------------------------------------------
// Range add, with lazy tags

function* addRec(
  c: Ctx,
  v: number,
  lo: number,
  hi: number,
  l: number,
  r: number,
  x: number,
): Generator<SegStep, void, void> {
  c.w.updateCost += 1;
  const name = rg(lo, hi);
  const q = rg(l, r);
  const here = { vars: { node: name } };
  if (r < lo || hi < l) {
    yield step(
      c,
      `Node ${name}: no overlap with ${q}, so nothing changes here.`,
      ['a.none'],
      3,
      v,
      here,
    );
    return;
  }
  if (l <= lo && hi <= r) {
    const old = c.w.val[v]!;
    apply(c, v, lo, hi, x);
    c.keep.push(node(v, 'new'));
    const len = hi - lo + 1;
    yield step(
      c,
      lo === hi
        ? `Leaf ${name}: full overlap. Its value goes from ${old} to ${c.w.val[v]}.`
        : `Node ${name}: full overlap. ${len === 2 ? 'Both' : `All ${len}`} of its values go up by ${x}, so its ${c.min ? `minimum goes up by ${x} too` : `sum goes up by ${x} × ${len} = ${x * len}`}: ${old} becomes ${c.w.val[v]}. Its children are left alone; the tag ${tagText(c.w.lazy[v]!)} says what they still owe.`,
      ['a.full', 'a.apply', 'a.ap.val', 'a.ap.tag'],
      2,
      v,
      here,
    );
    return;
  }
  yield step(
    c,
    `Node ${name}: partial overlap with ${q}. Push its tag down if it has one, add to both children, then recompute it.`,
    ['a.part'],
    2,
    v,
    here,
  );
  yield* push(c, v, lo, hi, ['a.push']);
  const m = midOf(lo, hi);
  c.stack.push(v);
  yield* addRec(c, 2 * v, lo, m, l, r, x);
  yield* addRec(c, 2 * v + 1, m + 1, hi, l, r, x);
  c.stack.pop();
  const [p, q2] = [c.w.val[2 * v]!, c.w.val[2 * v + 1]!];
  c.w.val[v] = combine(c, p, q2);
  yield step(
    c,
    `Back up: node ${name} = ${combineText(c, p, q2)} = ${c.w.val[v]}.`,
    ['a.mid', 'a.kids', 'a.combine'],
    2,
    v,
    here,
  );
}

const add: Op = {
  label: 'Range add',
  arity: 3,
  *run(s, [rl, rr, rx], { settings }) {
    const l = readIndex(rl);
    const r = readIndex(rr);
    const x = readNumber(rx);
    if (typeof l === 'string' || typeof r === 'string')
      return yield* refuse(s, `add(l, r, x): ${typeof l === 'string' ? l : r}`, 'a.sig');
    if (typeof x === 'string') return yield* refuse(s, `add(${l}, ${r}, x): ${x}`, 'a.sig');
    const bad = badRange(s.a.length, l, r);
    if (bad) return yield* refuse(s, `add(${l}, ${r}, ${x}): ${bad}`, 'a.sig');
    const out = s.a.findIndex(
      (v, k) => k >= l && k <= r && (v + x < MIN_VALUE || v + x > MAX_VALUE),
    );
    if (out >= 0)
      return yield* refuse(
        s,
        `add(${l}, ${r}, ${x}): A[${out}] would become ${s.a[out]! + x}. Keep values from ${MIN_VALUE} to ${MAX_VALUE} so they fit in the drawing.`,
        'a.sig',
      );
    const w = copy(s);
    w.updateCost = 0;
    for (let k = l; k <= r; k++) w.a[k]! += x;
    const c: Ctx = {
      w,
      min: settings.combine === 'min',
      stack: [],
      keep: [],
      range: { lo: l, hi: r, label: `add(${l}, ${r}, ${x})` },
      more: { l, r, x },
    };
    yield step(
      c,
      `add(${l}, ${r}, ${x}) adds ${x} to every value in ${span(l, r)}; A under the tree shows the result. The tree does as little as it can: a node that lies inside ${rg(l, r)} takes the add and a tag for its children, and nothing below it is touched.`,
      ['a.sig'],
      2,
      null,
    );
    yield* addRec(c, 1, 0, w.a.length - 1, l, r, x);
    const tags = c.keep.filter((k) => {
      const v = Number(k.id.slice(5));
      return w.lazy[v] !== 0;
    }).length;
    yield step(
      c,
      `Done: ${plural(w.updateCost, 'node')} visited, O(log n), however many values changed. ${tags ? `${plural(tags, 'tag')} now hold${tags === 1 ? 's' : ''} the rest of the work; the values under ${tags === 1 ? 'it' : 'them'} are out of date (gray) until a later query or update passes through and pushes ${tags === 1 ? 'it' : 'them'} down.` : 'No tags were needed: every node that took the add is a leaf.'}`,
      [],
      1,
      null,
    );
    return copy(w);
  },
};

export const ops = { query, update, add, build };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SegSettings): PseudoBlock[] {
  const min = settings.combine === 'min';
  const join = (a: string, b: string) => (min ? `min(${a}, ${b})` : `${a} + ${b}`);
  const kids = join('tree[2v]', 'tree[2v + 1]');
  const what = min ? 'the smaller of its children' : 'the sum of its children';
  const grow = min ? 'tree[v] = tree[v] + x' : 'tree[v] = tree[v] + x · (hi − lo + 1)';
  const growPlain = min ? 'its minimum grows by x,' : 'its sum grows by x for each of its values,';
  return [
    {
      op: 'query',
      lines: [
        L('q.sig', 0, 'query(v, lo, hi, l, r)', 'To answer for node v, which covers [lo, hi]:'),
        L('q.none', 1, 'if r < lo or hi < l', 'If the ranges do not overlap,'),
        L(
          'q.none.ret',
          2,
          min ? 'return ∞' : 'return 0',
          min ? 'it cannot hold the minimum.' : 'it adds nothing.',
        ),
        L('q.full', 1, 'if l ≤ lo and hi ≤ r', 'If the node lies inside the query,'),
        L('q.full.ret', 2, 'return tree[v]', 'take its value whole.'),
        L('q.part', 1, '// partial overlap', 'Otherwise it overlaps in part:'),
        L('q.push', 1, 'push(v, lo, hi)', 'hand down any pending add,'),
        L('q.mid', 1, 'mid = ⌊(lo + hi) / 2⌋', 'split the range in half,'),
        L(
          'q.ret',
          1,
          `return ${join('query(2v, lo, mid, l, r)', 'query(2v + 1, mid + 1, hi, l, r)')}`,
          `and ${min ? 'keep the smaller' : 'add up'} what the two children give back.`,
        ),
        L('q.p.sig', 0, 'push(v, lo, hi)', 'Handing down a pending add:'),
        L(
          'q.p.apply',
          1,
          'apply(2v, lo, mid, lazy[v]); apply(2v + 1, mid + 1, hi, lazy[v])',
          'both children take it,',
        ),
        L('q.p.clear', 1, 'lazy[v] = 0', 'and the node owes nothing more.'),
      ],
    },
    {
      op: 'update',
      lines: [
        L(
          'u.sig',
          0,
          'update(v, lo, hi, i, x)',
          'To set A[i] to x under node v, which covers [lo, hi]:',
        ),
        L('u.leaf', 1, 'if lo == hi', 'at the leaf for i,'),
        L('u.set', 2, 'tree[v] = x; return', 'store x and stop.'),
        L('u.push', 1, 'push(v, lo, hi)', 'Otherwise hand down any pending add,'),
        L('u.mid', 1, 'mid = ⌊(lo + hi) / 2⌋', 'split the range in half,'),
        L(
          'u.left',
          1,
          'if i ≤ mid: update(2v, lo, mid, i, x)',
          'go left if i is in the left half,',
        ),
        L('u.right', 1, 'else: update(2v + 1, mid + 1, hi, i, x)', 'and right if it is not,'),
        L('u.combine', 1, `tree[v] = ${kids}`, `then recompute the node as ${what}.`),
      ],
    },
    {
      op: 'add',
      lines: [
        L(
          'a.sig',
          0,
          'add(v, lo, hi, l, r, x)',
          'To add x to A[l..r] under node v, which covers [lo, hi]:',
        ),
        L(
          'a.none',
          1,
          'if r < lo or hi < l: return',
          'if they do not overlap, there is nothing to do.',
        ),
        L('a.full', 1, 'if l ≤ lo and hi ≤ r', 'If the node lies inside the range,'),
        L('a.apply', 2, 'apply(v, lo, hi, x); return', 'apply the add to the node alone and stop.'),
        L('a.part', 1, '// partial overlap', 'Otherwise it overlaps in part:'),
        L('a.push', 1, 'push(v, lo, hi)', 'hand down any pending add,'),
        L('a.mid', 1, 'mid = ⌊(lo + hi) / 2⌋', 'split the range in half,'),
        L(
          'a.kids',
          1,
          'add(2v, lo, mid, l, r, x); add(2v + 1, mid + 1, hi, l, r, x)',
          'add to both halves,',
        ),
        L('a.combine', 1, `tree[v] = ${kids}`, `then recompute the node as ${what}.`),
        L('a.ap.sig', 0, 'apply(v, lo, hi, x)', 'Applying an add to one node:'),
        L('a.ap.val', 1, grow, growPlain),
        L(
          'a.ap.tag',
          1,
          'if lo < hi: lazy[v] = lazy[v] + x',
          'and an inner node remembers it for its children.',
        ),
      ],
    },
    {
      op: 'build',
      lines: [
        L('b.sig', 0, 'build(v, lo, hi)', 'To build node v, which covers [lo, hi]:'),
        L('b.leaf', 1, 'if lo == hi', 'a single value'),
        L('b.set', 2, 'tree[v] = A[lo]; return', 'is a leaf that holds it.'),
        L('b.mid', 1, 'mid = ⌊(lo + hi) / 2⌋', 'Otherwise split the range in half,'),
        L('b.kids', 1, 'build(2v, lo, mid); build(2v + 1, mid + 1, hi)', 'build both halves,'),
        L('b.combine', 1, `tree[v] = ${kids}`, `and store ${what}.`),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(state: S, settings: SegSettings): string {
  const n = state.a.length;
  return `A holds ${plural(n, 'value')}, and the segment tree over it is built: every node covers a range of A and holds its ${settings.combine === 'min' ? 'minimum' : 'sum'}. Query a range by typing two indices, such as 2 6; update one value; add to a whole range with three numbers; or build from your own list.`;
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S, settings: SegSettings): string {
  const n = state.a.length;
  const what = settings.combine === 'min' ? 'minimum' : 'sum';
  const tags = nodesOf(n)
    .filter((nd) => state.lazy[nd.v])
    .map((nd) => `${rg(nd.lo, nd.hi)} ${tagText(state.lazy[nd.v]!)}`);
  const root = state.val[1];
  return `A holds ${plural(n, 'value')}, from A[0]: ${state.a.join(', ')}. The tree has ${2 * n - 1} nodes; the root covers ${rg(0, n - 1)}${root === null || root === undefined ? ' and is not built yet' : ` and holds the ${what}, ${root}`}. ${tags.length ? `Pending tags: ${tags.join(', ')}.` : 'No pending tags.'}`;
}
