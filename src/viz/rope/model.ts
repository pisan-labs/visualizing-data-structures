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

/** A leaf holds a piece of text; an internal node joins a left and a right rope. */
export interface RNode {
  uid: number;
  /** The piece of text, for a leaf; null for an internal node. */
  text: string | null;
  left: number | null;
  right: number | null;
  /** Characters under this node, in total. */
  len: number;
}

export interface RopeState {
  nodes: Record<number, RNode>;
  root: number | null;
  /** The right part after a split, until it is joined back. */
  other: number | null;
  nextUid: number;
}

export interface RopeSettings {
  [key: string]: Scalar;
  /** Longest piece build puts in one leaf. */
  leaf: number;
  /** left: a node stores the length of its left subtree (the usual rope). total: its own length. */
  weight: 'left' | 'total';
}

export interface RopeExtra {
  /** A character handed back by index. */
  out?: { text: string; label: string };
  arg?: { label: string; text: string };
  /** The index being looked for, drawn under the string. */
  at?: number;
  /** A range of the string being cut out or inserted at, [from, to). */
  range?: [number, number];
}

type S = RopeState;
type X = RopeExtra;
type Op = OpSpec<S, RopeSettings, X>;
type RStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MAX_LEN = 40;
export const MAX_PIECE = 12;

export const defaults: RopeSettings = { leaf: 4, weight: 'left' };

