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
  descend,
  edgeMark,
  emptyState,
  extremeBlocks,
  extremeWalk,
  inorderBlock,
  inorderWalk,
  mark,
  nodeMark,
  other,
  parseKey,
  plural,
  searchBlock,
  searchWalk,
  treeHeight,
  treeSize,
  cmp,
  type Ctx,
  type MakeStep,
  type Side,
  type TreeExtra,
  type TreeNode,
  type TreeState,
} from './tree-kit';

export interface AVLNode extends TreeNode {
  /** Height in edges (a leaf is 0), as the algorithm last stored it. */
  height: number;
}

export type AVLState = TreeState<AVLNode>;

export interface AVLSettings {
  [key: string]: Scalar;
  /** Which node replaces a deleted node that has two children. CLRS uses the successor. */
  delete: 'successor' | 'predecessor';
  /** What the drawing writes next to each node. */
  show: 'both' | 'height' | 'balance';
  /** Balance factor: left height minus right height, or the other way round. */
  bf: 'left' | 'right';
  /** Height of a leaf: 0 (counting edges, as CLRS does) or 1 (counting nodes). */
  leaf: 'zero' | 'one';
}

export type RotationCase = 'LL' | 'RR' | 'LR' | 'RL';

export interface AVLExtra extends TreeExtra {
  /** The rotation case being fixed, named in the band above the tree. */
  rotation?: RotationCase;
}

type S = AVLState;
type X = AVLExtra;
type Op = OpSpec<S, AVLSettings, X>;
type AVLStep = Step<S, X>;

export const defaults: AVLSettings = {
  delete: 'successor',
  show: 'both',
  bf: 'left',
  leaf: 'zero',
};

export function init(): S {
  return emptyState<AVLNode>();
}

// ---------------------------------------------------------------------------------------------
// Conventions

/** A height as this page shows it: edges (a leaf is 0) or nodes (a leaf is 1). */
export const shownHeight = (h: number, st: AVLSettings) => (st.leaf === 'one' ? h + 1 : h);

/** A balance factor as this page shows it, given left height minus right height. */
export const shownBalance = (leftMinusRight: number, st: AVLSettings) =>
  st.bf === 'right' ? -leftMinusRight : leftMinusRight;

/** +1, 0, −1: balance factors always carry their sign. */
export const signed = (b: number) => (b > 0 ? `+${b}` : b < 0 ? `−${-b}` : '0');

/** Left height minus right height, from the heights the nodes have stored. */
export function storedBalance(s: { nodes: Record<number, AVLNode> }, u: number): number {
  const n = s.nodes[u]!;
  const h = (v: number | null) => (v === null ? -1 : s.nodes[v]!.height);
  return h(n.left) - h(n.right);
}

// ---------------------------------------------------------------------------------------------
// A working copy that knows about heights

class AVLWork extends TreeWork<AVLNode> {
  h(u: number | null): number {
    return u === null ? -1 : this.n(u).height;
  }

  /** Left height minus right height, from stored heights. */
  balance(u: number): number {
    const n = this.n(u);
    return this.h(n.left) - this.h(n.right);
  }

  updateHeight(u: number): void {
    const n = this.n(u);
    n.height = 1 + Math.max(this.h(n.left), this.h(n.right));
  }
}

type AC = Ctx<AVLNode, X> & { W: AVLWork };

export function readouts(s: S, st: AVLSettings): Record<string, Scalar> {
  return { N: treeSize(s), height: shownHeight(treeHeight(s), st), rotations: s.rotations };
}

function stepper(st: AVLSettings): MakeStep<AVLNode, X> {
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
      vars: { ...readouts(state, st), ...c.vars },
      level,
      extra,
    };
  };
}

/** A step that reports a bad argument and changes nothing. */
function* badArg(s: S, st: AVLSettings, name: string, raw: Value, err: Error, line: string) {
  const c: AC = {
    W: new AVLWork(s),
    extra: { arg: { name: 'k', text: String(raw), error: true } },
    vars: {},
  };
  yield stepper(st)(
    c,
    `${name}(${String(raw)}): ${err.message} The tree is unchanged.`,
    [line],
    1,
    [mark('arg-box', 'error')],
  );
  return s;
}

