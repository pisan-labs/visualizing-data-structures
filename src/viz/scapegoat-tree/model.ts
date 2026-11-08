/**
 * Scapegoat tree (Galperin and Rivest): a plain BST that never rotates. An insert that lands too
 * deep (deeper than log base 1/α of n) walks back up to the first ancestor that is not
 * α-weight-balanced, the scapegoat, and rebuilds its subtree perfectly balanced. A delete counts
 * down, and rebuilds the whole tree once n falls below α times the largest n since the last
 * full rebuild.
 */
import type { OpContext, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  L,
  TreeWork,
  clearBlock,
  descend,
  edgeMark,
  emptyState,
  inorderBlock,
  inorderWalk,
  mark,
  nilMark,
  nodeMark,
  parseKey,
  plural,
  searchBlock,
  searchWalk,
  treeHeight,
  treeSize,
  type Ctx,
  type MakeStep,
  type Side,
  type TreeExtra,
  type TreeNode,
  type TreeState,
} from '../_bst/tree-kit';

export type Alpha = '0.6' | '2/3' | '0.75';

export interface ScapegoatSettings {
  [key: string]: Scalar;
  /** The weight-balance factor: a child may hold at most α of its parent's subtree. */
  alpha: Alpha;
}

export interface ScapegoatState extends TreeState<TreeNode> {
  /** The largest N since the last rebuild of the whole tree (Q in some books). */
  maxSize: number;
  /** Subtree rebuilds since the tree was cleared. */
  rebuilds: number;
}

export interface ScapegoatExtra extends TreeExtra {
  /** Subtree sizes worked out on the way up, drawn beside the nodes. */
  sizes?: Record<number, number>;
  /** A subtree flattened into a sorted row, waiting in the band above the tree. */
  flat?: number[];
}

type S = ScapegoatState;
type X = ScapegoatExtra;
type Op = OpSpec<S, ScapegoatSettings, X>;
/** The tree-kit walks yield steps typed by the plain tree state; every step here holds an S. */
type KitOp = {
  label: string;
  arity: number;
  run(
    state: S,
    args: Value[],
    ctx: OpContext<ScapegoatSettings>,
  ): Generator<Step<TreeState<TreeNode>, X>, S, void>;
};
type SC = Ctx<TreeNode, X> & { maxSize: number; rebuilds: number };

export const defaults: ScapegoatSettings = { alpha: '2/3' };

/** α as a fraction num/den, so every test is exact. */
export const FRACTIONS: Record<Alpha, { num: number; den: number }> = {
  '0.6': { num: 3, den: 5 },
  '2/3': { num: 2, den: 3 },
  '0.75': { num: 3, den: 4 },
};

export function init(): S {
  return { ...emptyState<TreeNode>(), maxSize: 0, rebuilds: 0 };
}

/** True when depth d is too deep for n nodes: d > log base 1/α of n, that is (1/α)^d > n. */
export function tooDeep(d: number, n: number, alpha: Alpha): boolean {
  const { num, den } = FRACTIONS[alpha];
  return BigInt(den) ** BigInt(d) > BigInt(n) * BigInt(num) ** BigInt(d);
}

/** The deepest a node may sit: ⌊log base 1/α of n⌋ (0 for an empty tree). */
export function depthLimit(n: number, alpha: Alpha): number {
  let h = 0;
  while (!tooDeep(h + 1, n, alpha)) h += 1;
  return h;
}

/** size(child) > α · size(w): the child holds too much of w's subtree. */
export function heavy(child: number, whole: number, alpha: Alpha): boolean {
  const { num, den } = FRACTIONS[alpha];
  return den * child > num * whole;
}

const alphaText = (a: Alpha) => (a === '2/3' ? '2/3' : a);

export function readouts(s: S, st: ScapegoatSettings): Record<string, Scalar> {
  const n = treeSize(s);
  return {
    N: n,
    'max N': s.maxSize,
    height: treeHeight(s),
    limit: depthLimit(n, st.alpha),
    rebuilds: s.rebuilds,
  };
}

function stepper(st: ScapegoatSettings): MakeStep<TreeNode, X> {
  return (c, say, lines, level, marks, more = {}) => {
    const sc = c as SC;
    const state: S = { ...c.W.snap(), maxSize: sc.maxSize, rebuilds: sc.rebuilds };
    const extra: X = { ...c.extra, ...more };
    if (extra.path) extra.path = [...extra.path];
    if (extra.output) extra.output = [...extra.output];
    if (extra.flat) extra.flat = [...extra.flat];
    if (extra.sizes) extra.sizes = { ...extra.sizes };
    return {
      state,
      marks,
      say,
      lines,
      vars: { ...readouts(state, st), ...c.vars },
      level,
      extra,
    };
  };
}

