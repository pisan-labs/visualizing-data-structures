import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export interface HNode {
  uid: number;
  /** The symbol of a leaf; null for a node made by a merge. */
  sym: string | null;
  weight: number;
  left: number | null;
  right: number | null;
  /** When it joined the queue: the leaves first, in symbol order, then each merged tree as it
   * is made. With equal weights this decides which tree comes out first. */
  order: number;
}

export interface HuffState {
  nodes: Record<number, HNode>;
  /** Roots of the trees in the priority queue, in the order they come out. */
  queue: number[];
  /** Trees taken out of the queue and not put back yet (in the middle of a merge). */
  held: number[];
  /** Each symbol and its count, in symbol order. */
  freq: [string, number][];
  /** The text the counts came from; null when they were typed as symbol:count pairs. */
  text: string | null;
  /** The code of each symbol, once a single tree is left. */
  codes: Record<string, string> | null;
  nextUid: number;
  nextOrder: number;
}

export interface HuffSettings {
  [key: string]: Scalar;
  /** Equal weights: leaves first (then merged trees, oldest first), or merged trees first. */
  ties: 'leaves' | 'merged';
}

export interface HuffExtra {
  /** Encode: the text, the symbol being encoded (`at`) and the codes written so far. */
  encode?: { text: string; at: number; done: number };
  /** Decode: the bits, the bit being read (`at`), and the text written so far. */
  decode?: { bits: string; at: number; out: string };
  /** Nodes on the path being read. */
  path?: number[];
  /** The bit totals, once encode has added them up. */
  totals?: { huffman: number; fixed: number; width: number; n: number };
  /** A refused argument, shown as typed. */
  bad?: string;
}

type S = HuffState;
type X = HuffExtra;
type Op = OpSpec<S, HuffSettings, X>;
type HuffStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: HuffSettings = { ties: 'leaves' };

