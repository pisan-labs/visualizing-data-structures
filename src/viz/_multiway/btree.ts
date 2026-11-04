/**
 * Shared model code for the B-tree and 2-4 tree pages: the state (nodes holding rows of keys),
 * a working copy that operations change and snapshot, key parsing, the step builder, search,
 * and insertion that splits on the way back up after an overflow (Goodrich and Tamassia's
 * insertion, and the B-tree page's second option). This folder has no index.ts, so the
 * registry does not treat it as a page.
 */
import type { Level, Mark, MarkRole, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { cellShapeId, edgeShapeId, nodeShapeId } from '../../layouts/multiway';

/** A key with an identity, so the drawing follows it when it moves to another node. */
export interface BKey {
  uid: number;
  key: number;
}

export interface BNode {
  uid: number;
  keys: BKey[];
  /** Children, left to right; empty for a leaf. An internal node has keys.length + 1. */
  kids: number[];
}

export interface BState {
  nodes: Record<number, BNode>;
  root: number | null;
  /** Shared by nodes and keys. */
  nextUid: number;
  /** Running totals since the tree was last cleared. */
  splits: number;
  merges: number;
  borrows: number;
}

export interface BExtra {
  /** The operation's argument, drawn as a key cell above the tree. */
  arg?: { name: string; text: string; uid?: number; error?: boolean };
  /** Nodes read so far in this operation, in order. */
  path?: number[];
  /** A leftover copy of a key that the delete is about to remove (drawn dashed). */
  ghost?: number;
}

export type BStep = Step<BState, BExtra>;

export const MIN_KEY = -99;
export const MAX_KEY = 999;

/** Read a key: a whole number from MIN_KEY to MAX_KEY. */
export function parseKey(raw: Value): number | Error {
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text))
    return new Error(`Keys are whole numbers from ${MIN_KEY} to ${MAX_KEY}, such as 42.`);
  const k = Number(text);
  if (k < MIN_KEY || k > MAX_KEY)
    return new Error(`Keep keys between ${MIN_KEY} and ${MAX_KEY} so they fit in the cells.`);
  return k;
}

export function emptyState(): BState {
  return { nodes: {}, root: null, nextUid: 1, splits: 0, merges: 0, borrows: 0 };
}

/** A working copy of the tree. Operations change it freely and yield snapshots. */
export class Work {
  nodes: Record<number, BNode>;
  root: number | null;
  nextUid: number;
  splits: number;
  merges: number;
  borrows: number;

  constructor(s: BState) {
    this.nodes = copyNodes(s.nodes);
    this.root = s.root;
    this.nextUid = s.nextUid;
    this.splits = s.splits;
    this.merges = s.merges;
    this.borrows = s.borrows;
  }

  snap(): BState {
    return {
      nodes: copyNodes(this.nodes),
      root: this.root,
      nextUid: this.nextUid,
      splits: this.splits,
      merges: this.merges,
      borrows: this.borrows,
    };
  }

  n(uid: number): BNode {
    return this.nodes[uid]!;
  }

  leaf(uid: number): boolean {
    return this.n(uid).kids.length === 0;
  }

  uid(): number {
    return this.nextUid++;
  }

  make(keys: BKey[], kids: number[]): number {
    const uid = this.uid();
    this.nodes[uid] = { uid, keys, kids };
    return uid;
  }

  free(uid: number): void {
    delete this.nodes[uid];
  }
}

function copyNodes(nodes: Record<number, BNode>): Record<number, BNode> {
  const out: Record<number, BNode> = {};
  for (const [k, n] of Object.entries(nodes))
    out[Number(k)] = { uid: n.uid, keys: n.keys.map((x) => ({ ...x })), kids: [...n.kids] };
  return out;
}

type Tree = { nodes: Record<number, BNode>; root: number | null };

/** Edges on the longest path from the root down; -1 for an empty tree. */
export function heightOf(s: Tree): number {
  const h = (u: number): number => {
    const kids = s.nodes[u]!.kids;
    return kids.length ? 1 + Math.max(...kids.map(h)) : 0;
  };
  return s.root === null ? -1 : h(s.root);
}

