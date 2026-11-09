import type { OpSpec, PseudoBlock, Scalar, Value } from '../../engine/types';
import {
  badArg,
  between,
  cellMark,
  describeTree,
  edgeMark,
  emptyState,
  heightOf,
  insertUp,
  keysOf,
  label,
  makeCtx,
  mark,
  nodeCount,
  nodeMark,
  parseKey,
  read,
  searchOp,
  snap,
  why,
  Work,
  type BExtra,
  type BKey,
  type BState,
  type BStep,
  type Ctx,
  type Readouts,
  L,
  searchLines,
  upInsertLines,
} from '../_multiway/btree';

export type { BExtra, BState };

export interface BTreeSettings {
  [key: string]: Scalar;
  /** Minimum degree: every node but the root holds t - 1 to 2t - 1 keys. */
  t: '2' | '3' | '4';
  /** When full nodes split. CLRS splits them on the way down, before they can overflow. */
  split: 'down' | 'up';
}

export const defaults: BTreeSettings = { t: '3', split: 'down' };

/** The minimum degree as a number (3 if the setting is somehow out of range). */
export function degree(settings: BTreeSettings): number {
  const t = Number(settings.t);
  return t === 2 || t === 3 || t === 4 ? t : 3;
}

type S = BState;
type Op = OpSpec<S, BTreeSettings, BExtra>;
type Gen = Generator<BStep, S, void>;

export const readouts: Readouts = (s, ghost) => ({
  N: keysOf(s, ghost).length,
  height: heightOf(s),
  nodes: nodeCount(s),
  splits: s.splits,
  merges: s.merges,
  borrows: s.borrows,
});

export function init(): S {
  return emptyState();
}

/** "key" for one, "keys" otherwise: t - 1 = 1 key when t = 2. */
const keysWord = (n: number) => (n === 1 ? 'key' : 'keys');

const done = (W: Work) => {
  const st = W.snap();
  return `N = ${keysOf(st).length}, height = ${heightOf(st)}.`;
};

// ---------------------------------------------------------------------------------------------
// insert, CLRS: split every full node on the way down, so there is always room for a key that
// comes up from below.

/** CLRS B-TREE-SPLIT-CHILD: split x's full child at index i around its middle key. */
function* splitChild(c: Ctx, x: number, i: number, t: number): Generator<BStep, void, void> {
  const W = c.W;
  const yU = W.n(x).kids[i]!;
  const y = W.n(yU);
  const before = label(W, yU);
  const mid = y.keys[t - 1]!;
  const z = W.make(y.keys.slice(t), y.kids.slice(t));
  y.keys = y.keys.slice(0, t - 1);
  y.kids = y.kids.slice(0, y.kids.length ? t : 0);
  W.n(x).keys.splice(i, 0, mid);
  W.n(x).kids.splice(i + 1, 0, z);
  W.splits++;
  const root = W.n(x).keys.length === 1 && W.root === x;
  yield snap(
    c,
    `Split ${before}: its middle key ${mid.key} moves up into ${root ? 'the new root' : 'the parent'}, ${label(W, x)}. A new node takes the ${t - 1 === 1 ? 'key' : `${t - 1} keys`} above it, so ${label(W, yU)} and ${label(W, z)} each keep t - 1 = ${t - 1}, the fewest a node may hold.`,
    ['sp.y', 'sp.z', 'sp.kids', 'sp.keep', 'sp.up', 'sp.link'],
    1,
    [cellMark(mid, 'active'), nodeMark(yU, 'new'), nodeMark(z, 'new'), nodeMark(x, 'active')],
  );
}

