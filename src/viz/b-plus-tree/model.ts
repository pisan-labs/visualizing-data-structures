import type { Mark, OpSpec, PseudoBlock, Scalar, Value } from '../../engine/types';
import {
  badArg,
  between,
  cellMark,
  edgeMark,
  emptyState,
  heightOf,
  L,
  label,
  levelsOf,
  makeCtx,
  mark,
  nodeCount,
  nodeMark,
  parseKey,
  plural,
  read,
  snap,
  Work,
  type BExtra,
  type BKey,
  type BState,
  type BStep,
  type Ctx,
} from '../_multiway/btree';

export type { BState };

export interface BPSettings {
  [key: string]: Scalar;
  /** The most children a node may have; every node holds at most order - 1 keys. */
  order: '3' | '4' | '5';
}

export const defaults: BPSettings = { order: '4' };

export interface BPExtra extends BExtra {
  /** The second argument of range(a, b). */
  arg2?: { name: string; text: string };
  /** Range query output so far: uids of leaf keys. */
  output?: number[];
  /** A separator copied up from a leaf: its uid and the leaf key it copies. */
  copy?: { uid: number; of: number };
}

export type BPStep = BStep & { extra?: BPExtra };

type S = BState;
type Op = OpSpec<S, BPSettings, BPExtra>;
type Gen = Generator<BPStep, S, void>;
type C = Ctx & { extra: BPExtra };

export function orderOf(settings: BPSettings): number {
  const m = Number(settings.order);
  return m === 3 || m === 4 || m === 5 ? m : 4;
}

/** Fewest keys in a leaf other than the root. */
export const minLeaf = (m: number) => Math.ceil((m - 1) / 2);
/** Fewest keys in an internal node other than the root (it has ceil(m/2) children). */
export const minInner = (m: number) => Math.ceil(m / 2) - 1;

type Tree = { nodes: S['nodes']; root: number | null };

/** The keys in the leaves, left to right (found by walking the tree, not the leaf links). */
export function leafKeys(s: Tree): BKey[] {
  const out: BKey[] = [];
  const walk = (u: number) => {
    const n = s.nodes[u]!;
    if (n.kids.length === 0) out.push(...n.keys);
    else n.kids.forEach(walk);
  };
  if (s.root !== null) walk(s.root);
  return out;
}

export const keysOf = (s: Tree) => leafKeys(s).map((k) => k.key);

/** Leaves, left to right. */
export function leavesOf(s: Tree): number[] {
  const levels = levelsOf(s);
  return levels.length ? levels[levels.length - 1]! : [];
}

export const readouts = (s: S) => ({
  N: leafKeys(s).length,
  height: heightOf(s),
  nodes: nodeCount(s),
  leaves: leavesOf(s).length,
  splits: s.splits,
  merges: s.merges,
  borrows: s.borrows,
});

export function init(): S {
  return emptyState();
}

/** A step, with the range output copied so earlier steps keep theirs. */
function step(c: C, say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): BPStep {
  const st = snap(c, say, lines, level, marks) as BPStep;
  const e = st.extra as BPExtra;
  if (e.output) e.output = [...e.output];
  if (e.arg2) e.arg2 = { ...e.arg2 };
  return st;
}

const done = (W: Work) => {
  const st = W.snap();
  return `N = ${leafKeys(st).length}, height = ${heightOf(st)}.`;
};

/** Why k goes to child i, where keys equal to a separator go right. */
function whyGE(keys: BKey[], i: number, k: number): string {
  if (i === 0) return `${k} < ${keys[0]!.key}`;
  if (i >= keys.length) return `${k} ≥ ${keys[keys.length - 1]!.key}`;
  return `${k} ≥ ${keys[i - 1]!.key} and ${k} < ${keys[i]!.key}`;
}

/**
 * Walk from the root to the leaf where k belongs. In a B+ tree a key equal to a separator is
 * in the right subtree, so the walk takes the pointer after every separator ≤ k. Returns the
 * path, root first.
 */