export function init(): S {
  return { nodes: {}, root: null, other: null, nextUid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const node = (uid: number, role: MarkRole) => mark(nodeShapeId(uid), role);
export const charId = (rope: 'r' | 's', i: number) => `ch-${rope}-${i}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const show = (t: string) => t.replace(/ /g, '␣');

// ---------------------------------------------------------------------------------------------
// Arguments

const INT = /^-?\d+$/;

export function parseText(raw: Value): string | Error {
  const t = String(raw);
  if (t.length === 0) return new Error('Type some text first.');
  if (t.length > MAX_LEN) return new Error(`Keep the text to ${MAX_LEN} characters.`);
  if (!/^[\x20-\x7e]+$/.test(t)) return new Error('Use plain letters, digits and punctuation.');
  return t;
}

export function parseIndex(raw: Value): number | Error {
  const t = String(raw).trim();
  if (!INT.test(t)) return new Error('An index is a whole number, such as 3.');
  return Number(t);
}

// ---------------------------------------------------------------------------------------------
// Tree helpers

export function textOf(nodes: Record<number, RNode>, u: number | null): string {
  if (u === null) return '';
  const v = nodes[u]!;
  return v.text ?? textOf(nodes, v.left) + textOf(nodes, v.right);
}

export function heightOf(nodes: Record<number, RNode>, u: number | null): number {
  if (u === null) return -1;
  const v = nodes[u]!;
  return v.text !== null ? 0 : 1 + Math.max(heightOf(nodes, v.left), heightOf(nodes, v.right));
}

export function leavesOf(nodes: Record<number, RNode>, u: number | null): number[] {
  if (u === null) return [];
  const v = nodes[u]!;
  return v.text !== null ? [u] : [...leavesOf(nodes, v.left), ...leavesOf(nodes, v.right)];
}

/** The number a node shows: its left subtree's length, or (with total weights, or a leaf) its own. */
export function weightOf(nodes: Record<number, RNode>, u: number, st: RopeSettings): number {
  const v = nodes[u]!;
  if (v.text !== null || st.weight === 'total') return v.len;
  return v.left === null ? 0 : nodes[v.left]!.len;
}

class Work {
  nodes: Record<number, RNode>;
  root: number | null;
  other: number | null;
  nextUid: number;
  visited = 0;

  constructor(s: S) {
    this.nodes = {};
    for (const [k, v] of Object.entries(s.nodes)) this.nodes[Number(k)] = { ...v };
    this.root = s.root;
    this.other = s.other;
    this.nextUid = s.nextUid;
  }

  snap(): S {
    const nodes: Record<number, RNode> = {};
    const keep = (u: number | null) => {
      if (u === null) return;
      const v = this.nodes[u]!;
      nodes[u] = { ...v };
      keep(v.left);
      keep(v.right);
    };
    keep(this.root);
    keep(this.other);
    return { nodes, root: this.root, other: this.other, nextUid: this.nextUid };
  }

  leaf(text: string, uid = this.nextUid++): number {
    this.nodes[uid] = { uid, text, left: null, right: null, len: text.length };
    return uid;
  }

  /** A node joining a and b (either may be null); reuses `uid` when given. */
  concat(a: number | null, b: number | null, uid?: number): number | null {
    if (a === null) return b;
    if (b === null) return a;
    const id = uid ?? this.nextUid++;
    this.nodes[id] = {
      uid: id,
      text: null,
      left: a,
      right: b,
      len: this.nodes[a]!.len + this.nodes[b]!.len,
    };
    return id;
  }

  len(u: number | null): number {
    return u === null ? 0 : this.nodes[u]!.len;
  }
}

interface Ctx {
  W: Work;
  st: RopeSettings;
  extra: X;
  vars: Record<string, Scalar>;
  /** While a split walks down, the drawing keeps the rope as it was before the walk. */
  frozen?: S;
}

function ctx(s: S, st: RopeSettings, vars: Record<string, Scalar> = {}): Ctx {
  return { W: new Work(s), st, extra: {}, vars };
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): RStep {
  const state = c.frozen ?? c.W.snap();
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      length: c.W.len(state.root),
      leaves: leavesOf(state.nodes, state.root).length,
      height: heightOf(state.nodes, state.root),
      ...c.vars,
      'nodes visited': c.W.visited,
    },
    level,
    extra: { ...c.extra },
  };
}

function* refuse(
  s: S,
  st: RopeSettings,
  say: string,
  line: string,
  arg: { label: string; text: string },
): Generator<RStep, S, void> {
  const c = ctx(s, st);
  c.extra.arg = arg;
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
  return s;
}

/** A balanced rope over `text`, cut into pieces of at most `leaf` characters. */
function buildBalanced(W: Work, text: string, leaf: number): number | null {
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += leaf) pieces.push(text.slice(i, i + leaf));
  const make = (lo: number, hi: number): number | null => {
    if (lo >= hi) return null;
    if (hi - lo === 1) return W.leaf(pieces[lo]!);
    const mid = Math.ceil((lo + hi) / 2);
    const a = make(lo, mid);
    const b = make(mid, hi);
    return W.concat(a, b);
  };
  return make(0, pieces.length);
}

// ---------------------------------------------------------------------------------------------
// Split, with a step for every node on the path. Returns the two ropes.

function* split(
  c: Ctx,
  u: number | null,
  i: number,
  base: number,
): Generator<RStep, [number | null, number | null], void> {
  const { W } = c;
  if (u === null) return [null, null];
  const v = W.nodes[u]!;
  W.visited += 1;
  if (v.text !== null) {
    if (i === 0 || i === v.len) {
      yield step(
        c,
        `Position ${base + i} falls ${i === 0 ? 'just before' : 'just after'} the leaf "${show(v.text)}", so nothing inside it is cut.`,
        ['sp.leaf'],
        3,
        [node(u, 'compare')],
      );
      return i === 0 ? [null, u] : [u, null];
    }
    const a = W.leaf(v.text.slice(0, i), u);
    const b = W.leaf(v.text.slice(i));
    yield step(
      c,
      `Position ${base + i} is inside the leaf "${show(v.text)}": cut it into "${show(v.text.slice(0, i))}" and "${show(v.text.slice(i))}". Only this leaf is copied, ${plural(v.len, 'character')}.`,
      ['sp.leaf', 'sp.cut'],
      2,
      [node(u, 'active')],
    );
    return [a, b];
  }
  const lw = W.len(v.left);
  const shown = weightOf(W.nodes, u, c.st);
  const cmpText = c.st.weight === 'left' ? `weight ${shown}` : `the left child's length, ${lw}`;
  if (i < lw) {
    yield step(
      c,
      `At this node, ${base + i} is before ${cmpText} (counting from ${base}): go left. The right subtree goes wholly to the right part.`,
      ['sp.cmp', 'sp.left'],
      3,
      [node(u, 'active'), ...(v.left !== null ? [node(v.left, 'compare')] : [])],
    );
    const [a, b] = yield* split(c, v.left, i, base);
    return [a, W.concat(b, v.right, u)];
  }
  if (i === lw) {
    yield step(
      c,
      `The cut falls exactly between this node's two subtrees: the left goes to the left part, the right to the right part.`,
      ['sp.cmp', 'sp.edge'],
      3,
      [node(u, 'active')],
    );
    return [v.left, v.right];
  }
  yield step(
    c,
    `At this node, ${base + i} is past ${cmpText}: go right, looking for position ${i - lw} there. The left subtree stays in the left part.`,
    ['sp.cmp', 'sp.right'],
    3,
    [node(u, 'active'), ...(v.right !== null ? [node(v.right, 'compare')] : [])],
  );
  const [a, b] = yield* split(c, v.right, i - lw, base + lw);
  return [W.concat(v.left, a, u), b];
}

function forget(c: Ctx) {
  delete c.extra.at;
  delete c.extra.range;
}

// ---------------------------------------------------------------------------------------------

const load: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [raw], { settings }) {
    const text = parseText(raw!);
    if (text instanceof Error)
      return yield* refuse(s, settings, `build: ${text.message}`, 'ld.sig', {
        label: 'text',
        text: String(raw),
      });
    if (text.length > MAX_LEN)
      return yield* refuse(
        s,
        settings,
        `build: keep the text to ${MAX_LEN} characters.`,
        'ld.sig',
        {
          label: 'text',
          text,
        },
      );
    const c = ctx(s, settings);
    const { W } = c;
    const leaf = Math.max(2, Math.min(6, Math.round(Number(settings.leaf) || 4)));
    W.root = buildBalanced(W, text, leaf);
    W.other = null;
    const n = leavesOf(W.nodes, W.root).length;
    yield step(
      c,
      `build("${show(text)}"): cut the text into ${plural(n, 'piece')} of at most ${leaf} characters and join them pairwise into a balanced tree. Each node's number is ${settings.weight === 'left' ? 'its weight: the length of its left subtree' : 'the length of its own subtree'}.`,
      ['ld.cut', 'ld.join'],
      1,
      leavesOf(W.nodes, W.root).map((u) => node(u, 'new')),
    );
    return W.snap();
  },
};

