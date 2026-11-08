/**
 * Persistent BST by path copying (Driscoll, Sarnak, Sleator and Tarjan): nodes never change. An
 * update copies the nodes on the path from the root to the change, and the copies point at the
 * old, unchanged subtrees. Every version keeps its own root, so every old version still works,
 * and versions share everything off the copied paths.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { nodeShapeId } from '../../layouts/binary-tree';
import { L, parseKey, plural } from '../_bst/tree-kit';

export interface PNode {
  uid: number;
  key: number;
  left: number | null;
  right: number | null;
  /** The version this node was made for, and its depth there (where it is drawn). */
  born: number;
  depth: number;
}

export interface Version {
  root: number | null;
  /** The version it was made from, and how. */
  from: number | null;
  op: string;
}

export interface PersistentState {
  nodes: Record<number, PNode>;
  versions: Version[];
  /** The version being looked at; updates start from it. */
  current: number;
  nextUid: number;
}

export interface PersistentSettings {
  [key: string]: Scalar;
}

export interface PersistentExtra {
  /** The operation's argument, drawn in a box at the top left. */
  arg?: { text: string; error?: boolean };
  /** Nodes walked so far. */
  path?: number[];
  /** Nodes made by this update so far. */
  made?: number[];
}

type S = PersistentState;
type X = PersistentExtra;
type Op = OpSpec<S, PersistentSettings, X>;
type PStep = Step<S, X>;

/** At most this many versions (v0 to v9), so the drawing stays readable. */
export const MAX_VERSIONS = 10;
export const defaults: PersistentSettings = {};

export function init(): S {
  return { nodes: {}, versions: [{ root: null, from: null, op: 'start' }], current: 0, nextUid: 1 };
}

/** Nodes reachable from a root. */
export function reach(s: { nodes: Record<number, PNode> }, root: number | null): number[] {
  const out: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    out.push(u);
    walk(s.nodes[u]!.left);
    walk(s.nodes[u]!.right);
  };
  walk(root);
  return out;
}

export function keysOf(s: S, v: number): number[] {
  const out: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    walk(s.nodes[u]!.left);
    out.push(s.nodes[u]!.key);
    walk(s.nodes[u]!.right);
  };
  walk(s.versions[v]!.root);
  return out;
}

export function heightOf(s: S, root: number | null): number {
  const h = (u: number | null): number =>
    u === null ? -1 : 1 + Math.max(h(s.nodes[u]!.left), h(s.nodes[u]!.right));
  return h(root);
}

export function readouts(s: S): Record<string, Scalar> {
  const v = s.versions[s.current]!;
  const mine = reach(s, v.root);
  return {
    viewing: `v${s.current}`,
    versions: s.versions.length,
    N: mine.length,
    'nodes in all': Object.keys(s.nodes).length,
    shared: mine.filter((u) => s.nodes[u]!.born !== s.current).length,
  };
}

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });
const nodeMark = (u: number, role: Mark['role']) => mk(nodeShapeId(u), role);
export const pedgeId = (p: number, side: 'left' | 'right') =>
  `pedge-${p}-${side === 'left' ? 'L' : 'R'}`;
export const vlabelId = (v: number) => `vlabel-${v}`;

function copyState(s: S): S {
  const nodes: Record<number, PNode> = {};
  for (const [k, n] of Object.entries(s.nodes)) nodes[Number(k)] = { ...n };
  return { ...s, nodes, versions: s.versions.map((v) => ({ ...v })) };
}

function make(
  s: S,
  extra: X,
  vars: Record<string, Scalar>,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[],
): PStep {
  const state = copyState(s);
  const x: X = { ...extra };
  if (x.path) x.path = [...x.path];
  if (x.made) x.made = [...x.made];
  return { state, marks, say, lines, level, extra: x, vars: { ...readouts(state), ...vars } };
}

function* refuse(s: S, call: string, raw: string, why: string, line: string) {
  yield make(
    s,
    { arg: { text: raw, error: true } },
    {},
    `${call}: ${why} Nothing changes.`,
    [line],
    1,
    [mk('arg-box', 'error')],
  );
  return s;
}

const fullWhy = `There are already ${MAX_VERSIONS} versions, as many as this page draws. Clear to start again.`;

// ---------------------------------------------------------------------------------------------
// Path copying, shared by insert and delete

interface Job {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
  v: number;
}

/** A fresh node for the new version. */
function fresh(
  j: Job,
  key: number,
  left: number | null,
  right: number | null,
  depth: number,
): number {
  const uid = j.s.nextUid;
  j.s.nextUid += 1;
  j.s.nodes[uid] = { uid, key, left, right, born: j.v, depth };
  j.extra.made!.push(uid);
  return uid;
}

