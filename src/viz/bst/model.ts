import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { edgeShapeId, nodeShapeId } from '../../layouts/binary-tree';

export interface BSTNode {
  uid: number;
  key: number;
  /** Key-value mode: the value, or null when none was given. */
  value: string | null;
  /** How many times the key is in the tree (more than 1 only when duplicates are counted). */
  count: number;
  /** Keys in this subtree, counting duplicates. select and rank rely on it. */
  size: number;
  left: number | null;
  right: number | null;
  parent: number | null;
}

export interface BSTState {
  nodes: Record<number, BSTNode>;
  root: number | null;
  nextUid: number;
}

export interface BSTSettings {
  [key: string]: Scalar;
  /** Which node replaces a deleted node that has two children. CLRS uses the successor. */
  delete: 'successor' | 'predecessor';
  /** Inserting a key that is already there: reject it, or count it. */
  dupes: 'reject' | 'count';
  /** keys: the tree is a set of keys. pairs: a map from keys to values. */
  mode: 'keys' | 'pairs';
}

export type Side = 'left' | 'right';

export interface BSTExtra {
  /** The operation's argument, drawn in a box above the tree. */
  arg?: { name: string; text: string; uid?: number; value?: string | null; error?: boolean };
  /** Nodes looked at so far, in order. */
  path?: number[];
  /** A node lifted out of the tree during delete, drawn above the root. */
  held?: number;
  /** An empty child being looked at. */
  nil?: { parent: number; side: Side };
  /** Draw each node's subtree size (select and rank). */
  sizes?: boolean;
  /** Inorder: keys written so far, as [uid, copy] pairs (a counted key is written once per copy). */
  output?: [number, number][];
  /** Lower bound: the best candidate so far. */
  best?: number;
  /** Insert: the node that has just been created from the argument. */
  fresh?: number;
}

type S = BSTState;
type X = BSTExtra;
type Op = OpSpec<S, BSTSettings, X>;
type BSTStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const MAX_VALUE = 6;

export const defaults: BSTSettings = { delete: 'successor', dupes: 'reject', mode: 'keys' };

export function init(): S {
  return { nodes: {}, root: null, nextUid: 1 };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const nodeMark = (uid: number, role: Mark['role']) => mark(nodeShapeId(uid), role);

// ---------------------------------------------------------------------------------------------
// Arguments

export interface KeyArg {
  key: number;
  /** The value typed after "=", or null for a bare key. */
  value: string | null;
}

const KEY_RE = /^-?\d+$/;
const VALUE_RE = /^[A-Za-z0-9]+$/;

/** Read "42" or "42=apple". */
export function parseKeyArg(raw: Value): KeyArg | Error {
  const text = String(raw).trim();
  const [k = '', v, ...rest] = text.split('=');
  if (!KEY_RE.test(k.trim()) || rest.length)
    return new Error(
      `Keys are whole numbers from ${MIN_KEY} to ${MAX_KEY}, such as 42 or 42=apple.`,
    );
  const key = Number(k.trim());
  if (key < MIN_KEY || key > MAX_KEY)
    return new Error(`Keep keys between ${MIN_KEY} and ${MAX_KEY} so they fit in the nodes.`);
  if (v === undefined) return { key, value: null };
  const value = v.trim();
  if (!VALUE_RE.test(value))
    return new Error('A value is a short word or number, such as 42=apple.');
  if (value.length > MAX_VALUE) return new Error(`Keep values to ${MAX_VALUE} characters.`);
  return { key, value };
}

// ---------------------------------------------------------------------------------------------
// A working copy of the tree. Operations change it freely and yield snapshots.

class Work {
  nodes: Record<number, BSTNode>;
  root: number | null;
  nextUid: number;

  constructor(s: S) {
    this.nodes = Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, { ...n }]));
    this.root = s.root;
    this.nextUid = s.nextUid;
  }

  snap(): S {
    const nodes = Object.fromEntries(
      Object.entries(this.nodes).map(([k, n]) => [k, { ...n }]),
    ) as Record<number, BSTNode>;
    return { nodes, root: this.root, nextUid: this.nextUid };
  }

  n(uid: number): BSTNode {
    return this.nodes[uid]!;
  }

  key(uid: number): number {
    return this.n(uid).key;
  }

  size(uid: number | null): number {
    return uid === null ? 0 : this.n(uid).size;
  }

  /** Recompute every subtree size in the tree. */
  fixSizes(): void {
    const walk = (u: number | null): number => {
      if (u === null) return 0;
      const n = this.n(u);
      n.size = n.count + walk(n.left) + walk(n.right);
      return n.size;
    };
    walk(this.root);
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
    const n = this.n(u);
    n.parent = null;
    n.left = null;
    n.right = null;
    n.size = n.count;
  }
}

export function treeHeight(s: { nodes: Record<number, BSTNode>; root: number | null }): number {
  const h = (u: number | null): number =>
    u === null ? -1 : 1 + Math.max(h(s.nodes[u]!.left), h(s.nodes[u]!.right));
  return h(s.root);
}

export const sizeOf = (s: S) => (s.root === null ? 0 : s.nodes[s.root]!.size);

function cmp(k: number, key: number): string {
  return k < key ? `${k} < ${key}` : k > key ? `${k} > ${key}` : `${k} = ${key}`;
}

const show = (v: string | null) => (v === null ? 'no value' : v);

// ---------------------------------------------------------------------------------------------
// Steps

interface Ctx {
  W: Work;
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
): BSTStep {
  const state = c.W.snap();
  const extra: X = { ...c.extra, ...more };
  if (extra.path) extra.path = [...extra.path];
  if (extra.output) extra.output = extra.output.map((o) => [...o] as [number, number]);
  return {
    state,
    marks,
    say,
    lines,
    vars: { N: sizeOf(state), height: treeHeight(state), ...c.vars },
    level,
    extra,
  };
}

