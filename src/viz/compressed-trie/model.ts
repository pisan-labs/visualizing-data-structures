import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { trieEdgeId, trieLabelId, trieNodeId } from '../../layouts/trie';
import { and, plural, readWord } from '../_trie/words';

export interface RNode {
  uid: number;
  /** The letters on the edge into this node; '' for the root. */
  label: string;
  /** A word ends at this node. */
  end: boolean;
  /** Children, in alphabetical order of the first letter of their edges. */
  kids: number[];
  parent: number | null;
}

export interface RadixState {
  nodes: Record<number, RNode>;
  root: number;
  nextUid: number;
}

/** The compressed trie has no options: its shape follows from its words. */
export type RadixSettings = Record<string, Scalar>;

export interface RadixExtra {
  /** The word or prefix being processed, as letter cells. Letters before `at` are matched. */
  arg?: { name: 'word' | 'prefix'; text: string; at: number; bad?: boolean };
  /** Nodes on the way down so far. */
  path?: number[];
  /** Nodes the startsWith walk has visited so far. */
  seen?: number[];
  /** Words startsWith has written so far. */
  output?: string[];
  /** A node made in this step: it slides out of its parent. */
  fresh?: number;
  /** The edge `was` just split into `top` (new node `node`) and `bottom`. */
  split?: { node: number; was: string; top: string; bottom: string };
  /** Node `node`'s edge `top` just took in its only child's edge `bottom`. */
  merge?: { node: number; top: string; bottom: string };
}

type S = RadixState;
type X = RadixExtra;
type Op = OpSpec<S, RadixSettings, X>;
type RadixStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: RadixSettings = {};

export const ROOT = 0;