const ctx = (s: S, extra: X, vars: Record<string, Scalar>): SC => ({
  W: new TreeWork(s),
  extra,
  vars,
  maxSize: s.maxSize,
  rebuilds: s.rebuilds,
});

function* badArg(s: S, st: ScapegoatSettings, name: string, raw: Value, err: Error, line: string) {
  const c = ctx(s, { arg: { name: 'k', text: String(raw), error: true } }, {});
  yield stepper(st)(
    c,
    `${name}(${String(raw)}): ${err.message} The tree is unchanged.`,
    [line],
    1,
    [mark('arg-box', 'error')],
  );
  return s;
}

const sizeOf = (W: TreeWork<TreeNode>, u: number | null): number =>
  u === null ? 0 : 1 + sizeOf(W, W.n(u).left) + sizeOf(W, W.n(u).right);

function inorderUids(W: TreeWork<TreeNode>, u: number | null, out: number[] = []): number[] {
  if (u === null) return out;
  inorderUids(W, W.n(u).left, out);
  out.push(u);
  inorderUids(W, W.n(u).right, out);
  return out;
}

/** Link the sorted nodes into a perfectly balanced tree: the middle (lower median) on top. */
function build(
  W: TreeWork<TreeNode>,
  list: number[],
  lo: number,
  hi: number,
  parent: number | null,
): number | null {
  if (lo > hi) return null;
  const mid = Math.floor((lo + hi) / 2);
  const u = list[mid]!;
  const n = W.n(u);
  n.parent = parent;
  n.left = build(W, list, lo, mid - 1, u);
  n.right = build(W, list, mid + 1, hi, u);
  return u;
}

/**
 * Rebuild the subtree at w perfectly balanced, in two pictures: flatten it into a sorted row,
 * then link the row back up from the middle. Nodes keep their identities, so they move.
 */
function* rebuild(c: SC, step: MakeStep<TreeNode, X>, w: number, why: string) {
  const W = c.W;
  const parent = W.n(w).parent;
  const side: Side | null = W.sideOf(w);
  const list = inorderUids(W, w);
  const keys = list.map((u) => W.key(u));
  // Flatten: take the subtree out and lay its nodes in a row, in order.
  if (parent === null) W.root = null;
  else W.n(parent)[side!] = null;
  for (const u of list) W.detach(u);
  c.extra.flat = list;
  c.extra.sizes = undefined;
  c.extra.path = [];
  yield step(
    c,
    `${why} Flatten it: an inorder walk lays its ${plural(list.length, 'node')} out in sorted order: ${keys.join(' ')}.`,
    ['rb.flat'],
    2,
    list.map((u) => nodeMark(u, 'active')),
  );
  const top = build(W, list, 0, list.length - 1, parent);
  if (parent === null) W.root = top;
  else W.n(parent)[side!] = top;
  c.extra.flat = undefined;
  c.rebuilds += 1;
  const mid = Math.floor((list.length - 1) / 2);
  yield step(
    c,
    `Rebuild: the middle key, ${keys[mid]}, becomes the root of the subtree, the keys left of it build its left subtree and the keys right of it its right subtree, the same way down. The subtree now has height ${W.height(top)}, as low as ${plural(list.length, 'node')} allow.`,
    ['rb.build'],
    2,
    [nodeMark(top!, 'new'), ...list.filter((u) => u !== top).map((u) => nodeMark(u, 'done'))],
  );
}

