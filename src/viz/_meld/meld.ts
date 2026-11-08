/**
 * Meldable min-heaps built from binary trees, merged along their right paths: the leftist heap
 * and the skew heap. They share everything except the rule applied on the way back up the
 * merge path: a leftist heap swaps a node's children only when the right side has the longer
 * null path, and keeps npl up to date; a skew heap always swaps.
 *
 * The merge is the usual recursion, merge(h1, h2): the smaller root wins, its right subtree is
 * merged with the other heap, then the winner is fixed. It is shown in two phases. On the way
 * down, the winners are linked along the right path of the result while one heap waits to the
 * side (`other`). On the way back up, each winner is fixed, innermost call first. The call
 * frames of the recursion are kept as text, so the view can draw the call stack.
 */
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
import { edgeShapeId, nodeShapeId } from '../../layouts/binary-tree';

export type Variant = 'leftist' | 'skew';

export interface MNode {
  uid: number;
  key: number;
  left: number | null;
  right: number | null;
  /** Null path length with npl(nil) = -1 (a leaf has 0). Kept for both variants; the skew
   * heap never shows it. */
  npl: number;
}

export interface MeldState {
  nodes: Record<number, MNode>;
  root: number | null;
  /** A second heap waiting to be merged in. Only ever set during an operation. */
  other: number | null;
  nextUid: number;
}

export interface MeldSettings {
  [key: string]: Scalar;
}

export interface MeldExtra {
  /** A key handed back, drawn in a box beside the root. */
  out?: { key: number; label: string };
  /** An argument that was refused. */
  arg?: { label: string; text: string };
  /** Label over the heap waiting to be merged in. */
  otherLabel?: string;
  /** The recursion: one "merge(a, b)" per call still running, outermost first. */
  frames?: string[];
  /** Winners so far along the merge path, top down. Their npl may be stale until fixed. */
  path?: number[];
  /** How many winners, from the bottom of the path, have been fixed already. */
  fixed?: number;
}

type S = MeldState;
type X = MeldExtra;
type MeldStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
/** At most this many keys in a heap (more is unreadable on a phone). */
export const MAX_KEYS = 31;
/** At most this many keys in a list typed for merge. */
export const MAX_LIST = 15;

export function init(): S {
  return { nodes: {}, root: null, other: null, nextUid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const nodeMark = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);

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

/** One key stays a number; a list (for merge) becomes its canonical text. */
export function parseMeldInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key first.');
  if (/[\s,]/.test(t)) {
    const keys = parseKeyList(t);
    return keys instanceof Error ? keys : keys.join(' ');
  }
  return parseKey(t);
}

// ---------------------------------------------------------------------------------------------
// Conventions

export interface Conv {
  variant: Variant;
  leftist: boolean;
  /** Added to the stored npl (nil = -1) for display: 0, or 1 when npl(nil) = 0. */
  shift: number;
  /** The shown npl of a node or nil. */
  npl(n: MNode | null): number;
}

export function conv(variant: Variant, settings: MeldSettings): Conv {
  const shift = variant === 'leftist' && settings.npl === '0' ? 1 : 0;
  return {
    variant,
    leftist: variant === 'leftist',
    shift,
    npl: (n) => (n ? n.npl : -1) + shift,
  };
}

// ---------------------------------------------------------------------------------------------
// Pure helpers, shared with the tests and the practice questions.

export function heightOf(s: { nodes: Record<number, MNode> }, u: number | null): number {
  return u === null
    ? -1
    : 1 + Math.max(heightOf(s, s.nodes[u]!.left), heightOf(s, s.nodes[u]!.right));
}

export function sizeOf(s: { nodes: Record<number, MNode> }, u: number | null): number {
  return u === null ? 0 : 1 + sizeOf(s, s.nodes[u]!.left) + sizeOf(s, s.nodes[u]!.right);
}

