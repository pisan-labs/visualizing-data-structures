import type {
  Mark,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import {
  L,
  TreeWork,
  clearBlock,
  cmp,
  edgeMark,
  emptyState,
  inorderBlock,
  inorderWalk,
  mark,
  nilMark,
  nodeMark,
  other,
  parseKey,
  plural,
  treeHeight,
  treeSize,
  type Ctx,
  type MakeStep,
  type Side,
  type TreeExtra,
  type TreeNode,
  type TreeState,
} from '../avl/tree-kit';

export type SplayState = TreeState<TreeNode>;

export interface SplaySettings {
  [key: string]: Scalar;
  /**
   * join: splay k to the root, remove it, and join its two subtrees by splaying the largest key
   * of the left one (Sleator and Tarjan). bst: delete as in a BST, then splay the parent of the
   * node that was removed (Goodrich and Tamassia).
   */
  delete: 'join' | 'bst';
}

export type SplayCase = 'zig' | 'zig-zig' | 'zig-zag';

export interface SplayExtra extends TreeExtra {
  /** The splay step being applied, named in the band above the tree. */
  caption?: string;
}

type S = SplayState;
type X = SplayExtra;
type Op = OpSpec<S, SplaySettings, X>;
type SplayStep = Step<S, X>;
type SC = Ctx<TreeNode, X>;
type Gen<R> = Generator<SplayStep, R, void>;

export const defaults: SplaySettings = { delete: 'join' };

export function init(): S {
  return emptyState<TreeNode>();
}

export function readouts(s: S): Record<string, Scalar> {
  return { N: treeSize(s), height: treeHeight(s), rotations: s.rotations };
}

function stepper(): MakeStep<TreeNode, X> {
  return (c, say, lines, level, marks, more = {}) => {
    const state = c.W.snap();
    const extra: X = { ...c.extra, ...more };
    if (extra.path) extra.path = [...extra.path];
    if (extra.output) extra.output = [...extra.output];
    return { state, marks, say, lines, vars: { ...readouts(state), ...c.vars }, level, extra };
  };
}

const ctx = (s: S, extra: X, vars: Record<string, Scalar>): SC => ({
  W: new TreeWork(s),
  extra,
  vars,
});

/** A step that reports a bad argument and changes nothing. */
function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c = ctx(s, { arg: { name: 'k', text: String(raw), error: true } }, {});
  yield stepper()(c, `${name}(${String(raw)}): ${err.message} The tree is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

function depthOf(W: TreeWork<TreeNode>, u: number): number {
  let d = 0;
  for (let p = W.n(u).parent; p !== null; p = W.n(p).parent) d++;
  return d;
}

function summary(W: TreeWork<TreeNode>, before: S): string {
  const s = W.snap();
  const made = W.rotations - before.rotations;
  return `N = ${treeSize(s)}, height = ${treeHeight(s)}, ${plural(made, 'rotation')}.`;
}

// ---------------------------------------------------------------------------------------------
// Splaying

/** Rotate at x's parent so that x moves up one level. */
function rotateUp(W: TreeWork<TreeNode>, x: number): void {
  const p = W.n(x).parent!;
  W.rotate(p, other(W.sideOf(x)!));
}

/** Which way rotateUp(x) turns: right when x is a left child. */
const turn = (W: TreeWork<TreeNode>, x: number) => (W.sideOf(x) === 'left' ? 'right' : 'left');

/** Narration for lifting x by one rotation at its parent, before the rotation happens. */
function liftSay(W: TreeWork<TreeNode>, x: number): string {
  const p = W.n(x).parent!;
  const side = W.sideOf(x)!;
  const inner = W.n(x)[other(side)];
  return `rotate ${turn(W, x)} at ${W.key(p)}: ${W.key(x)} moves up and ${W.key(p)} becomes its ${other(side)} child${
    inner === null ? '' : `, taking ${W.key(inner)} along as its ${side} child`
  }`;
}

/**
 * Bottom-up splay: move x up with zig, zig-zig and zig-zag steps until its parent is `stop`
 * (null: until x is the root). Every step names its case.
 */
function* splay(c: SC, step: MakeStep<TreeNode, X>, x: number, stop: number | null): Gen<void> {
  const W = c.W;
  const xk = W.key(x);
  const top = stop === null ? 'the root' : `just below ${W.key(stop)}`;
  c.vars.x = xk;
  while (W.n(x).parent !== stop) {
    const p = W.n(x).parent!;
    const g = W.n(p).parent;
    const pk = W.key(p);
    const xSide = W.sideOf(x)!;
    if (g === stop) {
      c.vars.case = 'zig';
      c.extra.caption = 'Zig';
      const say = liftSay(W, x);
      rotateUp(W, x);
      yield step(
        c,
        `Zig: ${xk}'s parent ${pk} is ${top}, so one rotation finishes the splay: ${say}.`,
        ['spl.loop', 'spl.pg', 'spl.zig', 'spl.zig1'],
        1,
        [nodeMark(x, 'new'), nodeMark(p, 'active'), edgeMark(p, 'active')],
      );
      continue;
    }
    const gk = W.key(g!);
    const pSide = W.sideOf(p)!;
    if (pSide === xSide) {
      c.vars.case = 'zig-zig';
      c.extra.caption = 'Zig-zig';
      yield step(
        c,
        `Zig-zig: ${xk} is the ${xSide} child of ${pk}, which is the ${pSide} child of ${gk}: both ${xSide}. Rotate at the grandparent ${gk} first, then at ${pk}.`,
        ['spl.loop', 'spl.pg', 'spl.zig', 'spl.zz'],
        2,
        [nodeMark(x, 'active'), nodeMark(p, 'compare'), nodeMark(g!, 'compare')],
      );
      const first = liftSay(W, p);
      rotateUp(W, p);
      yield step(c, `First ${first}.`, ['spl.zz1'], 2, [
        nodeMark(x, 'active'),
        nodeMark(p, 'new'),
        nodeMark(g!, 'visit'),
        edgeMark(g!, 'active'),
      ]);
      const second = liftSay(W, x);
      rotateUp(W, x);
      yield step(
        c,
        `Then ${second}. ${xk} has gone up two levels, and ${gk}, which was above it, is now two levels below.`,
        ['spl.zz2'],
        1,
        [nodeMark(x, 'new'), nodeMark(p, 'visit'), edgeMark(p, 'active')],
      );
    } else {
      c.vars.case = 'zig-zag';
      c.extra.caption = 'Zig-zag';
      yield step(
        c,
        `Zig-zag: ${xk} is the ${xSide} child of ${pk}, which is the ${pSide} child of ${gk}: they bend. Rotate at the parent ${pk} first, then at ${gk}, as in an AVL double rotation.`,
        ['spl.loop', 'spl.pg', 'spl.zig', 'spl.zz', 'spl.zg'],
        2,
        [nodeMark(x, 'active'), nodeMark(p, 'compare'), nodeMark(g!, 'compare')],
      );
      const first = liftSay(W, x);
      rotateUp(W, x);
      yield step(c, `First ${first}.`, ['spl.zg1'], 2, [
        nodeMark(x, 'new'),
        nodeMark(p, 'visit'),
        edgeMark(p, 'active'),
      ]);
      const second = liftSay(W, x);
      rotateUp(W, x);
      yield step(
        c,
        `Then ${second}. ${xk} has gone up two levels, with ${pk} and ${gk} now on either side of it.`,
        ['spl.zg2'],
        1,
        [nodeMark(x, 'new'), nodeMark(g!, 'visit'), edgeMark(g!, 'active')],
      );
    }
  }
  c.extra.caption = undefined;
  delete c.vars.case;
}