/** A step that reports a bad argument and changes nothing. */
function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = {
    W: new Work(s),
    extra: { arg: { name, text: String(raw), error: true } },
    vars: {},
  };
  yield step(c, `${name}(${String(raw)}): ${err.message} The tree is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

/**
 * Walk down from the root comparing k with each key, like search. Yields one step per
 * comparison. Returns the node holding k (or null) and the last node looked at.
 */
function* descend(
  c: Ctx,
  k: number,
  lines: { left: string[]; right: string[] },
  level: Level,
  name: string,
): Generator<BSTStep, { x: number | null; parent: number | null; side: Side | null }, void> {
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
    const nil = child === null ? { parent: x, side } : undefined;
    yield step(
      c,
      `${name}: ${cmp(k, key)}, ${where}`,
      side === 'left' ? lines.left : lines.right,
      level,
      [nodeMark(x, 'compare'), ...(child === null ? [mark('nil', 'active')] : [])],
      { nil },
    );
    parent = x;
    x = child;
  }
  c.vars.x = 'nil';
  // Keep showing where the walk fell off the tree.
  if (parent !== null && side !== null) c.extra.nil = { parent, side };
  return { x: null, parent, side };
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    const a = parseKeyArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'insert', raw!, a, 'ins.sig');
    const pairs = settings.mode === 'pairs';
    const { key: k } = a;
    const value = pairs ? a.value : null;
    const W = new Work(s);
    const uid = W.nextUid;
    const argText = String(k);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'k', text: argText, uid, value: pairs ? value : undefined } },
      vars: pairs ? { k, v: show(value) } : { k },
    };
    const name = `insert(${pairs && value !== null ? `${k}, ${value}` : k})`;
    const ignored =
      !pairs && a.value !== null
        ? ` This tree stores keys only, so the value ${a.value} is ignored (see Options).`
        : '';

    if (W.root === null) {
      yield step(
        c,
        `${name}: the tree is empty, so x = root = nil right away.${ignored}`,
        ['ins.init', 'ins.loop'],
        2,
        [mark(`key-${uid}`, 'active')],
      );
    } else {
      yield step(
        c,
        `${name}: start at the root, ${W.key(W.root)}. y trails one node behind x.${ignored}`,
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
        const node = W.n(x);
        if (pairs) {
          const old = node.value;
          node.value = value;
          c.extra.arg = undefined;
          yield step(
            c,
            `${name}: ${k} = ${key}, so ${k} is already a key. Its value changes from ${show(old)} to ${show(value)}; no new node.`,
            ['ins.loop', 'ins.trail', 'ins.eq', 'ins.dup'],
            1,
            [nodeMark(x, 'found')],
          );
          return W.snap();
        }
        if (settings.dupes === 'count') {
          node.count += 1;
          W.fixSizes();
          c.extra.arg = undefined;
          yield step(
            c,
            `${name}: ${k} = ${key}, so ${k} is already here. Duplicates are counted, so its count goes up to ${node.count}. N grows, but there is no new node.`,
            ['ins.loop', 'ins.trail', 'ins.eq', 'ins.dup'],
            1,
            [nodeMark(x, 'found')],
          );
          return W.snap();
        }
        yield step(
          c,
          `${name}: ${k} = ${key}, so ${k} is already in the tree. Duplicates are rejected, so nothing changes.`,
          ['ins.loop', 'ins.trail', 'ins.eq', 'ins.dup'],
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
        ['ins.loop', 'ins.trail', 'ins.eq', side === 'left' ? 'ins.left' : 'ins.right'],
        2,
        [
          nodeMark(x, 'compare'),
          ...(child === null ? [mark('nil', 'active')] : [mark(edgeShapeId(child), 'active')]),
        ],
        { nil: child === null ? { parent: x, side } : undefined },
      );
      x = child;
    }

    W.nodes[uid] = {
      uid,
      key: k,
      value,
      count: 1,
      size: 1,
      left: null,
      right: null,
      parent: y,
    };
    W.nextUid = uid + 1;
    let where: string;
    let lines: string[];
    if (y === null) {
      W.root = uid;
      where = `${k} becomes the root`;
      lines = ['ins.new', 'ins.root'];
    } else {
      const side: Side = k < W.key(y) ? 'left' : 'right';
      W.n(y)[side] = uid;
      where = `${k} becomes the ${side} child of ${W.key(y)}`;
      lines = ['ins.new', side === 'left' ? 'ins.attachL' : 'ins.attachR'];
    }
    W.fixSizes();
    c.extra.arg = undefined;
    c.extra.nil = undefined;
    c.extra.fresh = uid;
    c.vars.x = 'nil';
    const st = W.snap();
    yield step(
      c,
      `x is nil, so this is the spot: ${where}. Every node on the path now has one more key below it. N = ${sizeOf(st)}, height = ${treeHeight(st)}.`,
      [...lines, 'ins.size'],
      1,
      [nodeMark(uid, 'new'), ...(y === null ? [] : [mark(edgeShapeId(uid), 'active')])],
    );
    return st;
  },
};

// ---------------------------------------------------------------------------------------------
// search

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw], { settings }) {
    const a = parseKeyArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'search', raw!, a, 'srch.sig');
    const pairs = settings.mode === 'pairs';
    const k = a.key;
    const c: Ctx = { W: new Work(s), extra: { arg: { name: 'k', text: String(k) } }, vars: { k } };
    const name = `search(${k})`;
    if (s.root !== null) {
      yield step(c, `${name}: start at the root, ${c.W.key(s.root)}.`, ['srch.init'], 3, [
        nodeMark(s.root, 'active'),
      ]);
    }
    const { x } = yield* descend(
      c,
      k,
      { left: ['srch.loop', 'srch.left'], right: ['srch.loop', 'srch.right'] },
      2,
      name,
    );
    if (x === null) {
      c.vars.found = false;
      yield step(
        c,
        s.root === null
          ? `${name}: the tree is empty, so ${k} is not in it.`
          : `x is nil, so the search stops: ${k} is not in the tree. It would go where the nil is.`,
        ['srch.loop', 'srch.ret'],
        1,
        c.extra.nil ? [mark('nil', 'active')] : [],
      );
      return s;
    }
    c.vars.found = true;
    const node = c.W.n(x);
    if (pairs) c.vars.returned = show(node.value);
    yield step(
      c,
      pairs
        ? `${k} = ${node.key}: found it after ${c.extra.path!.length} ${c.extra.path!.length === 1 ? 'comparison' : 'comparisons'}. Its value is ${show(node.value)}.`
        : `${k} = ${node.key}: found it after ${c.extra.path!.length} ${c.extra.path!.length === 1 ? 'comparison' : 'comparisons'}.`,
      ['srch.loop', 'srch.ret'],
      1,
      [nodeMark(x, 'found')],
      { nil: undefined },
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// min, max

function extreme(which: 'min' | 'max'): Op {
  const side: Side = which === 'min' ? 'left' : 'right';
  return {
    label: which === 'min' ? 'Min' : 'Max',
    arity: 0,
    *run(s) {
      const c: Ctx = { W: new Work(s), extra: { path: [] }, vars: {} };
      const W = c.W;
      if (W.root === null) {
        c.vars.returned = 'nil';
        yield step(
          c,
          `${which}(): the tree is empty, so there is no ${which === 'min' ? 'smallest' : 'largest'} key.`,
          [`${which}.empty`],
          1,
          [],
        );
        return s;
      }
      let x = W.root;
      c.extra.path!.push(x);
      c.vars.x = W.key(x);
      yield step(c, `${which}(): start at the root, ${W.key(x)}.`, [`${which}.init`], 2, [
        nodeMark(x, 'active'),
      ]);
      for (let child = W.n(x)[side]; child !== null; child = W.n(x)[side]) {
        const from = W.key(x);
        x = child;
        c.extra.path!.push(x);
        c.vars.x = W.key(x);
        yield step(
          c,
          `${from} has a ${side} child, so go ${side} to ${W.key(x)}.`,
          [`${which}.loop`, `${which}.step`],
          2,
          [nodeMark(x, 'active'), mark(edgeShapeId(x), 'active')],
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
      return s;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// successor, predecessor

function neighbor(which: 'successor' | 'predecessor'): Op {
  const down: Side = which === 'successor' ? 'right' : 'left';
  const across: Side = which === 'successor' ? 'left' : 'right';
  const p = which === 'successor' ? 'succ' : 'pred';
  return {
    label: which === 'successor' ? 'Successor' : 'Predecessor',
    arity: 1,
    *run(s, [raw]) {
      const a = parseKeyArg(raw!);
      if (a instanceof Error) return yield* badArg(s, which, raw!, a, `${p}.sig`);
      const k = a.key;
      const name = `${which}(${k})`;
      const c: Ctx = {
        W: new Work(s),
        extra: { arg: { name: 'k', text: String(k) } },
        vars: { k },
      };
      const W = c.W;
      const { x: found } = yield* descend(
        c,
        k,
        { left: [`${p}.find`], right: [`${p}.find`] },
        3,
        name,
      );
      if (found === null) {
        c.vars.returned = 'nil';
        yield step(
          c,
          `${name}: ${k} is not in the tree, so it has no ${which} here. (Lower bound finds the smallest key ≥ ${k}.)`,
          [`${p}.find`, `${p}.missing`],
          1,
          c.extra.nil ? [mark('nil', 'active')] : [],
        );
        return s;
      }
      let x = found;
      c.extra.nil = undefined;
      c.extra.path = [x];
      c.vars.x = k;
      const sub = W.n(x)[down];
      if (sub !== null) {
        yield step(
          c,
          `Found ${k}. It has a ${down} subtree, so its ${which} is the ${which === 'successor' ? 'smallest' : 'largest'} key in there. Go ${down} to ${W.key(sub)}.`,
          [`${p}.find`, `${p}.has`, `${p}.sub`],
          2,
          [nodeMark(x, 'active'), nodeMark(sub, 'compare'), mark(edgeShapeId(sub), 'active')],
        );
        let y = sub;
        c.extra.path.push(y);
        for (let next = W.n(y)[across]; next !== null; next = W.n(y)[across]) {
          const from = W.key(y);
          y = next;
          c.extra.path.push(y);
          c.vars.y = W.key(y);
          yield step(
            c,
            `${from} has a ${across} child, so go ${across} to ${W.key(y)}.`,
            [`${p}.sub`],
            2,
            [nodeMark(found, 'active'), nodeMark(y, 'compare'), mark(edgeShapeId(y), 'active')],
          );
        }
        c.vars.returned = W.key(y);
        yield step(
          c,
          `${W.key(y)} has no ${across} child, so it is the one: ${name} = ${W.key(y)}.`,
          [`${p}.sub`],
          1,
          [nodeMark(found, 'active'), nodeMark(y, 'found')],
        );
        return s;
      }
      yield step(
        c,
        `Found ${k}. It has no ${down} subtree, so climb up until we arrive at a node from its ${across} side.`,
        [`${p}.find`, `${p}.has`, `${p}.up`],
        2,
        [nodeMark(x, 'active')],
      );
      let y = W.n(x).parent;
      while (y !== null && W.n(y)[down] === x) {
        c.extra.path.push(y);
        c.vars.y = W.key(y);
        yield step(
          c,
          `${W.key(x)} is the ${down} child of ${W.key(y)}, so ${W.key(y)} is ${which === 'successor' ? 'smaller' : 'larger'} than ${k}. Keep climbing.`,
          [`${p}.loop`, `${p}.climb`],
          2,
          [nodeMark(found, 'active'), nodeMark(y, 'compare'), mark(edgeShapeId(x), 'active')],
        );
        x = y;
        y = W.n(y).parent;
      }
      if (y === null) {
        c.vars.y = 'nil';
        c.vars.returned = 'nil';
        yield step(
          c,
          `We climbed past the root: ${k} is the ${which === 'successor' ? 'largest' : 'smallest'} key, so it has no ${which}.`,
          [`${p}.loop`, `${p}.ret`],
          1,
          [nodeMark(found, 'active')],
        );
        return s;
      }
      c.extra.path.push(y);
      c.vars.y = W.key(y);
      c.vars.returned = W.key(y);
      yield step(
        c,
        `${W.key(x)} is the ${across} child of ${W.key(y)}, so stop: ${name} = ${W.key(y)}.`,
        [`${p}.loop`, `${p}.ret`],
        1,
        [nodeMark(found, 'active'), nodeMark(y, 'found'), mark(edgeShapeId(x), 'active')],
      );
      return s;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// select, rank

export const ordinal = (n: number) => {
  const t = Math.abs(n) % 100;
  const u = Math.abs(n) % 10;
  const suffix =
    t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

const select: Op = {
  label: 'Select',
  arity: 1,
  *run(s, [raw], { settings }) {
    const a = parseKeyArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'select', raw!, a, 'sel.sig');
    const counted = settings.dupes === 'count';
    const want = a.key;
    let i = want;
    const name = `select(${want})`;
    const c: Ctx = {
      W: new Work(s),
      extra: { arg: { name: 'i', text: String(want) }, sizes: true, path: [] },
      vars: { i },
    };
    const W = c.W;
    const n = sizeOf(s);
    if (i < 1 || i > n) {
      c.vars.returned = 'nil';
      yield step(
        c,
        n === 0
          ? `${name}: the tree is empty, so there is no ${ordinal(want)} smallest key.`
          : `${name}: i has to be between 1 and N = ${n}, so there is no ${ordinal(want)} smallest key.`,
        ['sel.range'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    let x = W.root;
    while (x !== null) {
      c.extra.path!.push(x);
      const node = W.n(x);
      const L = W.size(node.left);
      c.vars.x = node.key;
      const lo = L + 1;
      const hi = L + node.count;
      const sizeSay = `${node.key}'s left subtree holds ${L} ${L === 1 ? 'key' : 'keys'}`;
      c.vars[counted ? 'L' : 'r'] = counted ? L : lo;
      const place =
        counted && node.count > 1
          ? `${node.key} fills places ${lo} to ${hi} in this subtree`
          : `${node.key} is the ${ordinal(lo)} smallest in this subtree (r = ${lo})`;
      if (i >= lo && i <= hi) {
        c.vars.returned = node.key;
        yield step(
          c,
          `${sizeSay}, so ${place}. i = ${i} lands here: ${name} = ${node.key}.`,
          ['sel.r', 'sel.found'],
          1,
          [nodeMark(x, 'found'), mark(`size-${x}`, 'found')],
        );
        return s;
      }
      if (i < lo) {
        yield step(
          c,
          `${sizeSay}, so ${place}. i = ${i} is smaller: the answer is in the left subtree. Go left.`,
          ['sel.r', 'sel.left'],
          2,
          [nodeMark(x, 'compare'), mark(`size-${x}`, 'active')],
        );
        x = node.left;
      } else {
        const skip = hi;
        yield step(
          c,
          `${sizeSay}, so ${place}. i = ${i} is bigger: skip ${skip === 1 ? 'that 1 key' : `those ${skip} keys`} and go right with i = ${i} - ${skip} = ${i - skip}.`,
          ['sel.r', 'sel.else', 'sel.skip', 'sel.right'],
          2,
          [nodeMark(x, 'compare'), mark(`size-${x}`, 'active')],
        );
        i -= skip;
        c.vars.i = i;
        x = node.right;
      }
    }
    // Unreachable when sizes are right: 1 <= i <= N always finds a node.
    c.vars.returned = 'nil';
    yield step(c, `${name}: no such key.`, ['sel.none'], 1, []);
    return s;
  },
};