function* toLeaf(c: C, k: number, lines: string[]): Generator<BPStep, number[], void> {
  const W = c.W;
  let x = W.root!;
  read(c, x);
  const path = [x];
  while (!W.leaf(x)) {
    const node = W.n(x);
    let i = 0;
    while (i < node.keys.length && k >= node.keys[i]!.key) {
      yield step(
        c,
        `${k} ≥ ${node.keys[i]!.key}, so look further right in ${label(W, x)}.`,
        lines,
        3,
        [nodeMark(x, 'active'), cellMark(node.keys[i]!, 'compare')],
      );
      i++;
    }
    const child = node.kids[i]!;
    read(c, child);
    const eq = node.keys[i - 1]?.key === k;
    yield step(
      c,
      `${whyGE(node.keys, i, k)}, so go down the pointer ${between(node.keys, i)} to ${label(W, child)}.${
        eq ? ` A key equal to a separator is always on its right.` : ''
      }`,
      lines,
      2,
      [
        ...(node.keys[Math.min(i, node.keys.length - 1)]
          ? [cellMark(node.keys[Math.min(i, node.keys.length - 1)]!, 'compare')]
          : []),
        edgeMark(child, 'active'),
        nodeMark(child, 'active'),
      ],
    );
    x = child;
    path.push(x);
  }
  return path;
}

/** The position of k in a leaf, with one fine step per key passed over. */
function* findInLeaf(c: C, x: number, k: number, lines: string[]): Generator<BPStep, number, void> {
  const keys = c.W.n(x).keys;
  let j = 0;
  while (j < keys.length && keys[j]!.key < k) {
    yield step(c, `${keys[j]!.key} < ${k}: keep looking in the leaf.`, lines, 3, [
      nodeMark(x, 'active'),
      cellMark(keys[j]!, 'compare'),
    ]);
    j++;
  }
  return j;
}

// ---------------------------------------------------------------------------------------------
// insert