/**
 * Copy the path bottom-up: path[i] gets a copy whose child on side sides[i] is the new subtree
 * below it. Returns the new root.
 */
function* copyUp(
  j: Job,
  path: number[],
  sides: ('left' | 'right')[],
  below: number | null,
): Generator<PStep, number | null, void> {
  let child = below;
  for (let i = path.length - 1; i >= 0; i--) {
    const old = j.s.nodes[path[i]!]!;
    const side = sides[i]!;
    const other = side === 'left' ? old.right : old.left;
    const u = fresh(
      j,
      old.key,
      side === 'left' ? child : old.left,
      side === 'right' ? child : old.right,
      i,
    );
    const childKey = child === null ? 'nil' : String(j.s.nodes[child]!.key);
    j.vars.copied = j.extra.made!.length;
    yield make(
      j.s,
      j.extra,
      j.vars,
      `Copy ${old.key}: the copy's ${side} child is ${child === null ? 'nil' : `the new ${childKey}`}${
        other === null
          ? ''
          : `, and its ${side === 'left' ? 'right' : 'left'} child is the old ${j.s.nodes[other]!.key}, shared, not copied`
      }. The old ${old.key} stays as it was.`,
      ['pc.copy'],
      2,
      [
        nodeMark(u, 'new'),
        nodeMark(old.uid, 'visit'),
        ...(other === null ? [] : [nodeMark(other, 'found')]),
      ],
    );
    child = u;
  }
  return child;
}

function* finish(j: Job, root: number | null, op: string, from: number): Generator<PStep, S, void> {
  j.s.versions.push({ root, from, op });
  j.s.current = j.v;
  const made = j.extra.made!.length;
  const mine = reach(j.s, root);
  j.extra.path = [];
  yield make(
    j.s,
    j.extra,
    { copied: made },
    `Version v${j.v} = ${op} on v${from}. It has ${plural(mine.length, 'node')}; ${plural(made, 'is', 'are')} new and ${mine.length - made} shared with older versions. v${from} is unchanged and can still be searched.`,
    ['pc.root'],
    1,
    [...j.extra.made!.map((u) => nodeMark(u, 'new')), mk(vlabelId(j.v), 'new')],
  );
  return j.s;
}

/** Walk down v's tree looking for k. Returns the path and the sides taken. */
function* walk(j: Job, k: number, name: string, line: string) {
  const path: number[] = [];
  const sides: ('left' | 'right')[] = [];
  j.extra.path = path;
  let x = j.s.versions[j.s.current]!.root;
  while (x !== null) {
    const n = j.s.nodes[x]!;
    path.push(x);
    if (n.key === k) return { path, sides, found: x };
    const side = k < n.key ? 'left' : 'right';
    sides.push(side);
    const next = n[side];
    yield make(
      j.s,
      j.extra,
      j.vars,
      `${name}: ${k} ${k < n.key ? '<' : '>'} ${n.key}, so go ${side}${next === null ? ', but there is nothing there.' : '.'} ${n.key} is on the path, so it will be copied.`,
      [line],
      2,
      [nodeMark(x, 'compare')],
    );
    x = next;
  }
  return { path, sides, found: null as number | null };
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error)
      return yield* refuse(s0, `insert(${String(raw)})`, String(raw), k.message, 'ins.sig');
    if (s0.versions.length >= MAX_VERSIONS)
      return yield* refuse(s0, `insert(${k})`, String(k), fullWhy, 'ins.sig');
    const from = s0.current;
    const j: Job = {
      s: copyState(s0),
      extra: { arg: { text: String(k) }, made: [] },
      vars: { k },
      v: s0.versions.length,
    };
    const name = `insert(${k}) on v${from}`;
    const { path, sides, found } = yield* walk(j, k, name, 'ins.walk');
    if (found !== null) {
      yield make(
        j.s,
        j.extra,
        j.vars,
        `${name}: ${k} is already in v${from}, so no new version is made.`,
        ['ins.walk'],
        1,
        [nodeMark(found, 'found'), mk('arg-box', 'error')],
      );
      return s0;
    }
    const leaf = fresh(j, k, null, null, path.length);
    j.vars.copied = 1;
    yield make(
      j.s,
      j.extra,
      j.vars,
      `Make a new leaf for ${k}. Nothing old may change, so instead of hanging it under ${path.length ? j.s.nodes[path.at(-1)!]!.key : 'a parent'}, copy the ${plural(path.length, 'node')} on the path, bottom up.`,
      ['ins.leaf'],
      2,
      [nodeMark(leaf, 'new')],
    );
    const root = yield* copyUp(j, path, sides, leaf);
    return yield* finish(j, root, `insert(${k})`, from);
  },
};