function* insertDown(s: S, k: number, t: number): Gen {
  const W = new Work(s);
  const uid = W.uid();
  const c: Ctx = {
    W,
    extra: { arg: { name: 'k', text: String(k), uid }, path: [] },
    vars: { k, reads: 0 },
    readouts,
  };
  const max = 2 * t - 1;

  function* duplicate(x: number, hit: BKey, lines: string[]): Gen {
    c.extra.arg = { name: 'k', text: String(k), error: true };
    const splits = W.splits > s.splits;
    yield snap(
      c,
      `${k} is already in ${label(W, x)}. Keys are not repeated, so ${k} is not inserted.${
        splits ? ' The splits made on the way down stay: the tree is still a valid B-tree.' : ''
      }`,
      lines,
      1,
      [nodeMark(x, 'found'), cellMark(hit, 'found'), mark('arg-box', 'error')],
    );
    return W.snap();
  }

  const fresh = W.root === null;
  if (fresh) {
    W.root = W.make([], []);
    yield snap(
      c,
      `insert(${k}): the tree is empty, so make an empty leaf to be the root.`,
      ['ins.sig', 'ins.empty', 'ins.create'],
      2,
      [nodeMark(W.root!, 'new')],
    );
  }
  const r = W.root!;
  read(c, r);
  let x = r;
  if (fresh) {
    // Nothing to check: the new root is an empty leaf.
  } else if (W.n(r).keys.length === max) {
    yield snap(
      c,
      `insert(${k}): the root ${label(W, r)} is full. It holds 2t - 1 = ${max} keys, the most a node may hold, so split it before going down.`,
      ['ins.sig', 'ins.root', 'ins.full'],
      2,
      [nodeMark(r, 'error'), cellMark(W.n(r).keys[t - 1]!, 'active')],
    );
    x = W.make([], [r]);
    W.root = x;
    yield snap(
      c,
      'Make a new, empty root above it, with the old root as its only child. This is the only way a B-tree grows taller: at the top.',
      ['ins.newroot', 'ins.setroot'],
      2,
      [nodeMark(x, 'new')],
    );
    yield* splitChild(c, x, 0, t);
  } else {
    yield snap(
      c,
      `insert(${k}): the root ${label(W, r)} is not full (it has fewer than 2t - 1 = ${max} keys), so it needs no split.`,
      ['ins.sig', 'ins.root', 'ins.full', 'ins.nonfull'],
      3,
      [nodeMark(r, 'active')],
    );
  }

  for (;;) {
    const node = W.n(x);
    let i = node.keys.length;
    c.vars.i = i;
    while (i >= 1 && k < node.keys[i - 1]!.key) {
      yield snap(
        c,
        `${k} < ${node.keys[i - 1]!.key}, so step one key to the left.`,
        ['nf.i', 'nf.loop', 'nf.dec'],
        3,
        [nodeMark(x, 'active'), cellMark(node.keys[i - 1]!, 'compare')],
      );
      i--;
      c.vars.i = i;
    }
    const left = node.keys[i - 1];
    if (left && left.key === k) return yield* duplicate(x, left, ['nf.loop', 'nf.dup']);
    if (W.leaf(x)) {
      node.keys.splice(i, 0, { uid, key: k });
      c.extra.arg = undefined;
      const others = node.keys.filter((y) => y.uid !== uid);
      const where = others.length ? `goes in ${between(others, i)}` : 'is its first key';
      const room =
        W.splits > s.splits
          ? ' It has room because every full node on the way down was split.'
          : '';
      yield snap(
        c,
        `${label(W, x)} is a leaf, so ${k} ${where}.${room} ${done(W)}`,
        ['nf.leaf', 'nf.put'],
        1,
        [cellMark(uid, 'new'), nodeMark(x, 'active')],
      );
      return W.snap();
    }
    let child = node.kids[i]!;
    read(c, child);
    c.vars.i = i + 1;
    yield snap(
      c,
      `${why(node.keys, i, k)}, so ${k} belongs under the pointer ${between(node.keys, i)}. Read that child, ${label(W, child)}.`,
      ['nf.leaf', 'nf.else', 'nf.child'],
      2,
      [
        ...(left ? [cellMark(left, 'compare')] : []),
        edgeMark(child, 'active'),
        nodeMark(child, 'active'),
      ],
    );
    if (W.n(child).keys.length === max) {
      yield snap(
        c,
        `${label(W, child)} is full: 2t - 1 = ${max} keys. Split it now, while its parent ${label(W, x)} still has room for the middle key.`,
        ['nf.full'],
        2,
        [nodeMark(child, 'error'), cellMark(W.n(child).keys[t - 1]!, 'active')],
      );
      yield* splitChild(c, x, i, t);
      const m = node.keys[i]!;
      if (m.key === k) return yield* duplicate(x, m, ['nf.split', 'nf.dup2']);
      const right = k > m.key;
      if (right) i++;
      child = node.kids[i]!;
      c.vars.i = i + 1;
      yield snap(
        c,
        right
          ? `${k} > ${m.key}, so ${k} belongs in the right half, ${label(W, child)}.`
          : `${k} < ${m.key}, so ${k} belongs in the left half, ${label(W, child)}.`,
        ['nf.split', 'nf.dup2', 'nf.pick'],
        2,
        [cellMark(m, 'compare'), edgeMark(child, 'active'), nodeMark(child, 'active')],
      );
    }
    yield snap(
      c,
      `Go down to ${label(W, child)}. It has fewer than 2t - 1 = ${max} keys, so whatever happens below, it has room for one more.`,
      ['nf.down'],
      3,
      [edgeMark(child, 'active'), nodeMark(child, 'active')],
    );
    x = child;
  }
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = parseKey(raw!);
    const sig = settings.split === 'up' ? 'up.sig' : 'ins.sig';
    if (k instanceof Error) return yield* badArg(s, readouts, 'insert', raw!, k, sig);
    const t = degree(settings);
    if (settings.split === 'up') {
      return yield* insertUp(
        s,
        k,
        t,
        {
          most: `2t - 1 = ${2 * t - 1} keys`,
          over: `2t = ${2 * t} keys`,
          halves: `keep t = ${t} and t - 1 = ${t - 1} ${keysWord(t - 1)}`,
        },
        readouts,
      );
    }
    return yield* insertDown(s, k, t);
  },
};