function summary(c: SC, st: ScapegoatSettings): string {
  const n = treeSize(c.W);
  return `N = ${n}, height = ${treeHeight(c.W)}, depth limit = ${depthLimit(n, st.alpha)}.`;
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: KitOp = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'insert', raw!, k, 'ins.sig');
    const step = stepper(st);
    const a = alphaText(st.alpha);
    const c = ctx(s, { arg: { name: 'k', text: String(k), uid: s.nextUid } }, { k });
    const W = c.W;
    const name = `insert(${k})`;
    const uid = W.nextUid;
    if (W.root !== null) {
      yield step(
        c,
        `${name}: insert as in a plain BST, counting the depth. Start at the root, ${W.key(W.root)}.`,
        ['ins.bst'],
        3,
        [nodeMark(W.root, 'active')],
      );
    }
    const { x, parent, side } = yield* descend(
      c,
      step,
      k,
      { left: ['ins.bst'], right: ['ins.bst'] },
      2,
      name,
    );
    if (x !== null) {
      yield step(
        c,
        `${name}: ${k} is already in the tree. Each key is stored once, so nothing changes.`,
        ['ins.bst'],
        1,
        [nodeMark(x, 'found'), mark('arg-box', 'error')],
      );
      return s;
    }
    W.nodes[uid] = { uid, key: k, left: null, right: null, parent };
    W.nextUid = uid + 1;
    if (parent === null) W.root = uid;
    else W.n(parent)[side!] = uid;
    c.maxSize = Math.max(c.maxSize, treeSize(W));
    c.extra.arg = undefined;
    c.extra.nil = undefined;
    c.extra.fresh = uid;
    const path = c.extra.path ?? [];
    c.extra.path = [];
    delete c.vars.x;
    const n = treeSize(W);
    const d = path.length;
    const h = depthLimit(n, st.alpha);
    c.vars.depth = d;
    const where =
      parent === null
        ? `${k} becomes the root`
        : `${k} becomes the ${side} child of ${W.key(parent)}`;
    if (!tooDeep(d, n, st.alpha)) {
      yield step(
        c,
        `${where}, at depth ${d}. With N = ${n} the limit is ⌊log base ${st.alpha === '2/3' ? '3/2' : `1/${a}`} of ${n}⌋ = ${h}, and ${d} ≤ ${h}: not too deep, so the tree stays as it is. ${summary(c, st)}`,
        ['ins.bst', 'ins.deep'],
        1,
        [nodeMark(uid, 'new'), ...(parent === null ? [] : [edgeMark(uid, 'new')])],
      );
      return { ...W.snap(), maxSize: c.maxSize, rebuilds: c.rebuilds };
    }
    yield step(
      c,
      `${where}, at depth ${d}. With N = ${n} the limit is ${h}, and ${d} > ${h}: too deep. Walk back up and look for a scapegoat, an ancestor whose child on the path holds more than α = ${a} of its subtree.`,
      ['ins.bst', 'ins.deep'],
      2,
      [nodeMark(uid, 'error'), edgeMark(uid, 'error')],
    );
    c.extra.fresh = undefined;

    // Walk up, adding up subtree sizes.
    const sizes: Record<number, number> = { [uid]: 1 };
    c.extra.sizes = sizes;
    let child = uid;
    let w = parent!;
    for (;;) {
      const sib = W.n(w).left === child ? W.n(w).right : W.n(w).left;
      const total = sizes[child]! + 1 + sizeOf(W, sib);
      sizes[w] = total;
      c.vars['size(w)'] = total;
      c.vars['size(child)'] = sizes[child]!;
      const goat = heavy(sizes[child]!, total, st.alpha);
      const cmpText = `size(${W.key(child)}) = ${sizes[child]} ${goat ? '>' : '≤'} ${a} × size(${W.key(w)}) = ${a} × ${total}`;
      yield step(
        c,
        goat
          ? `${cmpText}: ${W.key(w)} is not α-weight-balanced. ${W.key(w)} is the scapegoat.`
          : `${cmpText}: ${W.key(w)} is balanced enough. Keep going up.`,
        ['ins.up', 'ins.size', 'ins.goat'],
        goat ? 1 : 2,
        [
          nodeMark(w, goat ? 'error' : 'compare'),
          nodeMark(child, 'active'),
          edgeMark(child, 'active'),
        ],
      );
      if (goat) break;
      child = w;
      w = W.n(w).parent!;
    }
    delete c.vars['size(w)'];
    delete c.vars['size(child)'];
    yield* rebuild(c, step, w, `Rebuild the subtree at ${W.key(w)}.`);
    c.vars.depth = depthOf(W, uid);
    yield step(
      c,
      `Done: ${k} is now at depth ${c.vars.depth}, within the limit of ${depthLimit(treeSize(W), st.alpha)}. ${summary(c, st)}`,
      ['ins.rebuild'],
      1,
      [nodeMark(uid, 'new')],
    );
    return { ...W.snap(), maxSize: c.maxSize, rebuilds: c.rebuilds };
  },
};

function depthOf(W: TreeWork<TreeNode>, u: number): number {
  let d = 0;
  for (let p = W.n(u).parent; p !== null; p = W.n(p).parent) d += 1;
  return d;
}