function* insertGen(s: S, k: number, m: number): Gen {
  const W = new Work(s);
  const uid = W.uid();
  const c: C = {
    W,
    extra: { arg: { name: 'k', text: String(k), uid }, path: [] },
    vars: { k, reads: 0 },
    readouts,
  };
  if (W.root === null) {
    W.root = W.make([], []);
    W.n(W.root).next = null;
    yield step(
      c,
      `insert(${k}): the tree is empty, so make an empty leaf to be the root.`,
      ['ins.sig', 'ins.leaf'],
      2,
      [nodeMark(W.root, 'new')],
    );
  }
  const path = yield* toLeaf(c, k, ['ins.sig', 'ins.leaf']);
  const x = path[path.length - 1]!;
  const leaf = W.n(x);
  const j = yield* findInLeaf(c, x, k, ['ins.leaf', 'ins.dup']);
  const hit = leaf.keys[j];
  if (hit && hit.key === k) {
    c.extra.arg = { name: 'k', text: String(k), error: true };
    yield step(
      c,
      `${k} is already in the leaf ${label(W, x)}. Keys are not repeated, so the tree does not change.`,
      ['ins.dup'],
      1,
      [nodeMark(x, 'found'), cellMark(hit, 'found'), mark('arg-box', 'error')],
    );
    return W.snap();
  }
  leaf.keys.splice(j, 0, { uid, key: k });
  c.extra.arg = undefined;
  if (leaf.keys.length < m) {
    yield step(
      c,
      `Put ${k} into the leaf, which becomes ${label(W, x)}. It has room: at most m - 1 = ${m - 1} keys fit. ${done(W)}`,
      ['ins.put', 'ins.over'],
      1,
      [cellMark(uid, 'new'), nodeMark(x, 'active')],
    );
    return W.snap();
  }
  yield step(
    c,
    `Put ${k} into the leaf: ${label(W, x)}. That is ${m} keys, one more than the m - 1 = ${m - 1} a node may hold: an overflow.`,
    ['ins.put', 'ins.over'],
    2,
    [cellMark(uid, 'new'), nodeMark(x, 'error')],
  );

  // Split the leaf, and copy the first key of the new right leaf up.
  const before = label(W, x);
  const keep = Math.ceil(m / 2);
  const z = W.make(leaf.keys.slice(keep), []);
  W.n(z).next = leaf.next ?? null;
  leaf.next = z;
  leaf.keys = leaf.keys.slice(0, keep);
  const first = W.n(z).keys[0]!;
  const sep: BKey = { uid: W.uid(), key: first.key };
  c.extra.copy = { uid: sep.uid, of: first.uid };
  W.splits++;
  let where: string;
  if (path.length === 1) {
    W.root = W.make([sep], [x, z]);
    where = 'a new root';
  } else {
    const p = W.n(path[path.length - 2]!);
    const at = p.kids.indexOf(x);
    p.keys.splice(at, 0, sep);
    p.kids.splice(at + 1, 0, z);
    where = 'the parent';
  }
  const parentOf = path.length === 1 ? W.root : path[path.length - 2]!;
  const over = W.n(parentOf).keys.length === m;
  yield step(
    c,
    `Split ${before}: ${label(W, x)} keeps ${keep} keys and a new leaf takes ${label(W, z)}, linked in right after it. The new leaf's first key, ${first.key}, is copied up into ${where}. The copy is only a signpost: ${first.key} itself stays in the leaf, because every key lives in a leaf.${
      over ? ` Now the parent has ${m} keys: it overflows too.` : ` ${done(W)}`
    }`,
    ['ins.half', 'ins.link', 'ins.copy', ...(path.length === 1 ? ['ins.root'] : [])],
    1,
    [
      cellMark(sep, 'new'),
      cellMark(first, 'active'),
      nodeMark(x, 'new'),
      nodeMark(z, 'new'),
      ...(over ? [nodeMark(parentOf, 'error')] : []),
    ],
  );
  c.extra.copy = undefined;

  // Split internal nodes that overflow, pushing the middle key up.
  for (let idx = path.length - 2; idx >= 0; idx--) {
    const p = path[idx]!;
    const pn = W.n(p);
    if (pn.keys.length < m) break;
    const mid = Math.floor(m / 2);
    const up = pn.keys[mid]!;
    const plabel = label(W, p);
    const right = W.make(pn.keys.slice(mid + 1), pn.kids.slice(mid + 1));
    pn.keys = pn.keys.slice(0, mid);
    pn.kids = pn.kids.slice(0, mid + 1);
    W.splits++;
    let into: number;
    if (idx === 0) {
      W.root = W.make([up], [p, right]);
      into = W.root;
    } else {
      into = path[idx - 1]!;
      const g = W.n(into);
      const at = g.kids.indexOf(p);
      g.keys.splice(at, 0, up);
      g.kids.splice(at + 1, 0, right);
    }
    const still = W.n(into).keys.length === m;
    yield step(
      c,
      `Split the internal node ${plabel}: its middle key ${up.key} is pushed up into ${idx === 0 ? 'a new root, and the tree is one level taller' : 'its parent'}. Unlike a leaf split, nothing stays behind: an internal node's keys are only copies, so ${label(W, p)} and ${label(W, right)} share the rest.${
        still ? ` Now that parent overflows too.` : ` ${done(W)}`
      }`,
      ['ins.climb', 'ins.isplit', 'ins.push', ...(idx === 0 ? ['ins.root'] : [])],
      1,
      [
        cellMark(up, 'active'),
        nodeMark(p, 'new'),
        nodeMark(right, 'new'),
        ...(still ? [nodeMark(into, 'error')] : []),
      ],
    );
  }
  return W.snap();
}

// ---------------------------------------------------------------------------------------------
// delete