/** Nodes reachable from the root. */
export function nodeCount(s: Tree): number {
  const c = (u: number): number => 1 + s.nodes[u]!.kids.reduce((a, k) => a + c(k), 0);
  return s.root === null ? 0 : c(s.root);
}

/** Keys in order, as entries; a leftover copy (`ghost`) is left out. */
export function inorder(s: Tree, ghost?: number): BKey[] {
  const out: BKey[] = [];
  const walk = (u: number) => {
    const n = s.nodes[u]!;
    n.keys.forEach((k, i) => {
      if (n.kids[i] !== undefined) walk(n.kids[i]!);
      if (k.uid !== ghost) out.push(k);
    });
    if (n.kids.length > n.keys.length) walk(n.kids[n.kids.length - 1]!);
  };
  if (s.root !== null) walk(s.root);
  return out;
}

export const keysOf = (s: Tree, ghost?: number) => inorder(s, ghost).map((k) => k.key);

/** "[10 20 30]" */
export function label(s: Tree, uid: number): string {
  return `[${s.nodes[uid]!.keys.map((k) => k.key).join(' ')}]`;
}

/** Node ids level by level, left to right. */
export function levelsOf(s: Tree): number[][] {
  const out: number[][] = [];
  const walk = (u: number, d: number) => {
    (out[d] ??= []).push(u);
    for (const k of s.nodes[u]!.kids) walk(k, d + 1);
  };
  if (s.root !== null) walk(s.root, 0);
  return out;
}

/** Screen-reader summary, level by level. */
export function describeTree(s: Tree, what: string): string {
  if (s.root === null) return `An empty ${what}.`;
  const n = keysOf(s).length;
  const levels = levelsOf(s).map((ids, d) => {
    const nodes = ids.map((u) => label(s, u)).join(' ');
    return d === 0 ? `Root ${nodes}.` : `Depth ${d}: ${nodes}.`;
  });
  return `A ${what} with ${n} ${n === 1 ? 'key' : 'keys'} in ${nodeCount(s)} ${
    nodeCount(s) === 1 ? 'node' : 'nodes'
  }, height ${heightOf(s)}. ${levels.join(' ')}`;
}

// ---------------------------------------------------------------------------------------------
// Steps

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const nodeMark = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);
export const cellMark = (key: BKey | number, role: MarkRole) =>
  mark(cellShapeId(typeof key === 'number' ? key : key.uid), role);
export const edgeMark = (child: number, role: MarkRole) => mark(edgeShapeId(child), role);

/** The readouts a page shows on every step (N, height, nodes and its counters). */
export type Readouts = (s: BState, ghost: number | undefined) => Record<string, Scalar>;

export interface Ctx {
  W: Work;
  extra: BExtra;
  /** The operation's own variables (k, i, reads...). */
  vars: Record<string, Scalar>;
  readouts: Readouts;
}

export function makeCtx(s: BState, readouts: Readouts, extra: BExtra, vars: Ctx['vars']): Ctx {
  return { W: new Work(s), extra, vars, readouts };
}

export function snap(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): BStep {
  const state = c.W.snap();
  const extra: BExtra = { ...c.extra };
  if (extra.path) extra.path = [...extra.path];
  if (extra.arg) extra.arg = { ...extra.arg };
  return {
    state,
    marks,
    say,
    lines,
    vars: { ...c.readouts(state, extra.ghost), ...c.vars },
    level,
    extra,
  };
}

/** Count a node as read (a disk read), once per operation. */
export function read(c: Ctx, uid: number): void {
  const path = (c.extra.path ??= []);
  if (!path.includes(uid)) path.push(uid);
  c.vars.reads = path.length;
}