// ---------------------------------------------------------------------------------------------
// delete: CLRS cases, with copies instead of changes

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s0, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error)
      return yield* refuse(s0, `delete(${String(raw)})`, String(raw), k.message, 'del.sig');
    if (s0.versions.length >= MAX_VERSIONS)
      return yield* refuse(s0, `delete(${k})`, String(k), fullWhy, 'del.sig');
    const from = s0.current;
    const j: Job = {
      s: copyState(s0),
      extra: { arg: { text: String(k) }, made: [] },
      vars: { k },
      v: s0.versions.length,
    };
    const name = `delete(${k}) on v${from}`;
    const { path, sides, found: z } = yield* walk(j, k, name, 'del.walk');
    if (z === null) {
      yield make(
        j.s,
        j.extra,
        j.vars,
        `${name}: ${k} is not in v${from}, so no new version is made.`,
        ['del.walk'],
        1,
        [],
      );
      return s0;
    }
    const zn = j.s.nodes[z]!;
    const above = path.slice(0, -1);
    let below: number | null;
    if (zn.left === null || zn.right === null) {
      below = zn.left ?? zn.right;
      yield make(
        j.s,
        j.extra,
        j.vars,
        below === null
          ? `Found ${k}, a leaf. The new version simply leaves it out: copy the ${plural(above.length, 'node')} above it, and the copy of its parent gets nil.`
          : `Found ${k}, with one child. Its subtree (rooted at ${j.s.nodes[below]!.key}) takes its place, shared as it is; copy the ${plural(above.length, 'node')} above.`,
        ['del.walk', 'del.one'],
        2,
        [nodeMark(z, 'remove'), ...(below === null ? [] : [nodeMark(below, 'found')])],
      );
    } else {
      // Two children: the successor y moves up. Copy the path from z.right down to y's parent.
      const down: number[] = [];
      let y = zn.right!;
      while (j.s.nodes[y]!.left !== null) {
        down.push(y);
        y = j.s.nodes[y]!.left!;
      }
      const yn = j.s.nodes[y]!;
      yield make(
        j.s,
        j.extra,
        j.vars,
        `Found ${k}, with two children. Its successor, ${yn.key}, takes its place. ${
          down.length === 0
            ? `${yn.key} is ${k}'s right child, so nothing on the right needs copying.`
            : `Copy the ${plural(down.length, 'node')} from ${k}'s right child down to ${yn.key}'s parent, leaving ${yn.key} out.`
        }`,
        ['del.walk', 'del.two'],
        2,
        [nodeMark(z, 'remove'), nodeMark(y, 'found')],
      );
      // Copies along z.right ... y's parent; the bottom one takes y.right on its left.
      const depth0 = path.length;
      let child: number | null = yn.right;
      for (let i = down.length - 1; i >= 0; i--) {
        const old = j.s.nodes[down[i]!]!;
        child = fresh(j, old.key, child, old.right, depth0 + i);
      }
      const right = down.length === 0 ? yn.right : child;
      const y2 = fresh(j, yn.key, zn.left, right, path.length - 1);
      j.vars.copied = j.extra.made!.length;
      yield make(
        j.s,
        j.extra,
        j.vars,
        `A copy of ${yn.key} goes where ${k} was, with ${k}'s left subtree (shared) and the new right side. The old ${yn.key} stays where it was, in the old versions.`,
        ['del.two'],
        2,
        [...j.extra.made!.map((u) => nodeMark(u, 'new')), nodeMark(z, 'remove')],
      );
      below = y2;
    }
    const root = yield* copyUp(j, above, sides.slice(0, above.length), below);
    return yield* finish(j, root, `delete(${k})`, from);
  },
};

// ---------------------------------------------------------------------------------------------
// search, view, clear

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error)
      return yield* refuse(s, `search(${String(raw)})`, String(raw), k.message, 'srch.sig');
    const extra: X = { arg: { text: String(k) }, path: [] };
    const name = `search(${k}) in v${s.current}`;
    let x = s.versions[s.current]!.root;
    while (x !== null) {
      const n = s.nodes[x]!;
      extra.path!.push(x);
      if (n.key === k) break;
      const side = k < n.key ? 'left' : 'right';
      yield make(
        s,
        extra,
        { k },
        `${name}: ${k} ${k < n.key ? '<' : '>'} ${n.key}, so go ${side}.`,
        ['srch.loop'],
        2,
        [nodeMark(x, 'compare')],
      );
      x = n[side];
    }
    yield make(
      s,
      extra,
      { k, found: x !== null },
      x === null
        ? `${name}: fell off the tree, so ${k} is not in v${s.current}.`
        : `${name}: found ${k} after ${plural(extra.path!.length, 'comparison')}.`,
      ['srch.loop', 'srch.ret'],
      1,
      x === null ? [] : [nodeMark(x, 'found')],
    );
    return s;
  },
};

