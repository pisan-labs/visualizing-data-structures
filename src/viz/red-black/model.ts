import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { nullShapeId } from '../../layouts/binary-tree';
import {
  L,
  TreeWork,
  clearBlock,
  cmp,
  descend,
  edgeMark,
  emptyState,
  extremeBlocks,
  extremeWalk,
  inorderBlock,
  inorderWalk,
  mark,
  nilMark,
  nodeMark,
  other,
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

export type Color = 'red' | 'black';

export interface RBNode extends TreeNode {
  color: Color;
}

export type RBState = TreeState<RBNode>;

export interface RBSettings {
  [key: string]: Scalar;
  /** Which node replaces a deleted node that has two children. CLRS uses the successor. */
  delete: 'successor' | 'predecessor';
  /** Draw the NIL leaves as small black squares. */
  nils: boolean;
  /** Write each node's black-height next to it. */
  bh: boolean;
}

/** Where the extra black of a delete sits: on a node, or on an empty child (a NIL). */
export type ExtraBlack = { node: number } | { parent: number; side: Side };

export interface RBExtra extends TreeExtra {
  extraBlack?: ExtraBlack;
  /** The fixup case being applied, named in the band above the tree. */
  caption?: string;
}

type S = RBState;
type X = RBExtra;
type Op = OpSpec<S, RBSettings, X>;
type RBStep = Step<S, X>;
type RC = Ctx<RBNode, X>;

export const defaults: RBSettings = { delete: 'successor', nils: false, bh: true };

export function init(): S {
  return emptyState<RBNode>();
}

// ---------------------------------------------------------------------------------------------
// Black-heights

/**
 * The black-height of every node: the black nodes on a path from it down to a NIL, not counting
 * the node itself (CLRS). NILs are black. An extra black left by a delete counts as one more
 * black at its spot. A node whose paths disagree gets null.
 */
export function blackHeights(
  s: { nodes: Record<number, RBNode>; root: number | null },
  extra?: ExtraBlack,
): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const extraAt = (u: number | null, parent: number, side: Side) =>
    !extra
      ? 0
      : 'node' in extra
        ? u !== null && extra.node === u
          ? 1
          : 0
        : u === null && extra.parent === parent && extra.side === side
          ? 1
          : 0;
  const walk = (u: number | null): number | null => {
    if (u === null) return 0;
    const n = s.nodes[u]!;
    const via = (side: Side): number | null => {
      const ch = n[side];
      const below = walk(ch);
      if (below === null) return null;
      const self = ch === null || s.nodes[ch]!.color === 'black' ? 1 : 0;
      return below + self + extraAt(ch, u, side);
    };
    const l = via('left');
    const r = via('right');
    const bh = l !== null && l === r ? l : null;
    out.set(u, bh);
    return bh;
  };
  walk(s.root);
  return out;
}

export function treeBlackHeight(s: S, extra?: ExtraBlack): number | null {
  return s.root === null ? 0 : (blackHeights(s, extra).get(s.root) ?? null);
}

export function readouts(s: S, extra?: ExtraBlack): Record<string, Scalar> {
  return {
    N: treeSize(s),
    height: treeHeight(s),
    'black-height': treeBlackHeight(s, extra) ?? 'mixed',
    rotations: s.rotations,
  };
}

// ---------------------------------------------------------------------------------------------
// Steps

function stepper(): MakeStep<RBNode, X> {
  return (c, say, lines, level, marks, more = {}) => {
    const state = c.W.snap();
    const extra: X = { ...c.extra, ...more };
    if (extra.path) extra.path = [...extra.path];
    if (extra.output) extra.output = [...extra.output];
    return {
      state,
      marks,
      say,
      lines,
      vars: { ...readouts(state, extra.extraBlack), ...c.vars },
      level,
      extra,
    };
  };
}

function ctx(W: TreeWork<RBNode>, st: RBSettings, extra: X, vars: Record<string, Scalar>): RC {
  return {
    W,
    extra,
    vars,
    nilId: st.nils ? (parent, side) => nullShapeId(parent, side) : undefined,
  };
}