/** Walk down comparing k; returns the node holding k (or null) and the last node visited. */
function* walk(
  c: SC,
  step: MakeStep<TreeNode, X>,
  k: number,
  lines: string[],
  name: string,
): Gen<{ x: number | null; last: number | null; depth: number }> {
  const W = c.W;
  const path: number[] = [];
  c.extra.path = path;
  let x = W.root;
  let last: number | null = null;
  while (x !== null) {
    path.push(x);
    const key = W.key(x);
    c.vars.x = key;
    if (k === key) return { x, last: x, depth: path.length - 1 };
    const side: Side = k < key ? 'left' : 'right';
    const child: number | null = W.n(x)[side];
    yield step(
      c,
      `${name}: ${cmp(k, key)}, ${child === null ? `but ${key} has no ${side} child.` : `so go ${side} to ${W.key(child)}.`}`,
      lines,
      2,
      [nodeMark(x, 'compare'), ...(child === null ? [nilMark(c, x, side)] : [])],
      { nil: child === null ? { parent: x, side } : undefined },
    );
    last = x;
    x = child;
  }
  return { x: null, last, depth: path.length };
}

/** Search for k and splay what it finds, or the last node visited. Returns the node of k. */
function* access(
  c: SC,
  step: MakeStep<TreeNode, X>,
  k: number,
  name: string,
  lines: { walk: string[]; splay: string[] },
): Gen<number | null> {
  const W = c.W;
  if (W.root === null) return null;
  yield step(c, `${name}: start at the root, ${W.key(W.root)}.`, lines.walk, 3, [
    nodeMark(W.root, 'active'),
  ]);
  const { x, last, depth } = yield* walk(c, step, k, lines.walk, name);
  c.extra.nil = undefined;
  c.extra.path = [];
  const target = x ?? last!;
  const tk = W.key(target);
  c.vars.depth = depth;
  yield step(
    c,
    x !== null
      ? `${k} = ${tk}: found it at depth ${depth}. Now splay ${tk} to the root.`
      : `${k} is not in the tree. Splay the last node visited, ${tk}, to the root anyway: the work of the walk still pays for itself.`,
    lines.splay,
    2,
    [nodeMark(target, x !== null ? 'found' : 'active')],
  );
  yield* splay(c, step, target, null);
  return x;
}

