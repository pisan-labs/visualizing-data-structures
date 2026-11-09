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
  L,
  label,
  makeCtx,
  mark,
  nodeCount,
  nodeMark,
  parseKey,
  read,
  searchLines,
  searchOp,
  snap,
  upInsertLines,
  why,
  type BExtra,
  type BState,
  type BStep,
  type Readouts,
} from '../_multiway/btree';

export type { BExtra, BState };

export interface TwoFourSettings {
  [key: string]: Scalar;
  /** Which key a key in an internal node swaps with before it comes out of a leaf. */
  swap: 'pred' | 'succ';
}

export const defaults: TwoFourSettings = { swap: 'pred' };

type S = BState;
type Op = OpSpec<S, TwoFourSettings, BExtra>;
type Gen = Generator<BStep, S, void>;

/** Goodrich and Tamassia call merges fusions and borrows transfers. */
export const readouts: Readouts = (s, ghost) => ({
  N: keysOf(s, ghost).length,
  height: heightOf(s),
  nodes: nodeCount(s),
  splits: s.splits,
  fusions: s.merges,
  transfers: s.borrows,
});

export function init(): S {
  return emptyState();
}

/** "a 2-node", "a 3-node"... for a node with n keys. */
const kind = (n: number) => `a ${n + 1}-node`;

const done = (st: S) => `N = ${keysOf(st).length}, height = ${heightOf(st)}.`;

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, readouts, 'insert', raw!, k, 'up.sig');
    return yield* insertUp(
      s,
      k,
      2,
      { most: '3 keys', over: '4 keys (a 5-node)', halves: 'are a 3-node and a 2-node' },
      readouts,
    );
  },
};

// ---------------------------------------------------------------------------------------------
// delete, Goodrich and Tamassia: find k; if it is not in a leaf, swap it with its predecessor
// (or successor) so it is; take it out; then fix underflows from the bottom up, by a transfer
// from a sibling or a fusion with one. A fusion takes a key from the parent, so the underflow
// can move up, and an empty root goes away.