export const MAX_TEXT = 48;
export const MAX_BITS = 64;
export const MAX_SYMBOLS = 12;
export const MAX_COUNT = 999;
const SYMBOL = /^[a-zA-Z0-9 .,!?'-]$/;

export function init(): S {
  return {
    nodes: {},
    queue: [],
    held: [],
    freq: [],
    text: null,
    codes: null,
    nextUid: 1,
    nextOrder: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const nodeId = (u: number) => `hn-${u}`;
export const edgeId = (u: number) => `he-${u}`;
export const colId = (sym: string) => `col-${sym.charCodeAt(0)}`;
const nodeMark = (u: number, role: Mark['role']) => mark(nodeId(u), role);

/** How a symbol is shown: a space as ␣. */
export const show = (sym: string) => (sym === ' ' ? '␣' : sym);

// ---------------------------------------------------------------------------------------------
// Reading the input

export type Source =
  | { kind: 'text'; text: string; freq: [string, number][] }
  | { kind: 'pairs'; freq: [string, number][] };

const bySymbol = (a: [string, number], b: [string, number]) => (a[0] < b[0] ? -1 : 1);

/**
 * Read a text ("abracadabra") or symbol:count pairs ("a:5 b:2 r:2"). Symbols are letters,
 * digits, spaces (text only) and . , ! ? ' -. Returns the counts in symbol order.
 */
export function readSource(raw: Value | undefined): Source | Error {
  if (raw === undefined) return new Error('Type a text, or counts such as a:5 b:2.');
  const t = String(raw).trim();
  if (!t) return new Error('Type a text, or counts such as a:5 b:2.');
  if (t.includes(':')) {
    const freq: [string, number][] = [];
    for (const tok of t.split(/[\s,]+/).filter(Boolean)) {
      const m = /^(.):(\d+)$/.exec(tok);
      if (!m) return new Error(`Write each count as symbol:count, such as a:5, not "${tok}".`);
      const [, sym, count] = m as unknown as [string, string, string];
      if (!SYMBOL.test(sym))
        return new Error(`Symbols are letters, digits or . , ! ? ' - ("${sym}" is not).`);
      const n = Number(count);
      if (n < 1 || n > MAX_COUNT) return new Error(`Use counts from 1 to ${MAX_COUNT}.`);
      if (freq.some(([s]) => s === sym)) return new Error(`${sym} has two counts.`);
      freq.push([sym, n]);
    }
    if (freq.length > MAX_SYMBOLS) return new Error(`Use at most ${MAX_SYMBOLS} symbols.`);
    return { kind: 'pairs', freq: freq.sort(bySymbol) };
  }
  if (t.length > MAX_TEXT) return new Error(`Keep the text to ${MAX_TEXT} characters.`);
  for (const ch of t)
    if (!SYMBOL.test(ch))
      return new Error(
        `The text can hold letters, digits, spaces and . , ! ? ' - ("${ch}" is not one).`,
      );
  const counts = new Map<string, number>();
  for (const ch of t) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  if (counts.size > MAX_SYMBOLS) return new Error(`Use at most ${MAX_SYMBOLS} different symbols.`);
  return { kind: 'text', text: t, freq: [...counts].sort(bySymbol) };
}

/** Read bits for decode. */
export function readBits(raw: Value | undefined): string | Error {
  const t = String(raw ?? '').trim();
  if (!/^[01]+$/.test(t)) return new Error('decode reads bits: only 0s and 1s, such as 0110.');
  if (t.length > MAX_BITS) return new Error(`Decode at most ${MAX_BITS} bits at a time.`);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Reading a state

/** The leaves of a tree, left to right. */
export function leavesOf(s: S, u: number): string[] {
  const n = s.nodes[u]!;
  if (n.sym !== null) return [n.sym];
  return [...leavesOf(s, n.left!), ...leavesOf(s, n.right!)];
}

/** A tree's name in narration: "r (2)" for a leaf, "the tree cd (2)" for a merged one. */
export function treeName(s: S, u: number): string {
  const n = s.nodes[u]!;
  return n.sym !== null
    ? `${show(n.sym)} (${n.weight})`
    : `the tree ${leavesOf(s, u).map(show).join('')} (${n.weight})`;
}

/** Bits per symbol for a fixed-length code over k symbols: at least 1. */
export const fixedWidth = (k: number) => Math.max(1, Math.ceil(Math.log2(Math.max(1, k))));

/** Total bits with the Huffman codes: each symbol's count times its code length. */
export function totalBits(s: S): number {
  if (!s.codes) return 0;
  return s.freq.reduce((sum, [sym, n]) => sum + n * s.codes![sym]!.length, 0);
}

export const countOf = (s: S) => s.freq.reduce((sum, [, n]) => sum + n, 0);

/** Does tree a come out of the queue before tree b? */
export function before(a: HNode, b: HNode, ties: HuffSettings['ties']): boolean {
  if (a.weight !== b.weight) return a.weight < b.weight;
  if (ties === 'merged' && (a.sym === null) !== (b.sym === null)) return a.sym === null;
  return a.order < b.order;
}

function vars(s: S): Record<string, Scalar> {
  const out: Record<string, Scalar> = {
    symbols: s.freq.length,
    n: countOf(s),
    trees: s.queue.length + s.held.length,
  };
  if (s.codes) {
    out.bits = totalBits(s);
    out.fixed = countOf(s) * fixedWidth(s.freq.length);
  }
  return out;
}

/** "a", "a and b", "a, b and c". */
const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

const ruleText = (ties: HuffSettings['ties']) =>
  ties === 'leaves'
    ? 'leaves come first, in symbol order, then merged trees, oldest first'
    : 'merged trees come first, oldest first, then leaves, in symbol order';

// ---------------------------------------------------------------------------------------------
// A working copy

class Work {
  nodes: Record<number, HNode>;
  queue: number[];
  held: number[];
  freq: [string, number][];
  text: string | null;
  codes: Record<string, string> | null;
  nextUid: number;
  nextOrder: number;

  constructor(s: S) {
    this.nodes = Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, { ...n }]));
    this.queue = [...s.queue];
    this.held = [...s.held];
    this.freq = s.freq.map(([a, b]) => [a, b]);
    this.text = s.text;
    this.codes = s.codes && { ...s.codes };
    this.nextUid = s.nextUid;
    this.nextOrder = s.nextOrder;
  }

  snap(): S {
    return {
      nodes: Object.fromEntries(Object.entries(this.nodes).map(([k, n]) => [k, { ...n }])),
      queue: [...this.queue],
      held: [...this.held],
      freq: this.freq.map(([a, b]) => [a, b]),
      text: this.text,
      codes: this.codes && { ...this.codes },
      nextUid: this.nextUid,
      nextOrder: this.nextOrder,
    };
  }

  n(u: number): HNode {
    return this.nodes[u]!;
  }

  add(sym: string | null, weight: number, left: number | null, right: number | null): number {
    const uid = this.nextUid++;
    this.nodes[uid] = { uid, sym, weight, left, right, order: this.nextOrder++ };
    return uid;
  }

  /** Put a tree into the queue at its place. Returns its index. */
  enqueue(u: number, ties: HuffSettings['ties']): number {
    const at = this.queue.findIndex((q) => before(this.n(u), this.n(q), ties));
    const i = at < 0 ? this.queue.length : at;
    this.queue.splice(i, 0, u);
    return i;
  }
}

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
): HuffStep {
  const state = c.W.snap();
  const extra: X = { ...c.extra, ...more };
  if (extra.path) extra.path = [...extra.path];
  if (extra.encode) extra.encode = { ...extra.encode };
  if (extra.decode) extra.decode = { ...extra.decode };
  return { state, marks, say, lines, vars: { ...vars(state), ...c.vars }, level, extra };
}

