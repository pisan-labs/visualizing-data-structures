/**
 * AA tree (Arne Andersson, 1993): a red-black tree in disguise. Each node has a level instead of
 * a color; a right child on its parent's level is a horizontal link (a "red" child), and left
 * horizontal links are not allowed. Two small operations keep the rules: skew (a right rotation
 * that removes a left horizontal link) and split (a left rotation that breaks up two right
 * horizontal links in a row and lifts the middle node a level).
 */
import type { Mark, OpContext, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
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
  treeSize,
  type Ctx,
  type MakeStep,
  type TreeExtra,
  type TreeNode,
  type TreeState,
} from '../_bst/tree-kit';

export interface AANode extends TreeNode {
  level: number;
}

export interface AAState extends TreeState<AANode> {
  /** Skews and splits that changed the tree, since it was cleared. */
  skews: number;
  splits: number;
}

export interface AASettings {
  [key: string]: Scalar;
  /** levels: rows by level, horizontal links drawn flat. redblack: a binary tree, horizontal children red. */
  draw: 'levels' | 'redblack';
}

export type AAExtra = TreeExtra;

type S = AAState;
type X = AAExtra;
type Op = OpSpec<S, AASettings, X>;
type KitOp = {
  label: string;
  arity: number;
  run(
    state: S,
    args: Value[],
    ctx: OpContext<AASettings>,
  ): Generator<Step<TreeState<AANode>, X>, S, void>;
};
type AC = Ctx<AANode, X> & { skews: number; splits: number };
type MS = MakeStep<AANode, X>;

export const defaults: AASettings = { draw: 'levels' };

export function init(): S {
  return { ...emptyState<AANode>(), skews: 0, splits: 0 };
}

const lv = (W: TreeWork<AANode>, u: number | null) => (u === null ? 0 : W.n(u).level);

export function rootLevel(s: { nodes: Record<number, AANode>; root: number | null }): number {
  return s.root === null ? 0 : s.nodes[s.root]!.level;
}

export function readouts(s: S): Record<string, Scalar> {
  return { N: treeSize(s), 'root level': rootLevel(s), skews: s.skews, splits: s.splits };
}

function stepper(): MS {
  return (c, say, lines, level, marks, more = {}) => {
    const a = c as AC;
    const state: S = { ...c.W.snap(), skews: a.skews, splits: a.splits };
    const extra: X = { ...c.extra, ...more };
    if (extra.path) extra.path = [...extra.path];
    if (extra.output) extra.output = [...extra.output];
    return { state, marks, say, lines, vars: { ...readouts(state), ...c.vars }, level, extra };
  };
}

const ctx = (s: S, extra: X, vars: Record<string, Scalar>): AC => ({
  W: new TreeWork(s),
  extra,
  vars,
  skews: s.skews,
  splits: s.splits,
});

const finish = (c: AC): S => ({ ...c.W.snap(), skews: c.skews, splits: c.splits });