function* deleteGen(s: S, k: number, succ: boolean): Gen {
  const c = makeCtx(s, readouts, { arg: { name: 'k', text: String(k) }, path: [] }, { k });
  const W = c.W;
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

  // Find the node z that holds k, remembering the ancestors on the way.
  const above: number[] = [];
  let x = W.root;
  read(c, x);
  yield snap(
    c,
    `delete(${k}): first find the node that holds ${k}, starting at the root, ${label(W, x)}.`,
    ['del.sig', 'del.find'],
    3,
    [nodeMark(x, 'active')],
  );
  let i: number;
  for (;;) {
    const node = W.n(x);
    i = 0;
    while (i < node.keys.length && k > node.keys[i]!.key) {
      yield snap(
        c,
        `${k} > ${node.keys[i]!.key}, so look further right in ${label(W, x)}.`,
        ['del.find'],
        3,
        [nodeMark(x, 'active'), cellMark(node.keys[i]!, 'compare')],
      );
      i++;
    }
    const at = node.keys[i];
    if (at && at.key === k) break;
    if (W.leaf(x)) {
      yield snap(
        c,
        `${label(W, x)} is a leaf and ${k} is not in it, so ${k} is not in the tree. Nothing changes.`,
        ['del.find', 'del.missing'],
        1,
        [nodeMark(x, 'active'), mark('arg-box', 'error')],
      );
      return W.snap();
    }
    const child = node.kids[i]!;
    read(c, child);
    yield snap(
      c,
      `${why(node.keys, i, k)}, so go down the pointer ${between(node.keys, i)} to ${label(W, child)}.`,
      ['del.find'],
      2,
      [
        ...(at ? [cellMark(at, 'compare')] : []),
        edgeMark(child, 'active'),
        nodeMark(child, 'active'),
      ],
    );
    above.push(x);
    x = child;
  }

  // k is key i of z. A key can only come out of a leaf, so an internal key swaps first.
  const z = x;
  let v = z;
  let j = i;
  const hit = W.n(z).keys[i]!;
  if (!W.leaf(z)) {
    const which = succ ? 'successor' : 'predecessor';
    yield snap(
      c,
      `${k} is in ${label(W, z)}, which is not a leaf, and only a leaf can lose a key. So swap ${k} with its ${which}, the ${succ ? 'smallest key in the subtree to its right' : 'largest key in the subtree to its left'}.`,
      ['del.find', 'del.missing', 'del.leaf', 'del.swap'],
      2,
      [nodeMark(z, 'found'), cellMark(hit, 'found')],
    );
    above.push(z);
    v = W.n(z).kids[succ ? i + 1 : i]!;
    read(c, v);
    yield snap(
      c,
      `Go down the pointer ${succ ? 'right' : 'left'} of ${k}, to ${label(W, v)}.`,
      ['del.swap'],
      3,
      [edgeMark(v, 'active'), nodeMark(v, 'active')],
    );
    while (!W.leaf(v)) {
      above.push(v);
      const kids = W.n(v).kids;
      v = succ ? kids[0]! : kids[kids.length - 1]!;
      read(c, v);
      yield snap(
        c,
        `Keep taking the ${succ ? 'first' : 'last'} pointer, down to ${label(W, v)}.`,
        ['del.swap'],
        3,
        [edgeMark(v, 'active'), nodeMark(v, 'active')],
      );
    }
    const keys = W.n(v).keys;
    j = succ ? 0 : keys.length - 1;
    const other = keys[j]!;
    W.n(z).keys[i] = other;
    keys[j] = hit;
    yield snap(
      c,
      `Swap: the ${which} ${other.key} moves up into ${label(W, z)}, and ${k} moves down into the leaf, ${label(W, v)}. Every key is still between the right neighbors, except ${k}, which is about to go.`,
      ['del.swap2'],
      1,
      [cellMark(other, 'new'), cellMark(hit, 'remove'), nodeMark(v, 'active')],
    );
  }

  // Take k out of the leaf v.
  yield snap(c, `Remove ${k} from the leaf ${label(W, v)}.`, ['del.remove'], 2, [
    nodeMark(v, 'active'),
    cellMark(hit, 'remove'),
  ]);
  W.n(v).keys.splice(j, 1);
  if (W.n(v).keys.length > 0) {
    yield snap(
      c,
      `${k} is gone, and ${label(W, v)} still has a key, so nothing underflows. ${done(W.snap())}`,
      ['del.remove', 'del.under'],
      1,
      [nodeMark(v, 'active')],
    );
    return W.snap();
  }

  // Underflow: fix empty nodes from the bottom up.
  let first = true;
  for (;;) {
    if (v === W.root) {
      const kids = W.n(v).kids;
      W.free(v);
      W.root = kids[0] ?? null;
      yield snap(
        c,
        W.root === null
          ? `${k} was the last key, so the tree is empty now.`
          : `The root has no keys left, so it goes away and its only child, ${label(W, W.root)}, becomes the root. The tree is one level shorter. ${done(W.snap())}`,
        ['del.under', 'del.root', 'del.drop'],
        1,
        W.root === null ? [] : [nodeMark(W.root, 'new')],
      );
      return W.snap();
    }
    const p = above[above.length - 1]!;
    const pn = W.n(p);
    const vn = W.n(v);
    const at = pn.kids.indexOf(v);
    const left = at > 0 ? pn.kids[at - 1]! : undefined;
    const right = at < pn.kids.length - 1 ? pn.kids[at + 1]! : undefined;
    yield snap(
      c,
      first
        ? `Underflow: the leaf has no keys left, and every node needs at least one. Look at its siblings.`
        : `Underflow: now the parent has no keys left, just one child. Fix it the same way, one level up.`,
      ['del.under'],
      2,
      [nodeMark(v, 'error')],
    );
    first = false;
    if (left !== undefined) read(c, left);
    const lRich = left !== undefined && W.n(left).keys.length >= 2;
    if (!lRich && right !== undefined) read(c, right);
    const rRich = !lRich && right !== undefined && W.n(right).keys.length >= 2;
    if (lRich || rRich) {
      const w = lRich ? left! : right!;
      const wn = W.n(w);
      const was = kind(wn.keys.length);
      const sepAt = lRich ? at - 1 : at;
      const sep = pn.keys[sepAt]!;
      const up = lRich ? wn.keys.pop()! : wn.keys.shift()!;
      pn.keys[sepAt] = up;
      vn.keys = [sep];
      let moved: number | undefined;
      if (wn.kids.length) {
        moved = lRich ? wn.kids.pop()! : wn.kids.shift()!;
        if (lRich) vn.kids.unshift(moved);
        else vn.kids.push(moved);
      }
      W.borrows++;
      yield snap(
        c,
        `Transfer: the ${lRich ? 'left' : 'right'} sibling was ${was}, so it can spare a key. ${up.key} moves up into the parent, and ${sep.key} comes down into the empty node${
          moved !== undefined ? `, which also takes over the pointer to ${label(W, moved)}` : ''
        }. ${done(W.snap())}`,
        ['del.rich', 'del.transfer'],
        1,
        [
          cellMark(up, 'active'),
          cellMark(sep, 'active'),
          nodeMark(v, 'new'),
          ...(moved !== undefined ? [edgeMark(moved, 'active')] : []),
        ],
      );
      return W.snap();
    }
    // Fusion with a sibling (the right one when there is one) and the key between them.
    const withRight = right !== undefined;
    const sib = withRight ? right : left!;
    const lU = withRight ? v : left!;
    const rU = withRight ? right : v;
    const sepAt = withRight ? at : at - 1;
    const sep = pn.keys[sepAt]!;
    const sibs = [left, right].filter((u): u is number => u !== undefined);
    yield snap(
      c,
      `${sibs.length === 2 ? 'The siblings on both sides' : pn.kids.length === 2 ? 'Its only sibling' : 'The sibling next to it'}, ${sibs.map((u) => label(W, u)).join(' and ')}, ${sibs.length === 1 ? 'is a 2-node' : 'are 2-nodes'}, with no key to spare. Fusion: merge the empty node with ${label(W, sib)}, bringing ${sep.key} down from the parent between them.`,
      ['del.rich', 'del.else', 'del.fuse'],
      2,
      [nodeMark(v, 'error'), nodeMark(sib, 'active'), cellMark(sep, 'active')],
    );
    const ln = W.n(lU);
    const rn = W.n(rU);
    ln.keys = [...ln.keys, sep, ...rn.keys];
    ln.kids = [...ln.kids, ...rn.kids];
    pn.keys.splice(sepAt, 1);
    pn.kids.splice(sepAt + 1, 1);
    W.free(rU);
    W.merges++;
    if (pn.keys.length > 0) {
      yield snap(
        c,
        `Fused into ${label(W, lU)}, a 3-node. The parent still has a key, so the underflow is fixed. ${done(W.snap())}`,
        ['del.fuse'],
        1,
        [nodeMark(lU, 'new'), cellMark(sep, 'active')],
      );
      return W.snap();
    }
    yield snap(
      c,
      `Fused into ${label(W, lU)}. But ${sep.key} was the parent's only key, so the parent is empty now: the underflow moves up a level.`,
      ['del.fuse', 'del.up'],
      1,
      [nodeMark(lU, 'new'), nodeMark(p, 'error')],
    );
    above.pop();
    v = p;
  }
}

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, readouts, 'delete', raw!, k, 'del.sig');
    return yield* deleteGen(s, k, settings.swap === 'succ');
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