// ---------------------------------------------------------------------------------------------
// The walk back up: fix heights, and rotate where a node is out of balance

interface FixEnd {
  say: string;
  lines: string[];
  marks: Mark[];
}

/** Which rotation case a node with this balance (left minus right) and child balance is. */
export function caseOf(b: number, childBalance: number): RotationCase {
  return b > 0 ? (childBalance < 0 ? 'LR' : 'LL') : childBalance > 0 ? 'RL' : 'RR';
}

function* fixUp(
  c: AC,
  step: MakeStep<AVLNode, X>,
  st: AVLSettings,
  start: number | null,
  op: 'insert' | 'delete',
): Generator<AVLStep, FixEnd, void> {
  const W = c.W;
  const H = (h: number) => shownHeight(h, st);
  const B = (b: number) => signed(shownBalance(b, st));
  let x = start;
  while (x !== null) {
    const node = W.n(x);
    const key = node.key;
    const old = node.height;
    W.updateHeight(x);
    const b = W.balance(x);
    c.vars.x = key;
    c.vars.bf = shownBalance(b, st);
    const heightSay =
      node.height === old ? `height stays ${H(old)}` : `height ${H(old)} → ${H(node.height)}`;

    if (Math.abs(b) <= 1) {
      if (node.height === old) {
        return {
          say: `Back at ${key}: ${heightSay}, balance ${B(b)}. Its height did not change, so nothing above it can change either. Stop.`,
          lines: ['fix.loop', 'fix.kids', 'fix.old', 'fix.height', 'fix.same'],
          marks: [nodeMark(x, 'done')],
        };
      }
      if (node.parent === null) {
        return {
          say: `Back at ${key}, the root: ${heightSay}, balance ${B(b)}, which is fine. Nothing is above it, so the walk is over.`,
          lines: ['fix.loop', 'fix.kids', 'fix.old', 'fix.height', 'fix.same', 'fix.up'],
          marks: [nodeMark(x, 'done')],
        };
      }
      yield step(
        c,
        `Back at ${key}: ${heightSay}, balance ${B(b)}, which is fine. The height changed, so keep going up.`,
        ['fix.loop', 'fix.kids', 'fix.old', 'fix.height', 'fix.same', 'fix.up'],
        2,
        [nodeMark(x, 'active')],
      );
      x = node.parent;
      continue;
    }

    // Out of balance: two levels taller on one side.
    const heavy: Side = b > 0 ? 'left' : 'right';
    const ch = node[heavy]!;
    const ck = W.key(ch);
    const cb = W.balance(ch);
    const kind = caseOf(b, cb);
    const double = kind === 'LR' || kind === 'RL';
    const turn = other(heavy);
    c.vars.case = kind;
    c.extra.rotation = kind;
    const childSay = double
      ? `Its ${heavy} child ${ck} has balance ${B(cb)}, so it leans the other way. That is the ${kind} case: rotate ${heavy} at ${ck}, then ${turn} at ${key}.`
      : cb === 0
        ? `Its ${heavy} child ${ck} has balance 0 (its two sides are the same height, which only happens after a delete). That counts as the ${kind} case: one ${turn} rotation at ${key}.`
        : `Its ${heavy} child ${ck} has balance ${B(cb)}, leaning the same way. That is the ${kind} case: one ${turn} rotation at ${key}.`;
    yield step(
      c,
      `Back at ${key}: ${heightSay}, but its balance is ${B(b)}: the ${heavy} side is two levels taller. ${childSay}`,
      [
        'fix.loop',
        'fix.kids',
        'fix.old',
        'fix.height',
        'fix.left',
        ...(heavy === 'left' ? ['fix.lr'] : ['fix.right', 'fix.rl']),
      ],
      2,
      [nodeMark(x, 'error'), nodeMark(ch, 'compare')],
    );

    let top: number;
    if (double) {
      // First turn the child the same way as its parent leans.
      const g = W.n(ch)[turn]!;
      const gk = W.key(g);
      const inner = W.n(g)[heavy];
      W.rotate(ch, heavy);
      W.updateHeight(ch);
      W.updateHeight(g);
      c.vars.x = key;
      yield step(
        c,
        `First rotate ${heavy} at ${ck}: ${gk} moves up into ${ck}'s place and ${ck} becomes ${gk}'s ${heavy} child. ${
          inner === null
            ? `${gk} had no ${heavy} subtree, so ${ck}'s ${turn} side is now empty.`
            : `${gk}'s old ${heavy} subtree (${W.key(inner)}) moves across to ${ck}'s ${turn} side.`
        } Now ${key}, ${gk} and ${ck} form a straight line to the ${heavy}, which one more rotation fixes.`,
        [heavy === 'left' ? 'fix.lr' : 'fix.rl'],
        1,
        [
          nodeMark(x, 'error'),
          nodeMark(g, 'new'),
          nodeMark(ch, 'active'),
          edgeMark(ch, 'active'),
          ...(inner === null ? [] : [nodeMark(inner, 'visit'), edgeMark(inner, 'active')]),
        ],
      );
    }
    {
      const riser = W.n(x)[heavy]!;
      const rk = W.key(riser);
      const inner = W.n(riser)[turn];
      W.rotate(x, turn);
      W.updateHeight(x);
      W.updateHeight(riser);
      top = riser;
      c.vars.bf = shownBalance(W.balance(riser), st);
      c.vars.x = rk;
      yield step(
        c,
        `${double ? 'Then rotate' : 'Rotate'} ${turn} at ${key}: ${rk} moves up into ${key}'s place and ${key} becomes ${rk}'s ${turn} child. ${
          inner === null
            ? `${rk} had no ${turn} subtree, so ${key}'s ${heavy} side is now empty.`
            : `${rk}'s old ${turn} subtree (${W.key(inner)}) moves across to ${key}'s ${heavy} side.`
        } ${rk} now has balance ${B(W.balance(riser))}${double ? `: the ${kind} double rotation is done.` : '.'}`,
        [heavy === 'left' ? 'fix.ll' : 'fix.rr'],
        1,
        [
          nodeMark(riser, 'new'),
          nodeMark(x, 'active'),
          edgeMark(x, 'active'),
          ...(inner === null ? [] : [nodeMark(inner, 'visit'), edgeMark(inner, 'active')]),
        ],
      );
    }
    c.extra.rotation = undefined;
    delete c.vars.case;

    const t = W.n(top);
    if (t.height === old) {
      return {
        say: `The subtree under ${t.key} has height ${H(old)}, the same as before this ${op}, so nothing above it changes. Stop.`,
        lines: ['fix.same'],
        marks: [nodeMark(top, 'done')],
      };
    }
    if (t.parent === null) {
      return {
        say: `${t.key} is now the root and its subtree is one level shorter. Nothing is above it, so the walk is over.`,
        lines: ['fix.same', 'fix.up'],
        marks: [nodeMark(top, 'done')],
      };
    }
    yield step(
      c,
      `The subtree under ${t.key} is now one level shorter (height ${H(t.height)}), so a node above it may be out of balance. Keep going up.`,
      ['fix.same', 'fix.up'],
      2,
      [nodeMark(top, 'active')],
    );
    x = t.parent;
  }
  return { say: 'The walk reached the root.', lines: ['fix.loop'], marks: [] };
}

function summary(W: AVLWork, before: S, st: AVLSettings, op: 'insert' | 'delete'): string {
  const st2 = W.snap();
  const made = W.rotations - before.rotations;
  return `N = ${treeSize(st2)}, height = ${shownHeight(treeHeight(st2), st)}. ${
    made === 0 ? 'No rotations were needed.' : `This ${op} made ${plural(made, 'rotation')}.`
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
    const step = stepper(st);
    const W = new AVLWork(s);
    const uid = W.nextUid;
    const c: AC = { W, extra: { arg: { name: 'k', text: String(k), uid } }, vars: { k } };
    const name = `insert(${k})`;
    const leafH = shownHeight(0, st);

    if (W.root === null) {
      yield step(
        c,
        `${name}: the tree is empty, so x = root = nil right away.`,
        ['ins.init', 'ins.loop'],
        2,
        [mark(`key-${uid}`, 'active')],
      );
    } else {
      yield step(
        c,
        `${name}: start at the root, ${W.key(W.root)}. y trails one node behind x.`,
        ['ins.init'],
        3,
        [nodeMark(W.root, 'active')],
      );
    }

    const path: number[] = [];
    c.extra.path = path;
    let x = W.root;
    let y: number | null = null;
    while (x !== null) {
      path.push(x);
      y = x;
      const key = W.key(x);
      c.vars.x = key;
      if (k === key) {
        yield step(
          c,
          `${name}: ${k} = ${key}, so ${k} is already in the tree. Each key is stored once, so nothing changes.`,
          ['ins.loop', 'ins.trail', 'ins.dup'],
          1,
          [nodeMark(x, 'found'), mark('arg-box', 'error')],
        );
        return s;
      }
      const side: Side = k < key ? 'left' : 'right';
      const child = W.n(x)[side];
      yield step(
        c,
        `${cmp(k, key)}, so go ${side}. ${
          child === null
            ? `${key} has no ${side} child, so x = nil and y = ${key}.`
            : `x = ${W.key(child)}.`
        }`,
        ['ins.loop', 'ins.trail', 'ins.dup', 'ins.step'],
        2,
        [
          nodeMark(x, 'compare'),
          ...(child === null ? [mark('nil', 'active')] : [edgeMark(child, 'active')]),
        ],
        { nil: child === null ? { parent: x, side } : undefined },
      );
      x = child;
    }

    W.nodes[uid] = { uid, key: k, left: null, right: null, parent: y, height: 0 };
    W.nextUid = uid + 1;
    c.extra.arg = undefined;
    c.extra.nil = undefined;
    c.extra.fresh = uid;
    c.extra.path = [];
    c.vars.x = 'nil';
    if (y === null) {
      W.root = uid;
      yield step(
        c,
        `x is nil, so ${k} becomes the root, a leaf of height ${leafH}. N = 1, height = ${leafH}.`,
        ['ins.new', 'ins.root'],
        1,
        [nodeMark(uid, 'new')],
      );
      return W.snap();
    }
    const side: Side = k < W.key(y) ? 'left' : 'right';
    W.n(y)[side] = uid;
    yield step(
      c,
      `x is nil, so this is the spot: ${k} becomes the ${side} child of ${W.key(y)}, a leaf of height ${leafH}. Now walk back up from ${W.key(y)}, fixing heights and checking balance.`,
      ['ins.new', side === 'left' ? 'ins.attachL' : 'ins.attachR', 'ins.fix'],
      1,
      [nodeMark(uid, 'new'), edgeMark(uid, 'active')],
    );
    c.extra.fresh = undefined;
    delete c.vars.x;

    const end = yield* fixUp(c, step, st, y, 'insert');
    delete c.vars.x;
    delete c.vars.bf;
    yield step(c, `${end.say} ${summary(W, s, st, 'insert')}`, end.lines, 1, end.marks);
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// delete

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, st, 'delete', raw!, k, 'del.sig');
    const step = stepper(st);
    const name = `delete(${k})`;
    const W = new AVLWork(s);
    const c: AC = { W, extra: { arg: { name: 'k', text: String(k) } }, vars: { k } };
    const succ = st.delete === 'successor';
    const H = (h: number) => shownHeight(h, st);

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
        c.extra.nil ? [mark('nil', 'active')] : [],
      );
      return s;
    }
    c.extra.nil = undefined;
    c.extra.path = [];
    c.vars.z = k;
    delete c.vars.x;
    const zn = W.n(z);
    yield step(
      c,
      `${k} = ${k}: found it. z = ${k}. ${
        zn.left !== null && zn.right !== null
          ? 'It has two children, the hard case.'
          : zn.left === null && zn.right === null
            ? 'It is a leaf, the easy case.'
            : 'It has one child.'
      }`,
      ['del.find'],
      2,
      [nodeMark(z, 'remove')],
    );

    let from: number | null;
    if (zn.left === null || zn.right === null) {
      const noLeft = zn.left === null;
      const child = noLeft ? zn.right : zn.left;
      from = zn.parent;
      W.transplant(z, child);
      W.detach(z);
      c.extra.held = z;
      yield step(
        c,
        child === null
          ? `${k} has no children, so it simply leaves the tree. Its parent gets nil in its place.`
          : `${k} has no ${noLeft ? 'left' : 'right'} child, so its ${noLeft ? 'right' : 'left'} subtree (rooted at ${W.key(child)}) moves up into its place.`,
        noLeft ? ['del.noleft', 'del.right'] : ['del.noleft', 'del.noright', 'del.left'],
        2,
        [nodeMark(z, 'remove'), ...(child === null ? [] : [nodeMark(child, 'active')])],
      );
    } else {
      // Two children: y is the successor (smallest on the right) or the predecessor.
      const down: Side = succ ? 'right' : 'left';
      const across = other(down);
      const which = succ ? 'successor' : 'predecessor';
      let y = zn[down]!;
      c.extra.path = [y];
      c.vars.y = W.key(y);
      yield step(
        c,
        `Replace ${k} by its ${which} y: the ${succ ? 'smallest' : 'largest'} key in its ${down} subtree. Go ${down} to ${W.key(y)}.`,
        ['del.noleft', 'del.noright', 'del.else', 'del.y'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'compare'), edgeMark(y, 'active')],
      );
      for (let next = W.n(y)[across]; next !== null; next = W.n(y)[across]) {
        const fromKey = W.key(y);
        y = next;
        c.extra.path.push(y);
        c.vars.y = W.key(y);
        yield step(
          c,
          `${fromKey} has a ${across} child, so go ${across} to ${W.key(y)}.`,
          ['del.y'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'compare'), edgeMark(y, 'active')],
        );
      }
      const yk = W.key(y);
      yield step(
        c,
        `${yk} has no ${across} child, so y = ${yk}, the ${which} of ${k}.`,
        ['del.y'],
        3,
        [nodeMark(z, 'remove'), nodeMark(y, 'found')],
      );
      c.extra.path = [];
      if (y !== zn[down]) {
        const yn = W.n(y);
        from = yn.parent;
        const rest = yn[down];
        W.transplant(y, rest);
        W.detach(y);
        c.extra.held = y;
        yield step(
          c,
          rest === null
            ? `${yk} is not ${k}'s own ${down} child. Lift it out of its spot, which stays empty because ${yk} has no children. The walk up will start at ${W.key(from!)}, its old parent.`
            : `${yk} is not ${k}'s own ${down} child. Lift it out; its ${down} child, ${W.key(rest)}, moves up into its spot. The walk up will start at ${W.key(from!)}, its old parent.`,
          ['del.far', 'del.from', 'del.splice'],
          2,
          [
            nodeMark(z, 'remove'),
            nodeMark(y, 'active'),
            ...(rest === null ? [] : [nodeMark(rest, 'active')]),
          ],
        );
        const zNow = W.n(z);
        const yNow = W.n(y);
        yNow[down] = zNow[down];
        W.n(zNow[down]!).parent = y;
        W.transplant(z, y);
        yNow[across] = zNow[across];
        W.n(zNow[across]!).parent = y;
        yNow.height = zNow.height;
        W.detach(z);
        c.extra.held = z;
        yield step(
          c,
          `${yk} takes ${k}'s place, both of its subtrees (${W.key(yNow.left!)} and ${W.key(yNow.right!)}), and for now its height, ${H(yNow.height)}.`,
          ['del.adopt', 'del.replace', 'del.adopt2'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'active')],
        );
      } else {
        from = y;
        const zNow = W.n(z);
        const yNow = W.n(y);
        W.transplant(z, y);
        yNow[across] = zNow[across];
        W.n(zNow[across]!).parent = y;
        yNow.height = zNow.height;
        W.detach(z);
        c.extra.held = z;
        yield step(
          c,
          `${yk} is ${k}'s own ${down} child, so it moves up into ${k}'s place, keeps its ${down} subtree, and takes ${k}'s ${across} subtree (${W.key(yNow[across]!)}) and, for now, its height. The walk up starts at ${yk}.`,
          ['del.far', 'del.near', 'del.replace', 'del.adopt2'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'active')],
        );
      }
    }

    delete W.nodes[z];
    c.extra.held = undefined;
    delete c.vars.y;
    delete c.vars.z;
    if (from === null) {
      yield step(
        c,
        `${k} is gone. It was the root, and the subtree that took its place was already balanced, so there is nothing to fix. ${summary(W, s, st, 'delete')}`,
        ['del.fix'],
        1,
        [],
      );
      return W.snap();
    }
    yield step(
      c,
      `${k} is gone. Now walk back up from ${W.key(from)}, fixing heights and balance. A delete can make a subtree shorter, so more than one node may need a rotation.`,
      ['del.fix'],
      1,
      [nodeMark(from, 'active')],
    );
    const end = yield* fixUp(c, step, st, from, 'delete');
    delete c.vars.x;
    delete c.vars.bf;
    yield step(c, `${end.say} ${summary(W, s, st, 'delete')}`, end.lines, 1, end.marks);
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
    const c: AC = {
      W: new AVLWork(s),
      extra: { arg: { name: 'k', text: String(k) } },
      vars: { k },
    };
    yield* searchWalk(c, stepper(st), k);
    return s;
  },
};