function* refuse(s: S, say: string, line: string, bad?: string): Generator<HuffStep, S, void> {
  const W = new Work(s);
  yield {
    state: W.snap(),
    marks: bad !== undefined ? [mark('bad', 'error')] : [],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
    extra: bad !== undefined ? { bad } : {},
  };
  return s;
}

// ---------------------------------------------------------------------------------------------
// The steps of building a tree, shared by load, merge and build

/** Make one leaf per symbol and fill the queue. */
function* loadSteps(c: Ctx, src: Source, settings: HuffSettings): Generator<HuffStep, void, void> {
  const W = c.W;
  W.nodes = {};
  W.queue = [];
  W.held = [];
  W.codes = null;
  W.nextOrder = 0;
  W.freq = src.freq.map(([a, b]) => [a, b]);
  W.text = src.kind === 'text' ? src.text : null;
  const leaves = src.freq.map(([sym, n]) => W.add(sym, n, null, null));
  for (const u of leaves) W.enqueue(u, settings.ties);
  const list = src.freq.map(([sym, n]) => `${show(sym)} ${n}`).join(', ');
  const k = src.freq.length;
  const how =
    src.kind === 'text' ? `Count each symbol in "${src.text}": ${list}.` : `The counts: ${list}.`;
  yield step(
    c,
    k === 1
      ? `${how} There is only one symbol: make a leaf for it and put it in the priority queue.`
      : `${how} Make a leaf for each of the ${k} symbols and put them all in a priority queue, lightest first. Equal weights: ${ruleText(settings.ties)}.`,
    ['b.count', 'b.leaves'],
    k === 1 ? 2 : 1,
    leaves.map((u) => nodeMark(u, 'new')),
  );
  if (k === 1) yield* codeSteps(c, settings);
}

