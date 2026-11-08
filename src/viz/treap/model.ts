import type { OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  L,
  MAX_KEY,
  MIN_KEY,
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

export interface TreapNode extends TreeNode {
  priority: number;
}

export type TreapState = TreeState<TreapNode>;

export interface TreapSettings {
  [key: string]: Scalar;
  /** min: smaller priorities sit higher, as in CLRS. max: larger ones do. */
  heap: 'min' | 'max';
  /** random: each new key draws a priority from the seeded generator. typed: type 50:7. */
  priority: 'random' | 'typed';
}

export interface TreapExtra extends TreeExtra {
  /** The new node's priority, shown next to the argument while it walks down. */
  drawn?: number;
}

type S = TreapState;
type X = TreapExtra;
type Op = OpSpec<S, TreapSettings, X>;
type TreapStep = Step<S, X>;
type TC = Ctx<TreapNode, X>;

export const MAX_PRIORITY = 99;

export const defaults: TreapSettings = { heap: 'min', priority: 'random' };

export function init(): S {
  return emptyState<TreapNode>();
}

// ---------------------------------------------------------------------------------------------
// Arguments: "50" or "50:7"

export interface TreapArg {
  key: number;
  /** A priority typed after the colon, or null. */
  priority: number | null;
}

/** Read "50" or "50:7" (key 50 with priority 7). */
export function parseTreapArg(raw: Value): TreapArg | Error {
  const text = String(raw).trim();
  const [k = '', p, ...rest] = text.split(':');
  if (rest.length || (p !== undefined && !/^\d+$/.test(p.trim())))
    return new Error(
      `Type a key, or a key and a priority like 50:7. Priorities are whole numbers from 0 to ${MAX_PRIORITY}.`,
    );
  const key = parseKey(k);
  if (key instanceof Error) return key;
  if (p === undefined) return { key, priority: null };
  const priority = Number(p.trim());
  if (priority > MAX_PRIORITY)
    return new Error(
      `Keep priorities between 0 and ${MAX_PRIORITY} so they fit next to the nodes.`,
    );
  return { key, priority };
}

/** For the input box: "50" stays a number, "50:7" stays a string for insert to split. */
export function parseTreapInput(token: string): Value | Error {
  const a = parseTreapArg(token);
  if (a instanceof Error) return a;
  return a.priority === null ? a.key : `${a.key}:${a.priority}`;
}

// ---------------------------------------------------------------------------------------------
// Heap order

/** True when priority a belongs above priority b. Equal priorities may sit either way. */
export const above = (st: TreapSettings, a: number, b: number) =>
  st.heap === 'min' ? a < b : a > b;

const word = (st: TreapSettings) => (st.heap === 'min' ? 'smaller' : 'larger');

export function readouts(s: S): Record<string, Scalar> {
  return { N: treeSize(s), height: treeHeight(s), rotations: s.rotations };
}

function stepper(): MakeStep<TreapNode, X> {
  return (c, say, lines, level, marks, more = {}) => {
    const state = c.W.snap();
    const extra: X = { ...c.extra, ...more };
    if (extra.path) extra.path = [...extra.path];
    if (extra.output) extra.output = [...extra.output];
    return { state, marks, say, lines, vars: { ...readouts(state), ...c.vars }, level, extra };
  };
}

const ctx = (s: S, extra: X, vars: Record<string, Scalar>): TC => ({
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

function summary(W: TreeWork<TreapNode>, before: S, op: string): string {
  const s = W.snap();
  const made = W.rotations - before.rotations;
  return `N = ${treeSize(s)}, height = ${treeHeight(s)}. ${
    made === 0 ? `This ${op} needed no rotations.` : `This ${op} made ${plural(made, 'rotation')}.`
  }`;
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings: st, rng }) {
    const a = parseTreapArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'insert', raw!, a, 'ins.sig');
    if (a.priority === null && st.priority === 'typed')
      return yield* badArg(
        s,
        'insert',
        raw!,
        new Error(`Priorities are typed by hand here (see Options): type ${a.key}:7, for example.`),
        'ins.prio',
      );
    const step = stepper();
    const k = a.key;
    const p = a.priority ?? rng.int(1, MAX_PRIORITY);
    const typed = a.priority !== null;
    const W = new TreeWork<TreapNode>(s);
    const uid = W.nextUid;
    const c: TC = {
      W,
      extra: { arg: { name: 'k', text: String(k), uid }, drawn: p },
      vars: { k, priority: p },
    };
    const name = `insert(${k})`;
    const from = typed ? 'typed' : 'drawn at random';
    if (W.root === null) {
      W.nodes[uid] = { uid, key: k, left: null, right: null, parent: null, priority: p };
      W.nextUid = uid + 1;
      W.root = uid;
      c.extra.arg = undefined;
      c.extra.fresh = uid;
      yield step(
        c,
        `${name}: the tree is empty, so ${k} becomes the root, with priority ${p} (${from}). ${summary(W, s, 'insert')}`,
        ['ins.prio', 'ins.bst'],
        1,
        [nodeMark(uid, 'new')],
      );
      return W.snap();
    }
    yield step(
      c,
      `${name}: ${k} gets priority ${p} (${from}). First insert it as in a BST, starting at the root, ${W.key(W.root)}.`,
      ['ins.prio', 'ins.bst'],
      2,
      [nodeMark(W.root, 'active')],
    );
    const path: number[] = [];
    c.extra.path = path;
    let x: number | null = W.root;
    let y = W.root;
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
        `${cmp(k, key)}, so go ${side}. ${child === null ? `${key} has no ${side} child, so ${k} goes there.` : `Next is ${W.key(child)}.`}`,
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
    W.nodes[uid] = { uid, key: k, left: null, right: null, parent: y, priority: p };
    W.nextUid = uid + 1;
    W.n(y)[side] = uid;
    c.extra.arg = undefined;
    c.extra.nil = undefined;
    c.extra.fresh = uid;
    c.extra.path = [];
    delete c.vars.x;
    yield step(
      c,
      `${k} becomes the ${side} child of ${W.key(y)}, as a leaf. The keys are in order, but now check the priorities on the way up.`,
      ['ins.bst', 'ins.loop'],
      1,
      [nodeMark(uid, 'new'), edgeMark(uid, 'active')],
    );
    c.extra.fresh = undefined;

    // Rotate up while the new node's priority belongs above its parent's.
    let why: string;
    for (;;) {
      const parent = W.n(uid).parent;
      if (parent === null) {
        why = `${k} is the root now`;
        break;
      }
      const pp = W.n(parent).priority;
      const pk = W.key(parent);
      if (!above(st, p, pp)) {
        why = `${k}'s priority ${p} is not ${word(st)} than its parent ${pk}'s ${pp}, so the heap order holds`;
        break;
      }
      const s0 = W.sideOf(uid)!;
      const dir = other(s0);
      const inner = W.n(uid)[dir];
      yield step(
        c,
        `${k}'s priority ${p} is ${word(st)} than its parent ${pk}'s ${pp}: the heap order is broken. Rotate ${dir} at ${pk} to lift ${k} above it.`,
        ['ins.loop'],
        2,
        [nodeMark(uid, 'active'), nodeMark(parent, 'error'), edgeMark(uid, 'error')],
      );
      W.rotate(parent, dir);
      yield step(
        c,
        `Rotate ${dir} at ${pk}: ${k} moves up and ${pk} becomes its ${dir} child${
          inner === null
            ? ''
            : `, and ${k}'s old ${dir} subtree (${W.key(inner)}) moves across to ${pk}`
        }. The keys stay in order, as after any rotation.`,
        ['ins.rot'],
        1,
        [
          nodeMark(uid, 'new'),
          nodeMark(parent, 'active'),
          edgeMark(parent, 'active'),
          ...(inner === null ? [] : [nodeMark(inner, 'visit'), edgeMark(inner, 'active')]),
        ],
      );
    }
    yield step(c, `${why}. ${summary(W, s, 'insert')}`, ['ins.loop'], 1, [nodeMark(uid, 'done')]);
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// delete: rotate the node down until it has at most one child, then splice it out

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings: st }) {
    const a = parseTreapArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'delete', raw!, a, 'del.sig');
    const step = stepper();
    const k = a.key;
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
    yield step(
      c,
      `Found ${k}. Rotate it down until it has at most one child; each time, the child whose priority belongs higher moves up.`,
      ['del.find', 'del.loop'],
      2,
      [nodeMark(z, 'remove')],
    );
    for (;;) {
      const zn = W.n(z);
      if (zn.left === null || zn.right === null) break;
      const [l, r] = [W.n(zn.left), W.n(zn.right)];
      // The child that moves up: higher in heap order; on a tie, the right one.
      const upSide: Side = above(st, l.priority, r.priority) ? 'left' : 'right';
      const up = upSide === 'left' ? l : r;
      const dir = other(upSide);
      const inner = up[dir];
      W.rotate(z, dir);
      yield step(
        c,
        `${k} has two children: ${l.key} (priority ${l.priority}) and ${r.key} (priority ${r.priority}). ${up.key}'s belongs higher, so rotate ${dir} at ${k}: ${up.key} moves up and ${k} moves down${
          inner === null
            ? ''
            : `, and ${up.key}'s old ${dir} subtree (${W.key(inner)}) moves across to ${k}`
        }.`,
        ['del.loop', 'del.pick', 'del.rot'],
        1,
        [nodeMark(z, 'remove'), nodeMark(up.uid, 'new'), edgeMark(z, 'active')],
      );
    }
    const zn = W.n(z);
    const child = zn.left ?? zn.right;
    W.transplant(z, child);
    W.detach(z);
    c.extra.held = z;
    yield step(
      c,
      child === null
        ? `${k} is a leaf now, so it simply leaves the tree.`
        : `${k} has one child now, so its subtree (rooted at ${W.key(child)}) moves up into its place. Its priorities already belong below ${k}'s parent.`,
      ['del.splice'],
      2,
      [nodeMark(z, 'remove')],
    );
    delete W.nodes[z];
    c.extra.held = undefined;
    yield step(c, `${k} is gone. ${summary(W, s, 'delete')}`, ['del.splice'], 1, []);
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// search, min, max, inorder, clear

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const a = parseTreapArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'search', raw!, a, 'srch.sig');
    yield* searchWalk(
      ctx(s, { arg: { name: 'k', text: String(a.key) } }, { k: a.key }),
      stepper(),
      a.key,
    );
    return s;
  },
};