/** Read "2" or "v2". */
export function parseVersion(raw: Value, count: number): number | Error {
  const m = /^v?(\d+)$/i.exec(String(raw).trim());
  const n = m ? Number(m[1]) : NaN;
  if (!m || n >= count)
    return new Error(`Versions run from v0 to v${count - 1}: type a number such as ${count - 1}.`);
  return n;
}

const view: Op = {
  label: 'View version',
  arity: 1,
  *run(s0, [raw]) {
    const v = parseVersion(raw!, s0.versions.length);
    if (v instanceof Error)
      return yield* refuse(s0, `view(${String(raw)})`, String(raw), v.message, 'view.sig');
    const s = copyState(s0);
    s.current = v;
    const ver = s.versions[v]!;
    const keys = keysOf(s, v);
    yield make(
      s,
      {},
      {},
      `Viewing v${v}${ver.from === null ? ', the empty start' : `, made by ${ver.op} on v${ver.from}`}: ${keys.length ? `keys ${keys.join(' ')}` : 'no keys'}. Its nodes are drawn solid; the next update starts from it and makes a new version.`,
      ['view.root'],
      1,
      [mk(vlabelId(v), 'active'), ...reach(s, ver.root).map((u) => nodeMark(u, 'active'))],
    );
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { ...init(), nextUid: s.nextUid };
    yield make(
      empty,
      {},
      {},
      s.versions.length === 1 && s.versions[0]!.root === null
        ? 'clear(): there was only the empty v0.'
        : 'clear(): every version is gone; we start again from an empty v0.',
      ['clear.root'],
      1,
      [],
    );
    return empty;
  },
};

export const ops = { insert, delete: del, search, view, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(v, k)', 'To insert k into version v:'),
        L(
          'ins.walk',
          1,
          'path = search path for k in v',
          'walk down v as in a BST, remembering the path;',
        ),
        L('ins.leaf', 1, 'c = new node(k)', 'make a new leaf for k.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(v, k)', 'To delete k from version v:'),
        L(
          'del.walk',
          1,
          'path = search path to z, the node with k',
          'walk down to k, remembering the path;',
        ),
        L(
          'del.one',
          1,
          'if z has < 2 children: c = z’s child (shared)',
          'with at most one child, that child takes z’s place as it is;',
        ),
        L(
          'del.two',
          1,
          'else: c = copy of successor y, with copies down to y',
          'otherwise a copy of the successor does, with copies down to it.',
        ),
      ],
    },
    {
      op: 'copy',
      lines: [
        L('pc.sig', 0, 'pathCopy(path, c)', 'Then, nothing old is changed:'),
        L(
          'pc.copy',
          1,
          'for x in path, bottom up: c = copy of x with c as the child on the path',
          'copy each node on the path, pointing at the new child and the old other child;',
        ),
        L('pc.root', 1, 'versions.append(c)', 'the last copy is the root of the new version.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(v, k)', 'To find k in version v:'),
        L(
          'srch.loop',
          1,
          'x = v.root; while x ≠ nil and x.key ≠ k: go left or right',
          'walk down from v’s root as in any BST;',
        ),
        L('srch.ret', 1, 'return x', 'old versions answer exactly as they did when they were new.'),
      ],
    },
    {
      op: 'view',
      lines: [
        L('view.sig', 0, 'view(v)', 'To look at version v:'),
        L('view.root', 1, 'current = v', 'start from its root; the next update branches from it.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To start again:'),
        L('clear.root', 1, 'versions = [nil]', 'forget every version but an empty v0.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(): string {
  return 'v0 is an empty tree. Insert keys, such as 50 30 70 20: each one makes a new version, and every old version stays.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

export function describe(s: S): string {
  const parts = s.versions.map((v, i) => {
    const keys = keysOf(s, i);
    return `v${i}${v.from === null ? '' : ` (${v.op} on v${v.from})`}: ${keys.length ? keys.join(' ') : 'empty'}.`;
  });
  return `${plural(s.versions.length, 'version')} sharing ${plural(Object.keys(s.nodes).length, 'node')}, viewing v${s.current}. ${parts.join(' ')}`;
}