/** One round: take the two lightest trees, merge them, put the result back. */
function* mergeSteps(c: Ctx, settings: HuffSettings): Generator<HuffStep, void, void> {
  const W = c.W;
  const ties = settings.ties;
  const [x, y] = W.queue as [number, number];
  const rest = W.queue.slice(2);
  const xn = W.n(x);
  const yn = W.n(y);
  // Did the tie rule decide which trees come out, or which goes left?
  const tied = rest.filter((u) => W.n(u).weight === yn.weight);
  let why: string;
  if (tied.length) {
    const group = [x, y, ...tied].filter((u) => W.n(u).weight === yn.weight);
    why = `${group.length} trees weigh ${yn.weight}: ${and(group.map((u) => treeName(W, u)))}. Equal weights: ${ruleText(ties)}. So take ${treeName(W, x)} and ${treeName(W, y)}.`;
  } else if (xn.weight === yn.weight) {
    why = `Take the two lightest trees: ${treeName(W, x)} and ${treeName(W, y)}. They weigh the same, and ${ruleText(ties)}, so ${treeName(W, x)} comes out first.`;
  } else {
    why = `Take the two lightest trees: ${treeName(W, x)} and ${treeName(W, y)}.`;
  }
  W.queue = rest;
  W.held = [x, y];
  c.vars.x = xn.weight;
  c.vars.y = yn.weight;
  yield step(c, why, ['b.loop', 'b.x', 'b.y'], 2, [nodeMark(x, 'active'), nodeMark(y, 'active')]);

  const z = W.add(null, xn.weight + yn.weight, x, y);
  W.held = [z];
  c.vars.z = xn.weight + yn.weight;
  yield step(
    c,
    `Merge them under a new node of weight ${xn.weight} + ${yn.weight} = ${xn.weight + yn.weight}. The first one out goes left, on the edge labeled 0; the second goes right, on 1.`,
    ['b.z', 'b.link'],
    2,
    [nodeMark(z, 'new'), mark(edgeId(x), 'active'), mark(edgeId(y), 'active')],
  );

  W.held = [];
  const at = W.enqueue(z, ties);
  const n = W.queue.length;
  const w = xn.weight + yn.weight;
  const prev = at > 0 ? W.queue[at - 1]! : null;
  const next = at < n - 1 ? W.queue[at + 1]! : null;
  const place =
    n === 1
      ? 'It is the only tree left.'
      : prev !== null && W.n(prev).weight === w
        ? `It weighs as much as ${treeName(W, prev)}, and ${ruleText(ties)}, so it goes right after it.`
        : next !== null && W.n(next).weight === w
          ? `It weighs as much as ${treeName(W, next)}, and ${ruleText(ties)}, so it goes right before it.`
          : at === 0
            ? `It is the lightest of the ${n} trees now, so it goes to the front.`
            : at === n - 1
              ? `It is the heaviest of the ${n} trees now, so it goes to the back.`
              : `It goes between ${treeName(W, prev!)} and ${treeName(W, next!)}.`;
  delete c.vars.x;
  delete c.vars.y;
  delete c.vars.z;
  yield step(c, `Put the new tree back in the queue. ${place}`, ['b.insert'], n === 1 ? 2 : 1, [
    nodeMark(z, 'done'),
  ]);
  if (n === 1) yield* codeSteps(c, settings);
}

/** One tree is left: read the codes off it. */
function* codeSteps(c: Ctx, _settings: HuffSettings): Generator<HuffStep, void, void> {
  const W = c.W;
  const root = W.queue[0]!;
  const codes: Record<string, string> = {};
  const order: [number, string, number[]][] = [];
  const walk = (u: number, code: string, path: number[]) => {
    const n = W.n(u);
    if (n.sym !== null) {
      order.push([u, code, path]);
      return;
    }
    walk(n.left!, code + '0', [...path, n.left!]);
    walk(n.right!, code + '1', [...path, n.right!]);
  };
  walk(root, '', [root]);
  const lone = order.length === 1;
  for (const [u, code, path] of order) {
    const sym = W.n(u).sym!;
    codes[sym] = lone ? '0' : code;
    c.extra.path = path;
    yield step(
      c,
      lone
        ? `There is only one symbol, so the tree is a single leaf and its code would be empty. A code needs at least one bit: ${show(sym)} gets 0.`
        : `${show(sym)}: from the root, ${[...code].map((b) => (b === '0' ? 'left (0)' : 'right (1)')).join(', ')}. Its code is ${code}.`,
      ['c.walk', lone ? 'c.lone' : 'c.leaf'],
      3,
      [nodeMark(u, 'found'), ...path.slice(1).map((v) => mark(edgeId(v), 'active'))],
    );
  }
  W.codes = Object.fromEntries(W.freq.map(([sym]) => [sym, codes[sym]!]));
  c.extra.path = [];
  const k = W.freq.length;
  const total = W.freq.reduce((sum, [sym, n]) => sum + n * W.codes![sym]!.length, 0);
  const n = countOf(W);
  yield step(
    c,
    k === 1
      ? `The tree is a single leaf, and its code is 0. ${n} ${n === 1 ? 'symbol takes' : 'symbols take'} ${total} ${total === 1 ? 'bit' : 'bits'}: one bit each, the same as the shortest fixed-length code.`
      : `One tree is left: the Huffman tree. Each symbol's code is its path from the root, 0 for left and 1 for right. No code is the start of another, because every symbol sits at a leaf. ${n} symbols take ${total} bits with these codes; a fixed-length code for ${k} symbols needs ${fixedWidth(k)} ${fixedWidth(k) === 1 ? 'bit' : 'bits'} each, ${n * fixedWidth(k)} bits.`,
    ['c.done'],
    1,
    [nodeMark(root, 'found')],
  );
}

