/**
 * Interval tree (CLRS 17.3, "augmenting data structures"): a BST keyed on each interval's low
 * end, where every node also stores max, the largest high end in its subtree. max lets a search
 * skip whole subtrees that cannot hold an overlap. CLRS builds it on a red-black tree; here it is
 * a plain BST, so the augmentation is all there is to watch.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { edgeShapeId, nodeShapeId } from '../../layouts/binary-tree';
import {
  L,
  TreeWork,
  clearBlock,
  emptyState,
  plural,
  treeHeight,
  treeSize,
  type TreeNode,
  type TreeState,
} from '../_bst/tree-kit';

export interface INode extends TreeNode {
  /** key is lo, so the tree kit's helpers read the low end. */
  lo: number;
  hi: number;
  /** The largest high end in this node's subtree. */
  max: number;
}

export type IntervalState = TreeState<INode>;

export interface IntervalSettings {
  [key: string]: Scalar;
}

export interface IntervalExtra {
  /** The operation's interval, drawn in a box above the tree. */
  arg?: { text: string; error?: boolean };
  /** The query interval, drawn as a band on the number line. */
  query?: [number, number];
  /** Nodes looked at so far. */
  path?: number[];
  /** Roots of subtrees a search skipped, thanks to max. */
  pruned?: number[];
  /** Nodes whose intervals overlap the query. */
  found?: number[];
  /** A node lifted out during delete. */
  held?: number;
  /** Insert: the node just made. */
  fresh?: number;
}

type S = IntervalState;
type X = IntervalExtra;
type Op = OpSpec<S, IntervalSettings, X>;
type IStep = Step<S, X>;

export const MAX_END = 99;
export const defaults: IntervalSettings = {};

export function init(): S {
  return emptyState<INode>();
}

// ---------------------------------------------------------------------------------------------
// Intervals: "15,23", "15-23", "[15, 23]", or one number for a point

export type Interval = [number, number];

export function parseInterval(raw: Value): Interval | Error {
  const text = String(raw)
    .trim()
    .replace(/^\[|\]$/g, '')
    .trim();
  const m = /^(\d+)\s*(?:[,\-–]\s*(\d+))?$/.exec(text);
  const bad = new Error(
    `Type an interval as low,high with whole numbers from 0 to ${MAX_END}, such as 15,23 (or one number for a point).`,
  );
  if (!m) return bad;
  const lo = Number(m[1]);
  const hi = m[2] === undefined ? lo : Number(m[2]);
  if (lo > MAX_END || hi > MAX_END) return bad;
  if (lo > hi)
    return new Error(`The low end comes first: ${lo} is bigger than ${hi}. Try ${hi},${lo}.`);
  return [lo, hi];
}

/** For the input box: keeps "15,23" as one value. */
export function parseIntervalInput(token: string): Value | Error {
  const a = parseInterval(token);
  return a instanceof Error ? a : `${a[0]},${a[1]}`;
}

export const show = (a: Interval) => `[${a[0]}, ${a[1]}]`;
const showN = (n: INode) => `[${n.lo}, ${n.hi}]`;
export const overlaps = (a: Interval, lo: number, hi: number) => a[0] <= hi && lo <= a[1];
/** BST order: by low end, then by high end. */
const before = (a: Interval, n: INode) => a[0] < n.lo || (a[0] === n.lo && a[1] < n.hi);

export function readouts(s: S): Record<string, Scalar> {
  return { N: treeSize(s), height: treeHeight(s) };
}

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });
const nodeMark = (u: number, role: Mark['role']) => mk(nodeShapeId(u), role);
const edgeMark = (u: number, role: Mark['role']) => mk(edgeShapeId(u), role);

class Work {
  W: TreeWork<INode>;
  extra: X;
  vars: Record<string, Scalar>;
  constructor(s: S, extra: X, vars: Record<string, Scalar>) {
    this.W = new TreeWork(s);
    this.extra = extra;
    this.vars = vars;
  }
  n(u: number) {
    return this.W.n(u);
  }
  step(say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): IStep {
    const state = this.W.snap();
    const extra: X = { ...this.extra };
    for (const k of ['path', 'pruned', 'found'] as const) if (extra[k]) extra[k] = [...extra[k]];
    return { state, marks, say, lines, level, extra, vars: { ...readouts(state), ...this.vars } };
  }
  /** max from the node's own high end and its children's max. */
  maxOf(u: number): number {
    const n = this.n(u);
    return Math.max(
      n.hi,
      n.left === null ? -1 : this.n(n.left).max,
      n.right === null ? -1 : this.n(n.right).max,
    );
  }
}