function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c = ctx(s, { arg: { name: 'k', text: String(raw), error: true } }, {});
  yield stepper()(c, `${name}(${String(raw)}): ${err.message} The tree is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

// ---------------------------------------------------------------------------------------------
// skew and split, each with a picture when it changes something

/** skew(t): a left child on t's level is a left horizontal link. Rotate right. */
function* skew(
  c: AC,
  step: MS,
  t: number | null,
  line: string,
  quiet = false,
): Generator<Step<TreeState<AANode>, X>, number | null, void> {
  if (t === null) return t;
  const W = c.W;
  const l = W.n(t).left;
  if (l === null || W.n(l).level !== W.n(t).level) {
    if (!quiet)
      yield step(
        c,
        `skew(${W.key(t)}): its left child ${l === null ? 'is nil' : `${W.key(l)} is on a lower level`}, so there is no left horizontal link. Nothing to do.`,
        [line],
        3,
        [nodeMark(t, 'compare')],
      );
    return t;
  }
  const tk = W.key(t);
  const lk = W.key(l);
  yield step(
    c,
    `skew(${tk}): its left child ${lk} is on the same level, ${W.n(t).level}: a left horizontal link, which is not allowed. Rotate right at ${tk}.`,
    [line],
    2,
    [nodeMark(t, 'error'), nodeMark(l, 'active'), edgeMark(l, 'error')],
  );
  W.rotate(t, 'right');
  W.rotations -= 1;
  c.skews += 1;
  const inner = W.n(t).left;
  yield step(
    c,
    `skew: ${lk} moves up and ${tk} becomes its right child, a right horizontal link, which is fine${inner === null ? '' : `. ${lk}'s old right subtree (${W.key(inner)}) moves across to ${tk}`}.`,
    [line],
    2,
    [nodeMark(l, 'new'), nodeMark(t, 'active'), edgeMark(t, 'active')],
  );
  return l;
}

/** split(t): t, its right child and its right grandchild all on one level. Rotate left, lift. */
function* split(
  c: AC,
  step: MS,
  t: number | null,
  line: string,
  quiet = false,
): Generator<Step<TreeState<AANode>, X>, number | null, void> {
  if (t === null) return t;
  const W = c.W;
  const r = W.n(t).right;
  const rr = r === null ? null : W.n(r).right;
  if (rr === null || W.n(rr).level !== W.n(t).level) {
    if (!quiet)
      yield step(
        c,
        `split(${W.key(t)}): there are not two right horizontal links in a row here. Nothing to do.`,
        [line],
        3,
        [nodeMark(t, 'compare')],
      );
    return t;
  }
  const tk = W.key(t);
  const rk = W.key(r!);
  yield step(
    c,
    `split(${tk}): ${tk}, ${rk} and ${W.key(rr)} are all on level ${W.n(t).level}: two right horizontal links in a row, too many. Rotate left at ${tk} and lift ${rk} a level.`,
    [line],
    2,
    [nodeMark(t, 'error'), nodeMark(r!, 'active'), edgeMark(r!, 'error'), edgeMark(rr, 'error')],
  );
  W.rotate(t, 'left');
  W.rotations -= 1;
  W.n(r!).level += 1;
  c.splits += 1;
  yield step(
    c,
    `split: ${rk} moves up to level ${W.n(r!).level}, with ${tk} on its left and ${W.key(rr)} on its right.`,
    [line],
    2,
    [nodeMark(r!, 'new'), nodeMark(t, 'active'), nodeMark(rr, 'active')],
  );
  return r!;
}

function summary(c: AC, before: S, op: string): string {
  const sk = c.skews - before.skews;
  const sp = c.splits - before.splits;
  const what =
    sk + sp === 0 ? 'no skews or splits' : `${plural(sk, 'skew')} and ${plural(sp, 'split')}`;
  return `N = ${treeSize(c.W)}, root level = ${lv(c.W, c.W.root)}. This ${op} needed ${what}.`;
}

// ---------------------------------------------------------------------------------------------
// insert: add a leaf on level 1, then skew and split at every node on the way up

const insert: KitOp = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'insert', raw!, k, 'ins.sig');
    const step = stepper();
    const c = ctx(s, { arg: { name: 'k', text: String(k), uid: s.nextUid } }, { k });
    const W = c.W;
    const name = `insert(${k})`;
    if (W.root !== null)
      yield step(
        c,
        `${name}: walk down as in a BST. Start at the root, ${W.key(W.root)}.`,
        ['ins.bst'],
        3,
        [nodeMark(W.root, 'active')],
      );
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
    const uid = W.nextUid;
    W.nodes[uid] = { uid, key: k, left: null, right: null, parent, level: 1 };
    W.nextUid += 1;
    if (parent === null) W.root = uid;
    else W.n(parent)[side!] = uid;
    c.extra.arg = undefined;
    c.extra.nil = undefined;
    c.extra.fresh = uid;
    c.extra.path = [];
    delete c.vars.x;
    if (parent === null) {
      yield step(
        c,
        `${name}: the tree is empty, so ${k} becomes the root, on level 1. ${summary(c, s, 'insert')}`,
        ['ins.leaf'],
        1,
        [nodeMark(uid, 'new')],
      );
      return finish(c);
    }
    const pk = W.key(parent);
    const flat = W.n(parent).level === 1;
    yield step(
      c,
      `${k} becomes the ${side} child of ${pk}, on level 1, like every new node. ${
        flat
          ? side === 'left'
            ? `${pk} is on level 1 too, so this is a left horizontal link: skew will fix it.`
            : `${pk} is on level 1 too, so this is a right horizontal link. Fine, unless there are now two in a row.`
          : ''
      } Now skew and split at each node on the way back up.`,
      ['ins.leaf'],
      2,
      [nodeMark(uid, 'new'), edgeMark(uid, flat && side === 'left' ? 'error' : 'new')],
    );
    c.extra.fresh = undefined;
    let t: number | null = parent;
    while (t !== null) {
      c.vars.t = W.key(t);
      t = yield* skew(c, step, t, 'ins.skew');
      t = yield* split(c, step, t, 'ins.split');
      t = W.n(t!).parent;
    }
    delete c.vars.t;
    yield step(
      c,
      `Back at the root: every rule holds. ${summary(c, s, 'insert')}`,
      ['ins.split'],
      1,
      [nodeMark(uid, 'done')],
    );
    return finish(c);
  },
};

// ---------------------------------------------------------------------------------------------
// delete: remove a leaf (a neighbor stands in for an inner node), then fix levels on the way up

const del: KitOp = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'delete', raw!, k, 'del.sig');
    const step = stepper();
    const name = `delete(${k})`;
    const c = ctx(s, { arg: { name: 'k', text: String(k) } }, { k });
    const W = c.W;
    if (W.root !== null)
      yield step(c, `${name}: first find ${k}, as in a BST. Start at the root.`, ['del.find'], 3, [
        nodeMark(W.root, 'active'),
      ]);
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
    let start: number | null;
    if (zn.left === null && zn.right === null) {
      start = zn.parent;
      W.transplant(z, null);
      W.detach(z);
      c.extra.held = z;
      yield step(
        c,
        `Found ${k}. It is a leaf, on level 1, so it simply leaves the tree.`,
        ['del.find', 'del.leaf'],
        2,
        [nodeMark(z, 'remove')],
      );
    } else {
      // An inner node: its neighbor in key order is always a leaf on level 1. It stands in.
      const succ = zn.left === null;
      let r = succ ? zn.right! : zn.left!;
      if (!succ) while (W.n(r).right !== null) r = W.n(r).right!;
      const rk = W.key(r);
      yield step(
        c,
        succ
          ? `Found ${k}. It has no left child, so its successor, ${rk}, is its right child, a leaf. ${rk} will take its place.`
          : `Found ${k}. Its predecessor, the largest key on its left, is ${rk}: always a leaf on level 1 in an AA tree. ${rk} will take its place.`,
        ['del.find', succ ? 'del.succ' : 'del.pred'],
        2,
        [nodeMark(z, 'remove'), nodeMark(r, 'found')],
      );
      start = W.n(r).parent;
      W.transplant(r, null);
      W.detach(r);
      const zNow = W.n(z);
      const rn = W.n(r);
      rn.level = zNow.level;
      rn.left = zNow.left;
      rn.right = zNow.right;
      if (rn.left !== null) W.n(rn.left).parent = r;
      if (rn.right !== null) W.n(rn.right).parent = r;
      W.transplant(z, r);
      W.detach(z);
      if (start === z) start = r;
      c.extra.held = z;
      yield step(
        c,
        `${rk} leaves its leaf spot and moves into ${k}'s place, taking its level, ${rn.level}, and its children.`,
        [succ ? 'del.succ' : 'del.pred', 'del.copy'],
        2,
        [nodeMark(z, 'remove'), nodeMark(r, 'active')],
      );
    }
    delete W.nodes[z];
    c.extra.held = undefined;
    if (start === null) {
      yield step(c, `${k} is gone. ${summary(c, s, 'delete')}`, ['del.leaf'], 1, []);
      return finish(c);
    }
    yield step(
      c,
      `${k} is gone. Walk back up from ${W.key(start)}: at each node, lower its level if a child is now too far below, then skew three times and split twice.`,
      ['del.fix'],
      2,
      [nodeMark(start, 'active')],
    );
    let t: number | null = start;
    while (t !== null) {
      c.vars.t = W.key(t);
      t = yield* fixAt(c, step, t);
      t = W.n(t!).parent;
    }
    delete c.vars.t;
    yield step(
      c,
      `Back at the root: every rule holds. ${summary(c, s, 'delete')}`,
      ['del.fix'],
      1,
      [],
    );
    return finish(c);
  },
};

