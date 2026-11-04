/**
 * Pieces shared by the balanced and self-adjusting tree pages (AVL, red-black, splay, treap):
 * a working copy of a binary search tree with parent pointers, CLRS rotations and transplant,
 * key parsing, and the walks that do not change the tree (search, min, max, inorder). Each page
 * adds its own fields to the nodes (a height, a color, a priority) and its own steps.
 */
import type {
  Mark,
  MarkRole,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { edgeShapeId, nodeShapeId } from '../../layouts/binary-tree';

export type Side = 'left' | 'right';
export type Level = 1 | 2 | 3;

export interface TreeNode {
  uid: number;
  key: number;
  left: number | null;
  right: number | null;
  parent: number | null;
}

export interface TreeState<N extends TreeNode = TreeNode> {
  nodes: Record<number, N>;
  root: number | null;
  nextUid: number;
  /** Single rotations since the tree was last cleared; a double rotation counts as two. */
  rotations: number;
}

/** View-only data every tree page uses. */
export interface TreeExtra {
  /** The operation's argument, drawn in a box above the tree. */
  arg?: { name: string; text: string; uid?: number; error?: boolean };
  /** Nodes looked at so far, in order. */
  path?: number[];
  /** A node lifted out of the tree during delete, drawn above the root. */
  held?: number;
  /** An empty child being looked at. */
  nil?: { parent: number; side: Side };
  /** Insert: the node that has just been created from the argument. */
  fresh?: number;
  /** Inorder: keys written so far, by uid. */
  output?: number[];
}

export const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const nodeMark = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);
export const edgeMark = (uid: number, role: MarkRole) => mark(edgeShapeId(uid), role);

// ---------------------------------------------------------------------------------------------
// Keys

export const MIN_KEY = -99;
export const MAX_KEY = 999;

/** Read a key: a whole number from MIN_KEY to MAX_KEY. */
export function parseKey(raw: Value): number | Error {
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text))
    return new Error(`Keys are whole numbers from ${MIN_KEY} to ${MAX_KEY}, such as 42.`);
  const k = Number(text);
  if (k < MIN_KEY || k > MAX_KEY)
    return new Error(`Keep keys between ${MIN_KEY} and ${MAX_KEY} so they fit in the nodes.`);
  return k;
}