// ---------------------------------------------------------------------------------------------
// Operations

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [raw], { settings }) {
    const src = readSource(raw);
    if (src instanceof Error)
      return yield* refuse(s, `build: ${src.message} Nothing changes.`, 'b.sig', String(raw ?? ''));
    const c: Ctx = { W: new Work(s), extra: {}, vars: {} };
    yield* loadSteps(c, src, settings);
    while (c.W.queue.length > 1) yield* mergeSteps(c, settings);
    return c.W.snap();
  },
};

const load: Op = {
  label: 'Load only',
  arity: 1,
  *run(s, [raw], { settings }) {
    const src = readSource(raw);
    if (src instanceof Error)
      return yield* refuse(s, `load: ${src.message} Nothing changes.`, 'b.sig', String(raw ?? ''));
    const c: Ctx = { W: new Work(s), extra: {}, vars: {} };
    yield* loadSteps(c, src, settings);
    return c.W.snap();
  },
};

const merge: Op = {
  label: 'Merge two',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.queue.length === 0)
      return yield* refuse(
        s,
        'merge: the queue is empty. Build or load some text first.',
        'b.loop',
      );
    if (s.queue.length === 1)
      return yield* refuse(
        s,
        'merge: only one tree is left, so the Huffman tree is done. Nothing to merge.',
        'b.loop',
      );
    const c: Ctx = { W: new Work(s), extra: {}, vars: {} };
    yield* mergeSteps(c, settings);
    return c.W.snap();
  },
};

const encode: Op = {
  label: 'Encode',
  arity: 0,
  *run(s) {
    if (!s.codes)
      return yield* refuse(
        s,
        s.queue.length
          ? 'encode: the tree is not finished. Merge until one tree is left, then encode.'
          : 'encode: there is no tree yet. Build one first.',
        'e.sig',
      );
    const W = new Work(s);
    const codes = s.codes;
    const k = s.freq.length;
    const n = countOf(s);
    const width = fixedWidth(k);
    const total = totalBits(s);
    const totals = { huffman: total, fixed: n * width, width, n };
    const c: Ctx = { W, extra: {}, vars: {} };
    if (s.text !== null) {
      const text = s.text;
      c.extra.encode = { text, at: 0, done: 0 };
      let bits = 0;
      for (let i = 0; i < text.length; i++) {
        const sym = text[i]!;
        bits += codes[sym]!.length;
        c.extra.encode = { text, at: i, done: i + 1 };
        c.vars.i = i;
        c.vars.bits = bits;
        yield step(
          c,
          `${i === 0 ? `encode(): replace each symbol of "${text}" with its code. ` : ''}${show(sym)} → ${codes[sym]}.`,
          ['e.loop', 'e.write'],
          2,
          [mark(colId(sym), 'active'), mark(`enc-${i}`, 'new')],
        );
      }
      delete c.vars.i;
      c.extra.encode = { text, at: text.length, done: text.length };
    } else {
      // Counts typed as pairs: there is no text, so add up count × code length per symbol.
      let bits = 0;
      for (const [sym, cnt] of s.freq) {
        bits += cnt * codes[sym]!.length;
        c.vars.bits = bits;
        yield step(
          c,
          `${show(sym)} appears ${cnt} ${cnt === 1 ? 'time' : 'times'} and its code has ${codes[sym]!.length} ${codes[sym]!.length === 1 ? 'bit' : 'bits'}: ${cnt * codes[sym]!.length} bits.`,
          ['e.loop', 'e.count'],
          2,
          [mark(colId(sym), 'active')],
        );
      }
    }
    c.vars.bits = total;
    c.vars.fixed = n * width;
    const saved = n * width - total;
    yield step(
      c,
      `${n} symbols take ${total} bits with the Huffman codes, ${(total / n).toFixed(2)} per symbol. A fixed-length code needs ${width} ${width === 1 ? 'bit' : 'bits'} for each of the ${n}: ${n * width} bits. ${saved > 0 ? `Huffman saves ${saved} bits (${Math.round((100 * saved) / (n * width))}%).` : 'Here Huffman saves nothing: no code beats the fixed length.'}`,
      ['e.total'],
      1,
      [],
      { totals },
    );
    return s;
  },
};