function* refuse(s: S, call: string, raw: Value, err: Error, line: string) {
  const w = new Work(s, { arg: { text: String(raw), error: true } }, {});
  yield w.step(`${call}: ${err.message} The tree is unchanged.`, [line], 1, [
    mk('arg-box', 'error'),
  ]);
  return s;
}

// ---------------------------------------------------------------------------------------------
// insert: walk down, raising max on the way

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const a = parseInterval(raw!);
    if (a instanceof Error) return yield* refuse(s, `insert(${String(raw)})`, raw!, a, 'ins.sig');
    const name = `insert(${show(a)})`;
    const w = new Work(s, { arg: { text: show(a) } }, { lo: a[0], hi: a[1] });
    const W = w.W;
    const path: number[] = [];
    w.extra.path = path;
    let x = W.root;
    let parent: number | null = null;
    let side: 'left' | 'right' = 'left';
    while (x !== null) {
      const n = w.n(x);
      path.push(x);
      if (n.lo === a[0] && n.hi === a[1]) {
        yield w.step(
          `${name}: ${show(a)} is already in the tree. Each interval is stored once, so nothing changes.`,
          ['ins.walk'],
          1,
          [nodeMark(x, 'found'), mk('arg-box', 'error')],
        );
        return s;
      }
      const old = n.max;
      n.max = Math.max(n.max, a[1]);
      side = before(a, n) ? 'left' : 'right';
      const next = n[side];
      const why =
        a[0] !== n.lo
          ? `Low end ${a[0]} ${a[0] < n.lo ? '<' : '>'} ${n.lo}`
          : `Same low end; high end ${a[1]} ${a[1] < n.hi ? '<' : '>'} ${n.hi}`;
      yield w.step(
        `${n.max !== old ? `${a[1]} > ${old}, so ${showN(n)}'s max rises to ${a[1]}: the new interval will be in its subtree. ` : `${showN(n)}'s max, ${old}, already covers ${a[1]}. `}${why}, so go ${side}${next === null ? ': the spot is empty.' : '.'}`,
        ['ins.walk', 'ins.max', side === 'left' ? 'ins.left' : 'ins.right'],
        2,
        [
          nodeMark(x, n.max !== old ? 'new' : 'compare'),
          ...(next === null ? [] : [edgeMark(next, 'active')]),
        ],
      );
      parent = x;
      x = next;
    }
    const uid = W.nextUid;
    W.nextUid += 1;
    W.nodes[uid] = {
      uid,
      key: a[0],
      lo: a[0],
      hi: a[1],
      max: a[1],
      left: null,
      right: null,
      parent,
    };
    if (parent === null) W.root = uid;
    else W.n(parent)[side] = uid;
    w.extra = { fresh: uid };
    yield w.step(
      `${parent === null ? `${show(a)} becomes the root` : `${show(a)} becomes the ${side} child of ${showN(w.n(parent))}`}, with max = its own high end, ${a[1]}. Every max on the path already counts it. N = ${treeSize(W)}.`,
      ['ins.leaf'],
      1,
      [nodeMark(uid, 'new'), ...(parent === null ? [] : [edgeMark(uid, 'new')])],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// delete: a BST delete, then fix max from the lowest changed node up

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw]) {
    const a = parseInterval(raw!);
    if (a instanceof Error) return yield* refuse(s, `delete(${String(raw)})`, raw!, a, 'del.sig');
    const name = `delete(${show(a)})`;
    const w = new Work(s, { arg: { text: show(a) } }, { lo: a[0], hi: a[1] });
    const W = w.W;
    const path: number[] = [];
    w.extra.path = path;
    let z = W.root;
    while (z !== null) {
      const n = w.n(z);
      path.push(z);
      if (n.lo === a[0] && n.hi === a[1]) break;
      const side = before(a, n) ? 'left' : 'right';
      const next = n[side];
      yield w.step(
        `${name}: ${show(a)} comes ${side === 'left' ? 'before' : 'after'} ${showN(n)}, so go ${side}${next === null ? ', but there is nothing there.' : '.'}`,
        ['del.find'],
        2,
        [nodeMark(z, 'compare')],
      );
      z = next;
    }
    if (z === null) {
      yield w.step(
        s.root === null
          ? `${name}: the tree is empty, so there is nothing to delete.`
          : `${show(a)} is not in the tree, so nothing is deleted.`,
        ['del.find', 'del.missing'],
        1,
        [],
      );
      return s;
    }
    w.extra.path = [];
    const zn = w.n(z);
    let from: number | null;
    if (zn.left === null || zn.right === null) {
      const child = zn.left ?? zn.right;
      from = zn.parent;
      W.transplant(z, child);
      W.detach(z);
      w.extra.held = z;
      yield w.step(
        child === null
          ? `Found ${show(a)}. It is a leaf, so it simply leaves the tree.`
          : `Found ${show(a)}. It has one child, so its subtree moves up into its place.`,
        ['del.find', 'del.splice'],
        2,
        [nodeMark(z, 'remove'), ...(child === null ? [] : [nodeMark(child, 'active')])],
      );
    } else {
      let y = zn.right!;
      while (w.n(y).left !== null) y = w.n(y).left!;
      const yn = w.n(y);
      yield w.step(
        `Found ${show(a)}. It has two children, so its successor, ${showN(yn)} (the leftmost node on its right), takes its place.`,
        ['del.find', 'del.succ'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'found')],
      );
      if (y !== zn.right) {
        from = yn.parent;
        W.transplant(y, yn.right);
        yn.right = zn.right;
        w.n(yn.right!).parent = y;
      } else {
        from = y;
      }
      W.transplant(z, y);
      yn.left = zn.left;
      w.n(yn.left!).parent = y;
      W.detach(z);
      w.extra.held = z;
      yield w.step(
        `${showN(yn)} moves into ${show(a)}'s place and takes both of its subtrees.`,
        ['del.succ'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'active')],
      );
    }
    delete W.nodes[z];
    w.extra.held = undefined;
    // Fix max on the way up.
    let changed = 0;
    for (let u = from; u !== null; u = w.n(u).parent) {
      const n = w.n(u);
      const old = n.max;
      n.max = w.maxOf(u);
      if (n.max !== old) changed += 1;
      yield w.step(
        n.max !== old
          ? `${showN(n)}: its subtree lost the interval that set its max. max = largest of ${n.hi} and its children's max = ${n.max} (was ${old}).`
          : `${showN(n)}: max stays ${n.max}.`,
        ['del.fix'],
        n.max !== old ? 2 : 3,
        [nodeMark(u, n.max !== old ? 'new' : 'compare')],
      );
    }
    yield w.step(
      `${show(a)} is gone. ${plural(changed, 'max', 'maxes')} changed on the way up. N = ${treeSize(W)}.`,
      ['del.fix'],
      1,
      [],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// overlap: CLRS INTERVAL-SEARCH, one answer

const overlap: Op = {
  label: 'Find an overlap',
  arity: 1,
  *run(s, [raw]) {
    const q = parseInterval(raw!);
    if (q instanceof Error) return yield* refuse(s, `overlap(${String(raw)})`, raw!, q, 'any.sig');
    const name = `overlap(${show(q)})`;
    const w = new Work(
      s,
      { arg: { text: show(q) }, query: q, path: [], pruned: [], found: [] },
      { visited: 0 },
    );
    const ex = w.extra;
    let x = s.root;
    while (x !== null) {
      const n = w.n(x);
      ex.path!.push(x);
      w.vars.visited = ex.path!.length;
      if (overlaps(q, n.lo, n.hi)) break;
      const l = n.left === null ? null : w.n(n.left);
      const goLeft = l !== null && l.max >= q[0];
      const skipped = goLeft ? n.right : n.left;
      if (skipped !== null) ex.pruned!.push(skipped);
      yield w.step(
        `${showN(n)} does not overlap ${show(q)}. ${
          goLeft
            ? `Its left child's max is ${l!.max} ≥ ${q[0]}, so if anything overlaps, something on the left does. Go left${n.right === null ? '.' : ' and skip the right.'}`
            : l === null
              ? `There is no left subtree, so go right.`
              : `Its left child's max is ${l.max} < ${q[0]}: every interval on the left ends before ${show(q)} starts. Skip the left and go right.`
        }`,
        ['any.loop', goLeft ? 'any.left' : 'any.right'],
        2,
        [
          nodeMark(x, 'compare'),
          ...(l !== null ? [mk(`max-${l.uid}`, goLeft ? 'active' : 'error')] : []),
        ],
      );
      x = goLeft ? n.left : n.right;
    }
    if (x === null) {
      yield w.step(
        s.root === null
          ? `${name}: the tree is empty, so nothing overlaps.`
          : `Fell off the tree: nothing overlaps ${show(q)}. The search looked at ${plural(ex.path!.length, 'node')}.`,
        ['any.loop', 'any.ret'],
        1,
        [],
      );
      w.vars.found = 'none';
      return s;
    }
    ex.found = [x];
    w.vars.found = showN(w.n(x));
    yield w.step(
      `${showN(w.n(x))} overlaps ${show(q)}: found one, after looking at ${plural(ex.path!.length, 'node')}.`,
      ['any.loop', 'any.ret'],
      1,
      [nodeMark(x, 'found')],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// all: every overlap, pruning with max on the left and the low end on the right

const all: Op = {
  label: 'Find all overlaps',
  arity: 1,
  *run(s, [raw]) {
    const q = parseInterval(raw!);
    if (q instanceof Error) return yield* refuse(s, `all(${String(raw)})`, raw!, q, 'all.sig');
    const name = `all(${show(q)})`;
    const w = new Work(
      s,
      { arg: { text: show(q) }, query: q, path: [], pruned: [], found: [] },
      { visited: 0, found: 0, pruned: 0 },
    );
    const ex = w.extra;
    if (s.root === null) {
      yield w.step(`${name}: the tree is empty, so nothing overlaps.`, ['all.nil'], 1, []);
      return s;
    }
    const steps: IStep[] = [];
    const visit = (x: number) => {
      const n = w.n(x);
      ex.path!.push(x);
      w.vars.visited = ex.path!.length;
      const hit = overlaps(q, n.lo, n.hi);
      if (hit) {
        ex.found!.push(x);
        w.vars.found = ex.found!.length;
      }
      steps.push(
        w.step(
          hit
            ? `${showN(n)} overlaps ${show(q)}: report it.`
            : `${showN(n)} does not overlap ${show(q)}.`,
          ['all.check'],
          2,
          [nodeMark(x, hit ? 'found' : 'compare')],
        ),
      );
      if (n.left !== null) {
        const l = w.n(n.left);
        if (l.max >= q[0]) visit(n.left);
        else {
          ex.pruned!.push(n.left);
          w.vars.pruned = ex.pruned!.length;
          steps.push(
            w.step(
              `Left of ${showN(n)}: max = ${l.max} < ${q[0]}, so every interval there ends before ${show(q)} starts. Skip that whole subtree.`,
              ['all.left'],
              2,
              [nodeMark(x, 'active'), mk(`max-${l.uid}`, 'error')],
            ),
          );
        }
      }
      if (n.right !== null) {
        if (n.lo <= q[1]) visit(n.right);
        else {
          ex.pruned!.push(n.right);
          w.vars.pruned = ex.pruned!.length;
          steps.push(
            w.step(
              `Right of ${showN(n)}: every interval there starts at ${n.lo} or later, after ${show(q)} ends at ${q[1]}. Skip that whole subtree.`,
              ['all.right'],
              2,
              [nodeMark(x, 'active')],
            ),
          );
        }
      }
    };
    visit(s.root);
    yield* steps;
    const found = ex.found!.map((u) => showN(w.n(u)));
    yield w.step(
      `${found.length === 0 ? `Nothing overlaps ${show(q)}` : `${plural(found.length, 'interval')} overlap ${show(q)}: ${found.join(', ')}`}. The search looked at ${ex.path!.length} of ${treeSize(w.W)} nodes and skipped ${plural(ex.pruned!.length, 'subtree')}.`,
      ['all.check'],
      1,
      ex.found!.map((u) => nodeMark(u, 'found')),
    );
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { ...init(), nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say:
        s.root === null
          ? 'clear(): the tree was already empty.'
          : 'clear(): root = nil. Every interval is gone.',
      lines: ['clear.root'],
      vars: readouts(empty),
      level: 1,
    };
    return empty;
  },
};

export const ops = { insert, delete: del, overlap, all, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(i)', 'To insert interval i:'),
        L('ins.walk', 1, 'x = root; while x ≠ nil:', 'walk down from the root;'),
        L(
          'ins.max',
          2,
          'x.max = max(x.max, i.high)',
          'each node on the way will have i below it, so raise its max if needed,',
        ),
        L(
          'ins.left',
          2,
          'if (i.low, i.high) < (x.low, x.high): x = x.left',
          'go left if i starts earlier (or ends earlier, on a tie),',
        ),
        L('ins.right', 2, 'else: x = x.right', 'otherwise go right.'),
        L(
          'ins.leaf',
          1,
          'put i in a new leaf, max = i.high',
          'Add i as a leaf, its max its own high end.',
        ),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(i)', 'To delete interval i:'),
        L('del.find', 1, 'z = search(i)', 'find its node z.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L(
          'del.splice',
          1,
          'if z has < 2 children: splice z out',
          'With at most one child, its subtree takes its place;',
        ),
        L(
          'del.succ',
          1,
          'else: y = min(z.right); transplant(z, y)',
          'otherwise its successor y takes its place.',
        ),
        L(
          'del.fix',
          1,
          'for x from the lowest change up: x.max = max(x.high, x.left.max, x.right.max)',
          'Then fix max on the way up to the root.',
        ),
      ],
    },
    {
      op: 'overlap',
      lines: [
        L('any.sig', 0, 'intervalSearch(i)', 'To find one interval that overlaps i:'),
        L(
          'any.loop',
          1,
          'x = root; while x ≠ nil and i does not overlap x.int:',
          'walk down until x overlaps i:',
        ),
        L(
          'any.left',
          2,
          'if x.left ≠ nil and x.left.max ≥ i.low: x = x.left',
          'go left if something on the left still ends late enough,',
        ),
        L('any.right', 2, 'else: x = x.right', 'otherwise go right.'),
        L('any.ret', 1, 'return x', 'x overlaps i, or nil if nothing does.'),
      ],
    },
    {
      op: 'all',
      lines: [
        L('all.sig', 0, 'allOverlaps(x, i)', 'To list every interval at x that overlaps i:'),
        L('all.nil', 1, 'if x == nil: return', 'nothing here, stop;'),
        L('all.check', 1, 'if x.int overlaps i: report x', 'report x if it overlaps;'),
        L(
          'all.left',
          1,
          'if x.left ≠ nil and x.left.max ≥ i.low: allOverlaps(x.left, i)',
          'search the left only if something there ends late enough;',
        ),
        L(
          'all.right',
          1,
          'if x.low ≤ i.high: allOverlaps(x.right, i)',
          'search the right only if x itself starts early enough.',
        ),
      ],
    },
    clearBlock(),
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(): string {
  return 'An empty interval tree. Insert intervals such as 15,23 8,9 25,30 then ask which ones overlap 22,25.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

export function describe(s: S): string {
  if (s.root === null) return 'An empty interval tree.';
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${showN(s.nodes[n.left]!)}` : '',
      n.right !== null ? `right ${showN(s.nodes[n.right]!)}` : '',
    ].filter(Boolean);
    const label = `${showN(n)} (max ${n.max})`;
    parts.push(kids.length ? `${label} has ${kids.join(' and ')}.` : `${label} is a leaf.`);
    walk(n.right);
  };
  walk(s.root);
  return `An interval tree with ${plural(treeSize(s), 'interval')} and height ${treeHeight(s)}. The root is ${showN(s.nodes[s.root]!)}. ${parts.join(' ')}`;
}