function* deleteGen(s: S, k: number, m: number): Gen {
  const c = makeCtx(s, readouts, { arg: { name: 'k', text: String(k) }, path: [] }, { k }) as C;
  const W = c.W;
  if (W.root === null) {
    yield step(
      c,
      `delete(${k}): the tree is empty, so there is nothing to delete.`,
      ['del.sig'],
      1,
      [mark('arg-box', 'error')],
    );
    return s;
  }
  const path = yield* toLeaf(c, k, ['del.sig', 'del.leaf']);
  const x = path[path.length - 1]!;
  const j = yield* findInLeaf(c, x, k, ['del.leaf', 'del.missing']);
  const hit = W.n(x).keys[j];
  if (!hit || hit.key !== k) {
    yield step(
      c,
      `${k} is not in the leaf ${label(W, x)}, so it is not in the tree. Nothing changes.`,
      ['del.missing'],
      1,
      [nodeMark(x, 'active'), mark('arg-box', 'error')],
    );
    return W.snap();
  }
  yield step(c, `Remove ${k} from the leaf ${label(W, x)}.`, ['del.missing', 'del.remove'], 2, [
    nodeMark(x, 'active'),
    cellMark(hit, 'remove'),
  ]);
  W.n(x).keys.splice(j, 1);

  const signpost = Object.values(W.nodes).some(
    (n) => n.kids.length > 0 && n.keys.some((y) => y.key === k),
  );
  const stale = signpost
    ? ` ${k} still appears above as a separator, and that is fine: it still sends every search the right way.`
    : '';

  if (x === W.root) {
    if (W.n(x).keys.length === 0) {
      W.free(x);
      W.root = null;
      yield step(c, `${k} was the last key, so the tree is empty now.`, ['del.remove'], 1, []);
    } else {
      yield step(
        c,
        `${k} is gone. The root is a leaf, so it may hold any number of keys from 1 to m - 1. ${done(W)}`,
        ['del.remove', 'del.under'],
        1,
        [nodeMark(x, 'active')],
      );
    }
    return W.snap();
  }

  for (let idx = path.length - 1; ; idx--) {
    const u = path[idx]!;
    const un = W.n(u);
    const isLeaf = un.kids.length === 0;
    const min = isLeaf ? minLeaf(m) : minInner(m);
    if (idx === 0) {
      if (!isLeaf && un.keys.length === 0) {
        W.free(u);
        W.root = un.kids[0]!;
        yield step(
          c,
          `The root has no keys left, just one child, so that child, ${label(W, W.root)}, becomes the root. The tree is one level shorter. ${done(W)}`,
          ['del.root'],
          1,
          [nodeMark(W.root, 'new')],
        );
      }
      return W.snap();
    }
    if (un.keys.length >= min) {
      if (idx === path.length - 1) {
        yield step(
          c,
          `${k} is gone and the leaf ${label(W, u)} still has at least ${min} ${min === 1 ? 'key' : 'keys'}, the fewest a leaf may have.${stale} ${done(W)}`,
          ['del.remove', 'del.under'],
          1,
          [nodeMark(u, 'active')],
        );
      }
      return W.snap();
    }
    const p = path[idx - 1]!;
    const pn = W.n(p);
    const at = pn.kids.indexOf(u);
    const left = at > 0 ? pn.kids[at - 1]! : undefined;
    const right = at < pn.kids.length - 1 ? pn.kids[at + 1]! : undefined;
    const what =
      un.keys.length === 0
        ? 'The internal node above has no keys left, just one child'
        : `The ${isLeaf ? 'leaf' : 'internal node'} ${label(W, u)} has ${plural(un.keys.length, 'key')}`;
    yield step(
      c,
      `Underflow: ${what.charAt(0).toLowerCase()}${what.slice(1)}, fewer than the ${min} ${isLeaf ? `a leaf needs (⌈(m - 1)/2⌉ = ${min})` : `an internal node needs (⌈m/2⌉ - 1 = ${min})`}. Look at its siblings.`,
      ['del.under'],
      2,
      [nodeMark(u, 'error')],
    );
    if (left !== undefined) read(c, left);
    const lRich = left !== undefined && W.n(left).keys.length > min;
    if (!lRich && right !== undefined) read(c, right);
    const rRich = !lRich && right !== undefined && W.n(right).keys.length > min;

    if (lRich || rRich) {
      const sib = lRich ? left! : right!;
      const sn = W.n(sib);
      const sepAt = lRich ? at - 1 : at;
      const side = lRich ? 'left' : 'right';
      let say: string;
      const marks: Mark[] = [nodeMark(u, 'new')];
      if (isLeaf) {
        const moved = lRich ? sn.keys.pop()! : sn.keys.shift()!;
        if (lRich) un.keys.unshift(moved);
        else un.keys.push(moved);
        const newFirst = lRich ? moved : sn.keys[0]!;
        const old = pn.keys[sepAt]!.key;
        const copy: BKey = { uid: W.uid(), key: newFirst.key };
        pn.keys[sepAt] = copy;
        c.extra.copy = { uid: copy.uid, of: newFirst.uid };
        say = `Borrow: the ${side} sibling has a key to spare, so ${moved.key} moves over into ${label(W, u)}. The separator between them changes from ${old} to a copy of ${newFirst.key}, the first key of the right one.`;
        marks.push(cellMark(moved, 'active'), cellMark(copy, 'new'));
      } else {
        const sep = pn.keys[sepAt]!;
        const up = lRich ? sn.keys.pop()! : sn.keys.shift()!;
        const g = lRich ? sn.kids.pop()! : sn.kids.shift()!;
        if (lRich) {
          un.keys.unshift(sep);
          un.kids.unshift(g);
        } else {
          un.keys.push(sep);
          un.kids.push(g);
        }
        pn.keys[sepAt] = up;
        say = `Borrow through the parent: ${sep.key} comes down into ${label(W, u)}, ${up.key} goes up from the ${side} sibling to replace it, and ${label(W, g)} moves over too.`;
        marks.push(cellMark(sep, 'active'), cellMark(up, 'active'), edgeMark(g, 'active'));
      }
      W.borrows++;
      yield step(c, `${say} ${done(W)}`, ['del.rich', 'del.borrow'], 1, marks);
      c.extra.copy = undefined;
      return W.snap();
    }

    // Merge with a sibling: the right one when there is one.
    const withRight = right !== undefined;
    const lU = withRight ? u : left!;
    const rU = withRight ? right : u;
    const sepAt = withRight ? at : at - 1;
    const sep = pn.keys[sepAt]!;
    const sibs = [left, right].filter((v): v is number => v !== undefined);
    yield step(
      c,
      `${sibs.length === 1 ? 'Its only sibling' : 'Its siblings'}, ${sibs.map((v) => label(W, v)).join(' and ')}, ${sibs.length === 1 ? 'has' : 'have'} no key to spare. Merge ${label(W, lU)} with ${label(W, rU)}.`,
      ['del.rich', 'del.else', 'del.merge'],
      2,
      [
        nodeMark(u, 'error'),
        nodeMark(withRight ? right : left!, 'active'),
        cellMark(sep, 'active'),
      ],
    );
    const ln = W.n(lU);
    const rn = W.n(rU);
    if (isLeaf) {
      ln.keys = [...ln.keys, ...rn.keys];
      ln.next = rn.next ?? null;
    } else {
      ln.keys = [...ln.keys, sep, ...rn.keys];
      ln.kids = [...ln.kids, ...rn.kids];
    }
    pn.keys.splice(sepAt, 1);
    pn.kids.splice(sepAt + 1, 1);
    W.free(rU);
    W.merges++;
    const pmin = idx - 1 === 0 ? 1 : minInner(m);
    const parentShort = pn.keys.length < pmin;
    yield step(
      c,
      `${
        isLeaf
          ? `Merged into the leaf ${label(W, lU)}, which takes over the link to the next leaf. The separator ${sep.key} is dropped from the parent: it was only a copy, so nothing comes down.`
          : `Merged into ${label(W, lU)}, with the separator ${sep.key} brought down between the two halves.`
      }${parentShort ? ' Now the parent has too few keys.' : ` ${done(W)}`}`,
      ['del.merge', 'del.drop', ...(parentShort ? ['del.up'] : [])],
      1,
      [nodeMark(lU, 'new'), ...(isLeaf ? [] : [cellMark(sep, 'active')])],
    );
  }
}