const index: Op = {
  label: 'Index',
  arity: 1,
  *run(s, [raw], { settings }) {
    const i = parseIndex(raw!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `index(${String(raw)}): ${i.message}`, 'ix.sig', {
        label: 'i',
        text: String(raw),
      });
    const c = ctx(s, settings, { i });
    const { W } = c;
    const n = W.len(W.root);
    if (i < 0 || i >= n) {
      c.extra.arg = { label: 'i', text: String(i) };
      yield step(
        c,
        n === 0
          ? `index(${i}): the rope is empty.`
          : `index(${i}): the rope has ${n} characters, at indices 0 to ${n - 1}.`,
        ['ix.range'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    c.vars['flat string'] = 'O(1)';
    c.extra.at = i;
    let u = W.root!;
    let j = i;
    for (;;) {
      const v = W.nodes[u]!;
      W.visited += 1;
      if (v.text !== null) {
        const ch = v.text[j]!;
        c.vars.returned = ch;
        c.extra.out = { text: show(ch), label: `[${i}]` };
        yield step(
          c,
          `A leaf: "${show(v.text)}". Character ${j} of it is "${show(ch)}". Return "${show(ch)}" after visiting ${plural(W.visited, 'node')}, one per level.`,
          ['ix.leaf'],
          1,
          [node(u, 'found'), mark(charId('r', i), 'found'), mark('out', 'found')],
        );
        return s;
      }
      const lw = W.len(v.left);
      const w = weightOf(W.nodes, u, settings);
      const what = settings.weight === 'left' ? `the weight ${w}` : `the left child's length ${lw}`;
      if (j < lw) {
        yield step(
          c,
          `i = ${j} is less than ${what}: the character is in the left subtree. Go left with i = ${j}.`,
          ['ix.cmp', 'ix.left'],
          2,
          [node(u, 'active'), node(v.left!, 'compare'), mark(charId('r', i), 'active')],
        );
        u = v.left!;
      } else {
        yield step(
          c,
          `i = ${j} is at least ${what}: skip the ${lw} characters on the left. Go right with i = ${j} − ${lw} = ${j - lw}.`,
          ['ix.cmp', 'ix.right'],
          2,
          [node(u, 'active'), node(v.right!, 'compare'), mark(charId('r', i), 'active')],
        );
        j -= lw;
        u = v.right!;
      }
      c.vars.i = j;
    }
  },
};

const append: Op = {
  label: 'Append',
  arity: 1,
  *run(s, [raw], { settings }) {
    const t = parseText(raw!);
    if (t instanceof Error)
      return yield* refuse(s, settings, `append: ${t.message}`, 'ap.sig', {
        label: 'text',
        text: String(raw),
      });
    const text = String(t);
    const c = ctx(s, settings);
    const { W } = c;
    const n = W.len(W.root);
    if (n + text.length > MAX_LEN || text.length > MAX_PIECE) {
      c.extra.arg = { label: 'text', text };
      yield step(
        c,
        `append("${show(text)}"): keep pieces to ${MAX_PIECE} characters and the rope to ${MAX_LEN}.`,
        ['ap.sig'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    c.vars['flat string'] = n + text.length;
    const leaf = W.leaf(text);
    const old = W.root;
    W.root = W.concat(old, leaf);
    yield step(
      c,
      old === null
        ? `append("${show(text)}"): the rope was empty, so the new leaf is the whole rope.`
        : `append("${show(text)}"): make a leaf for "${show(text)}" and a new root with the old rope on its left. Its weight is ${n}, the old length. Nothing is copied; a flat string would copy all ${n + text.length} characters.`,
      ['ap.leaf', 'ap.root'],
      1,
      [node(leaf, 'new'), ...(W.root !== leaf ? [node(W.root!, 'new')] : [])],
    );
    return W.snap();
  },
};

const splitOp: Op = {
  label: 'Split at',
  arity: 1,
  *run(s, [raw], { settings }) {
    const i = parseIndex(raw!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `split(${String(raw)}): ${i.message}`, 'sp.sig', {
        label: 'i',
        text: String(raw),
      });
    const c = ctx(s, settings, { i });
    const { W } = c;
    const n = W.len(W.root);
    if (W.other !== null || i <= 0 || i >= n) {
      c.extra.arg = { label: 'i', text: String(i) };
      yield step(
        c,
        W.other !== null
          ? `split(${i}): join R2 back first; this page keeps at most two ropes.`
          : `split(${i}): pick a cut strictly inside the rope, from 1 to ${n - 1}, so both parts have text.`,
        ['sp.sig'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    c.vars['flat string'] = n;
    c.extra.range = [i, n];
    yield step(
      c,
      `split(${i}): cut the rope before position ${i}. Walk down from the root to the cut, as index does.`,
      ['sp.sig'],
      2,
      [node(W.root!, 'active')],
    );
    c.frozen = W.snap();
    const [a, b] = yield* split(c, W.root, i, 0);
    delete c.frozen;
    W.root = a;
    W.other = b;
    forget(c);
    yield step(
      c,
      `Two ropes: R holds the first ${i} characters, R2 the other ${n - i}. Only nodes on the path were touched (${plural(W.visited, 'node')}); a flat string would copy all ${n} characters.`,
      ['sp.ret'],
      1,
      [node(a!, 'done'), node(b!, 'new')],
    );
    return W.snap();
  },
};

const join: Op = {
  label: 'Join R2',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx(s, settings);
    const { W } = c;
    if (W.other === null) {
      yield step(c, 'join(): there is no R2 to join. Split the rope first.', ['jn.sig'], 1, []);
      return s;
    }
    const n = W.len(W.root);
    W.root = W.concat(W.root, W.other);
    W.other = null;
    c.vars['flat string'] = W.len(W.root);
    yield step(
      c,
      `join(): concat(R, R2) is one new root, with R on the left and weight ${n}. O(1).`,
      ['jn.root'],
      1,
      [node(W.root!, 'new')],
    );
    return W.snap();
  },
};

const insert: Op = {
  label: 'Insert text',
  arity: 2,
  *run(s, [rawI, rawT], { settings }) {
    const name = `insert(${String(rawI)}, ${String(rawT)})`;
    const i = parseIndex(rawI!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, 'in.sig', {
        label: 'i',
        text: String(rawI),
      });
    const t = parseText(rawT!);
    if (t instanceof Error)
      return yield* refuse(s, settings, `${name}: ${t.message}`, 'in.sig', {
        label: 'text',
        text: String(rawT),
      });
    const text = String(t);
    const c = ctx(s, settings, { i });
    const { W } = c;
    const n = W.len(W.root);
    if (
      W.other !== null ||
      i < 0 ||
      i > n ||
      n + text.length > MAX_LEN ||
      text.length > MAX_PIECE
    ) {
      c.extra.arg = { label: 'i', text: String(i) };
      yield step(
        c,
        W.other !== null
          ? `${name}: join R2 back first.`
          : i < 0 || i > n
            ? `${name}: insert at a position from 0 to ${n}.`
            : `${name}: keep pieces to ${MAX_PIECE} characters and the rope to ${MAX_LEN}.`,
        ['in.sig'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    c.vars['flat string'] = n + text.length;
    c.extra.range = [i, i];
    yield step(
      c,
      `insert(${i}, "${show(text)}"): split at ${i}, then concat the left part, a new leaf, and the right part.`,
      ['in.split'],
      2,
      W.root !== null ? [node(W.root, 'active')] : [],
    );
    c.frozen = W.snap();
    const [a, b] = yield* split(c, W.root, i, 0);
    delete c.frozen;
    W.root = a;
    W.other = b;
    forget(c);
    if (a !== null && b !== null)
      yield step(
        c,
        `The rope is now in two parts: before ${i} and from ${i} on.`,
        ['in.split'],
        2,
        [node(a, 'done'), node(b, 'done')],
      );
    const leaf = W.leaf(text);
    W.root = W.concat(W.concat(a, leaf), b);
    W.other = null;
    yield step(
      c,
      `concat(concat(left, "${show(text)}"), right): two new internal nodes at most, nothing copied but the cut leaf. A flat string would move ${n - i} characters, or copy all ${n + text.length} if strings are immutable.`,
      ['in.concat'],
      1,
      [node(leaf, 'new')],
    );
    return W.snap();
  },
};

const del: Op = {
  label: 'Delete text',
  arity: 2,
  *run(s, [rawI, rawL], { settings }) {
    const name = `delete(${String(rawI)}, ${String(rawL)})`;
    const i = parseIndex(rawI!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, 'dl.sig', {
        label: 'i',
        text: String(rawI),
      });
    const len = parseIndex(rawL!);
    if (len instanceof Error)
      return yield* refuse(s, settings, `${name}: ${len.message}`, 'dl.sig', {
        label: 'len',
        text: String(rawL),
      });
    const c = ctx(s, settings, { i, len });
    const { W } = c;
    const n = W.len(W.root);
    if (W.other !== null || len < 1 || i < 0 || i + len > n) {
      c.extra.arg = { label: 'i', text: String(i) };
      yield step(
        c,
        W.other !== null
          ? `${name}: join R2 back first.`
          : `${name}: delete at least one character, all inside 0 to ${n - 1}.`,
        ['dl.sig'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    c.vars['flat string'] = n - len;
    c.extra.range = [i, i + len];
    yield step(
      c,
      `delete(${i}, ${len}): split at ${i}, split what is left at ${len}, and join the outer parts.`,
      ['dl.split1'],
      2,
      [node(W.root!, 'active')],
    );
    c.frozen = W.snap();
    const [a, rest] = yield* split(c, W.root, i, 0);
    delete c.frozen;
    W.root = a;
    W.other = rest;
    if (a !== null)
      yield step(
        c,
        `First cut done: R holds the ${i} characters before ${i}, R2 the rest. Now cut R2 after ${len} characters.`,
        ['dl.split1'],
        2,
        [node(a, 'done'), node(rest!, 'active')],
      );
    c.frozen = W.snap();
    const [mid, b] = yield* split(c, rest, len, i);
    delete c.frozen;
    W.root = W.concat(a, mid);
    W.other = b;
    // Show the three parts: the doomed middle hangs on the left part for one step.
    forget(c);
    yield step(
      c,
      `The middle part, "${show(textOf(W.nodes, mid))}", is cut out.`,
      ['dl.split2'],
      2,
      [...leavesOf(W.nodes, mid).map((u) => node(u, 'remove'))],
    );
    W.root = W.concat(a, b);
    W.other = null;
    yield step(
      c,
      `concat(left, right): the rope is ${n - len} characters long. A flat string would move ${n - i - len} characters to close the gap.`,
      ['dl.concat'],
      1,
      W.root !== null ? [node(W.root, 'done')] : [],
    );
    return W.snap();
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx({ nodes: {}, root: null, other: null, nextUid: s.nextUid }, settings);
    yield step(c, 'clear(): the rope is empty.', ['clr.reset'], 1, []);
    return c.W.snap();
  },
};

export const ops = { load, index, append, insert, delete: del, split: splitOp, join, clear };

// ---------------------------------------------------------------------------------------------

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: RopeSettings): PseudoBlock[] {
  const left = st.weight === 'left';
  const w = left ? 'node.weight' : 'len(node.left)';
  const splitLines = [
    L('sp.sig', 0, 'split(node, i)', 'To cut a rope before position i:'),
    L('sp.leaf', 1, 'if node is a leaf', 'at a leaf,'),
    L('sp.cut', 2, 'return leaf(text[0..i)), leaf(text[i..])', 'cut its text in two.'),
    L('sp.cmp', 1, `if i < ${w}`, 'If the cut is in the left subtree,'),
    L(
      'sp.left',
      2,
      '(a, b) = split(node.left, i); return a, concat(b, node.right)',
      'split there; the right subtree joins the right part.',
    ),
    L(
      'sp.edge',
      1,
      `elseif i == ${w}: return node.left, node.right`,
      'If it falls between the subtrees, part them.',
    ),
    L(
      'sp.right',
      1,
      `else (a, b) = split(node.right, i − ${w}); return concat(node.left, a), b`,
      'Otherwise split the right subtree; the left one joins the left part.',
    ),
    L('sp.ret', 1, 'R = left part; R2 = right part', 'Keep both parts.'),
  ];
  const concat = L(
    'cc.sig',
    0,
    left
      ? 'concat(a, b) = node(left = a, right = b, weight = len(a))'
      : 'concat(a, b) = node(left = a, right = b, len = len(a) + len(b))',
    'Joining two ropes is one new node.',
  );
  return [
    {
      op: 'load',
      lines: [
        L('ld.sig', 0, 'build(text)', 'To build a rope from text:'),
        L('ld.cut', 1, 'cut text into pieces of at most L characters', 'cut it into short pieces'),
        L(
          'ld.join',
          1,
          'join neighbouring pieces pairwise, level by level',
          'and join them into a balanced tree.',
        ),
        concat,
      ],
    },
    {
      op: 'index',
      lines: [
        L('ix.sig', 0, 'index(node, i)', 'To find character i:'),
        L('ix.range', 1, 'if i < 0 or i ≥ len(rope): error', 'refuse an index outside the rope.'),
        L('ix.leaf', 1, 'if node is a leaf: return node.text[i]', 'At a leaf, read the character.'),
        L('ix.cmp', 1, `if i < ${w}`, 'If i is inside the left part,'),
        L('ix.left', 2, 'return index(node.left, i)', 'go left.'),
        L(
          'ix.right',
          1,
          `else return index(node.right, i − ${w})`,
          'Otherwise skip the left part and go right.',
        ),
      ],
    },
    {
      op: 'append',
      lines: [
        L('ap.sig', 0, 'append(text)', 'To add text at the end:'),
        L('ap.leaf', 1, 'x = leaf(text)', 'make a leaf,'),
        L('ap.root', 1, 'root = concat(root, x)', 'and a new root above the rope and the leaf.'),
        concat,
      ],
    },
    {
      op: 'insert',
      lines: [
        L('in.sig', 0, 'insert(i, text)', 'To insert text at position i:'),
        L('in.split', 1, '(a, b) = split(root, i)', 'cut the rope at i,'),
        L(
          'in.concat',
          1,
          'root = concat(concat(a, leaf(text)), b)',
          'and join left part, new text and right part.',
        ),
        ...splitLines,
        concat,
      ],
    },
    {
      op: 'delete',
      lines: [
        L('dl.sig', 0, 'delete(i, len)', 'To delete len characters from position i:'),
        L('dl.split1', 1, '(a, rest) = split(root, i)', 'cut the rope at i,'),
        L('dl.split2', 1, '(mid, b) = split(rest, len)', 'cut the rest after len characters,'),
        L('dl.concat', 1, 'root = concat(a, b)', 'and join the outer parts, dropping the middle.'),
        ...splitLines,
        concat,
      ],
    },
    { op: 'split', lines: splitLines.concat([concat]) },
    {
      op: 'join',
      lines: [
        L('jn.sig', 0, 'join()', 'To put the two ropes back together:'),
        L('jn.root', 1, 'root = concat(R, R2)', 'one new node.'),
        concat,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the rope:'),
        L('clr.reset', 1, 'root = nil', 'forget the root.'),
      ],
    },
  ];
}

export function initialSay(_s: S, st: RopeSettings): string {
  return `An empty rope. Build one from some text: the text is cut into leaves of at most ${st.leaf} characters, joined by a balanced tree.`;
}

export function initialVars(): Record<string, Scalar> {
  return { length: 0, leaves: 0, height: -1, 'nodes visited': 0 };
}

export function describe(s: S): string {
  if (s.root === null) return 'An empty rope.';
  const leaves = leavesOf(s.nodes, s.root).map((u) => `"${s.nodes[u]!.text}"`);
  const main = `A rope holding "${textOf(s.nodes, s.root)}", in ${plural(leaves.length, 'leaf', 'leaves')}: ${leaves.join(', ')}. Height ${heightOf(s.nodes, s.root)}.`;
  return s.other === null ? main : `${main} R2 holds "${textOf(s.nodes, s.other)}".`;
}