/** A step that reports a bad argument and changes nothing. */
function* badArg(s: S, st: RBSettings, name: string, raw: Value, err: Error, line: string) {
  const c = ctx(new TreeWork(s), st, { arg: { name: 'k', text: String(raw), error: true } }, {});
  yield stepper()(c, `${name}(${String(raw)}): ${err.message} The tree is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const isRed = (W: TreeWork<RBNode>, u: number | null) => u !== null && W.n(u).color === 'red';

function summary(W: TreeWork<RBNode>, before: S, op: string): string {
  const s = W.snap();
  const made = W.rotations - before.rotations;
  return `N = ${treeSize(s)}, height = ${treeHeight(s)}, black-height = ${treeBlackHeight(s)}. ${
    made === 0 ? `This ${op} needed no rotations.` : `This ${op} made ${plural(made, 'rotation')}.`
  }`;
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'insert', raw!, k, 'ins.sig');
    const step = stepper();
    const W = new TreeWork<RBNode>(s);
    const uid = W.nextUid;
    const c = ctx(W, st, { arg: { name: 'k', text: String(k), uid } }, { k });
    const name = `insert(${k})`;

    if (W.root === null) {
      yield step(c, `${name}: the tree is empty, so ${k} becomes the root.`, ['ins.bst'], 2, [
        mark(`key-${uid}`, 'active'),
      ]);
    } else {
      yield step(
        c,
        `${name}: walk down from the root, ${W.key(W.root)}, as in a binary search tree.`,
        ['ins.bst'],
        3,
        [nodeMark(W.root, 'active')],
      );
    }
    const path: number[] = [];
    c.extra.path = path;
    let x = W.root;
    let y: number | null = null;
    let side: Side = 'left';
    while (x !== null) {
      path.push(x);
      y = x;
      const key = W.key(x);
      c.vars.x = key;
      if (k === key) {
        yield step(
          c,
          `${name}: ${k} = ${key}, so ${k} is already in the tree. Each key is stored once, so nothing changes.`,
          ['ins.bst'],
          1,
          [nodeMark(x, 'found'), mark('arg-box', 'error')],
        );
        return s;
      }
      side = k < key ? 'left' : 'right';
      const child: number | null = W.n(x)[side];
      yield step(
        c,
        `${cmp(k, key)}, so go ${side}. ${
          child === null
            ? `${key} has no ${side} child, so ${k} goes there.`
            : `Next is ${W.key(child)}.`
        }`,
        ['ins.bst'],
        2,
        [
          nodeMark(x, 'compare'),
          ...(child === null ? [nilMark(c, x, side)] : [edgeMark(child, 'active')]),
        ],
        { nil: child === null ? { parent: x, side } : undefined },
      );
      x = child;
    }

    W.nodes[uid] = { uid, key: k, left: null, right: null, parent: y, color: 'red' };
    W.nextUid = uid + 1;
    if (y === null) W.root = uid;
    else W.n(y)[side] = uid;
    c.extra.arg = undefined;
    c.extra.nil = undefined;
    c.extra.fresh = uid;
    c.extra.path = [];
    delete c.vars.x;
    c.vars.z = k;
    yield step(
      c,
      y === null
        ? `${k} becomes the root. A new node starts out red.`
        : `${k} becomes the ${side} child of ${W.key(y)}. A new node starts out red, so no path gains a black node.`,
      ['ins.bst', 'ins.red', 'ins.fix'],
      1,
      [nodeMark(uid, 'new')],
    );
    c.extra.fresh = undefined;

    const why = yield* insertFixup(c, step, uid);
    c.extra.caption = undefined;
    delete c.vars.case;
    const root = W.root!;
    const rk = W.key(root);
    if (W.n(root).color === 'red') {
      W.n(root).color = 'black';
      yield step(
        c,
        `${why}. The root ${rk} is red, so color it black. That adds one black node to every path at once, so they all stay equal. ${summary(W, s, 'insert')}`,
        ['fx.loop', 'fx.root'],
        1,
        [nodeMark(root, 'done')],
      );
    } else {
      yield step(
        c,
        `${why}. The root ${rk} is black, as it must be. ${summary(W, s, 'insert')}`,
        ['fx.loop', 'fx.root'],
        1,
        [],
      );
    }
    return W.snap();
  },
};

/** CLRS RB-INSERT-FIXUP. Returns why the loop stopped. */
function* insertFixup(
  c: RC,
  step: MakeStep<RBNode, X>,
  start: number,
): Generator<RBStep, string, void> {
  const W = c.W;
  let z = start;
  for (;;) {
    const p = W.n(z).parent;
    if (p === null) return `z = ${W.key(z)} is the root, so it has no parent to clash with`;
    const P = W.n(p);
    if (P.color === 'black')
      return `z = ${W.key(z)} has a black parent, ${P.key}, so no red node has a red child`;
    // A red parent is never the root, so z has a grandparent.
    const g = P.parent!;
    const G = W.n(g);
    const pSide = W.sideOf(p)!;
    const uSide = other(pSide);
    const u = G[uSide];
    const [zk, pk, gk] = [W.key(z), P.key, G.key];
    const branch = pSide === 'left' ? ['fx.loop', 'fx.left', 'fx.uncle'] : ['fx.loop', 'fx.mirror'];
    const clash = `z = ${zk} and its parent ${pk} are both red, and a red node can't have a red child.`;
    const uncleMarks = u === null ? [nilMark(c, g, uSide, 'compare')] : [nodeMark(u, 'compare')];
    // A missing uncle is a NIL: point at its square, or at a nil marker when NILs are hidden.
    const uncleNil: Partial<X> =
      u === null && !c.nilId ? { nil: { parent: g, side: uSide } } : { nil: undefined };
    const clashMarks = [nodeMark(z, 'active'), nodeMark(p, 'error'), edgeMark(z, 'error')];

    if (u !== null && W.n(u).color === 'red') {
      const uk = W.key(u);
      c.vars.case = 1;
      c.extra.caption = 'Insert case 1';
      yield step(
        c,
        `${clash} The uncle ${uk} is red too: case 1, recolor.`,
        [...branch, 'fx.c1'],
        2,
        [...clashMarks, ...uncleMarks],
      );
      P.color = 'black';
      W.n(u).color = 'black';
      G.color = 'red';
      z = g;
      c.vars.z = gk;
      yield step(
        c,
        `Case 1: ${pk} and ${uk} turn black and ${gk} turns red. Every path through ${gk} still has as many black nodes as before. Now z = ${gk}, two levels up, and the check repeats there.`,
        ['fx.c1a', 'fx.c1b', 'fx.c1c', 'fx.c1d'],
        1,
        [nodeMark(g, 'active'), nodeMark(p, 'done'), nodeMark(u, 'done')],
      );
      continue;
    }

    const uncleSay =
      u === null ? 'The uncle is nil, which counts as black' : `The uncle ${W.key(u)} is black`;
    if (z === P[uSide]) {
      c.vars.case = 2;
      c.extra.caption = 'Insert case 2';
      yield step(
        c,
        `${clash} ${uncleSay}, and z is the ${uSide} child of a ${pSide} child, a zigzag: case 2. Rotate ${pSide} at ${pk} to straighten it out.`,
        [...branch, 'fx.c1', 'fx.else', 'fx.c2'],
        2,
        [...clashMarks, ...uncleMarks],
        uncleNil,
      );
      W.rotate(p, pSide);
      z = p;
      c.vars.z = pk;
      yield step(
        c,
        `Case 2: rotate ${pSide} at ${pk}. ${zk} moves up and ${pk} becomes its ${pSide} child. Both are red, so no path changes its black count. Now z = ${pk}, and z, ${zk} and ${gk} form a straight line: case 3.`,
        ['fx.c2a', 'fx.c2b'],
        1,
        [nodeMark(p, 'active'), nodeMark(W.n(p).parent!, 'new'), edgeMark(p, 'error')],
      );
    } else {
      c.vars.case = 3;
      c.extra.caption = 'Insert case 3';
      yield step(
        c,
        `${clash} ${uncleSay}, and z is the ${pSide} child of a ${pSide} child, a straight line: case 3.`,
        [...branch, 'fx.c1', 'fx.else', 'fx.c2'],
        2,
        [...clashMarks, ...uncleMarks],
        uncleNil,
      );
    }

    // Case 3: recolor and rotate at the grandparent.
    const p3 = W.n(z).parent!;
    const g3 = W.n(p3).parent!;
    const [p3k, g3k] = [W.key(p3), W.key(g3)];
    const inner = W.n(p3)[uSide];
    c.vars.case = 3;
    c.extra.caption = 'Insert case 3';
    W.n(p3).color = 'black';
    W.n(g3).color = 'red';
    W.rotate(g3, uSide);
    yield step(
      c,
      `Case 3: ${p3k} turns black, ${g3k} turns red, and a ${uSide} rotation at ${g3k} lifts ${p3k} into its place${
        inner === null ? '' : ` (${W.key(inner)} moves across to ${g3k})`
      }. ${p3k} is black now, so the red-red pair is gone.`,
      ['fx.c3a', 'fx.c3b', 'fx.c3c'],
      1,
      [
        nodeMark(p3, 'new'),
        nodeMark(g3, 'active'),
        edgeMark(g3, 'active'),
        ...(inner === null ? [] : [nodeMark(inner, 'visit'), edgeMark(inner, 'active')]),
      ],
    );
    return `z's parent ${p3k} is black now, so the loop stops`;
  }
}