// ---------------------------------------------------------------------------------------------
// search and range

function* searchGen(s: S, k: number): Gen {
  const c = makeCtx(s, readouts, { arg: { name: 'k', text: String(k) }, path: [] }, { k }) as C;
  if (c.W.root === null) {
    c.vars.found = false;
    yield step(c, `search(${k}): the tree is empty, so ${k} is not in it.`, ['srch.sig'], 1, []);
    return s;
  }
  const path = yield* toLeaf(c, k, ['srch.sig', 'srch.loop', 'srch.pick']);
  const x = path[path.length - 1]!;
  const j = yield* findInLeaf(c, x, k, ['srch.ret']);
  const hit = c.W.n(x).keys[j];
  const found = hit !== undefined && hit.key === k;
  c.vars.found = found;
  const r = Number(c.vars.reads);
  yield step(
    c,
    found
      ? `${k} is in the leaf ${label(c.W, x)}: found it, after reading ${plural(r, 'node')}. A search always ends in a leaf, even when k is also a separator above.`
      : `${k} is not in the leaf ${label(c.W, x)}, so it is not in the tree. That took ${plural(r, 'node')}.`,
    ['srch.ret'],
    1,
    found ? [nodeMark(x, 'found'), cellMark(hit, 'found')] : [nodeMark(x, 'active')],
  );
  return s;
}