/** Keys from the root down the right path. */
export function rightPath(s: { nodes: Record<number, MNode> }, u: number | null): number[] {
  const out: number[] = [];
  for (let x = u; x !== null; x = s.nodes[x]!.right) out.push(s.nodes[x]!.key);
  return out;
}

/**
 * Merge two heaps held in a plain node table, with no steps: the same algorithm as the
 * animated merge. Used to build the second heap of a merge from its list.
 */
export function quietMerge(
  nodes: Record<number, MNode>,
  a: number | null,
  b: number | null,
  variant: Variant,
): number | null {
  if (a === null) return b;
  if (b === null) return a;
  if (nodes[b]!.key < nodes[a]!.key) [a, b] = [b, a];
  const x = nodes[a]!;
  x.right = quietMerge(nodes, x.right, b, variant);
  fixNode(nodes, x, variant);
  return a;
}

/** The rule on the way back up. Returns true when the children were swapped. */
function fixNode(nodes: Record<number, MNode>, x: MNode, variant: Variant): boolean {
  const npl = (u: number | null) => (u === null ? -1 : nodes[u]!.npl);
  const swap = variant === 'skew' || npl(x.left) < npl(x.right);
  if (swap) [x.left, x.right] = [x.right, x.left];
  x.npl = 1 + npl(x.right);
  return swap;
}

// ---------------------------------------------------------------------------------------------
// A working copy. Operations change it freely and yield snapshots.

class Work {
  nodes: Record<number, MNode>;
  root: number | null;
  other: number | null;
  nextUid: number;
  comparisons = 0;
  swaps = 0;

  constructor(s: S) {
    this.nodes = Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, { ...n }]));
    this.root = s.root;
    this.other = s.other;
    this.nextUid = s.nextUid;
  }

  n(u: number): MNode {
    return this.nodes[u]!;
  }

  key(u: number | null): string {
    return u === null ? 'nil' : String(this.n(u).key);
  }

  snap(): S {
    const nodes = Object.fromEntries(
      Object.entries(this.nodes).map(([k, n]) => [k, { ...n }]),
    ) as Record<number, MNode>;
    return { nodes, root: this.root, other: this.other, nextUid: this.nextUid };
  }

  add(key: number): number {
    const uid = this.nextUid;
    this.nextUid += 1;
    this.nodes[uid] = { uid, key, left: null, right: null, npl: 0 };
    return uid;
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
): MeldStep {
  const state = c.W.snap();
  const extra: X = { ...c.extra, ...more };
  if (extra.frames) extra.frames = [...extra.frames];
  if (extra.path) extra.path = [...extra.path];
  const vars: Record<string, Scalar> = {
    N: sizeOf(state, state.root) + sizeOf(state, state.other),
    height: heightOf(state, state.root),
  };
  if (c.K.leftist)
    vars['npl(root)'] = state.root === null ? c.K.npl(null) : c.K.npl(state.nodes[state.root]!);
  return {
    state,
    marks,
    say,
    lines,
    vars: { ...vars, ...c.vars, comparisons: c.W.comparisons, swaps: c.W.swaps },
    level,
    extra,
  };
}

function ctx(s: S, variant: Variant, settings: MeldSettings, vars: Record<string, Scalar> = {}) {
  return { W: new Work(s), K: conv(variant, settings), extra: {}, vars } as Ctx;
}

/** A step that refuses an argument and changes nothing. */
function* refuse(c: Ctx, say: string, line: string, arg: { label: string; text: string }) {
  c.extra.arg = arg;
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
}

// ---------------------------------------------------------------------------------------------
// The merge, with every call of the recursion shown.