// ---------------------------------------------------------------------------------------------
// search, insert, delete

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'search', raw!, k, 'srch.sig');
    const step = stepper();
    const c = ctx(s, { arg: { name: 'k', text: String(k) } }, { k });
    const name = `search(${k})`;
    if (s.root === null) {
      c.vars.found = false;
      yield step(c, `${name}: the tree is empty, so ${k} is not in it.`, ['srch.walk'], 1, []);
      return s;
    }
    const x = yield* access(c, step, k, name, {
      walk: ['srch.walk', 'srch.loop', 'srch.step'],
      splay: ['srch.splay'],
    });
    c.vars.found = x !== null;
    delete c.vars.x;
    const W = c.W;
    yield step(
      c,
      x !== null
        ? `${k} is at the root now: searching for it again takes one comparison. ${summary(W, s)}`
        : `${k} is not in the tree, and ${W.key(W.root!)} is at the root now. ${summary(W, s)}`,
      ['srch.ret'],
      1,
      [nodeMark(W.root!, x !== null ? 'found' : 'done')],
    );
    return W.snap();
  },
};

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'insert', raw!, k, 'ins.sig');
    const step = stepper();
    const W = new TreeWork<TreeNode>(s);
    const uid = W.nextUid;
    const c: SC = { W, extra: { arg: { name: 'k', text: String(k), uid } }, vars: { k } };
    const name = `insert(${k})`;
    if (W.root === null) {
      W.nodes[uid] = { uid, key: k, left: null, right: null, parent: null };
      W.nextUid = uid + 1;
      W.root = uid;
      c.extra.arg = undefined;
      c.extra.fresh = uid;
      yield step(
        c,
        `${name}: the tree is empty, so ${k} becomes the root. There is nothing to splay. ${summary(W, s)}`,
        ['ins.bst'],
        1,
        [nodeMark(uid, 'new')],
      );
      return W.snap();
    }
    yield step(
      c,
      `${name}: walk down from the root, ${W.key(W.root)}, as in a BST.`,
      ['ins.bst'],
      3,
      [nodeMark(W.root, 'active')],
    );
    const { x, last } = yield* walk(c, step, k, ['ins.bst'], name);
    c.extra.nil = undefined;
    c.extra.path = [];
    if (x !== null) {
      c.vars.found = true;
      yield step(
        c,
        `${k} = ${k}: ${k} is already in the tree, so no new node. It still gets splayed to the root.`,
        ['ins.bst', 'ins.dup'],
        2,
        [nodeMark(x, 'found'), mark('arg-box', 'error')],
      );
      yield* splay(c, step, x, null);
      delete c.vars.x;
      yield step(
        c,
        `${k} is at the root, and the tree holds the same keys as before. ${summary(W, s)}`,
        ['ins.dup'],
        1,
        [nodeMark(x, 'found'), mark('arg-box', 'error')],
      );
      return W.snap();
    }
    const y = last!;
    const side: Side = k < W.key(y) ? 'left' : 'right';
    W.nodes[uid] = { uid, key: k, left: null, right: null, parent: y };
    W.nextUid = uid + 1;
    W.n(y)[side] = uid;
    c.extra.arg = undefined;
    c.extra.fresh = uid;
    c.vars.depth = depthOf(W, uid);
    yield step(
      c,
      `${k} becomes the ${side} child of ${W.key(y)}, at depth ${depthOf(W, uid)}. Now splay it to the root.`,
      ['ins.bst', 'ins.splay'],
      2,
      [nodeMark(uid, 'new'), edgeMark(uid, 'active')],
    );
    c.extra.fresh = undefined;
    yield* splay(c, step, uid, null);
    delete c.vars.x;
    yield step(c, `${k} is the root. ${summary(W, s)}`, ['ins.splay'], 1, [nodeMark(uid, 'new')]);
    return W.snap();
  },
};

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'delete', raw!, k, 'del.sig');
    const step = stepper();
    const c = ctx(s, { arg: { name: 'k', text: String(k) } }, { k });
    const W = c.W;
    const name = `delete(${k})`;
    if (W.root === null) {
      yield step(
        c,
        `${name}: the tree is empty, so there is nothing to delete.`,
        ['del.find'],
        1,
        [],
      );
      return s;
    }
    if (settings.delete === 'join') return yield* deleteJoin(c, step, s, k, name);
    return yield* deleteBst(c, step, s, k, name);
  },
};