// ---------------------------------------------------------------------------------------------
// delete

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'delete', raw!, k, 'del.sig');
    const step = stepper();
    const name = `delete(${k})`;
    const W = new TreeWork<RBNode>(s);
    const c = ctx(W, st, { arg: { name: 'k', text: String(k) } }, { k });
    const succ = st.delete === 'successor';

    if (W.root !== null) {
      yield step(
        c,
        `${name}: first find the node z that holds ${k}. Start at the root.`,
        ['del.find'],
        3,
        [nodeMark(W.root, 'active')],
      );
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
    c.vars.z = k;
    delete c.vars.x;
    const zn = W.n(z);
    const zColor = zn.color;
    yield step(
      c,
      `${k} = ${k}: found it. z = ${k}, a ${zColor} node ${
        zn.left !== null && zn.right !== null
          ? 'with two children'
          : zn.left === null && zn.right === null
            ? 'with no children'
            : 'with one child'
      }.`,
      ['del.find', 'del.y'],
      2,
      [nodeMark(z, 'remove')],
    );

    // x is the child that moves into the spot a node leaves; xp and xSide say where x is, even
    // when x is nil. `lost` is the color that leaves the tree.
    let x: number | null;
    let xp: number | null;
    let xSide: Side;
    let lost: Color;
    const label = (u: number | null) => (u === null ? 'nil' : String(W.key(u)));
    const carry = () => {
      if (lost === 'black' && (x !== null || xp !== null))
        c.extra.extraBlack = x !== null ? { node: x } : { parent: xp!, side: xSide };
    };
    const xMarks = (role: Mark['role']): Mark[] =>
      x !== null ? [nodeMark(x, role)] : xp !== null ? [nilMark(c, xp, xSide, role)] : [];
    const short = () =>
      lost === 'black'
        ? ` It was black, so every path through x = ${label(x)} is now one black node short: x carries an extra black.`
        : ' It was red, so no path loses a black node.';
    const nilAt = () =>
      x === null && xp !== null && !st.nils ? { nil: { parent: xp, side: xSide } } : {};

    if (zn.left === null || zn.right === null) {
      const up: Side = zn.left === null ? 'right' : 'left';
      x = zn[up];
      xp = zn.parent;
      xSide = W.sideOf(z) ?? 'left';
      lost = zColor;
      W.transplant(z, x);
      W.detach(z);
      c.extra.held = z;
      carry();
      Object.assign(c.extra, nilAt());
      yield step(
        c,
        `${k} has no ${other(up)} child, so its ${up} subtree (${x === null ? 'nil' : `rooted at ${W.key(x)}`}) takes its place: x = ${label(x)}. The color that leaves the tree is ${k}'s.${short()}`,
        up === 'right'
          ? ['del.noleft', 'del.right', 'del.trR']
          : ['del.noleft', 'del.noright', 'del.left', 'del.trL'],
        2,
        [nodeMark(z, 'remove'), ...xMarks('active')],
      );
    } else {
      const down: Side = succ ? 'right' : 'left';
      const across = other(down);
      const which = succ ? 'successor' : 'predecessor';
      let y = zn[down]!;
      c.extra.path = [y];
      c.vars.y = W.key(y);
      yield step(
        c,
        `${k} has two children, so its ${which} y takes its place: the ${succ ? 'smallest' : 'largest'} key in its ${down} subtree. Go ${down} to ${W.key(y)}.`,
        ['del.noleft', 'del.noright', 'del.else', 'del.min'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'compare'), edgeMark(y, 'active')],
      );
      for (let next = W.n(y)[across]; next !== null; next = W.n(y)[across]) {
        const from = W.key(y);
        y = next;
        c.extra.path.push(y);
        c.vars.y = W.key(y);
        yield step(
          c,
          `${from} has a ${across} child, so go ${across} to ${W.key(y)}.`,
          ['del.min'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'compare'), edgeMark(y, 'active')],
        );
      }
      const yk = W.key(y);
      const yn = W.n(y);
      lost = yn.color;
      x = yn[down];
      c.extra.path = [];
      yield step(
        c,
        `${yk} has no ${across} child, so y = ${yk}, the ${which} of ${k}. y is ${lost}: that is the color that leaves its spot.`,
        ['del.min', 'del.c'],
        3,
        [nodeMark(z, 'remove'), nodeMark(y, 'found')],
      );
      if (y !== zn[down]) {
        xp = yn.parent;
        xSide = W.sideOf(y)!;
        W.transplant(y, x);
        W.detach(y);
        c.extra.held = y;
        carry();
        Object.assign(c.extra, nilAt());
        yield step(
          c,
          `${yk} is not ${k}'s own ${down} child. Lift it out; ${
            x === null
              ? 'its spot becomes nil'
              : `its ${down} child ${W.key(x)} moves up into its spot`
          }, so x = ${label(x)}.${short()}`,
          ['del.far', 'del.splice'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'active'), ...xMarks('active')],
        );
        const zNow = W.n(z);
        const yNow = W.n(y);
        yNow[down] = zNow[down];
        W.n(zNow[down]!).parent = y;
        W.transplant(z, y);
        yNow[across] = zNow[across];
        W.n(zNow[across]!).parent = y;
        yNow.color = zNow.color;
        W.detach(z);
        c.extra.held = z;
        yield step(
          c,
          `${yk} takes ${k}'s place, both of its subtrees, and its color, ${zColor}. Paths through that spot see the same colors as before.`,
          ['del.adopt', 'del.replace', 'del.adopt2', 'del.color'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'active'), ...xMarks('active')],
        );
      } else {
        xp = y;
        xSide = down;
        const zNow = W.n(z);
        W.transplant(z, y);
        yn[across] = zNow[across];
        W.n(zNow[across]!).parent = y;
        yn.color = zNow.color;
        W.detach(z);
        c.extra.held = z;
        carry();
        Object.assign(c.extra, nilAt());
        yield step(
          c,
          `${yk} is ${k}'s own ${down} child, so it moves up into ${k}'s place, takes ${k}'s ${across} subtree and its color, ${zColor}. x = ${label(x)}, y's old ${down} child, stays where it is.${short()}`,
          ['del.far', 'del.near', 'del.replace', 'del.adopt2', 'del.color'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'active'), ...xMarks('active')],
        );
      }
    }
    delete W.nodes[z];
    c.extra.held = undefined;
    delete c.vars.y;
    delete c.vars.z;
    const keepNil = c.extra.nil;
    c.extra.nil = undefined;

    if (W.root === null) {
      yield step(
        c,
        `${k} is gone and the tree is empty. ${summary(W, s, 'delete')}`,
        ['del.fix'],
        1,
        [],
      );
      return W.snap();
    }
    if (lost === 'red') {
      yield step(
        c,
        `${k} is gone. The color that left was red, so every path still has the same number of black nodes and nothing needs fixing. ${summary(W, s, 'delete')}`,
        ['del.fix'],
        1,
        [],
      );
      return W.snap();
    }
    c.vars.x = label(x);
    c.extra.nil = keepNil;
    yield step(
      c,
      `${k} is gone. x = ${label(x)} carries the extra black, so it counts as ${
        isRed(W, x) ? 'red and black' : 'doubly black'
      }. deleteFixup moves the extra black up the tree, or uses it up.`,
      ['del.fix'],
      1,
      xMarks('active'),
    );

    // CLRS RB-DELETE-FIXUP.
    while (x !== W.root && !isRed(W, x)) {
      const p = xp!;
      const P = W.n(p);
      const wSide = other(xSide);
      let w = P[wSide]!;
      const branch =
        xSide === 'left' ? ['dfx.loop', 'dfx.left', 'dfx.w'] : ['dfx.loop', 'dfx.mirror'];
      const xSay = `x = ${label(x)} is doubly black, the ${xSide} child of ${P.key}.`;
      if (isRed(W, w)) {
        const wk = W.key(w);
        c.vars.case = 1;
        c.extra.caption = 'Delete case 1';
        yield step(
          c,
          `${xSay} Its sibling w = ${wk} is red: case 1. Swap the colors of ${wk} and ${P.key} and rotate ${xSide} at ${P.key}, so that x gets a black sibling.`,
          [...branch, 'dfx.c1'],
          2,
          [...xMarks('active'), nodeMark(w, 'compare'), nodeMark(p, 'visit')],
        );
        W.n(w).color = 'black';
        P.color = 'red';
        W.rotate(p, xSide);
        w = P[wSide]!;
        yield step(
          c,
          `Case 1: ${wk} turns black, ${P.key} turns red, and a ${xSide} rotation at ${P.key} lifts ${wk} up. x's new sibling is ${W.key(w)}, which is black, so case 2, 3 or 4 comes next.`,
          ['dfx.c1a', 'dfx.c1b', 'dfx.c1c', 'dfx.c1d'],
          1,
          [
            ...xMarks('active'),
            nodeMark(wk === W.key(w) ? w : W.n(p).parent!, 'new'),
            nodeMark(p, 'visit'),
          ],
        );
      }
      const wk = W.key(w);
      const near = W.n(w)[xSide];
      const far = W.n(w)[wSide];
      const nearSay = near === null ? 'nil' : String(W.key(near));
      const farSay = far === null ? 'nil' : String(W.key(far));
      if (!isRed(W, near) && !isRed(W, far)) {
        c.vars.case = 2;
        c.extra.caption = 'Delete case 2';
        yield step(
          c,
          `${xSay} Its sibling w = ${wk} is black, and so are both of w's children (${nearSay} and ${farSay}): case 2.`,
          [...branch, 'dfx.c1', 'dfx.c2'],
          2,
          [...xMarks('active'), nodeMark(w, 'compare')],
        );
        W.n(w).color = 'red';
        const pRed = P.color === 'red';
        x = p;
        xp = P.parent;
        xSide = W.sideOf(p) ?? 'left';
        c.extra.extraBlack = { node: p };
        c.extra.nil = undefined;
        c.vars.x = P.key;
        yield step(
          c,
          `Case 2: take one black from both x and w, so ${wk} turns red, and pass the extra black up to the parent: x = ${P.key}. ${
            pRed
              ? `${P.key} is red, so it is now red and black, and the loop stops.`
              : x === W.root
                ? `${P.key} is the root, so the loop stops.`
                : `${P.key} was already black, so now it is doubly black: repeat from there.`
          }`,
          ['dfx.c2a', 'dfx.c2b'],
          1,
          [nodeMark(p, 'active'), nodeMark(w, 'done')],
        );
        continue;
      }
      let w4 = w;
      if (!isRed(W, far)) {
        c.vars.case = 3;
        c.extra.caption = 'Delete case 3';
        yield step(
          c,
          `${xSay} Its sibling w = ${wk} is black, w's far child ${farSay} is black and its near child ${nearSay} is red: case 3.`,
          [...branch, 'dfx.c1', 'dfx.c2', 'dfx.else', 'dfx.c3'],
          2,
          [...xMarks('active'), nodeMark(w, 'compare'), nodeMark(near!, 'visit')],
        );
        W.n(near!).color = 'black';
        W.n(w).color = 'red';
        W.rotate(w, wSide);
        w4 = P[wSide]!;
        yield step(
          c,
          `Case 3: ${nearSay} turns black, ${wk} turns red, and a ${wSide} rotation at ${wk} lifts ${nearSay} up. Now x's sibling ${nearSay} is black with a red far child, ${wk}: case 4.`,
          ['dfx.c3a', 'dfx.c3b', 'dfx.c3c', 'dfx.c3d'],
          1,
          [...xMarks('active'), nodeMark(near!, 'new'), nodeMark(w, 'visit')],
        );
      } else {
        c.vars.case = 4;
        c.extra.caption = 'Delete case 4';
        yield step(
          c,
          `${xSay} Its sibling w = ${wk} is black and w's far child ${farSay} is red: case 4.`,
          [...branch, 'dfx.c1', 'dfx.c2', 'dfx.else', 'dfx.c3'],
          2,
          [...xMarks('active'), nodeMark(w, 'compare'), nodeMark(far!, 'visit')],
        );
      }
      // Case 4: recolor and rotate at the parent; the extra black is used up.
      const w4k = W.key(w4);
      const far4 = W.n(w4)[wSide]!;
      const pColor = P.color;
      c.vars.case = 4;
      c.extra.caption = 'Delete case 4';
      W.n(w4).color = pColor;
      P.color = 'black';
      W.n(far4).color = 'black';
      W.rotate(p, xSide);
      c.extra.extraBlack = undefined;
      c.extra.nil = undefined;
      const ended = `Case 4: ${w4k} takes ${P.key}'s color (${pColor}), ${P.key} and ${W.key(far4)} turn black, and a ${xSide} rotation at ${P.key} lifts ${w4k} up. The paths through x gain the black node they were missing and no other path changes, so the extra black is used up.`;
      x = W.root;
      yield step(
        c,
        `${ended} x = root, so the loop stops.`,
        ['dfx.c4a', 'dfx.c4b', 'dfx.c4c', 'dfx.c4d', 'dfx.c4e'],
        1,
        [nodeMark(w4, 'new'), nodeMark(p, 'active'), nodeMark(far4, 'done')],
      );
      break;
    }
    c.extra.caption = undefined;
    delete c.vars.case;
    delete c.vars.x;
    const xNow = x;
    if (xNow !== null && W.n(xNow).color === 'red') {
      W.n(xNow).color = 'black';
      c.extra.extraBlack = undefined;
      c.extra.nil = undefined;
      yield step(
        c,
        `x = ${W.key(xNow)} is red and black, so color it black. That uses up the extra black. ${summary(W, s, 'delete')}`,
        ['dfx.loop', 'dfx.end'],
        1,
        [nodeMark(xNow, 'done')],
      );
    } else if (c.extra.extraBlack) {
      c.extra.extraBlack = undefined;
      c.extra.nil = undefined;
      yield step(
        c,
        `The extra black has reached the root, ${W.key(W.root!)}. There it can simply be dropped: every path loses one black node, so they all stay equal. ${summary(W, s, 'delete')}`,
        ['dfx.loop', 'dfx.end'],
        1,
        [nodeMark(W.root!, 'done')],
      );
    } else {
      yield step(
        c,
        `The root ${W.key(W.root!)} is black, as it must be. ${summary(W, s, 'delete')}`,
        ['dfx.end'],
        1,
        [],
      );
    }
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// search, min, max, inorder, clear

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'search', raw!, k, 'srch.sig');
    yield* searchWalk(
      ctx(new TreeWork(s), st, { arg: { name: 'k', text: String(k) } }, { k }),
      stepper(),
      k,
    );
    return s;
  },
};