function* merge(c: Ctx): Generator<MeldStep, void, void> {
  const { W, K } = c;
  const frames: string[] = [];
  const path: number[] = [];
  c.extra.frames = frames;
  c.extra.path = path;
  c.extra.fixed = 0;
  const call = (a: number | null, b: number | null) => `merge(${W.key(a)}, ${W.key(b)})`;
  const depth = () => {
    c.vars.depth = frames.length;
  };

  frames.push(call(W.root, W.other));
  depth();
  if (W.other === null || W.root === null) {
    const only = W.root ?? W.other;
    const line = W.root === null ? 'mg.nil1' : 'mg.nil2';
    W.root = only;
    W.other = null;
    yield step(
      c,
      only === null
        ? `${frames[0]}: both heaps are empty, so the result is empty.`
        : `${frames[0]}: one heap is empty, so the result is the other one, rooted at ${W.key(only)}. Nothing to do.`,
      ['mg.sig', line],
      2,
      only === null ? [] : [nodeMark(only, 'done')],
    );
    frames.pop();
    depth();
    return;
  }

  // The outermost call picks the root of the result.
  const a = W.root;
  const b = W.other;
  W.comparisons += 1;
  const flip = W.n(b).key < W.n(a).key;
  if (flip) {
    W.root = b;
    W.other = a;
    c.extra.otherLabel = 'waiting';
  }
  let x = W.root;
  path.push(x);
  const lose = W.other!;
  yield step(
    c,
    `${frames[0]}: compare the roots. ${flip ? `${W.key(x)} < ${W.key(lose)}` : `${W.key(x)} ≤ ${W.key(lose)}`}, so ${W.key(x)} is the root of the result, and the heap at ${W.key(lose)} merges into its right subtree.`,
    ['mg.sig', 'mg.nil1', 'mg.nil2', 'mg.swap', ...(flip ? ['mg.swap2'] : []), 'mg.rec'],
    2,
    [nodeMark(x, 'active'), nodeMark(lose, 'compare')],
  );

  // Down the right paths. Invariant: x.key ≤ every key in the waiting heap.
  for (;;) {
    const r = W.n(x).right;
    const o = W.other!;
    frames.push(call(r, o));
    depth();
    if (r === null) {
      W.n(x).right = o;
      W.other = null;
      yield step(
        c,
        `${frames[frames.length - 1]}: ${W.key(x)} has no right child, so this call returns the other heap at once. The heap at ${W.key(o)} becomes the right subtree of ${W.key(x)}.`,
        ['mg.sig', 'mg.nil1'],
        2,
        [nodeMark(x, 'active'), nodeMark(o, 'new'), mark(edgeShapeId(o), 'active')],
      );
      frames.pop();
      depth();
      break;
    }
    W.comparisons += 1;
    const top = frames[frames.length - 1]!;
    if (W.n(o).key < W.n(r).key) {
      W.n(x).right = o;
      W.other = r;
      c.extra.otherLabel = 'waiting';
      yield step(
        c,
        `${top}: ${W.key(o)} < ${W.key(r)}, so ${W.key(o)} wins. It takes ${W.key(r)}'s place as the right child of ${W.key(x)}, and the heap at ${W.key(r)} waits to merge into ${W.key(o)}'s right subtree.`,
        ['mg.sig', 'mg.nil1', 'mg.nil2', 'mg.swap', 'mg.swap2', 'mg.rec'],
        2,
        [nodeMark(o, 'active'), nodeMark(r, 'compare'), mark(edgeShapeId(o), 'active')],
      );
    } else {
      yield step(
        c,
        `${top}: ${W.key(r)} ≤ ${W.key(o)}, so ${W.key(r)} wins and stays the right child of ${W.key(x)}. Its right subtree merges with the heap at ${W.key(o)}.`,
        ['mg.sig', 'mg.nil1', 'mg.nil2', 'mg.swap', 'mg.rec'],
        2,
        [nodeMark(r, 'active'), nodeMark(o, 'compare'), mark(edgeShapeId(r), 'active')],
      );
    }
    x = W.n(x).right!;
    path.push(x);
  }

  // Back up: fix each winner, innermost call first.
  for (let i = path.length - 1; i >= 0; i--) {
    const u = path[i]!;
    const node = W.n(u);
    const call = frames[frames.length - 1]!;
    const k = W.key(u);
    if (K.leftist) {
      const l = K.npl(node.left === null ? null : W.n(node.left));
      const r = K.npl(node.right === null ? null : W.n(node.right));
      const swapped = fixNode(W.nodes, node, 'leftist');
      if (swapped) W.swaps += 1;
      c.extra.fixed = path.length - i;
      const now = K.npl(node);
      yield step(
        c,
        swapped
          ? `Back in ${call}: at ${k}, npl(left) = ${l} < npl(right) = ${r}, which breaks the leftist property. Swap the children of ${k}. Now npl(${k}) = npl(right) + 1 = ${now}; return ${k}.`
          : `Back in ${call}: at ${k}, npl(left) = ${l} ≥ npl(right) = ${r}, so no swap. npl(${k}) = npl(right) + 1 = ${now}; return ${k}.`,
        swapped ? ['mg.npl', 'mg.kids', 'mg.fix', 'mg.ret'] : ['mg.npl', 'mg.fix', 'mg.ret'],
        2,
        [nodeMark(u, swapped ? 'active' : 'done'), mark(`npl-${u}`, 'active')],
      );
    } else {
      fixNode(W.nodes, node, 'skew');
      W.swaps += 1;
      c.extra.fixed = path.length - i;
      yield step(
        c,
        `Back in ${call}: swap the children of ${k}, always. The subtree that was just merged moves to the left. Return ${k}.`,
        ['mg.kids', 'mg.ret'],
        2,
        [nodeMark(u, 'active')],
      );
    }
    frames.pop();
    depth();
  }
}