// ---------------------------------------------------------------------------------------------
// delete, CLRS: one pass down. Before entering a node, make sure it has at least t keys, so a
// key can come out of it without the tree having to go back up.

function* deleteGen(s: S, k: number, t: number): Gen {
  const c = makeCtx(s, readouts, { arg: { name: 'k', text: String(k) }, path: [] }, { k });
  const W = c.W;
  const min = t - 1;
  const max = 2 * t - 1;
  if (W.root === null) {
    yield snap(
      c,
      `delete(${k}): the tree is empty, so there is nothing to delete.`,
      ['del.sig'],
      1,
      [mark('arg-box', 'error')],
    );
    return s;
  }
  let x = W.root;
  read(c, x);
  let target = k;
  yield snap(
    c,
    `delete(${k}): start at the root, ${label(W, x)}. Every node entered on the way down will have at least t = ${t} keys, one more than the minimum, so a key can be taken out of it without going back up.`,
    ['del.sig'],
    2,
    [nodeMark(x, 'active')],
  );

  /** After a merge that took the root's last key, the merged child becomes the root. */
  const shrink = (merged: number): string => {
    if (W.root !== null && W.n(W.root).keys.length === 0 && W.n(W.root).kids.length === 1) {
      W.free(W.root);
      W.root = merged;
      return ` The root has no keys left, so ${label(W, merged)} becomes the root and the tree is one level shorter.`;
    }
    return '';
  };

  for (;;) {
    const node = W.n(x);
    let i = 0;
    while (i < node.keys.length && target > node.keys[i]!.key) {
      yield snap(
        c,
        `${target} > ${node.keys[i]!.key}, so look further right in ${label(W, x)}.`,
        ['del.find'],
        3,
        [nodeMark(x, 'active'), cellMark(node.keys[i]!, 'compare')],
      );
      i++;
    }
    const at = node.keys[i];
    const hit = at && at.key === target ? at : undefined;

    if (W.leaf(x)) {
      if (!hit) {
        const changed = W.merges > s.merges || W.borrows > s.borrows;
        yield snap(
          c,
          `${label(W, x)} is a leaf and ${target} is not in it, so ${target} is not in the tree.${
            changed
              ? ' The borrows and merges made on the way down stay: the tree is still a valid B-tree.'
              : ''
          }`,
          ['del.find', 'del.leaf', 'del.missing'],
          1,
          [nodeMark(x, 'active'), mark('arg-box', 'error')],
        );
        return W.snap();
      }
      const ghost = hit.uid === c.extra.ghost;
      const before = label(W, x);
      yield snap(
        c,
        ghost
          ? `Case 1: the leftover copy of ${target} is in the leaf ${before}. Remove it.`
          : `Case 1: ${target} is in the leaf ${before}. Remove it.${
              x === W.root
                ? ''
                : ` The leaf has at least t = ${t} keys, so it keeps at least t - 1.`
            }`,
        ['del.find', 'del.leaf', 'del.case1'],
        2,
        [nodeMark(x, 'active'), cellMark(hit, 'remove')],
      );
      node.keys.splice(i, 1);
      c.extra.ghost = undefined;
      let tail: string;
      if (node.keys.length === 0 && x === W.root) {
        W.free(x);
        W.root = null;
        tail = 'The tree is empty now.';
      } else {
        tail = `The leaf is now ${label(W, x)}. ${done(W)}`;
      }
      yield snap(
        c,
        ghost ? `The old copy of ${target} is gone. ${tail}` : `${target} is gone. ${tail}`,
        ['del.case1'],
        1,
        W.root === null ? [] : [nodeMark(x, 'active')],
      );
      return W.snap();
    }

    if (hit) {
      // Case 2: target is a key of the internal node x.
      const yU = node.kids[i]!;
      const zU = node.kids[i + 1]!;
      read(c, yU);
      const y = W.n(yU);
      if (y.keys.length >= t) {
        yield* replace(c, x, i, yU, 'pred', target, t);
        target = Number(c.vars["k'"]);
        x = yU;
        continue;
      }
      read(c, zU);
      const z = W.n(zU);
      if (z.keys.length >= t) {
        yield snap(
          c,
          `${target} is in the internal node ${label(W, x)}, but the child before it, ${label(W, yU)}, has only t - 1 = ${min} ${keysWord(min)}, so it cannot spare its largest.`,
          ['del.inner', 'del.2a'],
          3,
          [cellMark(hit, 'active'), nodeMark(yU, 'active')],
        );
        yield* replace(c, x, i, zU, 'succ', target, t);
        target = Number(c.vars["k'"]);
        x = zU;
        continue;
      }
      yield snap(
        c,
        `Case 2c: ${target} is in the internal node ${label(W, x)}, and both children around it, ${label(W, yU)} and ${label(W, zU)}, have only t - 1 = ${min} ${keysWord(min)}. Merge ${target} and all of ${label(W, zU)} into ${label(W, yU)}.`,
        ['del.inner', 'del.2a', 'del.2b', 'del.2c'],
        2,
        [cellMark(hit, 'active'), nodeMark(yU, 'active'), nodeMark(zU, 'active')],
      );
      const zLabel = label(W, zU);
      y.keys = [...y.keys, hit, ...z.keys];
      y.kids = [...y.kids, ...z.kids];
      node.keys.splice(i, 1);
      node.kids.splice(i + 1, 1);
      W.free(zU);
      W.merges++;
      const shrunk = shrink(yU);
      yield snap(
        c,
        `Merged: ${label(W, yU)} holds 2t - 1 = ${max} keys, ${target} among them, and ${zLabel} is gone.${shrunk} Now delete ${target} from ${label(W, yU)}.`,
        ['del.2c.do', 'del.2c.rec', ...(shrunk ? ['del.root'] : [])],
        1,
        [nodeMark(yU, 'new'), cellMark(hit, 'active')],
      );
      x = yU;
      continue;
    }

    // Case 3: target can only be under the child at i.
    let cU = node.kids[i]!;
    read(c, cU);
    yield snap(
      c,
      `${why(node.keys, i, target)}, so ${target} can only be under the pointer ${between(node.keys, i)}, in ${label(W, cU)}.`,
      ['del.find', 'del.leaf', 'del.inner', 'del.down'],
      2,
      [...(at ? [cellMark(at, 'compare')] : []), edgeMark(cU, 'active'), nodeMark(cU, 'active')],
    );
    const cn = W.n(cU);
    if (cn.keys.length === min) {
      const L = i > 0 ? node.kids[i - 1]! : undefined;
      const R = i < node.keys.length ? node.kids[i + 1]! : undefined;
      if (L !== undefined) read(c, L);
      const lRich = L !== undefined && W.n(L).keys.length >= t;
      if (!lRich && R !== undefined) read(c, R);
      const rRich = !lRich && R !== undefined && W.n(R).keys.length >= t;
      if (lRich || rRich) {
        const sib = lRich ? L! : R!;
        const sn = W.n(sib);
        const side = lRich ? 'left' : 'right';
        yield snap(
          c,
          `${label(W, cU)} has only t - 1 = ${min} ${keysWord(min)}, the fewest allowed, so it cannot lose one. Case 3a: its ${side} sibling ${label(W, sib)} has ${sn.keys.length} ≥ t = ${t} keys, so borrow one through the parent.`,
          ['del.thin', 'del.3a'],
          2,
          [
            nodeMark(cU, 'error'),
            nodeMark(sib, 'active'),
            cellMark(node.keys[lRich ? i - 1 : i]!, 'active'),
          ],
        );
        const sepAt = lRich ? i - 1 : i;
        const sep = node.keys[sepAt]!;
        const up = lRich ? sn.keys.pop()! : sn.keys.shift()!;
        node.keys[sepAt] = up;
        let moved: number | undefined;
        if (lRich) {
          cn.keys.unshift(sep);
          if (sn.kids.length) cn.kids.unshift((moved = sn.kids.pop()!));
        } else {
          cn.keys.push(sep);
          if (sn.kids.length) cn.kids.push((moved = sn.kids.shift()!));
        }
        W.borrows++;
        yield snap(
          c,
          `${sep.key} moves down from the parent into ${label(W, cU)}, and ${up.key}, the ${lRich ? 'last' : 'first'} key of the sibling, moves up to take its place${
            moved !== undefined
              ? `, handing over the pointer on its ${lRich ? 'right' : 'left'}: ${label(W, moved)} now hangs under ${label(W, cU)}`
              : ''
          }. ${label(W, cU)} has t = ${t} keys now.`,
          ['del.3a.do'],
          1,
          [
            cellMark(sep, 'active'),
            cellMark(up, 'active'),
            nodeMark(cU, 'new'),
            ...(moved !== undefined ? [edgeMark(moved, 'active')] : []),
          ],
        );
      } else {
        const withRight = R !== undefined;
        const leftU = withRight ? cU : L!;
        const rightU = withRight ? R! : cU;
        const sepAt = withRight ? i : i - 1;
        const sep = node.keys[sepAt]!;
        const sibs = [L, R].filter((u): u is number => u !== undefined).map((u) => label(W, u));
        yield snap(
          c,
          `${label(W, cU)} has only t - 1 = ${min} ${keysWord(min)}, and so ${sibs.length === 2 ? 'do the siblings on both sides of it' : node.kids.length === 2 ? 'does its only sibling' : 'does the sibling next to it'}, ${sibs.join(' and ')}: none can spare a key. Case 3b: merge ${label(W, leftU)} and ${label(W, rightU)}, pulling the key between them, ${sep.key}, down from the parent.`,
          ['del.thin', 'del.3a', 'del.3b'],
          2,
          [nodeMark(cU, 'error'), nodeMark(withRight ? R! : L!, 'active'), cellMark(sep, 'active')],
        );
        const ln = W.n(leftU);
        const rn = W.n(rightU);
        const rLabel = label(W, rightU);
        ln.keys = [...ln.keys, sep, ...rn.keys];
        ln.kids = [...ln.kids, ...rn.kids];
        node.keys.splice(sepAt, 1);
        node.kids.splice(sepAt + 1, 1);
        W.free(rightU);
        W.merges++;
        const shrunk = shrink(leftU);
        yield snap(
          c,
          `Merged: ${label(W, leftU)} holds 2t - 1 = ${max} keys, and ${rLabel} is gone.${shrunk}`,
          ['del.3b.do', ...(shrunk ? ['del.root'] : [])],
          1,
          [nodeMark(leftU, 'new'), cellMark(sep, 'active')],
        );
        cU = leftU;
      }
    }
    yield snap(
      c,
      `Go down into ${label(W, cU)}: it has at least t = ${t} keys, so it can lose one.`,
      ['del.rec'],
      3,
      [nodeMark(cU, 'active'), ...(W.root === cU ? [] : [edgeMark(cU, 'active')])],
    );
    x = cU;
  }
}