const decode: Op = {
  label: 'Decode',
  arity: 1,
  *run(s, [raw]) {
    const bits = readBits(raw);
    if (bits instanceof Error)
      return yield* refuse(
        s,
        `decode(${String(raw ?? '')}): ${bits.message}`,
        'd.sig',
        String(raw ?? ''),
      );
    if (!s.codes)
      return yield* refuse(
        s,
        s.queue.length
          ? 'decode: the tree is not finished. Merge until one tree is left, then decode.'
          : 'decode: there is no tree yet. Build one first.',
        'd.sig',
      );
    const W = new Work(s);
    const root = s.queue[0]!;
    const c: Ctx = {
      W,
      extra: { decode: { bits, at: 0, out: '' }, path: [root] },
      vars: { input: bits },
    };
    let out = '';
    const lone = s.nodes[root]!.sym !== null;
    let x = root;
    let path = [root];
    /** Where the code being read started. */
    let start = 0;
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i]!;
      c.extra.decode = { bits, at: i, out };
      c.vars.i = i;
      if (lone) {
        const sym = s.nodes[root]!.sym!;
        if (b === '1') {
          c.extra.path = [root];
          yield step(
            c,
            `Bit ${i + 1} is 1, but the only code is 0, for ${show(sym)}. These bits are not a message in this code.`,
            ['d.loop', 'd.bad'],
            1,
            [mark(`bit-${i}`, 'error'), nodeMark(root, 'error')],
          );
          return s;
        }
        out += sym;
        c.extra.decode = { bits, at: i, out };
        c.vars.out = out;
        yield step(
          c,
          `Bit ${i + 1} is 0, the code for ${show(sym)}: write ${show(sym)}.`,
          ['d.loop', 'd.leaf'],
          2,
          [mark(`bit-${i}`, 'active'), nodeMark(root, 'found')],
        );
        continue;
      }
      const n = W.n(x);
      x = b === '0' ? n.left! : n.right!;
      path = [...path, x];
      c.extra.path = path;
      const leaf = W.n(x).sym;
      if (leaf === null) {
        yield step(
          c,
          `Bit ${i + 1} is ${b}: go ${b === '0' ? 'left' : 'right'}.`,
          ['d.loop', 'd.step'],
          3,
          [mark(`bit-${i}`, 'active'), mark(edgeId(x), 'active'), nodeMark(x, 'active')],
        );
        continue;
      }
      out += leaf;
      c.extra.decode = { bits, at: i, out };
      c.vars.out = out;
      yield step(
        c,
        `Bit ${i + 1} is ${b}: go ${b === '0' ? 'left' : 'right'} to the leaf ${show(leaf)}. Write ${show(leaf)} and start again at the root.`,
        ['d.loop', 'd.step', 'd.leaf', 'd.reset'],
        2,
        [mark(`bit-${i}`, 'active'), mark(edgeId(x), 'active'), nodeMark(x, 'found')],
      );
      x = root;
      path = [root];
      start = i + 1;
    }
    delete c.vars.i;
    c.extra.decode = { bits, at: bits.length, out };
    c.extra.path = path;
    if (x !== root) {
      c.vars.out = out;
      const tail = bits.slice(start);
      yield step(
        c,
        `The bits run out partway down the tree: the last ${tail.length === 1 ? 'bit' : `${tail.length} bits`}, ${tail}, ${tail.length === 1 ? 'is' : 'are'} not a whole code. These bits are not a message in this code.`,
        ['d.loop', 'd.bad'],
        1,
        [nodeMark(x, 'error')],
      );
      return s;
    }
    c.vars.out = out;
    yield step(
      c,
      `The bits run out at the root, right after a whole code: the message is "${out}". Each code stops at a leaf, so there is never a doubt where one code ends and the next begins.`,
      ['d.done'],
      1,
      [],
    );
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty = { ...init(), nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say: s.freq.length
        ? 'clear(): drop the trees and the codes.'
        : 'clear(): there is nothing to clear.',
      lines: ['clear.reset'],
      vars: vars(empty),
      level: 1,
    } satisfies HuffStep;
    return empty;
  },
};