/** Sleator and Tarjan: splay k to the root, remove it, splay the left side's largest key up. */
function* deleteJoin(c: SC, step: MakeStep<TreeNode, X>, s: S, k: number, name: string): Gen<S> {
  const W = c.W;
  const z = yield* access(c, step, k, name, { walk: ['del.find'], splay: ['del.find'] });
  delete c.vars.x;
  if (z === null) {
    yield step(
      c,
      `${k} is not in the tree, so nothing is deleted. ${W.key(W.root!)} is at the root now. ${summary(W, s)}`,
      ['del.find', 'del.missing'],
      1,
      [nodeMark(W.root!, 'done')],
    );
    return W.snap();
  }
  const zn = W.n(z);
  if (zn.left === null) {
    const r = zn.right;
    W.transplant(z, r);
    W.detach(z);
    c.extra.held = z;
    yield step(
      c,
      r === null
        ? `${k} is at the root and has no children: removing it leaves the tree empty.`
        : `${k} is at the root and has no left subtree, so its right subtree, rooted at ${W.key(r)}, becomes the whole tree.`,
      ['del.missing', 'del.noleft', 'del.right'],
      2,
      [nodeMark(z, 'remove')],
    );
  } else {
    const L0 = zn.left;
    let m = L0;
    c.extra.path = [m];
    yield step(
      c,
      `${k} is at the root. To join its two subtrees, find the largest key on the left: go left to ${W.key(m)}, then right as far as possible.`,
      ['del.missing', 'del.noleft', 'del.else', 'del.max'],
      2,
      [nodeMark(z, 'remove'), nodeMark(m, 'compare'), edgeMark(m, 'active')],
    );
    for (let next = W.n(m).right; next !== null; next = W.n(m).right) {
      const from = W.key(m);
      m = next;
      c.extra.path.push(m);
      yield step(c, `${from} has a right child, so go right to ${W.key(m)}.`, ['del.max'], 2, [
        nodeMark(z, 'remove'),
        nodeMark(m, 'compare'),
        edgeMark(m, 'active'),
      ]);
    }
    c.extra.path = [];
    const mk = W.key(m);
    yield step(
      c,
      m === L0
        ? `${mk} is the largest key on the left, and it is already ${k}'s left child, with no right child.`
        : `${mk} is the largest key on the left. Splay it up to just below ${k}: then it has no right child.`,
      ['del.max', 'del.splay'],
      2,
      [nodeMark(z, 'remove'), nodeMark(m, 'found')],
    );
    yield* splay(c, step, m, z);
    delete c.vars.x;
    const R = W.n(z).right;
    W.transplant(z, m);
    W.n(m).right = R;
    if (R !== null) W.n(R).parent = m;
    W.detach(z);
    c.extra.held = z;
    yield step(
      c,
      R === null
        ? `${mk} takes ${k}'s place at the root. ${k} had no right subtree, so that is the join.`
        : `${mk} takes ${k}'s place at the root and ${k}'s right subtree, rooted at ${W.key(R)}, hangs on its empty right side. Every key there is bigger than ${mk}.`,
      ['del.join'],
      2,
      [nodeMark(z, 'remove'), nodeMark(m, 'new'), ...(R === null ? [] : [edgeMark(R, 'active')])],
    );
  }
  delete W.nodes[z];
  c.extra.held = undefined;
  yield step(c, `${k} is gone. ${summary(W, s)}`, ['del.join'], 1, []);
  return W.snap();
}