// ---------------------------------------------------------------------------------------------
// delete: a plain BST delete, then the global rule

const del: KitOp = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'delete', raw!, k, 'del.sig');
    const step = stepper(st);
    const a = alphaText(st.alpha);
    const name = `delete(${k})`;
    const c = ctx(s, { arg: { name: 'k', text: String(k) } }, { k });
    const W = c.W;
    if (W.root !== null) {
      yield step(c, `${name}: first find ${k}, as in a BST. Start at the root.`, ['del.find'], 3, [
        nodeMark(W.root, 'active'),
      ]);
    }
    const { x: z } = yield* descend(
      c,
      step,
      k,
      { left: ['del.find'], right: ['del.find'] },
      2,
      name,
    );
    if (z === null) {
      yield step(
        c,
        s.root === null
          ? `${name}: the tree is empty, so there is nothing to delete.`
          : `x is nil: ${k} is not in the tree, so nothing is deleted.`,
        ['del.find', 'del.missing'],
        1,
        c.extra.nil ? [nilMark(c, c.extra.nil.parent, c.extra.nil.side)] : [],
      );
      return s;
    }
    c.extra.nil = undefined;
    c.extra.path = [];
    delete c.vars.x;
    const zn = W.n(z);
    if (zn.left === null || zn.right === null) {
      const child = zn.left ?? zn.right;
      W.transplant(z, child);
      W.detach(z);
      c.extra.held = z;
      yield step(
        c,
        child === null
          ? `Found ${k}. It is a leaf, so it simply leaves the tree.`
          : `Found ${k}. It has one child, so its subtree (rooted at ${W.key(child)}) moves up into its place.`,
        ['del.find', 'del.splice'],
        2,
        [nodeMark(z, 'remove'), ...(child === null ? [] : [nodeMark(child, 'active')])],
      );
    } else {
      // Two children: the successor y takes z's place, as in CLRS.
      let y = zn.right!;
      c.extra.path = [y];
      yield step(
        c,
        `Found ${k}. It has two children, so its successor y, the smallest key in its right subtree, will take its place. Go right to ${W.key(y)}.`,
        ['del.find', 'del.succ'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'compare'), edgeMark(y, 'active')],
      );
      for (let next = W.n(y).left; next !== null; next = W.n(y).left) {
        const from = W.key(y);
        y = next;
        c.extra.path.push(y);
        yield step(c, `${from} has a left child, so go left to ${W.key(y)}.`, ['del.succ'], 3, [
          nodeMark(z, 'remove'),
          nodeMark(y, 'compare'),
          edgeMark(y, 'active'),
        ]);
      }
      const yk = W.key(y);
      const yn = W.n(y);
      if (y !== zn.right) {
        W.transplant(y, yn.right);
        yn.right = zn.right;
        W.n(yn.right!).parent = y;
      }
      W.transplant(z, y);
      yn.left = zn.left;
      W.n(yn.left!).parent = y;
      W.detach(z);
      c.extra.held = z;
      c.extra.path = [];
      yield step(
        c,
        `${yk} has no left child, so it is the successor. It moves into ${k}'s place and takes both of ${k}'s subtrees.`,
        ['del.succ', 'del.replace'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'active')],
      );
    }
    delete W.nodes[z];
    c.extra.held = undefined;
    const n = treeSize(W);
    const { num, den } = FRACTIONS[st.alpha];
    const rule = `N = ${n}, max N = ${c.maxSize}, and α × max N = ${a} × ${c.maxSize} = ${Number(((num * c.maxSize) / den).toFixed(2))}`;
    if (!(den * n < num * c.maxSize)) {
      yield step(
        c,
        `${k} is gone. ${rule}; N is not below that, so the tree stays as it is. ${summary(c, st)}`,
        ['del.rule'],
        1,
        [],
      );
      return { ...W.snap(), maxSize: c.maxSize, rebuilds: c.rebuilds };
    }
    if (W.root === null) {
      c.maxSize = 0;
      yield step(
        c,
        `${k} is gone, and the tree is empty. max N starts again at 0.`,
        ['del.rule', 'del.all'],
        1,
        [],
      );
      return { ...W.snap(), maxSize: c.maxSize, rebuilds: c.rebuilds };
    }
    yield step(
      c,
      `${k} is gone. ${rule}, and N is below that: too many deletes since the last full rebuild. Rebuild the whole tree.`,
      ['del.rule'],
      2,
      [nodeMark(W.root, 'error')],
    );
    yield* rebuild(c, step, W.root, 'The scapegoat is the root.');
    c.maxSize = n;
    yield step(c, `Done: max N = N = ${n} again. ${summary(c, st)}`, ['del.all'], 1, []);
    return { ...W.snap(), maxSize: c.maxSize, rebuilds: c.rebuilds };
  },
};