export function pseudocode(settings: TwoFourSettings): PseudoBlock[] {
  const succ = settings.swap === 'succ';
  return [
    {
      op: 'insert',
      lines: upInsertLines({
        over: 'while x.n == 4  // overflow',
        plainOver: 'While a node holds 4 keys (a 5-node), one too many:',
        mid: 'm = x.key_3',
        keep: 'x keeps keys 1 and 2',
        plainKeep: 'the two keys before m stay in x.',
      }),
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'z = node that holds k', 'find the node z that holds k.'),
        L('del.missing', 1, 'if z == nil: return', 'If there is none, stop.'),
        L('del.leaf', 1, 'if z is not a leaf', 'If z is not a leaf,'),
        L(
          'del.swap',
          2,
          succ ? "v = leaf with k's successor" : "v = leaf with k's predecessor",
          succ
            ? 'find the leaf v with the next key after k'
            : 'find the leaf v with the key just before k',
        ),
        L(
          'del.swap2',
          2,
          succ ? "swap k with v's first key" : "swap k with v's last key",
          'and swap the two keys, so k is in a leaf.',
        ),
        L('del.remove', 1, 'remove k from its leaf v', 'Take k out of its leaf.'),
        L('del.under', 1, 'while v is empty  // underflow', 'While v has no keys (an underflow):'),
        L('del.root', 2, 'if v == T.root', 'if v is the root,'),
        L('del.drop', 3, "T.root = v's only child", 'drop it; its child is the new root.'),
        L(
          'del.rich',
          2,
          'elseif sibling w has 2+ keys',
          'If a sibling w next to v can spare a key,',
        ),
        L(
          'del.transfer',
          3,
          'transfer a key from w',
          'transfer: w sends a key up, the parent one down.',
        ),
        L('del.else', 2, 'else', 'Otherwise'),
        L('del.fuse', 3, 'fuse v with w', 'fuse v and w, bringing a key down from the parent,'),
        L('del.up', 3, 'v = v.p', 'and check the parent next.'),
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

export function initialSay(): string {
  return 'An empty 2-4 tree. Every node will hold 1, 2 or 3 keys (a 2-node, 3-node or 4-node), and every leaf will be at the same depth. Insert some keys, or pick a preset.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s, undefined);
}

export function describe(s: S): string {
  return describeTree(s, '2-4 tree');
}