/** The vars and extra a finished operation keeps: no recursion left. */
function settle(c: Ctx): void {
  delete c.extra.frames;
  delete c.extra.path;
  delete c.extra.fixed;
  delete c.extra.otherLabel;
  delete c.vars.depth;
}

const summary = (c: Ctx) => {
  const s = c.W.snap();
  const n = sizeOf(s, s.root);
  return `N = ${n}, height = ${heightOf(s, s.root)}.`;
};

// ---------------------------------------------------------------------------------------------
// Operations

export function meldOps(variant: Variant): Record<string, OpSpec<S, MeldSettings, X>> {
  const insert: OpSpec<S, MeldSettings, X> = {
    label: 'Insert',
    arity: 1,
    *run(s, [raw], { settings }) {
      const c = ctx(s, variant, settings);
      const key = parseKey(raw!);
      if (key instanceof Error) {
        yield* refuse(
          c,
          `insert(${String(raw)}): ${key.message} The heap is unchanged.`,
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
      if (sizeOf(W, W.root) >= MAX_KEYS) {
        yield* refuse(
          c,
          `insert(${key}): this page keeps heaps to ${MAX_KEYS} keys so they stay readable. ${key} is not inserted.`,
          'ins.sig',
          { label: 'key', text: String(key) },
        );
        return s;
      }
      const u = W.add(key);
      W.other = u;
      c.extra.otherLabel = 'new';
      yield step(
        c,
        `insert(${key}): make ${key} a heap of its own, one node, and merge it with the heap.`,
        ['ins.sig', 'ins.new'],
        2,
        [nodeMark(u, 'new')],
      );
      yield* merge(c);
      settle(c);
      yield step(c, `${key} is in. ${summary(c)}`, ['ins.merge'], 1, [nodeMark(u, 'done')]);
      return c.W.snap();
    },
  };

  const deletemin: OpSpec<S, MeldSettings, X> = {
    label: 'Delete min',
    arity: 0,
    *run(s, _args, { settings }) {
      const c = ctx(s, variant, settings);
      const { W } = c;
      if (W.root === null) {
        yield step(
          c,
          'deleteMin(): the heap is empty, so there is no minimum to delete.',
          ['del.empty'],
          1,
          [mark('empty', 'error')],
        );
        return s;
      }
      const r = W.n(W.root);
      c.vars.min = r.key;
      c.extra.out = { key: r.key, label: 'min' };
      yield step(
        c,
        `deleteMin(): the smallest key is at the root: ${r.key}.`,
        ['del.sig', 'del.empty', 'del.min'],
        2,
        [nodeMark(r.uid, 'found'), mark('out', 'found')],
      );
      W.root = r.left;
      W.other = r.right;
      delete W.nodes[r.uid];
      c.extra.otherLabel = 'right';
      const kids =
        r.left === null && r.right === null
          ? `${r.key} had no children, so the heap is now empty.`
          : r.right === null
            ? `Its left subtree, rooted at ${W.key(r.left)}, is all that is left. Merging it with an empty heap changes nothing.`
            : `That leaves two heaps, its left subtree (rooted at ${W.key(r.left)}) and its right subtree (rooted at ${W.key(r.right)}). Merge them.`;
      yield step(c, `Remove ${r.key}. ${kids}`, ['del.merge'], 2, [mark('out', 'found')]);
      yield* merge(c);
      settle(c);
      c.vars.returned = r.key;
      yield step(c, `Return ${r.key}. ${summary(c)}`, ['del.return'], 1, [mark('out', 'found')]);
      return c.W.snap();
    },
  };

  const mergeOp: OpSpec<S, MeldSettings, X> = {
    label: 'Merge with',
    arity: 1,
    *run(s, [raw], { settings }) {
      const c = ctx(s, variant, settings);
      const keys = parseKeyList(raw!);
      if (keys instanceof Error) {
        yield* refuse(
          c,
          `mergeWith(${String(raw)}): ${keys.message} The heap is unchanged.`,
          'mw.sig',
          {
            label: 'list',
            text: String(raw),
          },
        );
        return s;
      }
      const { W } = c;
      if (sizeOf(W, W.root) + keys.length > MAX_KEYS) {
        yield* refuse(
          c,
          `mergeWith(${keys.join(' ')}): the result would have more than ${MAX_KEYS} keys, more than this page draws readably. The heap is unchanged.`,
          'mw.sig',
          { label: 'list', text: keys.join(' ') },
        );
        return s;
      }
      let h2: number | null = null;
      for (const k of keys) h2 = quietMerge(W.nodes, h2, W.add(k), variant);
      W.other = h2;
      c.extra.otherLabel = 'H2';
      yield step(
        c,
        `mergeWith(${keys.join(' ')}): H2 is the ${variant} heap you get by inserting ${keys.length === 1 ? 'that key' : 'those keys, in that order'}. Merge it with the heap.`,
        ['mw.sig', 'mw.build'],
        2,
        [nodeMark(h2!, 'new')],
      );
      yield* merge(c);
      settle(c);
      yield step(c, `The two heaps are one. ${summary(c)}`, ['mw.merge'], 1, []);
      return c.W.snap();
    },
  };

  const clear: OpSpec<S, MeldSettings, X> = {
    label: 'Clear',
    arity: 0,
    *run(s, _args, { settings }) {
      const c = ctx(s, variant, settings);
      c.W.nodes = {};
      c.W.root = null;
      c.W.other = null;
      yield step(
        c,
        s.root === null
          ? 'clear(): the heap was already empty.'
          : 'clear(): root = nil. Every node is gone (a garbage collector, or a postorder walk in C++, frees them).',
        ['clr.root'],
        1,
        [],
      );
      return c.W.snap();
    },
  };

  return { insert, deletemin, merge: mergeOp, clear };
}

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function meldPseudocode(variant: Variant, settings: MeldSettings): PseudoBlock[] {
  const K = conv(variant, settings);
  const mergeLines = [
    L('mg.sig', 0, 'merge(h1, h2)', 'To merge two heaps:'),
    L('mg.nil1', 1, 'if h1 == nil: return h2', 'if the first is empty, the answer is the second;'),
    L('mg.nil2', 1, 'if h2 == nil: return h1', 'if the second is empty, the answer is the first.'),
    L('mg.swap', 1, 'if h2.key < h1.key', 'Make h1 the heap with the smaller root.'),
    L('mg.swap2', 2, 'swap h1 and h2', 'Swap the two names if needed.'),
    L('mg.rec', 1, 'h1.right = merge(h1.right, h2)', 'Merge h2 into the right subtree of h1.'),
    ...(K.leftist
      ? [
          L(
            'mg.npl',
            1,
            'if npl(h1.left) < npl(h1.right)',
            'If the right side is now longer to a nil,',
          ),
          L('mg.kids', 2, 'swap h1.left and h1.right', 'swap the children.'),
          L('mg.fix', 1, 'h1.npl = npl(h1.right) + 1', 'Update the null path length of h1.'),
        ]
      : [L('mg.kids', 1, 'swap h1.left and h1.right', 'Swap the children, always.')]),
    L('mg.ret', 1, 'return h1', 'Hand back h1.'),
    ...(K.leftist
      ? [
          L(
            'mg.nilnpl',
            0,
            `// npl(nil) = ${K.shift - 1}`,
            `An empty tree has null path length ${K.shift - 1}.`,
          ),
        ]
      : []),
  ];
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(key)', 'To insert a key:'),
        L('ins.new', 1, 'h2 = new Node(key)', 'make a heap of one node,'),
        L('ins.merge', 1, 'root = merge(root, h2)', 'and merge it with the heap.'),
        ...mergeLines,
      ],
    },
    {
      op: 'deletemin',
      lines: [
        L('del.sig', 0, 'deleteMin()', 'To remove the smallest key:'),
        L('del.empty', 1, 'if root == nil: error', 'if the heap is empty, stop.'),
        L('del.min', 1, 'min = root.key', 'The smallest key is at the root.'),
        L('del.merge', 1, 'root = merge(root.left, root.right)', 'Merge its two subtrees.'),
        L('del.return', 1, 'return min', 'Hand back the smallest key.'),
        ...mergeLines,
      ],
    },
    {
      op: 'merge',
      lines: [
        L('mw.sig', 0, 'mergeWith(list)', 'To merge in a second heap:'),
        L('mw.build', 1, 'h2 = heapOf(list)', 'build it by inserting the keys in order,'),
        L('mw.merge', 1, 'root = merge(root, h2)', 'then merge the two heaps.'),
        ...mergeLines,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the heap:'),
        L('clr.root', 1, 'root = nil', 'forget the root.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------

export function meldDescribe(variant: Variant, s: S, settings: MeldSettings): string {
  const K = conv(variant, settings);
  const name = `${variant} heap`;
  if (s.root === null && s.other === null) return `An empty ${name}.`;
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    const npl = K.leftist ? ` (npl ${K.npl(n)})` : '';
    parts.push(
      kids.length ? `${n.key}${npl} has ${kids.join(' and ')}.` : `${n.key}${npl} is a leaf.`,
    );
    walk(n.left);
    walk(n.right);
  };
  walk(s.root);
  const n = sizeOf(s, s.root);
  const main =
    s.root === null
      ? `An empty ${name}.`
      : `A ${name} with ${n} ${n === 1 ? 'key' : 'keys'} and height ${heightOf(s, s.root)}. The root is ${s.nodes[s.root]!.key}. ${parts.join(' ')}`;
  if (s.other === null) return main;
  const m = sizeOf(s, s.other);
  return `${main} A second heap of ${m} ${m === 1 ? 'key' : 'keys'}, rooted at ${s.nodes[s.other]!.key}, waits to be merged in.`;
}

export function meldInitialVars(
  variant: Variant,
  s: S,
  settings: MeldSettings,
): Record<string, Scalar> {
  const K = conv(variant, settings);
  const vars: Record<string, Scalar> = { N: sizeOf(s, s.root), height: heightOf(s, s.root) };
  if (K.leftist) vars['npl(root)'] = K.npl(s.root === null ? null : s.nodes[s.root]!);
  return { ...vars, comparisons: 0, swaps: 0 };
}