/** A step that reports a bad argument and changes nothing. */
export function* badArg(
  s: BState,
  readouts: Readouts,
  name: string,
  raw: Value,
  err: Error,
  line: string,
): Generator<BStep, BState, void> {
  const c = makeCtx(s, readouts, { arg: { name, text: String(raw).slice(0, 6), error: true } }, {});
  yield snap(c, `${name}(${String(raw)}): ${err.message} The tree is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

/** Where k falls among a node's keys, in words: "between 20 and 30", "left of 20"... */
export function between(keys: BKey[], i: number): string {
  if (keys.length === 0) return 'below this empty node';
  if (i === 0) return `left of ${keys[0]!.key}`;
  if (i >= keys.length) return `right of ${keys[keys.length - 1]!.key}`;
  return `between ${keys[i - 1]!.key} and ${keys[i]!.key}`;
}

/** Why k goes to child i: "25 < 30", "25 > 20 and 25 < 30", "45 > 40". */
export function why(keys: BKey[], i: number, k: number): string {
  if (keys.length === 0) return 'The node is empty';
  if (i === 0) return `${k} < ${keys[0]!.key}`;
  if (i >= keys.length) return `${k} > ${keys[keys.length - 1]!.key}`;
  return `${k} > ${keys[i - 1]!.key} and ${k} < ${keys[i]!.key}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export { plural };

// ---------------------------------------------------------------------------------------------
// Pseudocode shared by the pages. Lines stay within 33 characters, counting 2 per indent, so
// they fit the code panel on a phone without scrolling sideways.

export const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function searchLines(): PseudoLine[] {
  return [
    L('srch.sig', 0, 'search(x, k)', 'To find k under node x:'),
    L('srch.init', 1, 'i = 1', 'start at the first key.'),
    L('srch.loop', 1, 'while i ≤ x.n and k > x.key_i', 'While k is bigger than the key here,'),
    L('srch.inc', 2, 'i = i + 1', 'move one key right.'),
    L('srch.found', 1, 'if i ≤ x.n and k == x.key_i', 'If k is the key we stopped at,'),
    L('srch.ret', 2, 'return (x, i)', 'found it.'),
    L('srch.leaf', 1, 'elseif x.leaf: return nil', 'If x is a leaf, k is not in the tree.'),
    L('srch.read', 1, 'else DISK-READ(x.c_i)', 'Otherwise read the child left of that key'),
    L('srch.down', 2, 'return search(x.c_i, k)', 'and search there.'),
  ];
}

/** Insert with splits on the way back up. The page words the overflow test and the halves. */
export function upInsertLines(w: {
  over: string;
  plainOver: string;
  mid: string;
  keep: string;
  plainKeep: string;
}): PseudoLine[] {
  return [
    L('up.sig', 0, 'insert(T, k)', 'To insert key k:'),
    L('up.empty', 1, 'if T.root == nil', 'If the tree is empty,'),
    L('up.create', 2, 'T.root = new leaf', 'its root is a new, empty leaf.'),
    L('up.down', 1, 'x = leaf where k belongs', 'Walk down to the leaf where k belongs.'),
    L('up.dup', 1, 'if k is in the tree: return', 'If k is already there, stop.'),
    L('up.put', 1, 'put k into x, in order', 'Put k into that leaf, in order.'),
    L('up.over', 1, w.over, w.plainOver),
    L('up.mid', 2, w.mid, 'take its middle key m;'),
    L('up.split', 2, 'z = new node: keys after m', 'the keys after m go to a new node z,'),
    L('up.keep', 2, w.keep, w.plainKeep),
    L('up.root', 2, 'if x == T.root', 'If x was the root,'),
    L('up.newroot', 3, 'T.root = node(m; x, z)', 'm goes into a new root above x and z;'),
    L('up.parent', 2, 'else put m and z into x.p', 'otherwise m moves up into the parent.'),
    L('up.next', 2, 'x = x.p', 'Then check the parent.'),
  ];
}

// ---------------------------------------------------------------------------------------------
// Search: the same on both pages (CLRS's B-TREE-SEARCH, a linear scan in each node).

export function* searchOp(
  s: BState,
  raw: Value,
  readouts: Readouts,
): Generator<BStep, BState, void> {
  const k = parseKey(raw);
  if (k instanceof Error) return yield* badArg(s, readouts, 'search', raw, k, 'srch.sig');
  const c = makeCtx(s, readouts, { arg: { name: 'k', text: String(k) }, path: [] }, { k });
  const W = c.W;
  if (W.root === null) {
    c.vars.found = false;
    yield snap(c, `search(${k}): the tree is empty, so ${k} is not in it.`, ['srch.sig'], 1, []);
    return s;
  }
  let x = W.root;
  read(c, x);
  c.vars.i = 1;
  yield snap(
    c,
    `search(${k}): start at the root, ${label(W, x)}, and compare ${k} with its keys from the left.`,
    ['srch.sig', 'srch.init'],
    3,
    [nodeMark(x, 'active')],
  );
  for (;;) {
    const node = W.n(x);
    let i = 0;
    c.vars.i = 1;
    while (i < node.keys.length && k > node.keys[i]!.key) {
      yield snap(
        c,
        `${k} > ${node.keys[i]!.key}, so move one key to the right.`,
        ['srch.loop', 'srch.inc'],
        3,
        [nodeMark(x, 'active'), cellMark(node.keys[i]!, 'compare')],
      );
      i++;
      c.vars.i = i + 1;
    }
    const hit = node.keys[i];
    if (hit && hit.key === k) {
      c.vars.found = true;
      const r = Number(c.vars.reads);
      yield snap(
        c,
        `${k} = ${hit.key}: found it in ${label(W, x)}, after reading ${plural(r, 'node')}.`,
        ['srch.loop', 'srch.found', 'srch.ret'],
        1,
        [nodeMark(x, 'found'), cellMark(hit, 'found')],
      );
      return s;
    }
    const stop = hit ?? node.keys[node.keys.length - 1];
    const stopMark = stop ? [cellMark(stop, 'compare')] : [];
    if (W.leaf(x)) {
      c.vars.found = false;
      yield snap(
        c,
        `${why(node.keys, i, k)}, and ${label(W, x)} is a leaf, so there is nowhere left to look: ${k} is not in the tree. It would go ${between(node.keys, i)}.`,
        ['srch.loop', 'srch.found', 'srch.leaf'],
        1,
        [nodeMark(x, 'active'), ...stopMark],
      );
      return s;
    }
    const child = node.kids[i]!;
    read(c, child);
    yield snap(
      c,
      `${why(node.keys, i, k)}, so follow the pointer ${between(node.keys, i)} down to ${label(W, child)}.`,
      ['srch.loop', 'srch.found', 'srch.leaf', 'srch.read', 'srch.down'],
      2,
      [...stopMark, edgeMark(child, 'active'), nodeMark(child, 'active')],
    );
    x = child;
  }
}

// ---------------------------------------------------------------------------------------------
// Insert, splitting on the way back up: find the leaf, put the key in, and while a node holds
// one key too many, split it and push its middle key up into the parent.

export interface UpWords {
  /** Most keys a node may hold, in words: "2t - 1 = 5 keys" or "3 keys". */
  most: string;
  /** What an overflowing node holds: "2t = 6 keys" or "4 keys". */
  over: string;
  /** What the two halves of a split are, after "They": "keep t = 3 and t - 1 = 2 keys". */
  halves: string;
}

export function* insertUp(
  s: BState,
  k: number,
  t: number,
  words: UpWords,
  readouts: Readouts,
): Generator<BStep, BState, void> {
  const W = new Work(s);
  const uid = W.uid();
  const c: Ctx = {
    W,
    extra: { arg: { name: 'k', text: String(k), uid }, path: [] },
    vars: { k, reads: 0 },
    readouts,
  };
  const max = 2 * t - 1;
  if (W.root === null) {
    W.root = W.make([], []);
    yield snap(
      c,
      `insert(${k}): the tree is empty, so make an empty leaf to be the root.`,
      ['up.sig', 'up.empty', 'up.create'],
      2,
      [nodeMark(W.root, 'new')],
    );
  }
  // Walk down to the leaf where k belongs, remembering the path for the splits.
  const path: number[] = [];
  let x = W.root;
  read(c, x);
  for (;;) {
    path.push(x);
    const node = W.n(x);
    let i = 0;
    while (i < node.keys.length && k > node.keys[i]!.key) {
      yield snap(
        c,
        `${k} > ${node.keys[i]!.key}, so look further right in ${label(W, x)}.`,
        ['up.down'],
        3,
        [nodeMark(x, 'active'), cellMark(node.keys[i]!, 'compare')],
      );
      i++;
    }
    const hit = node.keys[i];
    if (hit && hit.key === k) {
      c.extra.arg = { ...c.extra.arg!, uid: undefined, error: true };
      yield snap(
        c,
        `${k} is already in ${label(W, x)}. Keys are not repeated, so the tree does not change.`,
        ['up.dup'],
        1,
        [nodeMark(x, 'found'), cellMark(hit, 'found'), mark('arg-box', 'error')],
      );
      return s;
    }
    if (W.leaf(x)) {
      node.keys.splice(i, 0, { uid, key: k });
      c.extra.arg = undefined;
      const over = node.keys.length > max;
      const st = W.snap();
      const others = node.keys.filter((y) => y.uid !== uid);
      const where = others.length ? `goes in ${between(others, i)}` : 'is its first key';
      yield snap(
        c,
        over
          ? `${label(W, x)} is a leaf, so ${k} ${where}. Now it holds ${words.over}, one more than the ${words.most} a node may hold: an overflow.`
          : `${label(W, x)} is a leaf with room, so ${k} ${where}. N = ${keysOf(st).length}, height = ${heightOf(st)}.`,
        ['up.put', ...(over ? ['up.over'] : [])],
        over ? 2 : 1,
        [cellMark(uid, 'new'), ...(over ? [nodeMark(x, 'error')] : [])],
      );
      break;
    }
    const child = node.kids[i]!;
    read(c, child);
    yield snap(
      c,
      `${why(node.keys, i, k)}, so go down the pointer ${between(node.keys, i)} to ${label(W, child)}.`,
      ['up.down'],
      2,
      [
        ...(hit ? [cellMark(hit, 'compare')] : []),
        edgeMark(child, 'active'),
        nodeMark(child, 'active'),
      ],
    );
    x = child;
  }

  // Split while a node overflows.
  let depth = path.length - 1;
  while (W.n(x).keys.length > max) {
    const node = W.n(x);
    const mid = node.keys[t]!;
    const before = label(W, x);
    const right = W.make(node.keys.slice(t + 1), node.kids.slice(t + 1));
    node.keys = node.keys.slice(0, t);
    node.kids = node.kids.slice(0, node.kids.length ? t + 1 : 0);
    W.splits++;
    const parent = depth > 0 ? path[depth - 1]! : null;
    let say: string;
    let lines: string[];
    if (parent === null) {
      W.root = W.make([mid], [x, right]);
      say = `Split ${before}: its middle key ${mid.key} moves up into a new root, and the two halves ${label(W, x)} and ${label(W, right)} become its children. They ${words.halves}, and the tree is one level taller.`;
      lines = ['up.mid', 'up.split', 'up.keep', 'up.root', 'up.newroot'];
    } else {
      const p = W.n(parent);
      const at = p.kids.indexOf(x);
      p.keys.splice(at, 0, mid);
      p.kids.splice(at + 1, 0, right);
      say = `Split ${before}: its middle key ${mid.key} moves up into the parent, which becomes ${label(W, parent)}. The halves, ${label(W, x)} and ${label(W, right)}, ${words.halves}.`;
      lines = ['up.mid', 'up.split', 'up.keep', 'up.root', 'up.parent'];
    }
    const top = parent ?? W.root!;
    const still = W.n(top).keys.length > max;
    const st = W.snap();
    yield snap(
      c,
      still
        ? `${say} Now the parent overflows: it holds ${words.over}.`
        : `${say} N = ${keysOf(st).length}, height = ${heightOf(st)}.`,
      still ? [...lines, 'up.next', 'up.over'] : lines,
      1,
      [
        cellMark(mid, 'active'),
        nodeMark(x, 'new'),
        nodeMark(right, 'new'),
        nodeMark(top, still ? 'error' : 'active'),
      ],
    );
    x = top;
    depth--;
  }
  return W.snap();
}