export function init(): S {
  return {
    nodes: { [ROOT]: { uid: ROOT, label: '', end: false, kids: [], parent: null } },
    root: ROOT,
    nextUid: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (i: number) => `arg-${i}`;
const nodeMark = (u: number, role: Mark['role']) => mark(trieNodeId(u), role);
const edgeMark = (u: number, role: Mark['role']) => mark(trieEdgeId(u), role);
const labelMark = (u: number, role: Mark['role']) => mark(trieLabelId(u), role);
/** Marks for the letter cells from `from` up to (not including) `to`. */
const cells = (from: number, to: number, role: Mark['role']) =>
  Array.from({ length: Math.max(0, to - from) }, (_, i) => mark(cellId(from + i), role));

const q = (s: string) => `"${s}"`;
const allMatch = (k: number) =>
  k === 1 ? 'its one letter matches' : `all ${k} of its letters match`;

// ---------------------------------------------------------------------------------------------
// Reading a state

/** The letters on the path from the root down to u. */
export function spell(s: S, u: number): string {
  let out = '';
  for (let x: number | null = u; x !== null; x = s.nodes[x]!.parent) out = s.nodes[x]!.label + out;
  return out;
}

/** Every word at or below u, in alphabetical order. */
export function wordsBelow(s: S, u: number): string[] {
  const out: string[] = [];
  const walk = (x: number, w: string) => {
    const n = s.nodes[x]!;
    if (n.end) out.push(w);
    for (const k of n.kids) walk(k, w + s.nodes[k]!.label);
  };
  walk(u, spell(s, u));
  return out;
}

export const wordsOf = (s: S) => wordsBelow(s, s.root);
export const nodeCount = (s: S) => Object.keys(s.nodes).length;

export function heightOf(s: S): number {
  const h = (u: number): number => Math.max(0, ...s.nodes[u]!.kids.map((k) => 1 + h(k)));
  return h(s.root);
}

/** Letters on all the edges: a plain trie for the same words has this many nodes plus one. */
export const letterCount = (s: S) =>
  Object.values(s.nodes).reduce((sum, n) => sum + n.label.length, 0);

function counts(s: S): Record<string, Scalar> {
  return { words: wordsOf(s).length, nodes: nodeCount(s), height: heightOf(s) };
}

/** Length of the longest common prefix of a and b. */
export function common(a: string, b: string): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

// ---------------------------------------------------------------------------------------------
// A working copy. Operations change it and yield snapshots.

class Work {
  nodes: Record<number, RNode>;
  root: number;
  nextUid: number;

  constructor(s: S) {
    this.nodes = Object.fromEntries(
      Object.entries(s.nodes).map(([k, n]) => [k, { ...n, kids: [...n.kids] }]),
    );
    this.root = s.root;
    this.nextUid = s.nextUid;
  }

  snap(): S {
    const nodes = Object.fromEntries(
      Object.entries(this.nodes).map(([k, n]) => [k, { ...n, kids: [...n.kids] }]),
    ) as Record<number, RNode>;
    return { nodes, root: this.root, nextUid: this.nextUid };
  }

  n(u: number): RNode {
    return this.nodes[u]!;
  }

  /** The child of u whose edge starts with ch. */
  child(u: number, ch: string): number | null {
    return this.n(u).kids.find((k) => this.n(k).label[0] === ch) ?? null;
  }

  /** A new leaf under u on an edge labeled `label`, kept in alphabetical order. */
  leaf(u: number, label: string): number {
    const uid = this.nextUid++;
    this.nodes[uid] = { uid, label, end: true, kids: [], parent: u };
    const kids = this.n(u).kids;
    const at = kids.findIndex((k) => this.n(k).label[0]! > label[0]!);
    kids.splice(at < 0 ? kids.length : at, 0, uid);
    return uid;
  }

  /** Split y's edge after k letters: a new node m takes the first k, and y hangs below it. */
  split(y: number, k: number): number {
    const n = this.n(y);
    const p = this.n(n.parent!);
    const m = this.nextUid++;
    this.nodes[m] = { uid: m, label: n.label.slice(0, k), end: false, kids: [y], parent: p.uid };
    p.kids = p.kids.map((c) => (c === y ? m : c));
    n.label = n.label.slice(k);
    n.parent = m;
    return m;
  }

  /** x has one child and ends no word: x takes in the child's edge, end mark and children. */
  merge(x: number): number {
    const n = this.n(x);
    const c = this.n(n.kids[0]!);
    n.label += c.label;
    n.end = c.end;
    n.kids = c.kids;
    for (const k of n.kids) this.n(k).parent = x;
    delete this.nodes[c.uid];
    return c.uid;
  }

  /** Take leaf u out of the trie. */
  remove(u: number): void {
    const p = this.n(u).parent!;
    this.n(p).kids = this.n(p).kids.filter((k) => k !== u);
    delete this.nodes[u];
  }
}

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
): RadixStep {
  const state = c.W.snap();
  const extra: X = { ...c.extra, ...more };
  if (extra.arg) extra.arg = { ...extra.arg };
  if (extra.path) extra.path = [...extra.path];
  if (extra.seen) extra.seen = [...extra.seen];
  if (extra.output) extra.output = [...extra.output];
  return { state, marks, say, lines, vars: { ...counts(state), ...c.vars }, level, extra };
}

function* badArg(s: S, name: string, raw: Value | undefined, err: Error, line: string) {
  const c: Ctx = {
    W: new Work(s),
    extra: { arg: { name: 'word', text: String(raw ?? ''), at: 0, bad: true } },
    vars: {},
  };
  yield step(c, `${name}(${String(raw ?? '')}): ${err.message} The trie is unchanged.`, [line], 1, [
    mark('arg-bad', 'error'),
  ]);
  return s;
}

/** Up to three words below u, then "more". */
function longer(W: Work, u: number): string[] {
  const ws = wordsBelow(W, u);
  return ws.length > 3 ? [...ws.slice(0, 3), 'more'] : ws;
}

const nodeName = (W: Work, u: number) =>
  u === W.root ? 'the root' : `the node for ${spell(W, u)}`;

/** How a walk down the edges ended. */
type Walk =
  /** Every letter matched, ending at node x. */
  | { kind: 'node'; x: number }
  /** The letters ran out partway along the edge into x (`into` letters of it matched). */
  | { kind: 'inside'; x: number; into: number }
  /** No edge from x starts with the next letter, at index i of the word. */
  | { kind: 'none'; x: number; i: number }
  /** The edge into y and the word differ at index i of the word. */
  | { kind: 'differ'; x: number; y: number; i: number };

/**
 * Walk down from the root along the letters of w, one step per edge that matches in full. The
 * last step (a miss, or the end of the letters) is left to the caller, which narrates it.
 */
function* descend(
  c: Ctx,
  w: string,
  lines: string[],
  level: Level,
): Generator<RadixStep, Walk, void> {
  const W = c.W;
  let x = W.root;
  let i = 0;
  const path = [x];
  c.extra.path = path;
  while (i < w.length) {
    c.extra.arg!.at = i;
    const y = W.child(x, w[i]!);
    if (y === null) return { kind: 'none', x, i };
    const label = W.n(y).label;
    const k = common(label, w.slice(i));
    if (k < label.length) {
      if (i + k === w.length) return { kind: 'inside', x: y, into: k };
      return { kind: 'differ', x, y, i: i + k };
    }
    x = y;
    path.push(x);
    c.vars.x = spell(W, x);
    const rest = w.slice(i + k);
    yield step(
      c,
      `The edge ${q(label)} starts with ${w[i]}, and ${allMatch(label.length)}, so follow it down. ${rest ? `Left: ${rest}.` : 'No letters left.'}`,
      lines,
      level,
      [...cells(i, i + k, 'active'), edgeMark(x, 'active'), nodeMark(x, 'active')],
    );
    i += k;
  }
  c.extra.arg!.at = w.length;
  return { kind: 'node', x };
}

const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** Narration for a walk that fell off the trie, then `conclusion`. */
function missSay(W: Work, w: string, walk: Walk, conclusion: string): string {
  if (walk.kind === 'none')
    return `No edge from ${nodeName(W, walk.x)} starts with ${w[walk.i]}. ${conclusion}`;
  if (walk.kind === 'differ') {
    const label = W.n(walk.y).label;
    const k = walk.i - spell(W, walk.x).length;
    return `The edge ${q(label)} starts with ${w[walk.i - k]}, but its ${ordinal(k + 1)} letter is ${label[k]}, and ${w} has ${w[walk.i]} there. ${conclusion}`;
  }
  return conclusion;
}

function missMarks(W: Work, w: string, walk: Walk): Mark[] {
  if (walk.kind === 'none') return [mark(cellId(walk.i), 'error'), nodeMark(walk.x, 'error')];
  if (walk.kind === 'differ') {
    const start = spell(W, walk.x).length;
    return [
      ...cells(start, walk.i, 'active'),
      mark(cellId(walk.i), 'error'),
      edgeMark(walk.y, 'error'),
      labelMark(walk.y, 'error'),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const w = readWord(raw);
    if (w instanceof Error) return yield* badArg(s, 'insert', raw, w, 'ins.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'word', text: w, at: 0 } },
      vars: { word: w, s: w, x: 'root' },
    };
    yield step(
      c,
      `insert(${w}): start at the root with every letter still to place. At each node, look for the edge that starts with the next letter.`,
      ['ins.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const path = [W.root];
    c.extra.path = path;
    let x = W.root;
    let i = 0;
    while (i < w.length) {
      const rest = w.slice(i);
      c.extra.arg!.at = i;
      c.vars.s = rest;
      const y = W.child(x, w[i]!);
      if (y === null) {
        const u = W.leaf(x, rest);
        path.push(u);
        c.extra.arg!.at = w.length;
        c.vars.s = '';
        c.vars.x = w;
        yield step(
          c,
          `No edge from ${nodeName(W, x)} starts with ${w[i]}. Hang a new leaf on an edge labeled ${q(rest)}, marked as the end of a word. ${w} is in the trie.`,
          ['ins.loop', 'ins.find', 'ins.none', 'ins.leaf'],
          1,
          [...cells(i, w.length, 'new'), edgeMark(u, 'active'), nodeMark(u, 'new')],
          { fresh: u },
        );
        return W.snap();
      }
      const label = W.n(y).label;
      const k = common(label, rest);
      c.vars.k = k;
      if (k === label.length) {
        x = y;
        path.push(x);
        c.vars.x = spell(W, x);
        c.vars.s = w.slice(i + k);
        yield step(
          c,
          `The edge ${q(label)} starts with ${w[i]}, and ${allMatch(k)}, so go down it. ${i + k < w.length ? `Left to place: ${w.slice(i + k)}.` : 'Every letter is placed.'}`,
          ['ins.loop', 'ins.find', 'ins.common', 'ins.down'],
          2,
          [...cells(i, i + k, 'active'), edgeMark(x, 'active'), nodeMark(x, 'active')],
        );
        i += k;
        continue;
      }
      // The word and the edge part ways inside the edge: split it after k letters.
      const top = label.slice(0, k);
      const bottom = label.slice(k);
      yield step(
        c,
        `The edge ${q(label)} starts with ${w[i]}. ${rest} and ${q(label)} share ${q(top)}, then ${i + k < w.length ? `${rest} has ${w[i + k]} where the edge has ${label[k]}` : `${w} runs out inside the edge`}.`,
        ['ins.loop', 'ins.find', 'ins.common', 'ins.part'],
        2,
        [...cells(i, i + k, 'active'), edgeMark(y, 'active'), labelMark(y, 'active')],
      );
      const low = y;
      const m = W.split(y, k);
      x = m;
      path.push(m);
      i += k;
      c.vars.x = spell(W, m);
      c.vars.s = w.slice(i);
      const split = { node: m, was: label, top, bottom };
      if (i === w.length) {
        W.n(m).end = true;
        c.extra.arg!.at = w.length;
        yield step(
          c,
          `Split: the edge ${q(label)} becomes ${q(top)} and ${q(bottom)}, with a new node between them. ${w} ends exactly at the new node, so mark it as the end of a word. ${w} is in the trie.`,
          ['ins.split', 'split.new', 'split.cut', 'split.link', 'ins.down', 'ins.mark'],
          1,
          [nodeMark(m, 'new'), edgeMark(m, 'active'), labelMark(m, 'new'), labelMark(low, 'new')],
          { split, fresh: m },
        );
        return W.snap();
      }
      yield step(
        c,
        `Split: the edge ${q(label)} becomes ${q(top)} and ${q(bottom)}, with a new node between them. Go down to the new node. Left to place: ${w.slice(i)}.`,
        ['ins.split', 'split.new', 'split.cut', 'split.link', 'ins.down'],
        2,
        [
          ...cells(i - k, i, 'active'),
          nodeMark(m, 'new'),
          labelMark(m, 'new'),
          labelMark(low, 'new'),
        ],
        { split, fresh: m },
      );
    }
    c.extra.arg!.at = w.length;
    c.vars.s = '';
    if (W.n(x).end) {
      yield step(
        c,
        `insert(${w}): every letter matched, and this node already ends a word. ${w} was in the trie already, so nothing changes.`,
        ['ins.loop', 'ins.check', 'ins.dup'],
        1,
        [nodeMark(x, 'found')],
      );
      return s;
    }
    W.n(x).end = true;
    yield step(
      c,
      `Every letter is placed, and the path ends at a node, so no split is needed. Mark it as the end of a word: ${w} is in the trie.`,
      ['ins.loop', 'ins.check', 'ins.mark'],
      1,
      [nodeMark(x, 'done')],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// search

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const w = readWord(raw);
    if (w instanceof Error) return yield* badArg(s, 'search', raw, w, 'srch.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'word', text: w, at: 0 } },
      vars: { word: w, x: 'root' },
    };
    yield step(
      c,
      `search(${w}): start at the root. Each edge must match the next letters of ${w} in full.`,
      ['srch.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const walk = yield* descend(c, w, ['srch.loop', 'srch.find', 'srch.test', 'srch.down'], 2);
    if (walk.kind === 'none' || walk.kind === 'differ') {
      c.vars.found = false;
      yield step(
        c,
        missSay(W, w, walk, `${w} is not in the trie.`),
        ['srch.loop', 'srch.find', 'srch.test', 'srch.miss'],
        1,
        missMarks(W, w, walk),
      );
      return s;
    }
    if (walk.kind === 'inside') {
      const label = W.n(walk.x).label;
      c.vars.found = false;
      c.extra.arg!.at = w.length;
      const start = w.length - walk.into;
      yield step(
        c,
        `${w} runs out partway along the edge ${q(label)}, after ${q(label.slice(0, walk.into))}. No word ends in the middle of an edge, so ${w} is only the start of longer words: not found.`,
        ['srch.loop', 'srch.find', 'srch.test', 'srch.miss'],
        1,
        [
          ...cells(start, w.length, 'active'),
          edgeMark(walk.x, 'error'),
          labelMark(walk.x, 'error'),
        ],
      );
      return s;
    }
    const end = W.n(walk.x).end;
    c.vars.found = end;
    yield step(
      c,
      end
        ? `Every letter matched, and this node ends a word (it has the second ring). ${w} is in the trie.`
        : `Every letter matched, but this node does not end a word, so ${w} is only the start of ${and(longer(W, walk.x))}. Not found.`,
      ['srch.end'],
      1,
      [nodeMark(walk.x, end ? 'found' : 'error')],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// delete

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw]) {
    const w = readWord(raw);
    if (w instanceof Error) return yield* badArg(s, 'delete', raw, w, 'del.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'word', text: w, at: 0 } },
      vars: { word: w, x: 'root' },
    };
    yield step(
      c,
      `delete(${w}): first find it, as search does.`,
      ['del.find'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const walk = yield* descend(c, w, ['del.find'], 2);
    if (walk.kind === 'none' || walk.kind === 'differ') {
      yield step(
        c,
        missSay(W, w, walk, `${w} is not in the trie, so there is nothing to delete.`),
        ['del.find', 'del.miss'],
        1,
        missMarks(W, w, walk),
      );
      return s;
    }
    if (walk.kind === 'inside' || !W.n(walk.x).end) {
      const at = walk.x;
      yield step(
        c,
        walk.kind === 'inside'
          ? `${w} runs out partway along the edge ${q(W.n(at).label)}, so it is not a word in the trie. Nothing to delete.`
          : `Every letter matched, but this node does not end a word. ${w} is not in the trie, so there is nothing to delete.`,
        ['del.find', 'del.miss'],
        1,
        [nodeMark(at, 'error')],
      );
      return s;
    }
    const x = walk.x;
    W.n(x).end = false;
    c.extra.path = [];
    const kids = W.n(x).kids.length;
    c.vars.x = spell(W, x);
    yield step(
      c,
      `Clear the end mark: ${w} no longer ends here. Now the node has ${kids === 0 ? 'no children and ends no word, so it goes' : kids === 1 ? "one child and ends no word, so it is no longer needed: its edge can merge with its child's" : `${kids} children, so it still branches and stays`}.`,
      ['del.unmark'],
      kids >= 2 ? 1 : 2,
      [nodeMark(x, 'active')],
    );
    if (kids >= 2) return W.snap();
    if (kids === 1) {
      const top = W.n(x).label;
      const bottom = W.n(W.n(x).kids[0]!).label;
      const childId = W.n(x).kids[0]!;
      yield step(
        c,
        `Merge: the edge ${q(top)} and the edge ${q(bottom)} below it become one edge, ${q(top + bottom)}.`,
        ['del.one', 'del.mergex', 'merge.child', 'merge.join', 'merge.take'],
        2,
        [
          nodeMark(childId, 'remove'),
          edgeMark(childId, 'active'),
          labelMark(x, 'active'),
          labelMark(childId, 'active'),
        ],
      );
      W.merge(x);
      c.vars.x = spell(W, x);
      yield step(
        c,
        `${w} is gone. The node for ${spell(W, x)} took in its child's edge, so the trie has one node fewer.`,
        ['merge.take'],
        1,
        [labelMark(x, 'new'), nodeMark(x, W.n(x).end ? 'found' : 'active')],
        { merge: { node: x, top, bottom } },
      );
      return W.snap();
    }
    // A leaf: remove it, then its parent may be left with one child.
    const p = W.n(x).parent!;
    yield step(
      c,
      `Remove the leaf and its edge ${q(W.n(x).label)}.`,
      ['del.leaf', 'del.remove'],
      2,
      [nodeMark(x, 'remove'), edgeMark(x, 'error')],
    );
    W.remove(x);
    const pn = W.n(p);
    if (p === W.root || pn.end || pn.kids.length !== 1) {
      const why =
        p === W.root
          ? 'Its parent is the root, which stays even with one child.'
          : pn.end
            ? `Its parent ends the word ${spell(W, p)}, so it stays.`
            : `Its parent still has ${plural(pn.kids.length, 'child', 'children')}, so it stays.`;
      yield step(c, `${why} ${w} is gone.`, ['del.check'], 1, [
        nodeMark(p, p === W.root ? 'active' : 'found'),
      ]);
      return W.snap();
    }
    const top = pn.label;
    const childId = pn.kids[0]!;
    const bottom = W.n(childId).label;
    c.vars.x = spell(W, p);
    yield step(
      c,
      `Now the node for ${spell(W, p)} has one child and ends no word. Merge: its edge ${q(top)} and the edge ${q(bottom)} below it become one edge, ${q(top + bottom)}.`,
      ['del.check', 'del.mergep', 'merge.child', 'merge.join', 'merge.take'],
      2,
      [
        nodeMark(p, 'active'),
        nodeMark(childId, 'remove'),
        labelMark(p, 'active'),
        labelMark(childId, 'active'),
      ],
    );
    W.merge(p);
    c.vars.x = spell(W, p);
    yield step(
      c,
      `${w} is gone, and the edges ${q(top)} and ${q(bottom)} are now one edge, ${q(top + bottom)}.`,
      ['merge.take'],
      1,
      [labelMark(p, 'new'), nodeMark(p, W.n(p).end ? 'found' : 'active')],
      { merge: { node: p, top, bottom } },
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// startsWith

const startsWith: Op = {
  label: 'Starts with',
  arity: 1,
  *run(s, [raw]) {
    const p = readWord(raw);
    if (p instanceof Error) return yield* badArg(s, 'startsWith', raw, p, 'pre.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'prefix', text: p, at: 0 } },
      vars: { prefix: p, x: 'root' },
    };
    yield step(
      c,
      `startsWith(${p}): walk down the letters of the prefix, then collect every word below.`,
      ['pre.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const walk = yield* descend(c, p, ['pre.loop', 'pre.find', 'pre.down'], 2);
    if (walk.kind === 'none' || walk.kind === 'differ') {
      c.vars.returned = 'none';
      yield step(
        c,
        missSay(W, p, walk, `No word starts with ${p}: the list is empty.`),
        ['pre.loop', 'pre.find', 'pre.none'],
        1,
        missMarks(W, p, walk),
      );
      return s;
    }
    const x = walk.x;
    if (walk.kind === 'inside') {
      const label = W.n(x).label;
      c.extra.arg!.at = p.length;
      c.vars.x = spell(W, x);
      c.extra.path!.push(x);
      yield step(
        c,
        `${p} runs out partway along the edge ${q(label)}. Every word below that edge starts with ${p}, so collect from the node at its end.`,
        ['pre.loop', 'pre.find', 'pre.inside'],
        2,
        [
          ...cells(p.length - walk.into, p.length, 'active'),
          edgeMark(x, 'active'),
          nodeMark(x, 'active'),
        ],
      );
    }
    const output: string[] = [];
    const visited: number[] = [];
    c.extra.output = output;
    c.extra.seen = visited;
    yield step(
      c,
      `Every word that starts with ${p} is below this node. Visit them in preorder, children in alphabetical order, and write down each word that ends.`,
      ['pre.out', 'pre.collect'],
      2,
      [nodeMark(x, 'active')],
    );
    function* collect(u: number, word: string): Generator<RadixStep, void, void> {
      visited.push(u);
      c.vars.w = word;
      if (W.n(u).end) {
        output.push(word);
        yield step(c, `${word} ends here: write it down.`, ['col.end', 'col.add'], 2, [
          nodeMark(u, 'found'),
          mark(`out-${output.length - 1}`, 'new'),
        ]);
      } else {
        yield step(c, `No word ends at ${word}; keep going down.`, ['col.end'], 3, [
          nodeMark(u, 'active'),
        ]);
      }
      for (const k of W.n(u).kids) yield* collect(k, word + W.n(k).label);
    }
    yield* collect(x, spell(W, x));
    delete c.vars.w;
    c.vars.returned = output.join(' ') || 'none';
    yield step(
      c,
      `${plural(output.length, 'word starts', 'words start')} with ${p}: ${output.join(', ')}.${output.length > 1 ? ' They come out in alphabetical order because the children are visited a to z.' : ''}`,
      ['pre.ret'],
      1,
      [nodeMark(x, 'found')],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// clear

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty = { ...init(), nextUid: s.nextUid };
    const n = nodeCount(s) - 1;
    yield {
      state: empty,
      marks: [],
      say:
        n === 0
          ? 'clear(): the trie is already empty: just the root.'
          : `clear(): drop every node but the root (${plural(n, 'node')}). The trie is empty.`,
      lines: ['clear.reset'],
      vars: counts(empty),
      level: 1,
    } satisfies RadixStep;
    return empty;
  },
};

export const ops = { insert, search, delete: del, startsWith, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(word)', 'To insert a word:'),
        L('ins.init', 1, 'x = root; s = word', 'start at the root, with every letter to place.'),
        L('ins.loop', 1, 'while s ≠ ""', 'While letters are left:'),
        L(
          'ins.find',
          2,
          'y = the child of x whose edge starts with s[0]',
          'find the edge that starts with the next letter.',
        ),
        L('ins.none', 2, 'if y == nil', 'If there is none,'),
        L(
          'ins.leaf',
          3,
          'add a leaf with edge s, end = true; return',
          'hang a new leaf on an edge with all the letters left. Done.',
        ),
        L(
          'ins.common',
          2,
          'k = length of the common prefix of y.edge and s',
          'Count the letters the edge and the word share.',
        ),
        L('ins.part', 2, 'if k < |y.edge|', 'If they part ways inside the edge,'),
        L('ins.split', 3, 'y = split(y, k)', 'split the edge there.'),
        L('ins.down', 2, 'x = y; s = s[k..]', 'Go down, and drop the letters just matched.'),
        L('ins.check', 1, 'if x.end', 'If a word already ends here,'),
        L('ins.dup', 2, 'return  // already there', 'stop: it is already in the trie.'),
        L('ins.mark', 1, 'x.end = true', 'Mark the node as the end of a word.'),
        L('split.sig', 0, 'split(y, k)', 'To split the edge into y after k letters:'),
        L(
          'split.new',
          1,
          'm = new node; m.edge = y.edge[0..k)',
          'make a node m for the first k letters,',
        ),
        L('split.cut', 1, 'y.edge = y.edge[k..]', "keep the rest of the letters on y's edge,"),
        L(
          'split.link',
          1,
          "put m in y's place; y becomes m's only child",
          'and hang y below m, where y used to be.',
        ),
        L('split.ret', 1, 'return m', 'The new node is where the word goes on.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(word)', 'To look for a word:'),
        L('srch.init', 1, 'x = root; s = word', 'start at the root, with every letter to match.'),
        L('srch.loop', 1, 'while s ≠ ""', 'While letters are left:'),
        L(
          'srch.find',
          2,
          'y = the child of x whose edge starts with s[0]',
          'find the edge that starts with the next letter.',
        ),
        L(
          'srch.test',
          2,
          'if y == nil or s does not start with y.edge',
          'If there is none, or its letters do not all match,',
        ),
        L('srch.miss', 3, 'return false', 'the word is not there.'),
        L(
          'srch.down',
          2,
          'x = y; s = s[|y.edge|..]',
          'Otherwise go down, and drop the letters just matched.',
        ),
        L('srch.end', 1, 'return x.end', 'Found only if a word ends at the last node.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(word)', 'To delete a word:'),
        L(
          'del.find',
          1,
          'x = the node for word, as search finds it',
          'find its node, as search does.',
        ),
        L('del.miss', 1, 'if x == nil or not x.end: return', 'If the word is not there, stop.'),
        L('del.unmark', 1, 'x.end = false', 'Clear the end mark.'),
        L('del.leaf', 1, 'if x has no children', 'If the node has no children,'),
        L('del.remove', 2, 'p = x.parent; remove x', 'remove it.'),
        L(
          'del.check',
          2,
          'if p ≠ root and not p.end and p has one child',
          'If that leaves its parent with one child and no word,',
        ),
        L('del.mergep', 3, 'merge(p)', 'merge the parent with that child.'),
        L('del.one', 1, 'elseif x has one child', 'If the node has one child,'),
        L('del.mergex', 2, 'merge(x)', 'merge it with that child.'),
        L('merge.sig', 0, 'merge(x)', 'To merge x with its only child:'),
        L('merge.child', 1, 'c = the only child of x', 'take the child c,'),
        L('merge.join', 1, 'x.edge = x.edge + c.edge', "put its letters at the end of x's edge,"),
        L(
          'merge.take',
          1,
          'x.end = c.end; x.children = c.children',
          "and give x the child's end mark and children.",
        ),
      ],
    },
    {
      op: 'startsWith',
      lines: [
        L('pre.sig', 0, 'startsWith(prefix)', 'To list the words that start with a prefix:'),
        L('pre.init', 1, 'x = root; s = prefix', 'start at the root.'),
        L('pre.loop', 1, 'while s ≠ ""', 'While letters are left:'),
        L(
          'pre.find',
          2,
          'y = the child of x whose edge starts with s[0]',
          'find the edge that starts with the next letter.',
        ),
        L(
          'pre.down',
          2,
          'if s starts with y.edge: x = y; s = s[|y.edge|..]',
          'If it matches in full, go down it.',
        ),
        L(
          'pre.inside',
          2,
          'elseif y.edge starts with s: x = y; s = ""',
          'If the prefix ends inside it, go to its end.',
        ),
        L('pre.none', 2, 'else return []', 'Otherwise no word starts with the prefix.'),
        L('pre.out', 1, 'out = []', 'Start an empty list.'),
        L(
          'pre.collect',
          1,
          'collect(x, the letters from the root to x, out)',
          'Collect every word below this node.',
        ),
        L('pre.ret', 1, 'return out', 'Hand back the list.'),
        L('col.sig', 0, 'collect(x, w, out)', 'To collect the words below x (w spells x):'),
        L('col.end', 1, 'if x.end', 'if a word ends at x,'),
        L('col.add', 2, 'append w to out', 'write it down.'),
        L('col.kids', 1, 'for each child y of x, a to z', 'Then, for each child in letter order,'),
        L('col.rec', 2, 'collect(y, w + y.edge, out)', 'collect the words below it.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To empty the trie:'),
        L('clear.reset', 1, 'root = new Node()', 'start over with a lone root.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty compressed trie: just the root. Each edge will carry a string, and a node exists only where the paths branch or a word ends.';
}

export function initialVars(state: S) {
  return counts(state);
}

/** Screen-reader summary. */
export function describe(state: S): string {
  const words = wordsOf(state);
  if (nodeCount(state) === 1) return 'An empty compressed trie: just the root.';
  return `A compressed trie with ${plural(words.length, 'word')} in ${plural(nodeCount(state), 'node')} (a plain trie would need ${letterCount(state) + 1}), height ${heightOf(state)}: ${words.join(', ')}.`;
}