/** Goodrich and Tamassia: delete as in a BST, then splay the parent of the removed node. */
function* deleteBst(c: SC, step: MakeStep<TreeNode, X>, s: S, k: number, name: string): Gen<S> {
  const W = c.W;
  yield step(
    c,
    `${name}: find ${k} as in a BST, starting at the root ${W.key(W.root!)}.`,
    ['del.find'],
    3,
    [nodeMark(W.root!, 'active')],
  );
  const { x: z, last } = yield* walk(c, step, k, ['del.find'], name);
  c.extra.nil = undefined;
  c.extra.path = [];
  if (z === null) {
    yield step(
      c,
      `${k} is not in the tree, so nothing is deleted. Splay the last node visited, ${W.key(last!)}, to the root.`,
      ['del.missing'],
      2,
      [nodeMark(last!, 'active')],
    );
    yield* splay(c, step, last!, null);
    delete c.vars.x;
    yield step(c, `${W.key(last!)} is at the root. ${summary(W, s)}`, ['del.missing'], 1, [
      nodeMark(last!, 'done'),
    ]);
    return W.snap();
  }
  const zn = W.n(z);
  let target: number | null;
  if (zn.left === null || zn.right === null) {
    const child = zn.left ?? zn.right;
    target = zn.parent;
    W.transplant(z, child);
    W.detach(z);
    c.extra.held = z;
    yield step(
      c,
      child === null
        ? `${k} has no children, so it simply leaves the tree.`
        : `${k} has one child, so its subtree, rooted at ${W.key(child)}, moves up into its place.`,
      ['del.find', 'del.bst'],
      2,
      [nodeMark(z, 'remove')],
    );
  } else {
    let y = zn.right!;
    for (let next = W.n(y).left; next !== null; next = W.n(y).left) y = next;
    const yk = W.key(y);
    target = y === zn.right ? y : W.n(y).parent;
    if (y !== zn.right) {
      W.transplant(y, W.n(y).right);
      W.n(y).right = zn.right;
      W.n(zn.right!).parent = y;
    }
    W.transplant(z, y);
    W.n(y).left = zn.left;
    W.n(zn.left!).parent = y;
    W.detach(z);
    c.extra.held = z;
    yield step(
      c,
      `${k} has two children, so its successor ${yk}, the smallest key on its right, takes its place.`,
      ['del.find', 'del.bst'],
      2,
      [nodeMark(z, 'remove'), nodeMark(y, 'active')],
    );
  }
  delete W.nodes[z];
  c.extra.held = undefined;
  if (target === null) {
    yield step(
      c,
      `${k} is gone. It was the root, so there is no parent to splay. ${summary(W, s)}`,
      ['del.splay'],
      1,
      [],
    );
    return W.snap();
  }
  yield step(
    c,
    `${k} is gone. Now splay ${W.key(target)}, the parent of the node that left, to the root.`,
    ['del.splay'],
    2,
    [nodeMark(target, 'active')],
  );
  yield* splay(c, step, target, null);
  delete c.vars.x;
  yield step(c, `${W.key(target)} is at the root. ${summary(W, s)}`, ['del.splay'], 1, [
    nodeMark(target, 'done'),
  ]);
  return W.snap();
}