function* rangeGen(s: S, a: number, b: number): Gen {
  const extra: BPExtra = { arg: { name: 'a', text: String(a) }, path: [], output: [] };
  const c = makeCtx(s, readouts, extra, { a, b, count: 0 }) as C;
  c.extra.arg2 = { name: 'b', text: String(b) };
  const W = c.W;
  const out = c.extra.output!;
  const result = () => (out.length ? out.map((u) => keyOf(W, u)).join(' ') : 'nothing');
  if (a > b) {
    yield step(
      c,
      `range(${a}, ${b}): ${a} > ${b}, so no key can be at least ${a} and at most ${b}. The answer is empty.`,
      ['rng.sig'],
      1,
      [mark('arg-box', 'error')],
    );
    return s;
  }
  if (W.root === null) {
    yield step(
      c,
      `range(${a}, ${b}): the tree is empty, so there is nothing to list.`,
      ['rng.sig'],
      1,
      [],
    );
    return s;
  }
  const path = yield* toLeaf(c, a, ['rng.sig', 'rng.leaf']);
  let x: number | null = path[path.length - 1]!;
  let leaves = 1;
  c.vars.visited = leaves;
  yield step(
    c,
    `This leaf, ${label(W, x)}, is where ${a} would be. From here the walk goes along the leaves, not down the tree.`,
    ['rng.leaf', 'rng.loop'],
    2,
    [nodeMark(x, 'active')],
  );
  while (x !== null) {
    for (const key of W.n(x).keys) {
      if (key.key > b) {
        yield step(
          c,
          `${key.key} > ${b}: past the end of the range, so stop. range(${a}, ${b}) = ${result()}, after reading ${plural(leaves, 'leaf', 'leaves')} along the chain.`,
          ['rng.key', 'rng.stop'],
          1,
          [cellMark(key, 'compare')],
        );
        return s;
      }
      if (key.key < a) {
        yield step(
          c,
          `${key.key} < ${a}: not in the range yet.`,
          ['rng.key', 'rng.stop', 'rng.out'],
          3,
          [cellMark(key, 'compare')],
        );
        continue;
      }
      out.push(key.uid);
      c.vars.count = out.length;
      yield step(
        c,
        `${a} ≤ ${key.key} ≤ ${b}: output ${key.key}.`,
        ['rng.key', 'rng.stop', 'rng.out'],
        2,
        [cellMark(key, 'found'), mark(`out-${key.uid}`, 'found')],
      );
    }
    const next: number | null = W.n(x).next ?? null;
    if (next === null) {
      yield step(
        c,
        `That was the last leaf, so the walk ends. range(${a}, ${b}) = ${result()}, after reading ${plural(leaves, 'leaf', 'leaves')} along the chain.`,
        ['rng.loop', 'rng.next'],
        1,
        [nodeMark(x, 'active')],
      );
      return s;
    }
    const from = x;
    x = next;
    read(c, x);
    leaves++;
    c.vars.visited = leaves;
    yield step(
      c,
      `Follow the link from ${label(W, from)} to the next leaf, ${label(W, x)}. No need to go back up the tree.`,
      ['rng.next'],
      2,
      [mark(`next-${from}`, 'active'), nodeMark(x, 'active')],
    );
  }
  return s;
}

function keyOf(W: Work, uid: number): number {
  for (const n of Object.values(W.nodes)) {
    const k = n.keys.find((x) => x.uid === uid);
    if (k) return k.key;
  }
  return NaN;
}

// ---------------------------------------------------------------------------------------------
// Operations

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, readouts, 'insert', raw!, k, 'ins.sig');
    return yield* insertGen(s, k, orderOf(settings));
  },
};

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, readouts, 'delete', raw!, k, 'del.sig');
    return yield* deleteGen(s, k, orderOf(settings));
  },
};

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, readouts, 'search', raw!, k, 'srch.sig');
    return yield* searchGen(s, k);
  },
};

const range: Op = {
  label: 'Range',
  arity: 2,
  *run(s, [rawA, rawB]) {
    for (const raw of [rawA, rawB]) {
      const k = parseKey(raw as Value);
      if (k instanceof Error)
        return yield* badArg(s, readouts, 'range', raw as Value, k, 'rng.sig');
    }
    return yield* rangeGen(s, Number(rawA), Number(rawB));
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { ...emptyState(), nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say:
        s.root === null
          ? 'clear(): the tree was already empty.'
          : 'clear(): root = nil. Every node is gone, and the counters start again from 0.',
      lines: ['clear.root'],
      vars: readouts(empty),
      level: 1,
    } satisfies BPStep;
    return empty;
  },
};