function extreme(which: 'min' | 'max'): Op {
  return {
    label: which === 'min' ? 'Min' : 'Max',
    arity: 0,
    *run(s, _args, { settings: st }) {
      const c: AC = { W: new AVLWork(s), extra: {}, vars: {} };
      yield* extremeWalk(c, stepper(st), which);
      return s;
    },
  };
}

const inorder: Op = {
  label: 'Inorder',
  arity: 0,
  *run(s, _args, { settings: st }) {
    const c: AC = { W: new AVLWork(s), extra: {}, vars: {} };
    yield* inorderWalk(c, stepper(st));
    return s;
  },
};

const clear: Op = {
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
          : 'clear(): root = nil. Every node is gone, and the rotation count starts again at 0.',
      lines: ['clear.root'],
      vars: readouts(empty, st),
      level: 1,
    } satisfies AVLStep;
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

function fixLines(st: AVLSettings): PseudoLine[] {
  const lr = st.bf === 'left';
  return [
    L('fix.sig', 0, 'fixUp(x)', 'Walking back up from x:'),
    L(
      'fix.def',
      1,
      `// h(nil) = ${st.leaf === 'one' ? '0' : '−1'}`,
      `(A missing child has height ${st.leaf === 'one' ? '0' : '−1'}.)`,
    ),
    L(
      'fix.bf',
      1,
      lr ? '// bf(x) = h(x.left) − h(x.right)' : '// bf(x) = h(x.right) − h(x.left)',
      lr
        ? '(The balance is the left height minus the right.)'
        : '(The balance is the right height minus the left.)',
    ),
    L('fix.loop', 1, 'while x ≠ nil', 'At each node on the way to the root:'),
    L('fix.kids', 2, 'l = x.left; r = x.right', 'look at its two children,'),
    L('fix.old', 2, 'old = x.h', 'remember its height,'),
    L('fix.height', 2, 'x.h = 1 + max(h(l), h(r))', 'and recompute it from theirs.'),
    L('fix.left', 2, `if bf(x) == ${lr ? '+2' : '−2'}`, 'If the left side is two taller:'),
    L(
      'fix.lr',
      3,
      `if bf(l) ${lr ? '< 0' : '> 0'}: rotateLeft(l)`,
      'if the left child leans right (LR), rotate it left first;',
    ),
    L('fix.ll', 3, 'x = rotateRight(x)', 'then rotate right at x (LL).'),
    L('fix.right', 2, `elseif bf(x) == ${lr ? '−2' : '+2'}`, 'If the right side is two taller:'),
    L(
      'fix.rl',
      3,
      `if bf(r) ${lr ? '> 0' : '< 0'}: rotateRight(r)`,
      'if the right child leans left (RL), rotate it right first;',
    ),
    L('fix.rr', 3, 'x = rotateLeft(x)', 'then rotate left at x (RR).'),
    L('fix.same', 2, 'if x.h == old: return', 'If the height came out the same, stop.'),
    L('fix.up', 2, 'x = x.p', 'Otherwise go up to the parent.'),
  ];
}