/**
 * Cases 2a and 2b: the child before (2a) or after (2b) the target has at least t keys. Find
 * the target's predecessor (the largest key under that child) or successor (the smallest), move
 * it up in place of the target, and leave its old copy, dashed, for the recursive delete.
 * Sets vars["k'"] to the key that moved up.
 */
function* replace(
  c: Ctx,
  x: number,
  i: number,
  sub: number,
  which: 'pred' | 'succ',
  target: number,
  t: number,
): Generator<BStep, void, void> {
  const W = c.W;
  const pred = which === 'pred';
  const hit = W.n(x).keys[i]!;
  yield snap(
    c,
    pred
      ? `Case 2a: ${target} is in the internal node ${label(W, x)}. The child before it, ${label(W, sub)}, has ${W.n(sub).keys.length} ≥ t = ${t} keys, so ${target}'s predecessor can take its place.`
      : `Case 2b: the child after it, ${label(W, sub)}, has ${W.n(sub).keys.length} ≥ t = ${t} keys, so ${target}'s successor can take its place.`,
    pred ? ['del.inner', 'del.2a'] : ['del.inner', 'del.2a', 'del.2b'],
    2,
    [cellMark(hit, 'remove'), nodeMark(sub, 'active'), edgeMark(sub, 'active')],
  );
  let p = sub;
  while (!W.leaf(p)) {
    const kids = W.n(p).kids;
    p = pred ? kids[kids.length - 1]! : kids[0]!;
    read(c, p);
    yield snap(
      c,
      pred
        ? `The predecessor is the largest key under ${label(W, sub)}: keep taking the last pointer, down to ${label(W, p)}.`
        : `The successor is the smallest key under ${label(W, sub)}: keep taking the first pointer, down to ${label(W, p)}.`,
      [pred ? 'del.2a.do' : 'del.2b.do'],
      3,
      [nodeMark(p, 'active'), edgeMark(p, 'active')],
    );
  }
  const keys = W.n(p).keys;
  const j = pred ? keys.length - 1 : 0;
  const moving = keys[j]!;
  const ghost = W.uid();
  W.n(x).keys[i] = moving;
  keys[j] = { uid: ghost, key: moving.key };
  c.extra.ghost = ghost;
  c.vars["k'"] = moving.key;
  yield snap(
    c,
    `${pred ? 'The predecessor' : 'The successor'} is ${moving.key}. It moves up and replaces ${target} in ${label(W, x)}, which keeps the keys in order. Its old copy (dashed) is still in the leaf: delete ${moving.key} from the subtree under ${label(W, sub)} next.`,
    pred ? ['del.2a.do', 'del.2a.rec'] : ['del.2b.do', 'del.2b.rec'],
    1,
    [cellMark(moving, 'new'), cellMark(ghost, 'remove'), nodeMark(sub, 'active')],
  );
}

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, readouts, 'delete', raw!, k, 'del.sig');
    return yield* deleteGen(s, k, degree(settings));
  },
};