const rank: Op = {
  label: 'Rank',
  arity: 1,
  *run(s, [raw]) {
    const a = parseKeyArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'rank', raw!, a, 'rank.sig');
    const k = a.key;
    const name = `rank(${k})`;
    const c: Ctx = {
      W: new Work(s),
      extra: { arg: { name: 'k', text: String(k) }, sizes: true, path: [] },
      vars: { k, r: 0 },
    };
    const W = c.W;
    let r = 0;
    let x = W.root;
    if (x !== null) {
      yield step(
        c,
        `${name}: r counts the keys smaller than ${k}. Start with r = 0 at the root.`,
        ['rank.init'],
        3,
        [nodeMark(x, 'active')],
      );
    }
    while (x !== null) {
      c.extra.path!.push(x);
      const node = W.n(x);
      c.vars.x = node.key;
      const L = W.size(node.left);
      if (k < node.key) {
        c.extra.nil = node.left === null ? { parent: x, side: 'left' } : undefined;
        yield step(
          c,
          `${cmp(k, node.key)}: ${node.key} and everything to its right are bigger. Go left; r stays ${r}.`,
          ['rank.loop', 'rank.left'],
          2,
          [nodeMark(x, 'compare'), ...(c.extra.nil ? [mark('nil', 'active')] : [])],
        );
        x = node.left;
      } else if (k > node.key) {
        const add = L + node.count;
        const before = r;
        r += add;
        c.vars.r = r;
        c.extra.nil = node.right === null ? { parent: x, side: 'right' } : undefined;
        yield step(
          c,
          `${cmp(k, node.key)}: ${node.key} and its left subtree (${L} ${L === 1 ? 'key' : 'keys'}) are all smaller. r = ${before} + ${L} + ${node.count} = ${r}. Go right.`,
          ['rank.loop', 'rank.gt', 'rank.add', 'rank.right'],
          2,
          [
            nodeMark(x, 'compare'),
            mark(`size-${x}`, 'active'),
            ...(c.extra.nil ? [mark('nil', 'active')] : []),
          ],
        );
        x = node.right;
      } else {
        const result = r + L + 1;
        c.vars.returned = result;
        c.extra.nil = undefined;
        yield step(
          c,
          `${k} = ${node.key}: found it. Its left subtree adds ${L} smaller ${L === 1 ? 'key' : 'keys'}, so ${r + L} ${r + L === 1 ? 'key is' : 'keys are'} smaller and ${name} = ${r + L} + 1 = ${result}.`,
          ['rank.loop', 'rank.found'],
          1,
          [nodeMark(x, 'found'), mark(`size-${x}`, 'found')],
        );
        return s;
      }
    }
    c.vars.returned = 'nil';
    yield step(
      c,
      s.root === null
        ? `${name}: the tree is empty, so ${k} has no rank.`
        : `x is nil: ${k} is not in the tree, so it has no rank. (${r} ${r === 1 ? 'key is' : 'keys are'} smaller than it.)`,
      ['rank.loop', 'rank.missing'],
      1,
      c.extra.nil ? [mark('nil', 'active')] : [],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// lower bound

const lowerbound: Op = {
  label: 'Lower bound',
  arity: 1,
  *run(s, [raw]) {
    const a = parseKeyArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'lowerBound', raw!, a, 'lb.sig');
    const k = a.key;
    const name = `lowerBound(${k})`;
    const c: Ctx = {
      W: new Work(s),
      extra: { arg: { name: 'k', text: String(k) }, path: [] },
      vars: { k, best: 'nil' },
    };
    const W = c.W;
    let best: number | null = null;
    let x = W.root;
    if (x !== null) {
      yield step(
        c,
        `${name}: look for the smallest key ≥ ${k}. No candidate yet: best = nil.`,
        ['lb.init'],
        3,
        [nodeMark(x, 'active')],
      );
    }
    while (x !== null) {
      c.extra.path!.push(x);
      const node = W.n(x);
      c.vars.x = node.key;
      if (node.key >= k) {
        best = x;
        c.extra.best = x;
        c.vars.best = node.key;
        yield step(
          c,
          `${node.key} ≥ ${k}, so ${node.key} is the best candidate so far. A smaller one could only be on the left: go left.`,
          ['lb.loop', 'lb.ge', 'lb.left'],
          2,
          [nodeMark(x, 'found')],
          { nil: node.left === null ? { parent: x, side: 'left' } : undefined },
        );
        x = node.left;
      } else {
        yield step(
          c,
          `${node.key} < ${k}: too small, and so is its whole left subtree. Go right.`,
          ['lb.loop', 'lb.ge', 'lb.right'],
          2,
          [nodeMark(x, 'compare'), ...(best === null ? [] : [nodeMark(best, 'found')])],
          { nil: node.right === null ? { parent: x, side: 'right' } : undefined },
        );
        x = node.right;
      }
    }
    c.vars.returned = best === null ? 'nil' : W.key(best);
    yield step(
      c,
      best === null
        ? `x is nil and there is no candidate: no key is ≥ ${k}, so ${name} = nil.`
        : `x is nil, so the search is over: ${name} = ${W.key(best)}, the smallest key ≥ ${k}.`,
      ['lb.loop', 'lb.ret'],
      1,
      best === null ? [] : [nodeMark(best, 'found')],
      { nil: undefined },
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// inorder

const inorder: Op = {
  label: 'Inorder',
  arity: 0,
  *run(s) {
    const c: Ctx = { W: new Work(s), extra: { output: [] }, vars: { output: '' } };
    const W = c.W;
    const out = c.extra.output!;
    const keys: number[] = [];
    if (W.root === null) {
      yield step(
        c,
        'inorder(): the tree is empty, so there is nothing to list.',
        ['in.check'],
        1,
        [],
      );
      return s;
    }
    const steps: BSTStep[] = [];
    const walk = (u: number | null) => {
      if (u === null) return;
      const node = W.n(u);
      walk(node.left);
      for (let copy = 0; copy < node.count; copy++) {
        out.push([u, copy]);
        keys.push(node.key);
      }
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
          [nodeMark(u, 'active'), mark(`out-${u}-0`, 'new')],
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
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// delete

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const a = parseKeyArg(raw!);
    if (a instanceof Error) return yield* badArg(s, 'delete', raw!, a, 'del.sig');
    const k = a.key;
    const name = `delete(${k})`;
    const W = new Work(s);
    const c: Ctx = { W, extra: { arg: { name: 'k', text: String(k) } }, vars: { k } };
    const succ = settings.delete === 'successor';
    if (W.root !== null) {
      yield step(
        c,
        `${name}: first find the node z that holds ${k}. Start at the root.`,
        ['del.find'],
        3,
        [nodeMark(W.root, 'active')],
      );
    }
    const { x: z } = yield* descend(c, k, { left: ['del.find'], right: ['del.find'] }, 2, name);
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

    if (settings.dupes === 'count' && zn.count > 1) {
      zn.count -= 1;
      W.fixSizes();
      yield step(
        c,
        `${k} = ${k}: found it. ${k} is in the tree ${zn.count + 1} times, so its count drops to ${zn.count}. No node is removed.`,
        ['del.find', 'del.count'],
        1,
        [nodeMark(z, 'found')],
      );
      return W.snap();
    }

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

    const finish = (held: number, say: string, lines: string[], marks: Mark[]) => {
      W.fixSizes();
      c.extra.held = held;
      return step(c, say, lines, 2, marks);
    };

    if (zn.left === null || zn.right === null) {
      const noLeft = zn.left === null;
      const child = noLeft ? zn.right : zn.left;
      W.transplant(z, child);
      W.detach(z);
      yield finish(
        z,
        child === null
          ? `${k} has no children, so it simply leaves the tree. Its parent gets nil in its place.`
          : noLeft
            ? `${k} has no left child, so its right subtree (rooted at ${W.key(child)}) moves up into its place.`
            : `${k} has no right child, so its left subtree (rooted at ${W.key(child)}) moves up into its place.`,
        noLeft ? ['del.noleft', 'del.right'] : ['del.noleft', 'del.noright', 'del.left'],
        [nodeMark(z, 'remove'), ...(child === null ? [] : [nodeMark(child, 'active')])],
      );
    } else {
      // Two children: y is the successor (smallest in the right subtree) or predecessor.
      const down: Side = succ ? 'right' : 'left';
      const across: Side = succ ? 'left' : 'right';
      const which = succ ? 'successor' : 'predecessor';
      let y = zn[down]!;
      c.extra.path = [y];
      c.vars.y = W.key(y);
      yield step(
        c,
        `Replace ${k} by its ${which} y: the ${succ ? 'smallest' : 'largest'} key in its ${down} subtree. Go ${down} to ${W.key(y)}.`,
        ['del.noleft', 'del.noright', 'del.else', 'del.y'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'compare'), mark(edgeShapeId(y), 'active')],
      );
      for (let next = W.n(y)[across]; next !== null; next = W.n(y)[across]) {
        const from = W.key(y);
        y = next;
        c.extra.path.push(y);
        c.vars.y = W.key(y);
        yield step(
          c,
          `${from} has a ${across} child, so go ${across} to ${W.key(y)}.`,
          ['del.y'],
          2,
          [nodeMark(z, 'remove'), nodeMark(y, 'compare'), mark(edgeShapeId(y), 'active')],
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
        const rest = yn[down];
        W.transplant(y, rest);
        W.detach(y);
        yield finish(
          y,
          rest === null
            ? `${yk} is not ${k}'s own ${down} child. Lift it out of its spot, which stays empty because ${yk} has no children.`
            : `${yk} is not ${k}'s own ${down} child. Lift it out; its ${down} child, ${W.key(rest)}, moves up into its spot.`,
          ['del.far', 'del.splice'],
          [
            nodeMark(z, 'remove'),
            nodeMark(y, 'active'),
            ...(rest === null ? [] : [nodeMark(rest, 'active')]),
          ],
        );
        // y takes z's subtree on the far side, then z's place, then z's other subtree.
        const zNow = W.n(z);
        const yNow = W.n(y);
        yNow[down] = zNow[down];
        W.n(zNow[down]!).parent = y;
        W.transplant(z, y);
        yNow[across] = zNow[across];
        W.n(zNow[across]!).parent = y;
        W.detach(z);
        yield finish(
          z,
          `${yk} takes ${k}'s place and both of its subtrees: ${W.key(yNow.left!)} on the left and ${W.key(yNow.right!)} on the right.`,
          ['del.adopt', 'del.replace', 'del.adopt2'],
          [nodeMark(z, 'remove'), nodeMark(y, 'active')],
        );
      } else {
        const zNow = W.n(z);
        const yNow = W.n(y);
        W.transplant(z, y);
        yNow[across] = zNow[across];
        W.n(zNow[across]!).parent = y;
        W.detach(z);
        yield finish(
          z,
          `${yk} is ${k}'s own ${down} child, so it moves up into ${k}'s place, keeps its ${down} subtree, and takes ${k}'s ${across} subtree (${W.key(yNow[across]!)}).`,
          ['del.far', 'del.replace', 'del.adopt2'],
          [nodeMark(z, 'remove'), nodeMark(y, 'active')],
        );
      }
    }

    delete W.nodes[z];
    W.fixSizes();
    c.extra.held = undefined;
    const st = W.snap();
    yield step(
      c,
      `${k} is gone and every key is still in order. N = ${sizeOf(st)}, height = ${treeHeight(st)}.`,
      ['del.size'],
      1,
      [],
    );
    return st;
  },
};

// ---------------------------------------------------------------------------------------------
// clear

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { nodes: {}, root: null, nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say:
        s.root === null
          ? 'clear(): the tree was already empty.'
          : 'clear(): root = nil. Every node is gone (a garbage collector, or a postorder walk in C++, frees them).',
      lines: ['clear.root'],
      vars: { N: 0, height: -1 },
      level: 1,
    } satisfies BSTStep;
    return empty;
  },
};

export const ops = {
  insert,
  delete: del,
  search,
  min: extreme('min'),
  max: extreme('max'),
  predecessor: neighbor('predecessor'),
  successor: neighbor('successor'),
  select,
  rank,
  lowerbound,
  inorder,
  clear,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: BSTSettings): PseudoBlock[] {
  const pairs = settings.mode === 'pairs';
  const counted = !pairs && settings.dupes === 'count';
  const succ = settings.delete === 'successor';
  const down = succ ? 'right' : 'left';
  const across = succ ? 'left' : 'right';
  const dup = pairs
    ? L('ins.dup', 3, 'x.value = v; return', 'it is already there: just update its value.')
    : counted
      ? L('ins.dup', 3, 'x.count += 1; return', 'it is already there: count it once more.')
      : L('ins.dup', 3, 'return  // no duplicates', 'it is already there: stop, change nothing.');
  return [
    {
      op: 'insert',
      lines: [
        L(
          'ins.sig',
          0,
          pairs ? 'insert(k, v)' : 'insert(k)',
          pairs ? 'To insert key k with value v:' : 'To insert key k:',
        ),
        L('ins.init', 1, 'y = nil; x = root', 'Start at the root; y will trail one step behind.'),
        L('ins.loop', 1, 'while x ≠ nil', 'Until we fall off the tree:'),
        L('ins.trail', 2, 'y = x', 'remember this node,'),
        L('ins.eq', 2, 'if k == x.key', 'if k is the key here,'),
        dup,
        L('ins.left', 2, 'elseif k < x.key: x = x.left', 'if k is smaller, go left;'),
        L('ins.right', 2, 'else x = x.right', 'if it is bigger, go right.'),
        L(
          'ins.new',
          1,
          pairs ? 'z = Node(k, v); z.p = y' : 'z = Node(k); z.p = y',
          'Make a node whose parent is the last node we saw.',
        ),
        L('ins.root', 1, 'if y == nil: root = z', 'If the tree was empty, it is the root;'),
        L('ins.attachL', 1, 'elseif k < y.key: y.left = z', 'otherwise it hangs to the left'),
        L('ins.attachR', 1, 'else y.right = z', 'or the right of that node.'),
        L(
          'ins.size',
          1,
          'add 1 to size on path to root',
          'Each node above it has one more key below.',
        ),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = search(k)', 'find the node z that holds k.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        ...(counted
          ? [
              L(
                'del.count',
                1,
                'if z.count > 1: z.count -= 1; return',
                'If k is there more than once, count one fewer and stop.',
              ),
            ]
          : []),
        L('del.noleft', 1, 'if z.left == nil', 'If z has no left child,'),
        L(
          'del.right',
          2,
          'transplant(z, z.right)',
          'its right subtree (maybe empty) takes its place.',
        ),
        L('del.noright', 1, 'elseif z.right == nil', 'If z has no right child,'),
        L('del.left', 2, 'transplant(z, z.left)', 'its left subtree takes its place.'),
        L('del.else', 1, 'else', 'Otherwise z has two children:'),
        L(
          'del.y',
          2,
          succ ? 'y = min(z.right)' : 'y = max(z.left)',
          succ
            ? 'y is the smallest key in its right subtree,'
            : 'y is the largest key in its left subtree,',
        ),
        L('del.far', 2, `if y ≠ z.${down}`, `and if y is deeper than z's own ${down} child,`),
        L(
          'del.splice',
          3,
          `transplant(y, y.${down})`,
          `lift y out; its ${down} child takes its spot,`,
        ),
        L('del.adopt', 3, `y.${down} = z.${down}`, `and y takes z's ${down} subtree.`),
        L('del.replace', 2, 'transplant(z, y)', 'Put y where z was'),
        L('del.adopt2', 2, `y.${across} = z.${across}`, `and give it z's ${across} subtree.`),
        L(
          'del.size',
          1,
          'fix sizes on the path to root',
          'Each node above the change has one key fewer below.',
        ),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To find key k:'),
        L('srch.init', 1, 'x = root', 'start at the root.'),
        L('srch.loop', 1, 'while x ≠ nil and k ≠ x.key', 'Until we find k or fall off the tree:'),
        L('srch.left', 2, 'if k < x.key: x = x.left', 'if k is smaller, go left,'),
        L('srch.right', 2, 'else x = x.right', 'otherwise go right.'),
        L(
          'srch.ret',
          1,
          pairs ? 'return x == nil ? nil : x.value' : 'return x',
          pairs
            ? "Hand back x's value (nil if k was not found)."
            : 'Hand back the node (nil if k was not found).',
        ),
      ],
    },
    ...(['min', 'max'] as const).map((w) => {
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
    }),
    ...(['predecessor', 'successor'] as const).map((w) => {
      const p = w === 'successor' ? 'succ' : 'pred';
      const dn = w === 'successor' ? 'right' : 'left';
      const ac = w === 'successor' ? 'left' : 'right';
      return {
        op: w,
        lines: [
          L(
            `${p}.sig`,
            0,
            `${w}(k)`,
            `To find the key just ${w === 'successor' ? 'after' : 'before'} k:`,
          ),
          L(`${p}.find`, 1, 'x = search(k)', 'find the node x that holds k.'),
          L(`${p}.missing`, 1, 'if x == nil: return nil', 'If k is not there, there is no answer.'),
          L(`${p}.has`, 1, `if x.${dn} ≠ nil`, `If x has a ${dn} subtree,`),
          L(
            `${p}.sub`,
            2,
            `return ${w === 'successor' ? 'min' : 'max'}(x.${dn})`,
            `the answer is its ${w === 'successor' ? 'smallest' : 'largest'} key.`,
          ),
          L(`${p}.up`, 1, 'y = x.p', 'Otherwise climb up from x:'),
          L(
            `${p}.loop`,
            1,
            `while y ≠ nil and x == y.${dn}`,
            `while we come up from a ${dn} side,`,
          ),
          L(`${p}.climb`, 2, 'x = y; y = y.p', 'keep climbing.'),
          L(
            `${p}.ret`,
            1,
            'return y',
            `The first node we reach from its ${ac} side is the answer (nil past the root).`,
          ),
        ],
      };
    }),
    {
      op: 'select',
      lines: [
        L('sel.sig', 0, 'select(i)', 'To find the i-th smallest key (1 is the smallest):'),
        L('sel.range', 1, 'if i < 1 or i > size(root): nil', 'i must be between 1 and N.'),
        L('sel.init', 1, 'x = root', 'Start at the root.'),
        L('sel.loop', 1, 'while x ≠ nil', 'At each node:'),
        counted
          ? L('sel.r', 2, 'L = size(x.left)', 'count the keys in its left subtree.')
          : L('sel.r', 2, 'r = size(x.left) + 1', 'its place among this subtree is r.'),
        counted
          ? L('sel.left', 2, 'if i ≤ L: x = x.left', 'If i is within the left subtree, go left.')
          : L('sel.left', 2, 'if i < r: x = x.left', 'If i is smaller, the answer is to the left.'),
        counted
          ? L(
              'sel.found',
              2,
              'elseif i ≤ L + x.count: return x',
              "If i lands on this key's copies, this is it.",
            )
          : L('sel.found', 2, 'elseif i == r: return x', 'If i is r, this is it.'),
        L('sel.else', 2, 'else', 'Otherwise the answer is to the right:'),
        counted
          ? L('sel.skip', 3, 'i = i - L - x.count', 'skip the left subtree and this key,')
          : L('sel.skip', 3, 'i = i - r', 'skip the r smaller keys,'),
        L('sel.right', 3, 'x = x.right', 'and go right.'),
        L('sel.none', 1, 'return nil', 'Never reached when i is in range.'),
      ],
    },
    {
      op: 'rank',
      lines: [
        L('rank.sig', 0, 'rank(k)', "To find k's place in sorted order (1 is the smallest):"),
        L('rank.init', 1, 'r = 0; x = root', 'count smaller keys in r, starting at the root.'),
        L('rank.loop', 1, 'while x ≠ nil', 'At each node:'),
        L(
          'rank.left',
          2,
          'if k < x.key: x = x.left',
          'if k is smaller, go left (nothing to count);',
        ),
        L('rank.gt', 2, 'elseif k > x.key', 'if k is bigger,'),
        L(
          'rank.add',
          3,
          counted ? 'r += size(x.left) + x.count' : 'r = r + size(x.left) + 1',
          'this node and its left subtree are all smaller: count them,',
        ),
        L('rank.right', 3, 'x = x.right', 'then go right;'),
        L(
          'rank.found',
          2,
          'else return r + size(x.left) + 1',
          'if k is here, add its left subtree, plus 1.',
        ),
        L('rank.missing', 1, 'return nil', 'k is not in the tree.'),
      ],
    },
    {
      op: 'lowerbound',
      lines: [
        L('lb.sig', 0, 'lowerBound(k)', 'To find the smallest key that is at least k:'),
        L('lb.init', 1, 'best = nil; x = root', 'no candidate yet; start at the root.'),
        L('lb.loop', 1, 'while x ≠ nil', 'At each node:'),
        L('lb.ge', 2, 'if x.key ≥ k', 'if its key is big enough,'),
        L(
          'lb.left',
          3,
          'best = x; x = x.left',
          'it is the best so far; look left for smaller ones;',
        ),
        L('lb.right', 2, 'else x = x.right', 'otherwise it is too small: go right.'),
        L('lb.ret', 1, 'return best', 'The last candidate is the answer.'),
      ],
    },
    {
      op: 'inorder',
      lines: [
        L('in.sig', 0, 'inorder(x)', 'To list the keys at x in sorted order:'),
        L('in.check', 1, 'if x ≠ nil', 'if there is a node here,'),
        L('in.left', 2, 'inorder(x.left)', 'first list the smaller keys (left),'),
        L('in.visit', 2, 'visit(x)', 'then this key,'),
        L('in.right', 2, 'inorder(x.right)', 'then the bigger keys (right).'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To empty the tree:'),
        L('clear.root', 1, 'root = nil', 'forget the root; every node goes with it.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(_s: S, settings: BSTSettings): string {
  const what = settings.mode === 'pairs' ? 'key-value pairs (type 42=apple)' : 'keys';
  return `An empty binary search tree. Insert some ${what}, or pick a preset shape.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return { N: sizeOf(s), height: treeHeight(s) };
}

/** Screen-reader summary: size, height, and the keys with their children. */
export function describe(s: S, settings?: BSTSettings): string {
  if (s.root === null) return 'An empty binary search tree.';
  const parts: string[] = [];
  const label = (u: number) => {
    const n = s.nodes[u]!;
    const extra =
      settings?.mode === 'pairs' ? ` (${show(n.value)})` : n.count > 1 ? ` (${n.count} times)` : '';
    return `${n.key}${extra}`;
  };
  const walk = (u: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    walk(n.left);
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    parts.push(kids.length ? `${label(u)} has ${kids.join(' and ')}.` : `${label(u)} is a leaf.`);
    walk(n.right);
  };
  walk(s.root);
  const n = sizeOf(s);
  return `A binary search tree with ${n} ${n === 1 ? 'key' : 'keys'} and height ${treeHeight(s)}. The root is ${s.nodes[s.root]!.key}. ${parts.join(' ')}`;
}