export function pseudocode(st: AVLSettings): PseudoBlock[] {
  const succ = st.delete === 'successor';
  const down = succ ? 'right' : 'left';
  const across = succ ? 'left' : 'right';
  const leaf = st.leaf === 'one' ? '1' : '0';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L('ins.init', 1, 'y = nil; x = root', 'start at the root; y trails one step behind.'),
        L('ins.loop', 1, 'while x ≠ nil', 'Until we fall off the tree:'),
        L('ins.trail', 2, 'y = x', 'remember this node;'),
        L('ins.dup', 2, 'if k == x.key: return', 'if k is already here, stop (no duplicates);'),
        L(
          'ins.step',
          2,
          'x = k < x.key ? x.left : x.right',
          'go left if k is smaller, right if it is bigger.',
        ),
        L(
          'ins.new',
          1,
          `z = Node(k); z.p = y; z.h = ${leaf}`,
          `Make a leaf of height ${leaf} under y:`,
        ),
        L('ins.root', 1, 'if y == nil: root = z', 'the root if the tree was empty,'),
        L('ins.attachL', 1, 'elseif k < y.key: y.left = z', "else y's left child"),
        L('ins.attachR', 1, 'else y.right = z', "or y's right child."),
        L('ins.fix', 1, 'fixUp(y)', 'Then walk back up from y.'),
        ...fixLines(st),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = search(k)', 'find the node z that holds k.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L('del.noleft', 1, 'if z.left == nil', 'If z has no left child,'),
        L(
          'del.right',
          2,
          'x = z.p; transplant(z, z.right)',
          'its right subtree (maybe empty) takes its place.',
        ),
        L('del.noright', 1, 'elseif z.right == nil', 'If z has no right child,'),
        L('del.left', 2, 'x = z.p; transplant(z, z.left)', 'its left subtree takes its place.'),
        L('del.else', 1, 'else', 'Otherwise z has two children:'),
        L(
          'del.y',
          2,
          succ ? 'y = min(z.right)' : 'y = max(z.left)',
          succ
            ? 'y is the smallest key in its right subtree.'
            : 'y is the largest key in its left subtree.',
        ),
        L('del.far', 2, `if y ≠ z.${down}`, `If y is deeper than z's own ${down} child,`),
        L('del.from', 3, 'x = y.p', "the walk up starts at y's parent;"),
        L(
          'del.splice',
          3,
          `transplant(y, y.${down})`,
          `lift y out; its ${down} child takes its spot,`,
        ),
        L('del.adopt', 3, `y.${down} = z.${down}`, `and y takes z's ${down} subtree.`),
        L('del.near', 2, 'else x = y', 'Otherwise the walk up starts at y.'),
        L('del.replace', 2, 'transplant(z, y); y.h = z.h', "Put y where z was, with z's height,"),
        L('del.adopt2', 2, `y.${across} = z.${across}`, `and give it z's ${across} subtree.`),
        L('del.fix', 1, 'fixUp(x)', 'Then walk back up from x.'),
        ...fixLines(st),
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
  return 'An empty AVL tree. Insert some keys, or pick a preset: sorted keys are a good start.';
}

export function initialVars(s: S, st: AVLSettings): Record<string, Scalar> {
  return readouts(s, st);
}

/** Screen-reader summary: size, height, and each key with its height, balance and children. */
export function describe(s: S, st: AVLSettings = defaults): string {
  if (s.root === null) return 'An empty AVL tree.';
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    const facts = `${n.key} (height ${shownHeight(n.height, st)}, balance ${signed(shownBalance(storedBalance(s, u), st))})`;
    parts.push(kids.length ? `${facts} has ${kids.join(' and ')}.` : `${facts} is a leaf.`);
    walk(n.right);
  };
  walk(s.root);
  const n = treeSize(s);
  return `An AVL tree with ${plural(n, 'key')} and height ${shownHeight(treeHeight(s), st)}. The root is ${s.nodes[s.root]!.key}. ${parts.join(' ')}`;
}