function extreme(which: 'min' | 'max'): Op {
  return {
    label: which === 'min' ? 'Min' : 'Max',
    arity: 0,
    *run(s) {
      yield* extremeWalk(ctx(s, {}, {}), stepper(), which);
      return s;
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
    } satisfies TreapStep;
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

export function pseudocode(st: TreapSettings): PseudoBlock[] {
  const lt = st.heap === 'min' ? '<' : '>';
  const pick = st.heap === 'min' ? 'smaller' : 'larger';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L(
          'ins.prio',
          1,
          st.priority === 'typed' ? 'p = the typed priority' : 'p = random()',
          st.priority === 'typed' ? 'use the priority typed with it,' : 'draw a random priority,',
        ),
        L('ins.bst', 1, 'z = bstInsert(k, p)', 'add k as a leaf, as in a BST.'),
        L(
          'ins.loop',
          1,
          `while z.p ≠ nil and p ${lt} z.p.p`,
          `While its priority is ${pick} than its parent's,`,
        ),
        L('ins.rot', 2, 'rotateUp(z)', 'rotate z above its parent.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = search(k)', 'find the node z.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L('del.loop', 1, 'while z has two children', 'While z has two children:'),
        L('del.pick', 2, `c = child with ${pick} p`, `pick the child whose priority is ${pick},`),
        L('del.rot', 2, 'rotateUp(c)', 'and rotate it above z.'),
        L(
          'del.splice',
          1,
          'replace z by its child',
          'Then z has at most one child: splice it out.',
        ),
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

export function initialSay(_s: S, st: TreapSettings): string {
  return st.priority === 'typed'
    ? 'An empty treap with typed priorities. Insert keys with priorities, such as 50:7 30:2.'
    : 'An empty treap. Insert some keys: each one gets a random priority.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

export function describe(s: S): string {
  if (s.root === null) return 'An empty treap.';
  const parts: string[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    const label = `${n.key} (priority ${n.priority})`;
    parts.push(kids.length ? `${label} has ${kids.join(' and ')}.` : `${label} is a leaf.`);
    walk(n.right);
  };
  walk(s.root);
  const n = treeSize(s);
  return `A treap with ${plural(n, 'key')} and height ${treeHeight(s)}. The root is ${s.nodes[s.root]!.key}. ${parts.join(' ')}`;
}

export { MIN_KEY, MAX_KEY };