const search: Op = {
  label: 'Search',
  arity: 1,
  run: (s, [raw]) => searchOp(s, raw as Value, readouts),
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
      vars: readouts(empty, undefined),
      level: 1,
    } satisfies BStep;
    return empty;
  },
};

export const ops = { insert, delete: del, search, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short (33 characters with their indent) so they fit a phone's code panel.

export function pseudocode(settings: BTreeSettings): PseudoBlock[] {
  const insertLines =
    settings.split === 'up'
      ? upInsertLines({
          over: 'while x.n == 2t  // overflow',
          plainOver: 'While a node holds 2t keys, one too many:',
          mid: 'm = x.key_{t+1}',
          keep: 'x keeps its first t keys',
          plainKeep: 'the t keys before it stay in x.',
        })
      : [
          L('ins.sig', 0, 'insert(T, k)', 'To insert key k:'),
          L('ins.empty', 1, 'if T.root == nil', 'If the tree is empty,'),
          L('ins.create', 2, 'T.root = new leaf', 'its root is a new, empty leaf.'),
          L('ins.root', 1, 'r = T.root', 'Start at the root.'),
          L('ins.full', 1, 'if r.n == 2t - 1', 'If the root is full,'),
          L('ins.newroot', 2, 's = new node; s.c_1 = r', 'make a new, empty node above it'),
          L('ins.setroot', 2, 'T.root = s', 'and make that the root,'),
          L('ins.split', 2, 'split-child(s, 1)', 'then split the old root under it.'),
          L('ins.nonfull', 1, 'insert-nonfull(T.root, k)', 'Insert from the root down.'),
          L('nf.sig', 0, 'insert-nonfull(x, k)', 'To insert k under x, which has room:'),
          L('nf.i', 1, 'i = x.n', 'start after the last key.'),
          L('nf.loop', 1, 'while i ≥ 1 and k < x.key_i', 'While the key on the left is bigger,'),
          L('nf.dec', 2, 'i = i - 1', 'step one key left.'),
          L('nf.dup', 1, 'if k == x.key_i: return', 'If k is already here, stop.'),
          L('nf.leaf', 1, 'if x.leaf', 'If x is a leaf,'),
          L('nf.put', 2, 'insert k after x.key_i', 'make room and put k right after that key.'),
          L('nf.else', 1, 'else i = i + 1', 'Otherwise take the pointer after that key'),
          L('nf.child', 2, 'DISK-READ(x.c_i)', 'and read the child it points to.'),
          L('nf.full', 2, 'if x.c_i.n == 2t - 1', 'If that child is full,'),
          L('nf.split', 3, 'split-child(x, i)', 'split it first;'),
          L('nf.dup2', 3, 'if k == x.key_i: return', 'if k was its middle key, k is already here;'),
          L('nf.pick', 3, 'if k > x.key_i: i = i + 1', 'otherwise pick the half where k belongs.'),
          L('nf.down', 2, 'insert-nonfull(x.c_i, k)', 'Go down into that child.'),
          L('sp.sig', 0, 'split-child(x, i)', "To split x's full child:"),
          L('sp.y', 1, 'y = x.c_i; z = new node', 'call the full child y and make a new node z.'),
          L('sp.z', 1, 'z.keys = last t - 1 of y', 'z takes the t - 1 keys at the top of y,'),
          L('sp.kids', 1, 'z.c = last t children of y', 'and the t children around them.'),
          L('sp.keep', 1, 'y.n = t - 1', 'y keeps the bottom t - 1 keys.'),
          L('sp.up', 1, 'insert y.key_t into x at i', "y's middle key moves up into x,"),
          L('sp.link', 1, 'x.c_{i+1} = z', 'and z goes right after y.'),
        ];
  return [
    { op: 'insert', lines: insertLines },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(x, k)', 'To delete k from the subtree at x:'),
        L('del.find', 1, 'i = first i with k ≤ x.key_i', 'find where k is, or would be.'),
        L('del.leaf', 1, 'if x.leaf', 'If x is a leaf,'),
        L('del.case1', 2, 'if k == x.key_i: remove k', 'case 1: take k out if it is there;'),
        L('del.missing', 2, 'else return  // not found', 'otherwise k is not in the tree.'),
        L('del.inner', 1, 'elseif k == x.key_i  // case 2', 'Case 2, k is in this internal node:'),
        L('del.2a', 2, 'if x.c_i.n ≥ t  // 2a', 'if the child before k can spare a key,'),
        L('del.2a.do', 3, "x.key_i = k' = pred(k)", "move k's predecessor up into its place"),
        L('del.2a.rec', 3, "delete(x.c_i, k')", 'and delete the predecessor below;'),
        L('del.2b', 2, 'elseif x.c_{i+1}.n ≥ t  // 2b', 'else if the child after k can spare one,'),
        L('del.2b.do', 3, "x.key_i = k' = succ(k)", "move k's successor up into its place"),
        L('del.2b.rec', 3, "delete(x.c_{i+1}, k')", 'and delete the successor below;'),
        L('del.2c', 2, 'else  // 2c', 'otherwise'),
        L('del.2c.do', 3, 'merge x.c_i, k, x.c_{i+1}', 'merge k and both children into one node'),
        L('del.2c.rec', 3, 'delete(x.c_i, k)', 'and delete k from it.'),
        L('del.down', 1, 'else c = x.c_i  // case 3', 'Case 3, k can only be under child c.'),
        L('del.thin', 2, 'if c.n == t - 1', 'If c has only t - 1 keys,'),
        L('del.3a', 3, 'if a sibling has ≥ t keys', 'and a sibling next to it can spare one,'),
        L('del.3a.do', 4, 'borrow through x  // 3a', 'borrow it through x (3a);'),
        L('del.3b', 3, 'else  // 3b', 'otherwise'),
        L('del.3b.do', 4, 'merge c with a sibling', "merge c, a sibling and x's key between (3b)."),
        L('del.root', 2, 'if T.root.n == 0: T.root = c', 'An empty root hands over to its child.'),
        L('del.rec', 2, 'delete(c, k)', 'Go down into c.'),
      ],
    },
    { op: 'search', lines: searchLines() },
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

export function initialSay(_s: S, settings: BTreeSettings): string {
  const t = degree(settings);
  return `An empty B-tree with minimum degree t = ${t}: every node except the root will hold between t - 1 = ${t - 1} and 2t - 1 = ${2 * t - 1} keys. Insert some keys, or pick a preset.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s, undefined);
}

export function describe(s: S, settings?: BTreeSettings): string {
  const t = settings ? degree(settings) : 3;
  return describeTree(s, `B-tree of minimum degree ${t}`);
}