export const ops = { insert, delete: del, search, range, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short (33 characters with their indent) so they fit a phone's code panel.

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L('ins.leaf', 1, 'x = leaf where k belongs', 'walk down to the leaf where k belongs.'),
        L('ins.dup', 1, 'if k is in x: return', 'If k is already there, stop.'),
        L('ins.put', 1, 'put k into x, in order', 'Put k into the leaf, in order.'),
        L('ins.over', 1, 'if x.n == m  // overflow', 'If the leaf now holds m keys, one too many:'),
        L('ins.half', 2, 'z = new leaf: top half of x', 'a new leaf z takes the top half,'),
        L('ins.link', 2, 'z.next = x.next; x.next = z', 'z joins the chain of leaves after x,'),
        L('ins.copy', 2, 'copy z.key_1 up into x.p', "and a copy of z's first key goes up."),
        L('ins.climb', 1, 'while a parent p has m keys', 'While a parent overflows:'),
        L('ins.isplit', 2, 'split p at its middle key', 'split it at its middle key,'),
        L('ins.push', 2, 'push that key up', 'which moves up (no copy stays behind).'),
        L(
          'ins.root',
          1,
          'a split root makes a new root',
          'A split root puts its key in a new root.',
        ),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.leaf', 1, 'x = leaf where k belongs', 'walk down to the leaf where k belongs.'),
        L('del.missing', 1, 'if k is not in x: return', 'If k is not there, stop.'),
        L('del.remove', 1, 'remove k from x', 'Take k out of the leaf.'),
        L('del.under', 1, 'while x has too few keys', 'While x (not the root) has too few keys:'),
        L(
          'del.rich',
          2,
          'if a sibling can spare a key',
          'if a sibling next to it can spare a key,',
        ),
        L('del.borrow', 3, 'borrow it; fix x.p', 'borrow it and fix the separator above.'),
        L('del.else', 2, 'else', 'Otherwise'),
        L('del.merge', 3, 'merge x with a sibling', 'merge x with a sibling,'),
        L('del.drop', 3, 'remove their separator', 'drop the separator between them,'),
        L('del.up', 3, 'x = x.p', 'and check the parent next.'),
        L(
          'del.root',
          1,
          'if root has 1 child: drop it',
          'A root with no keys hands over to its child.',
        ),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To find key k:'),
        L('srch.loop', 1, 'x = T.root; while x not leaf', 'start at the root; until a leaf,'),
        L('srch.pick', 2, 'x = child after keys ≤ k', 'go down past every separator ≤ k.'),
        L('srch.ret', 1, 'return k is in x', 'k is in the tree if it is in that leaf.'),
      ],
    },
    {
      op: 'range',
      lines: [
        L('rng.sig', 0, 'range(a, b)', 'To list every key from a to b:'),
        L('rng.leaf', 1, 'x = leaf where a belongs', 'walk down to the leaf where a would be.'),
        L('rng.loop', 1, 'while x ≠ nil', 'Then, leaf by leaf:'),
        L('rng.key', 2, 'for each key k in x', 'look at each key k in order;'),
        L('rng.stop', 3, 'if k > b: return', 'past b, stop;'),
        L('rng.out', 3, 'if k ≥ a: output k', 'from a on, output it.'),
        L('rng.next', 2, 'x = x.next', 'Follow the link to the next leaf.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To empty the tree:'),
        L('clear.root', 1, 'T.root = nil', 'forget the root; every node goes with it.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(_s: S, settings: BPSettings): string {
  const m = orderOf(settings);
  return `An empty B+ tree of order m = ${m}: a node holds at most m - 1 = ${m - 1} keys, and every key lives in a leaf. The leaves are linked left to right. Insert some keys, or pick a preset.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

/** Screen-reader summary: the levels, then the leaf chain. */
export function describe(s: S, settings?: BPSettings): string {
  const m = settings ? orderOf(settings) : 4;
  if (s.root === null) return `An empty B+ tree of order ${m}.`;
  const n = leafKeys(s).length;
  const levels = levelsOf(s).map((ids, d) => {
    const nodes = ids.map((u) => label(s, u)).join(' ');
    return d === 0 ? `Root ${nodes}.` : `Depth ${d}: ${nodes}.`;
  });
  return `A B+ tree of order ${m} with ${plural(n, 'key')} in ${plural(leavesOf(s).length, 'leaf', 'leaves')}, height ${heightOf(s)}. ${levels.join(' ')}`;
}