// ---------------------------------------------------------------------------------------------
// min, max, inorder, clear

function extreme(which: 'min' | 'max'): Op {
  const side: Side = which === 'min' ? 'left' : 'right';
  return {
    label: which === 'min' ? 'Min' : 'Max',
    arity: 0,
    *run(s) {
      const step = stepper();
      const c = ctx(s, { path: [] }, {});
      const W = c.W;
      if (W.root === null) {
        c.vars.returned = 'nil';
        yield step(
          c,
          `${which}(): the tree is empty, so there is no ${which === 'min' ? 'smallest' : 'largest'} key.`,
          [`${which}.walk`],
          1,
          [],
        );
        return s;
      }
      let x = W.root;
      c.extra.path!.push(x);
      yield step(
        c,
        `${which}(): start at the root, ${W.key(x)}, and go ${side} as far as possible.`,
        [`${which}.walk`],
        2,
        [nodeMark(x, 'active')],
      );
      for (let ch = W.n(x)[side]; ch !== null; ch = W.n(x)[side]) {
        const from = W.key(x);
        x = ch;
        c.extra.path!.push(x);
        yield step(
          c,
          `${from} has a ${side} child, so go ${side} to ${W.key(x)}.`,
          [`${which}.walk`],
          2,
          [nodeMark(x, 'active'), edgeMark(x, 'active')],
        );
      }
      c.extra.path = [];
      c.vars.returned = W.key(x);
      yield step(
        c,
        `${W.key(x)} has no ${side} child, so ${which} = ${W.key(x)}. Splay it to the root.`,
        [`${which}.walk`, `${which}.splay`],
        2,
        [nodeMark(x, 'found')],
      );
      yield* splay(c, step, x, null);
      delete c.vars.x;
      yield step(
        c,
        `${which} = ${W.key(x)}, now at the root. ${summary(W, s)}`,
        [`${which}.splay`],
        1,
        [nodeMark(x, 'found')],
      );
      return W.snap();
    },
  };
}

const inorder: Op = {
  label: 'Inorder',
  arity: 0,
  *run(s) {
    yield* inorderWalk(ctx(s, {}, {}), stepper());
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
          : 'clear(): root = nil. Every node is gone, and the rotation count starts again at 0.',
      lines: ['clear.root'],
      vars: readouts(empty),
      level: 1,
    } satisfies SplayStep;
    return empty;
  },
};

