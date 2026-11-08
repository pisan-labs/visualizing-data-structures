import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { nodeShapeId } from '../../layouts/binary-tree';

/** A node: its key and its children, leftmost (the most recently linked) first. */
export interface PNode {
  uid: number;
  key: number;
  kids: number[];
}

export interface PairState {
  nodes: Record<number, PNode>;
  /**
   * The trees drawn, left to right. Between operations there is at most one: the heap. During
   * meld there are two, and during deleteMin the root's former children.
   */
  roots: number[];
  nextUid: number;
}

export interface PairSettings {
  [key: string]: Scalar;
  /** two-pass: pair left to right, then meld right to left (Fredman et al.). multipass: FIFO. */
  pass: 'two-pass' | 'multipass';
  /** tree: each node with all its children. pointers: left-child, right-sibling links. */
  draw: 'tree' | 'pointers';
}

export interface PairExtra {
  out?: { key: number; label: string; from?: number };
  arg?: { label: string; text: string };
  /** A label over some roots: "H2", or the pass a tree came from. */
  tags?: Record<number, string>;
}

type S = PairState;
type X = PairExtra;
type Op = OpSpec<S, PairSettings, X>;
type PStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const CAPACITY = 31;

export const defaults: PairSettings = { pass: 'two-pass', draw: 'tree' };