export function cmp(k: number, key: number): string {
  return k < key ? `${k} < ${key}` : k > key ? `${k} > ${key}` : `${k} = ${key}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------
// A working copy of the tree. Operations change it freely and yield snapshots.

export function emptyState<N extends TreeNode>(): TreeState<N> {
  return { nodes: {}, root: null, nextUid: 1, rotations: 0 };
}

export class TreeWork<N extends TreeNode> {
  nodes: Record<number, N>;
  root: number | null;
  nextUid: number;
  rotations: number;

  constructor(s: TreeState<N>) {
    this.nodes = copyNodes(s.nodes);
    this.root = s.root;
    this.nextUid = s.nextUid;
    this.rotations = s.rotations;
  }

  snap(): TreeState<N> {
    return {
      nodes: copyNodes(this.nodes),
      root: this.root,
      nextUid: this.nextUid,
      rotations: this.rotations,
    };
  }

  n(uid: number): N {
    return this.nodes[uid]!;
  }

  key(uid: number): number {
    return this.n(uid).key;
  }

  /** Which child of its parent u is, or null for the root. */
  sideOf(u: number): Side | null {
    const p = this.n(u).parent;
    if (p === null) return null;
    return this.n(p).left === u ? 'left' : 'right';
  }

  /** CLRS TRANSPLANT: put the subtree rooted at v where the subtree rooted at u was. */
  transplant(u: number, v: number | null): void {
    const p = this.n(u).parent;
    if (p === null) this.root = v;
    else if (this.n(p).left === u) this.n(p).left = v;
    else this.n(p).right = v;
    if (v !== null) this.n(v).parent = p;
  }

  /** Take a node out of the picture: no parent, no children. */
  detach(u: number): void {
    const n: TreeNode = this.n(u);
    n.parent = null;
    n.left = null;
    n.right = null;
  }

  /**
   * CLRS LEFT-ROTATE (dir 'left') or RIGHT-ROTATE (dir 'right') at x. The child on the other
   * side, y, moves up into x's place; x becomes y's child on side dir; y's inner subtree moves
   * across to x. Returns y. Every node keeps its identity, so the drawing can follow it.
   */
  rotate(x: number, dir: Side): number {
    const up = other(dir);
    const X: TreeNode = this.n(x);
    const y = X[up]!;
    const Y: TreeNode = this.n(y);
    const inner = Y[dir];
    X[up] = inner;
    if (inner !== null) this.n(inner).parent = x;
    this.transplant(x, y);
    Y[dir] = x;
    X.parent = y;
    this.rotations += 1;
    return y;
  }

  /** Height of the subtree at u, counted in edges (nil is -1), from the structure itself. */
  height(u: number | null): number {
    return u === null
      ? -1
      : 1 + Math.max(this.height(this.n(u).left), this.height(this.n(u).right));
  }

  size(): number {
    return Object.keys(this.nodes).length;
  }

  /** Smallest (side 'left') or largest key under u. */
  extreme(u: number, side: Side): number {
    let x = u;
    for (let c = this.n(x)[side]; c !== null; c = this.n(x)[side]) x = c;
    return x;
  }
}

function copyNodes<N extends TreeNode>(nodes: Record<number, N>): Record<number, N> {
  const out = {} as Record<number, N>;
  for (const [k, n] of Object.entries(nodes)) out[Number(k)] = { ...n };
  return out;
}

// ---------------------------------------------------------------------------------------------
// Facts about a state

type Shape = { nodes: Record<number, TreeNode>; root: number | null };

/** Edges on the longest path down from the root; -1 for an empty tree. */
export function treeHeight(s: Shape): number {
  const h = (u: number | null): number =>
    u === null ? -1 : 1 + Math.max(h(s.nodes[u]!.left), h(s.nodes[u]!.right));
  return h(s.root);
}

/** Nodes reachable from the root. A node lifted out during delete does not count. */
export function treeSize(s: Shape): number {
  const n = (u: number | null): number =>
    u === null ? 0 : 1 + n(s.nodes[u]!.left) + n(s.nodes[u]!.right);
  return n(s.root);
}

export function inorderKeys(s: Shape): number[] {
  const out: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    walk(s.nodes[u]!.left);
    out.push(s.nodes[u]!.key);
    walk(s.nodes[u]!.right);
  };
  walk(s.root);
  return out;
}

export function preorderKeys(s: Shape): number[] {
  const out: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    out.push(s.nodes[u]!.key);
    walk(s.nodes[u]!.left);
    walk(s.nodes[u]!.right);
  };
  walk(s.root);
  return out;
}

/** "(40 (20 10 30) (60 . 70))": a compact picture of the shape, for tests and screen readers. */
export function shapeText(s: Shape, label: (u: number) => string = (u) => String(s.nodes[u]!.key)) {
  const t = (u: number | null): string => {
    if (u === null) return '.';
    const n = s.nodes[u]!;
    if (n.left === null && n.right === null) return label(u);
    return `(${label(u)} ${t(n.left)} ${t(n.right)})`;
  };
  return t(s.root);
}

// ---------------------------------------------------------------------------------------------
// Walks that every page shares. A page passes its own step maker, which adds its readouts.

export interface Ctx<N extends TreeNode, X extends TreeExtra> {
  W: TreeWork<N>;
  extra: X;
  vars: Record<string, Scalar>;
  /**
   * The shape id of an empty child, for a page that draws its empty children itself (the
   * red-black tree's NIL leaves). Otherwise the view draws a temporary "nil" marker.
   */
  nilId?: (parent: number, side: Side) => string;
}

/** The mark for an empty child: the page's own NIL square, or the temporary "nil" marker. */
export function nilMark<N extends TreeNode, X extends TreeExtra>(
  c: Ctx<N, X>,
  parent: number,
  side: Side,
  role: MarkRole = 'active',
): Mark {
  return mark(c.nilId ? c.nilId(parent, side) : 'nil', role);
}

export type MakeStep<N extends TreeNode, X extends TreeExtra> = (
  c: Ctx<N, X>,
  say: string,
  lines: string[],
  level: Level,
  marks: Mark[],
  more?: Partial<X>,
) => Step<TreeState<N>, X>;

type Gen<N extends TreeNode, X extends TreeExtra, R> = Generator<Step<TreeState<N>, X>, R, void>;

/**
 * Walk down from the root comparing k with each key, one step per comparison. Returns the node
 * holding k (or null), and the last node looked at with the side the walk left it by.
 */
export function* descend<N extends TreeNode, X extends TreeExtra>(
  c: Ctx<N, X>,
  step: MakeStep<N, X>,
  k: number,
  lines: { left: string[]; right: string[] },
  level: Level,
  name: string,
): Gen<N, X, { x: number | null; parent: number | null; side: Side | null }> {
  const W = c.W;
  const path: number[] = [];
  c.extra.path = path;
  let x = W.root;
  let parent: number | null = null;
  let side: Side | null = null;
  while (x !== null) {
    path.push(x);
    const key = W.key(x);
    c.vars.x = key;
    if (k === key) return { x, parent, side };
    side = k < key ? 'left' : 'right';
    const child = W.n(x)[side];
    const where =
      child === null
        ? `but ${key} has no ${side} child, so x = nil.`
        : `so go ${side} to ${W.key(child)}.`;
    yield step(
      c,
      `${name}: ${cmp(k, key)}, ${where}`,
      side === 'left' ? lines.left : lines.right,
      level,
      [nodeMark(x, 'compare'), ...(child === null ? [nilMark(c, x, side)] : [])],
      { nil: child === null ? { parent: x, side } : undefined } as Partial<X>,
    );
    parent = x;
    x = child;
  }
  c.vars.x = 'nil';
  if (parent !== null && side !== null) c.extra.nil = { parent, side };
  return { x: null, parent, side };
}

/** search(k): one comparison per level. Leaves the tree alone. */
export function* searchWalk<N extends TreeNode, X extends TreeExtra>(
  c: Ctx<N, X>,
  step: MakeStep<N, X>,
  k: number,
): Gen<N, X, boolean> {
  const name = `search(${k})`;
  const root = c.W.root;
  if (root !== null) {
    yield step(c, `${name}: start at the root, ${c.W.key(root)}.`, ['srch.init'], 3, [
      nodeMark(root, 'active'),
    ]);
  }
  const { x } = yield* descend(
    c,
    step,
    k,
    { left: ['srch.loop', 'srch.left'], right: ['srch.loop', 'srch.right'] },
    2,
    name,
  );
  if (x === null) {
    c.vars.found = false;
    yield step(
      c,
      root === null
        ? `${name}: the tree is empty, so ${k} is not in it.`
        : `x is nil, so the search stops: ${k} is not in the tree.`,
      ['srch.loop', 'srch.ret'],
      1,
      c.extra.nil ? [nilMark(c, c.extra.nil.parent, c.extra.nil.side)] : [],
    );
    return false;
  }
  c.vars.found = true;
  const n = c.extra.path!.length;
  yield step(
    c,
    `${k} = ${k}: found it after ${plural(n, 'comparison')}.`,
    ['srch.loop', 'srch.ret'],
    1,
    [nodeMark(x, 'found')],
    { nil: undefined } as Partial<X>,
  );
  return true;
}

/** min() or max(): walk down one side. */
export function* extremeWalk<N extends TreeNode, X extends TreeExtra>(
  c: Ctx<N, X>,
  step: MakeStep<N, X>,
  which: 'min' | 'max',
): Gen<N, X, void> {
  const side: Side = which === 'min' ? 'left' : 'right';
  const W = c.W;
  c.extra.path = [];
  if (W.root === null) {
    c.vars.returned = 'nil';
    yield step(
      c,
      `${which}(): the tree is empty, so there is no ${which === 'min' ? 'smallest' : 'largest'} key.`,
      [`${which}.empty`],
      1,
      [],
    );
    return;
  }
  let x = W.root;
  c.extra.path.push(x);
  c.vars.x = W.key(x);
  yield step(c, `${which}(): start at the root, ${W.key(x)}.`, [`${which}.init`], 2, [
    nodeMark(x, 'active'),
  ]);
  for (let child = W.n(x)[side]; child !== null; child = W.n(x)[side]) {
    const from = W.key(x);
    x = child;
    c.extra.path.push(x);
    c.vars.x = W.key(x);
    yield step(
      c,
      `${from} has a ${side} child, so go ${side} to ${W.key(x)}.`,
      [`${which}.loop`, `${which}.step`],
      2,
      [nodeMark(x, 'active'), edgeMark(x, 'active')],
    );
  }
  c.vars.returned = W.key(x);
  yield step(
    c,
    `${W.key(x)} has no ${side} child, so nothing is ${which === 'min' ? 'smaller' : 'larger'}: ${which} = ${W.key(x)}.`,
    [`${which}.loop`, `${which}.ret`],
    1,
    [nodeMark(x, 'found')],
  );
}

/** inorder(): write the keys in sorted order. Rotations never change this order. */
export function* inorderWalk<N extends TreeNode, X extends TreeExtra>(
  c: Ctx<N, X>,
  step: MakeStep<N, X>,
): Gen<N, X, void> {
  const W = c.W;
  const out: number[] = [];
  c.extra.output = out;
  c.vars.output = '';
  if (W.root === null) {
    yield step(
      c,
      'inorder(): the tree is empty, so there is nothing to list.',
      ['in.check'],
      1,
      [],
    );
    return;
  }
  const keys: number[] = [];
  const steps: Step<TreeState<N>, X>[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    const node = W.n(u);
    walk(node.left);
    out.push(u);
    keys.push(node.key);
    c.vars.output = keys.join(' ');
    c.vars.x = node.key;
    steps.push(
      step(
        c,
        node.left === null
          ? `${node.key} has no left subtree, so write it down. Output: ${keys.join(' ')}.`
          : `The left subtree of ${node.key} is done, so write ${node.key} down. Output: ${keys.join(' ')}.`,
        ['in.visit'],
        2,
        [nodeMark(u, 'active'), mark(`out-${u}`, 'new')],
      ),
    );
    walk(node.right);
  };
  walk(W.root);
  yield* steps;
  delete c.vars.x;
  yield step(
    c,
    `Done. Inorder lists the keys in sorted order: ${keys.join(' ')}.`,
    ['in.check'],
    1,
    [],
  );
}

// ---------------------------------------------------------------------------------------------
// Pseudocode shared by the pages

export const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function searchBlock(): PseudoBlock {
  return {
    op: 'search',
    lines: [
      L('srch.sig', 0, 'search(k)', 'To find key k:'),
      L('srch.init', 1, 'x = root', 'start at the root.'),
      L('srch.loop', 1, 'while x ≠ nil and k ≠ x.key', 'Until we find k or fall off the tree:'),
      L('srch.left', 2, 'if k < x.key: x = x.left', 'if k is smaller, go left,'),
      L('srch.right', 2, 'else x = x.right', 'otherwise go right.'),
      L('srch.ret', 1, 'return x', 'Hand back the node (nil if k was not found).'),
    ],
  };
}

export function extremeBlocks(): PseudoBlock[] {
  return (['min', 'max'] as const).map((w) => {
    const side = w === 'min' ? 'left' : 'right';
    return {
      op: w,
      lines: [
        L(`${w}.sig`, 0, `${w}()`, `To find the ${w === 'min' ? 'smallest' : 'largest'} key:`),
        L(`${w}.empty`, 1, 'if root == nil: return nil', 'an empty tree has none.'),
        L(`${w}.init`, 1, 'x = root', 'Start at the root'),
        L(`${w}.loop`, 1, `while x.${side} ≠ nil`, `and while there is a ${side} child,`),
        L(`${w}.step`, 2, `x = x.${side}`, `go ${side}.`),
        L(`${w}.ret`, 1, 'return x', 'The node where we stop is the answer.'),
      ],
    };
  });
}

export function inorderBlock(): PseudoBlock {
  return {
    op: 'inorder',
    lines: [
      L('in.sig', 0, 'inorder(x)', 'To list the keys at x in sorted order:'),
      L('in.check', 1, 'if x ≠ nil', 'if there is a node here,'),
      L('in.left', 2, 'inorder(x.left)', 'first list the smaller keys (left),'),
      L('in.visit', 2, 'visit(x)', 'then this key,'),
      L('in.right', 2, 'inorder(x.right)', 'then the bigger keys (right).'),
    ],
  };
}

export function clearBlock(): PseudoBlock {
  return {
    op: 'clear',
    lines: [
      L('clear.sig', 0, 'clear()', 'To empty the tree:'),
      L('clear.root', 1, 'root = nil', 'forget the root; every node goes with it.'),
    ],
  };
}