/** The rebalancing after a delete, at t. Returns the new root of t's subtree. */
function* fixAt(c: AC, step: MS, t0: number): Generator<Step<TreeState<AANode>, X>, number, void> {
  const W = c.W;
  const tk = W.key(t0);
  const tn = W.n(t0);
  const should = Math.min(lv(W, tn.left), lv(W, tn.right)) + 1;
  const marks: Mark[] = [nodeMark(t0, 'active')];
  if (should < tn.level) {
    const from = tn.level;
    tn.level = should;
    const r = tn.right;
    let also = '';
    if (r !== null && should < W.n(r).level) {
      W.n(r).level = should;
      also = ` Its right child ${W.key(r)} was on level ${from} with it, so it comes down too.`;
      marks.push(nodeMark(r, 'active'));
    }
    yield step(
      c,
      `${tk}: a child is on level ${should - 1}, so ${tk} may be at most on level ${should}. Lower it from ${from} to ${should}.${also}`,
      ['del.level'],
      2,
      marks,
    );
  } else {
    yield step(
      c,
      `${tk}: its children are close enough below it, so its level, ${tn.level}, stays.`,
      ['del.level'],
      3,
      marks,
    );
  }
  // Each of these is a no-op unless a lowered level made a horizontal link go the wrong way.
  let t = (yield* skew(c, step, t0, 'del.skew', true))!;
  const r1 = W.n(t).right;
  if (r1 !== null) yield* skew(c, step, r1, 'del.skew', true);
  const r2 = W.n(t).right;
  const rr = r2 === null ? null : W.n(r2).right;
  if (rr !== null) yield* skew(c, step, rr, 'del.skew', true);
  t = (yield* split(c, step, t, 'del.split', true))!;
  const r3 = W.n(t).right;
  if (r3 !== null) yield* split(c, step, r3, 'del.split', true);
  return t;
}