// ---------------------------------------------------------------------------------------------
// search, inorder, clear

const search: KitOp = {
  label: 'Search',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'search', raw!, k, 'srch.sig');
    yield* searchWalk(ctx(s, { arg: { name: 'k', text: String(k) } }, { k }), stepper(st), k);
    return s;
  },
};

const inorder: KitOp = {
  label: 'Inorder',
  arity: 0,
  *run(s, _args, { settings: st }) {
    yield* inorderWalk(ctx(s, {}, {}), stepper(st));
    return s;
  },
};

const clear: KitOp = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings: st }) {
    const empty: S = { ...init(), nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say:
        s.root === null
          ? 'clear(): the tree was already empty.'
          : 'clear(): root = nil. Every node is gone; max N and the rebuild count start again at 0.',
      lines: ['clear.root'],
      vars: readouts(empty, st),
      level: 1,
    } satisfies Step<S, X>;
    return empty;
  },
};

export const ops = { insert, delete: del, search, inorder, clear } as unknown as Record<
  'insert' | 'delete' | 'search' | 'inorder' | 'clear',
  Op
>;

// ---------------------------------------------------------------------------------------------
// Pseudocode

export function pseudocode(st: ScapegoatSettings): PseudoBlock[] {
  const a = alphaText(st.alpha);
  const base = st.alpha === '2/3' ? '3/2' : `1/${a}`;
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L(
          'ins.bst',
          1,
          'x = bstInsert(k); d = depth(x)',
          'add k as a leaf, as in a BST, and note how deep it is.',
        ),
        L('ins.deep', 1, `if d > log_${base}(n)`, 'If it is deeper than the limit for n nodes:'),
        L('ins.up', 2, 'w = x.p; c = x', 'walk up from its parent,'),
        L(
          'ins.size',
          3,
          'size(w) = size(c) + 1 + size(sibling)',
          'adding up the size of each subtree,',
        ),
        L(
          'ins.goat',
          3,
          `until size(c) > ${a} · size(w)`,
          `until a child holds more than ${a} of its parent's subtree;`,
        ),
        L('ins.rebuild', 2, 'rebuild(w)', 'that parent is the scapegoat: rebuild its subtree.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = search(k)', 'find the node z.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L(
          'del.splice',
          1,
          'if z has < 2 children: splice z out',
          'With at most one child, its subtree takes its place.',
        ),
        L('del.succ', 1, 'else: y = min(z.right)', 'Otherwise find its successor y,'),
        L('del.replace', 2, 'transplant(z, y)', 'and put y where z was.'),
        L(
          'del.rule',
          1,
          `if n < ${a} · maxN`,
          'If too many nodes have gone since the last full rebuild,',
        ),
        L(
          'del.all',
          2,
          'rebuild(root); maxN = n',
          'rebuild the whole tree and start counting again.',
        ),
      ],
    },
    {
      op: 'rebuild',
      lines: [
        L('rb.sig', 0, 'rebuild(w)', 'To rebuild the subtree at w:'),
        L('rb.flat', 1, 'A = inorder(w)', 'list its nodes in sorted order,'),
        L(
          'rb.build',
          1,
          'build(A): root = A[mid], recurse on halves',
          'then hang them back from the middle, half by half.',
        ),
      ],
    },
    searchBlock(),
    inorderBlock(),
    clearBlock(),
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(_s: S, st: ScapegoatSettings): string {
  return `An empty scapegoat tree with α = ${alphaText(st.alpha)}. Insert some keys, such as 10 20 30 40 50 60 70: no rotations, only the odd rebuild.`;
}

export function initialVars(s: S, st: ScapegoatSettings): Record<string, Scalar> {
  return readouts(s, st);
}

export function describe(s: S): string {
  if (s.root === null) return 'An empty scapegoat tree.';
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    parts.push(kids.length ? `${n.key} has ${kids.join(' and ')}.` : `${n.key} is a leaf.`);
    walk(n.right);
  };
  walk(s.root);
  return `A scapegoat tree with ${plural(treeSize(s), 'key')} and height ${treeHeight(s)}. The root is ${s.nodes[s.root]!.key}. ${parts.join(' ')}`;
}