export const ops = {
  insert,
  delete: del,
  search,
  min: extreme('min'),
  max: extreme('max'),
  inorder,
  clear,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

function splayLines(): PseudoLine[] {
  return [
    L('spl.sig', 0, 'splay(x)', 'To splay x (bottom-up):'),
    L('spl.loop', 1, 'while x.p ≠ nil', 'until x is the root,'),
    L('spl.pg', 2, 'p = x.p; g = p.p', 'look at its parent p and grandparent g.'),
    L('spl.zig', 2, 'if g == nil  // zig', 'Zig, p is the root:'),
    L('spl.zig1', 3, 'rotateUp(x)', 'one rotation lifts x to the top.'),
    L('spl.zz', 2, 'elseif sameSide(x, p)  // zig-zig', 'Zig-zig, x and p lean the same way:'),
    L('spl.zz1', 3, 'rotateUp(p)', 'rotate at g first,'),
    L('spl.zz2', 3, 'rotateUp(x)', 'then at p.'),
    L('spl.zg', 2, 'else  // zig-zag', 'Zig-zag, they bend:'),
    L('spl.zg1', 3, 'rotateUp(x)', 'rotate at p first,'),
    L('spl.zg2', 3, 'rotateUp(x)', 'then at g.'),
  ];
}

export function pseudocode(settings: SplaySettings): PseudoBlock[] {
  const join = settings.delete === 'join';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L('ins.bst', 1, 'z = bstInsert(k)', 'add it as a leaf, as in a BST.'),
        L(
          'ins.dup',
          1,
          'if k was there: splay it',
          'If k was already there, splay that node and stop;',
        ),
        L('ins.splay', 1, 'splay(z)', 'otherwise splay the new node to the root.'),
        ...splayLines(),
      ],
    },
    {
      op: 'delete',
      lines: join
        ? [
            L('del.sig', 0, 'delete(k)', 'To delete key k:'),
            L('del.find', 1, 'search(k)  // splays', 'search for it, which splays it to the root.'),
            L('del.missing', 1, 'if root.key ≠ k: return', 'If k is not there, stop.'),
            L('del.noleft', 1, 'if root.left == nil', 'If the root has no left subtree,'),
            L('del.right', 2, 'root = root.right', 'its right subtree is the new tree.'),
            L('del.else', 1, 'else', 'Otherwise:'),
            L('del.max', 2, 'm = max(root.left)', 'find the largest key on the left,'),
            L('del.splay', 2, 'splay m to below root', 'splay it up to just below the root,'),
            L('del.join', 2, 'm.right = root.right; root = m', 'and let it adopt the right side.'),
            ...splayLines(),
          ]
        : [
            L('del.sig', 0, 'delete(k)', 'To delete key k:'),
            L('del.find', 1, 'z = bstFind(k)', 'find it as in a BST.'),
            L(
              'del.missing',
              1,
              'if z == nil: splay(last)',
              'If it is missing, splay the last node seen.',
            ),
            L('del.bst', 1, 'p = bstDelete(z)', 'Delete it as in a BST (successor),'),
            L('del.splay', 1, 'splay(p)', "then splay the removed node's parent."),
            ...splayLines(),
          ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To find key k:'),
        L('srch.walk', 1, 'x = root; last = nil', 'start at the root.'),
        L('srch.loop', 1, 'while x ≠ nil and k ≠ x.key', 'Until we find k or fall off:'),
        L('srch.step', 2, 'last = x; go left or right', 'remember x and go down.'),
        L('srch.splay', 1, 'splay(x ≠ nil ? x : last)', 'Splay what we found, or the last node.'),
        L('srch.ret', 1, 'return x', 'Hand back the node (nil if k was missing).'),
        ...splayLines(),
      ],
    },
    ...(['min', 'max'] as const).map((w) => ({
      op: w,
      lines: [
        L(`${w}.sig`, 0, `${w}()`, `To find the ${w === 'min' ? 'smallest' : 'largest'} key:`),
        L(
          `${w}.walk`,
          1,
          `x = ${w}(root)`,
          `go ${w === 'min' ? 'left' : 'right'} as far as possible,`,
        ),
        L(`${w}.splay`, 1, 'splay(x); return x', 'splay it to the root and return it.'),
        ...splayLines(),
      ],
    })),
    inorderBlock(),
    clearBlock(),
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(): string {
  return 'An empty splay tree. Insert some keys, then search for the deep ones and watch them come up.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

export function describe(s: S): string {
  if (s.root === null) return 'An empty splay tree.';
  const parts: string[] = [];
  const walkTree = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walkTree(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    parts.push(kids.length ? `${n.key} has ${kids.join(' and ')}.` : `${n.key} is a leaf.`);
    walkTree(n.right);
  };
  walkTree(s.root);
  const n = treeSize(s);
  return `A splay tree with ${plural(n, 'key')} and height ${treeHeight(s)}. The root is ${s.nodes[s.root]!.key}. ${parts.join(' ')}`;
}

export type { Mark };