function extreme(which: 'min' | 'max'): Op {
  return {
    label: which === 'min' ? 'Min' : 'Max',
    arity: 0,
    *run(s, _args, { settings: st }) {
      yield* extremeWalk(ctx(new TreeWork(s), st, {}, {}), stepper(), which);
      return s;
    },
  };
}

const inorder: Op = {
  label: 'Inorder',
  arity: 0,
  *run(s, _args, { settings: st }) {
    yield* inorderWalk(ctx(new TreeWork(s), st, {}, {}), stepper());
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
    } satisfies RBStep;
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
// Pseudocode (CLRS, with the mirror-image branches folded into one line each)

export function pseudocode(st: RBSettings): PseudoBlock[] {
  const succ = st.delete === 'successor';
  const down = succ ? 'right' : 'left';
  const across = succ ? 'left' : 'right';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L('ins.bst', 1, 'z = bstInsert(k)', 'add it as a new leaf, as in a BST,'),
        L('ins.red', 1, 'z.color = RED', 'color it red,'),
        L('ins.fix', 1, 'insertFixup(z)', 'then repair any red node with a red child.'),
        L('fx.sig', 0, 'insertFixup(z)', 'To repair from z:'),
        L('fx.loop', 1, 'while z.p.color == RED', "while z's parent is red too,"),
        L('fx.left', 2, 'if z.p == z.p.p.left', 'if the parent is a left child,'),
        L('fx.uncle', 3, 'y = z.p.p.right', 'look at the uncle y.'),
        L('fx.c1', 3, 'if y.color == RED  // 1', 'Case 1, the uncle is red:'),
        L('fx.c1a', 4, 'z.p.color = BLACK', 'the parent turns black,'),
        L('fx.c1b', 4, 'y.color = BLACK', 'the uncle turns black,'),
        L('fx.c1c', 4, 'z.p.p.color = RED', 'the grandparent turns red,'),
        L('fx.c1d', 4, 'z = z.p.p', 'and z moves up to it.'),
        L('fx.else', 3, 'else', 'Otherwise the uncle is black:'),
        L('fx.c2', 4, 'if z == z.p.right  // 2', 'case 2, z is an inner child:'),
        L('fx.c2a', 5, 'z = z.p', 'z moves up to its parent'),
        L('fx.c2b', 5, 'rotateLeft(z)', 'and a rotation lines them up.'),
        L('fx.c3a', 4, 'z.p.color = BLACK  // 3', 'Case 3: the parent turns black,'),
        L('fx.c3b', 4, 'z.p.p.color = RED', 'the grandparent turns red,'),
        L('fx.c3c', 4, 'rotateRight(z.p.p)', 'and a rotation lifts the parent up.'),
        L(
          'fx.mirror',
          2,
          'else same, left ↔ right',
          'If the parent is a right child, swap left and right.',
        ),
        L('fx.root', 1, 'root.color = BLACK', 'Finally, the root is black.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = search(k)', 'find the node z that holds k.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L('del.y', 1, 'y = z; c = y.color', 'Remember the color that may leave.'),
        L('del.noleft', 1, 'if z.left == nil', 'If z has no left child,'),
        L('del.right', 2, 'x = z.right', 'x is its right child (maybe nil),'),
        L('del.trR', 2, 'transplant(z, z.right)', 'which takes its place.'),
        L('del.noright', 1, 'elseif z.right == nil', 'If z has no right child,'),
        L('del.left', 2, 'x = z.left', 'x is its left child,'),
        L('del.trL', 2, 'transplant(z, z.left)', 'which takes its place.'),
        L('del.else', 1, 'else', 'Otherwise z has two children:'),
        L(
          'del.min',
          2,
          succ ? 'y = min(z.right)' : 'y = max(z.left)',
          succ ? 'y is the smallest key on the right;' : 'y is the largest key on the left;',
        ),
        L('del.c', 2, `c = y.color; x = y.${down}`, "its color may leave; x is y's child."),
        L('del.far', 2, `if y ≠ z.${down}`, `If y is deeper than z's ${down} child,`),
        L('del.splice', 3, `transplant(y, y.${down})`, 'lift y out, x takes its spot,'),
        L('del.adopt', 3, `y.${down} = z.${down}`, `and y takes z's ${down} subtree.`),
        L('del.near', 2, 'else x.p = y', 'Otherwise x stays below y.'),
        L('del.replace', 2, 'transplant(z, y)', 'Put y where z was,'),
        L('del.adopt2', 2, `y.${across} = z.${across}`, `give it z's ${across} subtree`),
        L('del.color', 2, 'y.color = z.color', "and z's color."),
        L('del.fix', 1, 'if c == BLACK: deleteFixup(x)', 'If a black node left, repair from x.'),
        L('dfx.sig', 0, 'deleteFixup(x)', 'x carries an extra black:'),
        L(
          'dfx.loop',
          1,
          'while x ≠ root and x is BLACK',
          'while x is doubly black and not the root,',
        ),
        L('dfx.left', 2, 'if x == x.p.left', 'if x is a left child,'),
        L('dfx.w', 3, 'w = x.p.right', 'look at its sibling w.'),
        L('dfx.c1', 3, 'if w.color == RED  // 1', 'Case 1, w is red:'),
        L('dfx.c1a', 4, 'w.color = BLACK', 'w turns black,'),
        L('dfx.c1b', 4, 'x.p.color = RED', 'the parent turns red,'),
        L('dfx.c1c', 4, 'rotateLeft(x.p)', 'rotate at the parent,'),
        L('dfx.c1d', 4, 'w = x.p.right', 'and x has a new sibling.'),
        L('dfx.c2', 3, "if w's children are BLACK", "Case 2, both of w's children are black:"),
        L('dfx.c2a', 4, 'w.color = RED  // 2', 'w turns red'),
        L('dfx.c2b', 4, 'x = x.p', 'and the extra black moves up.'),
        L('dfx.else', 3, 'else', 'Otherwise w has a red child:'),
        L('dfx.c3', 4, 'if w.right is BLACK  // 3', "case 3, w's far child is black:"),
        L('dfx.c3a', 5, 'w.left.color = BLACK', "w's near child turns black,"),
        L('dfx.c3b', 5, 'w.color = RED', 'w turns red,'),
        L('dfx.c3c', 5, 'rotateRight(w)', 'rotate at w,'),
        L('dfx.c3d', 5, 'w = x.p.right', 'and x has a new sibling.'),
        L('dfx.c4a', 4, 'w.color = x.p.color  // 4', "Case 4: w takes the parent's color,"),
        L('dfx.c4b', 4, 'x.p.color = BLACK', 'the parent turns black,'),
        L('dfx.c4c', 4, 'w.right.color = BLACK', "w's far child turns black,"),
        L('dfx.c4d', 4, 'rotateLeft(x.p)', 'rotate at the parent,'),
        L('dfx.c4e', 4, 'x = root', 'and the extra black is gone.'),
        L(
          'dfx.mirror',
          2,
          'else same, left ↔ right',
          'If x is a right child, swap left and right.',
        ),
        L('dfx.end', 1, 'x.color = BLACK', 'Finally x turns plain black.'),
      ],
    },
    searchBlock(),
    ...extremeBlocks(),
    inorderBlock(),
    clearBlock(),
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(): string {
  return 'An empty red-black tree. Insert some keys, or pick a preset: sorted keys are a good start.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

/** Screen-reader summary: size, heights, and each key with its color and children. */
export function describe(s: S): string {
  if (s.root === null) return 'An empty red-black tree.';
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    parts.push(
      kids.length
        ? `${n.key} (${n.color}) has ${kids.join(' and ')}.`
        : `${n.key} (${n.color}) is a leaf.`,
    );
    walk(n.right);
  };
  walk(s.root);
  const n = treeSize(s);
  return `A red-black tree with ${plural(n, 'key')}, height ${treeHeight(s)} and black-height ${treeBlackHeight(s) ?? 'mixed'}. The root is ${s.nodes[s.root]!.key}, ${s.nodes[s.root]!.color}. ${parts.join(' ')}`;
}