export function init(): S {
  return { nodes: {}, roots: [], nextUid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const node = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cmp = (a: number, b: number) =>
  a < b ? `${a} < ${b}` : a > b ? `${a} > ${b}` : `${a} = ${b}`;

// ---------------------------------------------------------------------------------------------
// Arguments

const INT = /^-?\d+$/;

export function parseKey(raw: Value): number | Error {
  const t = String(raw).trim();
  if (!INT.test(t)) return new Error(`Keys are whole numbers from ${MIN_KEY} to ${MAX_KEY}.`);
  const k = Number(t);
  if (k < MIN_KEY || k > MAX_KEY)
    return new Error(`Keep keys between ${MIN_KEY} and ${MAX_KEY} so they fit in the nodes.`);
  return k;
}

export function parseKeyList(raw: Value): number[] | Error {
  const tokens = String(raw)
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length === 0) return new Error('Type the keys of the second heap, such as 5 3 8.');
  if (tokens.length > 15) return new Error('The second heap holds at most 15 keys.');
  const keys: number[] = [];
  for (const t of tokens) {
    const k = parseKey(t);
    if (k instanceof Error)
      return new Error(tokens.length > 1 ? `"${t}": ${k.message}` : k.message);
    keys.push(k);
  }
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Tree helpers

export function count(nodes: Record<number, PNode>, roots: number[]): number {
  let n = 0;
  const walk = (u: number) => {
    n++;
    nodes[u]!.kids.forEach(walk);
  };
  roots.forEach(walk);
  return n;
}

/** Preorder: a node, then its children left to right. */
export function preorder(nodes: Record<number, PNode>, roots: number[]): number[] {
  const out: number[] = [];
  const walk = (u: number) => {
    out.push(u);
    nodes[u]!.kids.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

class Work {
  nodes: Record<number, PNode>;
  roots: number[];
  nextUid: number;
  comparisons = 0;
  links = 0;

  constructor(s: S) {
    this.nodes = {};
    for (const [k, v] of Object.entries(s.nodes))
      this.nodes[Number(k)] = { ...v, kids: [...v.kids] };
    this.roots = [...s.roots];
    this.nextUid = s.nextUid;
  }

  snap(): S {
    const nodes: Record<number, PNode> = {};
    // Only nodes still reachable are kept, so a removed root disappears.
    for (const u of preorder(this.nodes, this.roots)) {
      const v = this.nodes[u]!;
      nodes[u] = { ...v, kids: [...v.kids] };
    }
    return { nodes, roots: [...this.roots], nextUid: this.nextUid };
  }

  key(u: number): number {
    return this.nodes[u]!.key;
  }

  /** Link two roots: the larger becomes the leftmost child of the smaller. Returns the winner. */
  link(a: number, b: number): { win: number; lose: number } {
    this.comparisons += 1;
    this.links += 1;
    const [win, lose] = this.key(b) < this.key(a) ? [b, a] : [a, b];
    this.nodes[win]!.kids.unshift(lose);
    return { win, lose };
  }

  parentOf(u: number): number | null {
    for (const v of Object.values(this.nodes)) if (v.kids.includes(u)) return v.uid;
    return null;
  }
}

interface Ctx {
  W: Work;
  extra: X;
  vars: Record<string, Scalar>;
}

function ctx(s: S, vars: Record<string, Scalar> = {}): Ctx {
  return { W: new Work(s), extra: {}, vars };
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): PStep {
  const state = c.W.snap();
  const n = count(state.nodes, state.roots);
  const root = state.roots.length === 1 ? state.nodes[state.roots[0]!]! : null;
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      N: n,
      trees: state.roots.length,
      'root degree': root ? root.kids.length : '–',
      ...c.vars,
      comparisons: c.W.comparisons,
      links: c.W.links,
    },
    level,
    extra: { ...c.extra, tags: c.extra.tags ? { ...c.extra.tags } : undefined },
  };
}

function* refuse(s: S, say: string, line: string, arg: { label: string; text: string }) {
  const c = ctx(s);
  c.extra.arg = arg;
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
  return s;
}

/** One link, as a step: who wins, and the loser's new place as the winner's first child. */
function* linkStep(
  c: Ctx,
  a: number,
  b: number,
  lines: string[],
  intro: string,
): Generator<PStep, number, void> {
  const { W } = c;
  const ka = W.key(a);
  const kb = W.key(b);
  const { win, lose } = W.link(a, b);
  W.roots = W.roots.filter((r) => r !== lose);
  yield step(
    c,
    `${intro}${cmp(ka, kb)}, so ${W.key(lose)} becomes the first child of ${W.key(win)}. One comparison, one link.`,
    lines,
    2,
    [node(win, 'found'), node(lose, 'visit')],
  );
  return win;
}

const summary = (W: Work) => {
  const n = count(W.nodes, W.roots);
  if (n === 0) return 'The heap is empty.';
  return `N = ${n}, and the root ${W.key(W.roots[0]!)} has ${plural(W.nodes[W.roots[0]!]!.kids.length, 'child', 'children')}.`;
};

// ---------------------------------------------------------------------------------------------

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const key = parseKey(raw!);
    if (key instanceof Error)
      return yield* refuse(s, `insert(${String(raw)}): ${key.message}`, 'ins.sig', {
        label: 'key',
        text: String(raw),
      });
    const c = ctx(s, { key });
    const { W } = c;
    if (count(W.nodes, W.roots) >= CAPACITY) {
      c.extra.arg = { label: 'key', text: String(key) };
      yield step(
        c,
        `insert(${key}): the drawing holds at most ${CAPACITY} keys. ${key} is not inserted.`,
        ['ins.sig'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    const uid = W.nextUid++;
    W.nodes[uid] = { uid, key, kids: [] };
    if (W.roots.length === 0) {
      W.roots = [uid];
      yield step(
        c,
        `insert(${key}): the heap was empty, so ${key} is the root.`,
        ['ins.new', 'ins.meld'],
        1,
        [node(uid, 'new')],
      );
      return W.snap();
    }
    W.roots = [...W.roots, uid];
    yield step(
      c,
      `insert(${key}): make a one-node heap for ${key}, then meld it with the heap.`,
      ['ins.new'],
      2,
      [node(uid, 'new')],
    );
    yield* linkStep(
      c,
      W.roots[0]!,
      uid,
      ['ins.meld', 'meld.cmp', 'meld.link'],
      'Meld: compare the roots. ',
    );
    yield step(
      c,
      `${key} is in, in O(1): no walking down the tree. ${summary(W)}`,
      ['ins.sig'],
      1,
      [node(uid, 'done')],
    );
    return W.snap();
  },
};

/** Builds a second heap from a list by plain inserts, without steps. */
function buildSecond(W: Work, keys: number[]): number {
  let root: number | null = null;
  for (const key of keys) {
    const uid = W.nextUid++;
    W.nodes[uid] = { uid, key, kids: [] };
    if (root === null) root = uid;
    else {
      const [win, lose] = key < W.key(root) ? [uid, root] : [root, uid];
      W.nodes[win]!.kids.unshift(lose);
      root = win;
    }
  }
  return root!;
}

const meld: Op = {
  label: 'Meld with',
  arity: 1,
  *run(s, [raw]) {
    const keys = parseKeyList(raw!);
    if (keys instanceof Error)
      return yield* refuse(s, `meld: ${keys.message}`, 'mld.sig', {
        label: 'list',
        text: String(raw),
      });
    const c = ctx(s);
    const { W } = c;
    if (count(W.nodes, W.roots) + keys.length > CAPACITY) {
      c.extra.arg = { label: 'list', text: keys.join(' ') };
      yield step(
        c,
        `meld: the drawing holds at most ${CAPACITY} keys, and the two heaps together would have more.`,
        ['mld.sig'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    const h2 = buildSecond(W, keys);
    W.roots = [...W.roots, h2];
    c.extra.tags = { [h2]: 'H2' };
    yield step(
      c,
      `meld(H, H2): H2 is a pairing heap built from ${keys.join(' ')} by inserts. Its root ${W.key(h2)} is its minimum.`,
      ['mld.sig'],
      2,
      [node(h2, 'new')],
    );
    if (W.roots.length === 1) {
      delete c.extra.tags;
      yield step(c, `H was empty, so H2 is the heap now. ${summary(W)}`, ['meld.nil'], 1, []);
      return W.snap();
    }
    yield* linkStep(c, W.roots[0]!, h2, ['meld.cmp', 'meld.link'], 'Compare the two roots: ');
    delete c.extra.tags;
    yield step(
      c,
      `Melded with one comparison, however big the heaps are: O(1). ${summary(W)}`,
      ['mld.sig'],
      1,
      [node(W.roots[0]!, 'done')],
    );
    return W.snap();
  },
};

const decrease: Op = {
  label: 'Decrease key',
  arity: 2,
  *run(s, [rawOld, rawNew]) {
    const name = `decreaseKey(${String(rawOld)}, ${String(rawNew)})`;
    const old = parseKey(rawOld!);
    if (old instanceof Error)
      return yield* refuse(s, `${name}: ${old.message}`, 'dec.sig', {
        label: 'key',
        text: String(rawOld),
      });
    const k = parseKey(rawNew!);
    if (k instanceof Error)
      return yield* refuse(s, `${name}: ${k.message}`, 'dec.sig', {
        label: 'new',
        text: String(rawNew),
      });
    const c = ctx(s, { old, new: k });
    const { W } = c;
    const x = preorder(W.nodes, W.roots).find((u) => W.key(u) === old);
    if (x === undefined) {
      c.extra.arg = { label: 'key', text: String(old) };
      yield step(c, `${name}: there is no key ${old} in the heap.`, ['dec.sig'], 1, [
        mark('arg-box', 'error'),
      ]);
      return s;
    }
    if (k > old) {
      c.extra.arg = { label: 'new', text: String(k) };
      yield step(
        c,
        `${name}: ${k} is larger than ${old}. Decrease-key only lowers a key; the heap is unchanged.`,
        ['dec.check'],
        1,
        [mark('arg-box', 'error'), node(x, 'compare')],
      );
      return s;
    }
    W.nodes[x]!.key = k;
    const p = W.parentOf(x);
    if (p === null) {
      yield step(
        c,
        `${name}: ${old} becomes ${k}. It is the root, so it is still the minimum: nothing else changes.`,
        ['dec.check', 'dec.set', 'dec.root'],
        1,
        [node(x, 'done')],
      );
      return W.snap();
    }
    yield step(
      c,
      `${name}: ${old} becomes ${k}. Now ${k} may be smaller than its parent ${W.key(p)}.`,
      ['dec.check', 'dec.set', 'dec.root'],
      2,
      [node(x, 'active'), node(p, 'compare')],
    );
    W.nodes[p]!.kids = W.nodes[p]!.kids.filter((u) => u !== x);
    W.roots = [...W.roots, x];
    yield step(
      c,
      `Cut ${k} and its whole subtree away from ${W.key(p)}. Both pieces are still heap-ordered. No sifting up: that would cost O(log n) or worse.`,
      ['dec.cut'],
      2,
      [node(x, 'active')],
    );
    yield* linkStep(
      c,
      W.roots[0]!,
      x,
      ['dec.meld', 'meld.cmp', 'meld.link'],
      'Meld the piece back in: ',
    );
    yield step(c, `Done with one cut and one link. ${summary(W)}`, ['dec.sig'], 1, [
      node(x, 'done'),
    ]);
    return W.snap();
  },
};

const deleteMin: Op = {
  label: 'Delete min',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx(s);
    const { W } = c;
    if (W.roots.length === 0) {
      yield step(
        c,
        'deleteMin(): the heap is empty. There is nothing to delete.',
        ['del.empty'],
        1,
        [mark('empty', 'error')],
      );
      return s;
    }
    const r = W.roots[0]!;
    const min = W.key(r);
    c.vars.min = min;
    c.extra.out = { key: min, label: 'min', from: r };
    yield step(c, `deleteMin(): the minimum is the root, ${min}.`, ['del.empty', 'del.min'], 2, [
      node(r, 'found'),
      mark('out', 'found'),
    ]);
    const kids = W.nodes[r]!.kids;
    W.roots = [...kids];
    if (kids.length === 0) {
      c.vars.returned = min;
      yield step(
        c,
        `${min} had no children, so the heap is now empty. Return ${min}.`,
        ['del.kids', 'del.return'],
        1,
        [mark('out', 'found')],
      );
      return W.snap();
    }
    yield step(
      c,
      `Remove the root. Its ${plural(kids.length, 'child', 'children')} (${kids.map((u) => W.key(u)).join(', ')}) are now separate heaps, left to right. One of their roots is the new minimum, and pairing finds it.`,
      ['del.kids'],
      2,
      [...kids.map((u) => node(u, 'compare')), mark('out', 'found')],
    );
    if (kids.length === 1) {
      // Nothing to pair.
    } else if (settings.pass === 'multipass') {
      while (W.roots.length > 1) {
        const [a, b] = W.roots;
        const win = yield* linkStep(
          c,
          a!,
          b!,
          ['mp.loop', 'mp.meld'],
          `Take the first two trees, ${W.key(a!)} and ${W.key(b!)}: `,
        );
        W.roots = [...W.roots.filter((u) => u !== win), win];
        yield step(
          c,
          `Put the result, rooted at ${W.key(win)}, at the back of the list.`,
          ['mp.back'],
          3,
          [node(win, 'active')],
        );
      }
    } else {
      // Pass 1: meld pairs left to right.
      c.vars.pass = 1;
      const list = [...W.roots];
      const pairs: number[] = [];
      for (let i = 0; i < list.length; i += 2) {
        const a = list[i]!;
        const b = list[i + 1];
        if (b === undefined) {
          pairs.push(a);
          yield step(
            c,
            `Pass 1: ${W.key(a)} is left over at the right end with no partner. It waits for pass 2.`,
            ['p1.loop', 'p1.odd'],
            2,
            [node(a, 'active')],
          );
          continue;
        }
        const win = yield* linkStep(
          c,
          a,
          b,
          ['p1.loop', 'p1.meld'],
          `Pass 1, left to right: pair ${W.key(a)} with ${W.key(b)}. `,
        );
        pairs.push(win);
      }
      // Pass 2: meld right to left.
      c.vars.pass = 2;
      let h = pairs[pairs.length - 1]!;
      yield step(
        c,
        `Pass 2, right to left: start from the last tree, ${W.key(h)}, and meld each tree before it into the result.`,
        ['p2.start'],
        2,
        [node(h, 'active')],
      );
      for (let i = pairs.length - 2; i >= 0; i--) {
        h = yield* linkStep(
          c,
          pairs[i]!,
          h,
          ['p2.loop', 'p2.meld'],
          `Pass 2: meld ${W.key(pairs[i]!)} into the result. `,
        );
      }
      delete c.vars.pass;
    }
    c.vars.returned = min;
    yield step(
      c,
      `Return ${min}. ${plural(kids.length, 'tree')} became one with ${plural(W.links, 'link')}. ${summary(W)}`,
      ['del.return'],
      1,
      [node(W.roots[0]!, 'done'), mark('out', 'found')],
    );
    return W.snap();
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const c = ctx({ nodes: {}, roots: [], nextUid: s.nextUid });
    yield step(c, 'clear(): root = nil. The heap is empty.', ['clr.reset'], 1, []);
    return c.W.snap();
  },
};

export const ops = { insert, deleteMin, decrease, meld, clear };

// ---------------------------------------------------------------------------------------------

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const meldLines = [
  L('meld.sig', 0, 'meld(a, b)', 'To meld two heaps:'),
  L(
    'meld.nil',
    1,
    'if a == nil: return b; if b == nil: return a',
    'if one is empty, return the other.',
  ),
  L('meld.cmp', 1, 'if b.key < a.key: swap a and b', 'Let a be the root with the smaller key.'),
  L(
    'meld.link',
    1,
    'make b the first child of a; return a',
    'Hang b under a, in front of its children.',
  ),
];

export function pseudocode(settings: PairSettings): PseudoBlock[] {
  const passes =
    settings.pass === 'multipass'
      ? [
          L('mp.loop', 1, 'while list has two or more trees', 'While more than one tree is left,'),
          L('mp.meld', 2, 'h = meld(first, second)', 'meld the first two'),
          L('mp.back', 2, 'append h to the end of list', 'and put the result at the back.'),
        ]
      : [
          L('p1.loop', 1, 'for i = 1, 3, 5, ... (left to right)', 'Pass 1, left to right:'),
          L('p1.meld', 2, 'pair[i] = meld(list[i], list[i + 1])', 'meld the trees in pairs.'),
          L('p1.odd', 2, 'an odd tree out stays as it is', 'An odd one at the end waits.'),
          L('p2.start', 1, 'h = the last pair', 'Pass 2, from the right:'),
          L('p2.loop', 1, 'for each earlier pair, right to left', 'for each pair before it,'),
          L('p2.meld', 2, 'h = meld(pair, h)', 'meld it into the result.'),
        ];
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(key)', 'To insert a key:'),
        L('ins.new', 1, 'x = a new node holding key', 'make a one-node heap'),
        L('ins.meld', 1, 'root = meld(root, x)', 'and meld it with the heap.'),
        ...meldLines,
      ],
    },
    {
      op: 'deleteMin',
      lines: [
        L('del.sig', 0, 'deleteMin()', 'To remove the minimum:'),
        L('del.empty', 1, 'if root == nil: error "heap is empty"', 'If the heap is empty, stop.'),
        L('del.min', 1, 'min = root.key', 'The minimum is the root.'),
        L(
          'del.kids',
          1,
          'list = the children of root, left to right',
          'Its children become separate heaps.',
        ),
        ...passes,
        L('del.return', 1, 'root = h; return min', 'The one tree left is the heap.'),
        ...meldLines,
      ],
    },
    {
      op: 'decrease',
      lines: [
        L('dec.sig', 0, 'decreaseKey(x, k)', 'To lower the key of node x to k:'),
        L('dec.check', 1, 'if k > x.key: error "new key is larger"', 'refuse a larger key.'),
        L('dec.set', 1, 'x.key = k', 'Write the new key.'),
        L('dec.root', 1, 'if x ≠ root', 'Unless x is the root,'),
        L(
          'dec.cut',
          2,
          'cut x and its subtree from its parent',
          'cut x off with everything under it',
        ),
        L('dec.meld', 2, 'root = meld(root, x)', 'and meld it back in.'),
        ...meldLines,
      ],
    },
    {
      op: 'meld',
      lines: [
        L('mld.sig', 0, 'root = meld(H.root, H2.root)', 'To meld two heaps, link their roots.'),
        ...meldLines,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the heap:'),
        L('clr.reset', 1, 'root = nil', 'forget the root.'),
      ],
    },
  ];
}

export function initialSay(_s: S, settings: PairSettings): string {
  return `An empty pairing heap. Insert and meld cost one comparison each; deleteMin does the real work, pairing up the root's children ${settings.pass === 'multipass' ? 'over and over, front to back' : 'in two passes'}.`;
}

export function initialVars(): Record<string, Scalar> {
  return { N: 0, trees: 0, 'root degree': '–', comparisons: 0, links: 0 };
}

export function describe(s: S): string {
  const n = count(s.nodes, s.roots);
  if (n === 0) return 'An empty pairing heap.';
  const parts = preorder(s.nodes, s.roots)
    .filter((u) => s.nodes[u]!.kids.length > 0)
    .map(
      (u) =>
        `${s.nodes[u]!.key} has children ${s.nodes[u]!.kids.map((v) => s.nodes[v]!.key).join(', ')}`,
    );
  const trees =
    s.roots.length === 1
      ? `The root is ${s.nodes[s.roots[0]!]!.key}.`
      : `${s.roots.length} trees, rooted at ${s.roots.map((u) => s.nodes[u]!.key).join(', ')}.`;
  return `A pairing heap with ${plural(n, 'key')}. ${trees}${parts.length ? ` ${parts.join('; ')}.` : ''}`;
}