// ---------------------------------------------------------------------------------------------
// search, inorder, clear

const search: KitOp = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'search', raw!, k, 'srch.sig');
    yield* searchWalk(ctx(s, { arg: { name: 'k', text: String(k) } }, { k }), stepper(), k);
    return s;
  },
};

const inorder: KitOp = {
  label: 'Inorder',
  arity: 0,
  *run(s) {
    yield* inorderWalk(ctx(s, {}, {}), stepper());
    return s;
  },
};

const clear: KitOp = {
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
          : 'clear(): root = nil. Every node is gone, and the counts start again at 0.',
      lines: ['clear.root'],
      vars: readouts(empty),
      level: 1,
    };
    return empty;
  },
};

export const ops = { insert, delete: del, search, inorder, clear } as unknown as Record<
  'insert' | 'delete' | 'search' | 'inorder' | 'clear',
  Op
>;

// ---------------------------------------------------------------------------------------------
// Pseudocode

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(t, k)', 'To insert key k into the subtree at t:'),
        L('ins.bst', 1, 'if k < t.key: t.left = insert(t.left, k) …', 'go down as in a BST;'),
        L(
          'ins.leaf',
          1,
          'if t == nil: return new node(k, level 1)',
          'at the bottom, add k as a leaf on level 1.',
        ),
        L('ins.skew', 1, 't = skew(t)', 'On the way back up, remove a left horizontal link,'),
        L(
          'ins.split',
          1,
          't = split(t); return t',
          'then break up two right horizontal links in a row.',
        ),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = search(k)', 'find the node z.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L('del.leaf', 1, 'if z is a leaf: remove z', 'A leaf simply leaves.'),
        L(
          'del.succ',
          1,
          'elif z.left == nil: r = successor(z)',
          'Otherwise a neighbor stands in: the successor if there is no left child,',
        ),
        L(
          'del.pred',
          1,
          'else: r = predecessor(z)',
          'else the predecessor (either way a leaf on level 1).',
        ),
        L('del.copy', 2, 'remove leaf r; put r in z’s place', 'Move that leaf into z’s place.'),
        L('del.fix', 1, 'for t on the path, bottom up:', 'Then, at each node on the way back up:'),
        L('del.level', 2, 'decreaseLevel(t)', 'lower its level if a child is too far below,'),
        L(
          'del.skew',
          2,
          'skew(t); skew(t.right); skew(t.right.right)',
          'remove left horizontal links,',
        ),
        L(
          'del.split',
          2,
          'split(t); split(t.right)',
          'and break up runs of right horizontal links.',
        ),
      ],
    },
    {
      op: 'skew',
      lines: [
        L('skew.sig', 0, 'skew(t)', 'skew: if t has a left child on its own level,'),
        L(
          'skew.rot',
          1,
          'if t.left.level == t.level: rotateRight(t)',
          'rotate right, so the link points right instead.',
        ),
      ],
    },
    {
      op: 'split',
      lines: [
        L(
          'split.sig',
          0,
          'split(t)',
          'split: if t, its right child and its right grandchild share a level,',
        ),
        L('split.rot', 1, 'if t.right.right.level == t.level:', 'rotate left at t'),
        L(
          'split.lift',
          2,
          'r = rotateLeft(t); r.level += 1',
          'and lift the middle node one level.',
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

export function initialSay(): string {
  return 'An empty AA tree. Insert some keys, such as 10 20 30 40 50: watch skew and split keep the levels in shape.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

export function describe(s: S): string {
  if (s.root === null) return 'An empty AA tree.';
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    const label = `${n.key} (level ${n.level})`;
    parts.push(kids.length ? `${label} has ${kids.join(' and ')}.` : `${label} is a leaf.`);
    walk(n.right);
  };
  walk(s.root);
  return `An AA tree with ${plural(treeSize(s), 'key')}. The root is ${s.nodes[s.root]!.key}, on level ${rootLevel(s)}. ${parts.join(' ')}`;
}