export const ops = { build, encode, decode, load, merge, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: HuffSettings): PseudoBlock[] {
  const tie =
    settings.ties === 'leaves'
      ? 'Q orders by weight; ties: leaves first, then the oldest tree'
      : 'Q orders by weight; ties: merged trees first, then leaves';
  const buildLines = [
    L('b.sig', 0, 'huffman(C)', 'To build the Huffman tree for the symbols in C:'),
    L('b.count', 1, 'count how often each symbol appears', 'count each symbol;'),
    L(
      'b.leaves',
      1,
      `Q = a min-priority queue of one leaf per symbol  // ${tie}`,
      'put one leaf per symbol in a queue, lightest first.',
    ),
    L('b.loop', 1, 'while Q holds more than one tree', 'While more than one tree is left:'),
    L('b.x', 2, 'x = extractMin(Q)', 'take the lightest tree,'),
    L('b.y', 2, 'y = extractMin(Q)', 'and the next lightest;'),
    L(
      'b.z',
      2,
      'z = new node; z.weight = x.weight + y.weight',
      'make a node that weighs as much as both,',
    ),
    L(
      'b.link',
      2,
      'z.left = x; z.right = y',
      'with the first one on its left and the second on its right,',
    ),
    L('b.insert', 2, 'insert(Q, z)', 'and put it back in the queue.'),
  ];
  const codeLines = [
    L('c.walk', 1, 'for each leaf, walk down from the root:', 'Read each code from the root down:'),
    L(
      'c.leaf',
      2,
      'code = the edge labels on the path (left 0, right 1)',
      'a 0 for each left turn, a 1 for each right turn.',
    ),
    L('c.lone', 2, 'if the root is a leaf: its code is 0', 'A lone symbol still gets one bit.'),
    L('c.done', 1, 'return the tree and the codes', 'The last tree is the Huffman tree.'),
  ];
  return [
    { op: 'build', lines: [...buildLines, ...codeLines] },
    {
      op: 'encode',
      lines: [
        L('e.sig', 0, 'encode(text)', 'To encode a text:'),
        L('e.loop', 1, 'for each symbol s of text', 'for each symbol,'),
        L('e.write', 2, 'append code[s] to the output', 'write its code.'),
        L('e.count', 2, 'bits += count[s] × |code[s]|', 'add its count times its code length.'),
        L(
          'e.total',
          1,
          'return the output (Σ count × code length bits)',
          'The total is the sum of count times code length.',
        ),
      ],
    },
    {
      op: 'decode',
      lines: [
        L('d.sig', 0, 'decode(bits)', 'To decode a string of bits:'),
        L('d.init', 1, 'x = root', 'start at the root.'),
        L('d.loop', 1, 'for each bit b', 'For each bit:'),
        L('d.step', 2, 'x = (b == 0) ? x.left : x.right', 'go left on 0 and right on 1.'),
        L('d.leaf', 2, 'if x is a leaf: append x.symbol', 'At a leaf, write its symbol'),
        L('d.reset', 3, 'x = root', 'and start again at the root.'),
        L(
          'd.bad',
          1,
          'if x ≠ root: error  // the bits end inside a code',
          'If the bits stop partway down, they are not a message.',
        ),
        L('d.done', 1, 'return the symbols written', 'Hand back what you wrote.'),
      ],
    },
    { op: 'load', lines: [...buildLines.slice(0, 3), ...codeLines] },
    { op: 'merge', lines: [...buildLines.slice(3), ...codeLines] },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To start over:'),
        L('clear.reset', 1, 'drop the trees and the codes', 'forget the trees and the codes.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'Type a text, such as abracadabra, or counts such as a:5 b:2 r:2 c:1 d:1, and press Build. Huffman coding gives frequent symbols short codes and rare ones long codes.';
}

export function initialVars(state: S) {
  return vars(state);
}

/** Screen-reader summary. */
export function describe(state: S): string {
  if (state.freq.length === 0) return 'No symbols yet.';
  const trees = state.queue.length + state.held.length;
  if (state.codes) {
    const table = state.freq.map(([sym]) => `${show(sym)} ${state.codes![sym]}`).join(', ');
    const k = state.freq.length;
    return `A Huffman tree for ${k} ${k === 1 ? 'symbol' : 'symbols'}. Codes: ${table}. Total ${totalBits(state)} bits.`;
  }
  return `A priority queue of ${trees} ${trees === 1 ? 'tree' : 'trees'}, lightest first: ${state.queue.map((u) => treeName(state, u)).join(', ')}.`;
}
