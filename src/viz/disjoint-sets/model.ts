/**
 * Disjoint sets (union-find), CLRS style: a forest in which every node points at its parent and
 * each root names its set. MAKE-SET(x) makes a tree of one node, FIND-SET(x) follows parent
 * pointers up to the root, and UNION(x, y) = LINK(FIND-SET(x), FIND-SET(y)) puts one root under
 * the other.
 *
 * Settings:
 *   union  'rank'   union by rank (CLRS): the root of smaller rank goes under the other; on a
 *                   tie, x's root goes under y's and y's rank grows by one
 *          'size'   union by size: the smaller tree goes under the bigger; on a tie, x's root
 *                   goes under y's
 *          'naive'  x's root always goes under y's
 *   path   'compress'  full path compression (CLRS): on the way back from the root, every node
 *                      on the path points straight at the root
 *          'halve'     path halving: every other node on the path points at its grandparent
 *          'none'      just follow the pointers
 *
 * Elements are whole numbers from 0 to 99, at most 16 of them. The page starts with 0 to 7,
 * each in a set of its own. Ranks and sizes are kept whatever the setting, so switching the
 * setting replays the same history; the view shows the one the setting uses.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** "1 node", "3 nodes". */
const nodes = (k: number) => `${k} ${k === 1 ? 'node' : 'nodes'}`;

export interface DSState {
  /** Elements in increasing order. */
  elems: number[];
  p: Record<number, number>;
  rank: Record<number, number>;
  size: Record<number, number>;
  /** Counters for the variables panel: FIND-SET calls, parent pointers followed, links. */
  count: Counters;
}

export type UnionKind = 'rank' | 'size' | 'naive';
export type PathKind = 'compress' | 'halve' | 'none';

export interface DSSettings {
  [key: string]: Scalar;
  union: UnionKind;
  path: PathKind;
}

export const defaults: DSSettings = { union: 'rank', path: 'compress' };

export interface DSExtra {
  /** The node FIND-SET is at, drawn with the label x. */
  at?: number;
  /** The root it found. */
  root?: number;
}

export interface Counters {
  finds: number;
  steps: number;
  links: number;
}

export const MAX_ELEMS = 16;
export const MAX_VALUE = 99;

type S = DSState;
type X = DSExtra;
type Op = OpSpec<S, DSSettings, X>;
type DStep = Step<S, X>;

export const nodeId = (x: number) => `node-${x}`;
export const keyId = (x: number) => `key-${x}`;
export const ptrId = (x: number) => `dsp-${x}`;
export const cellId = (row: 'p' | 'rank' | 'size', x: number) => `arr-${row}-${x}`;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export function init(): S {
  const elems = [0, 1, 2, 3, 4, 5, 6, 7];
  return {
    elems,
    p: Object.fromEntries(elems.map((x) => [x, x])),
    rank: Object.fromEntries(elems.map((x) => [x, 0])),
    size: Object.fromEntries(elems.map((x) => [x, 1])),
    count: zero(),
  };
}

function clone(s: S, c: Counters = s.count): S {
  return {
    elems: [...s.elems],
    p: { ...s.p },
    rank: { ...s.rank },
    size: { ...s.size },
    count: { ...c },
  };
}

export const roots = (s: S) => s.elems.filter((x) => s.p[x] === x);

export function depth(s: S, x: number): number {
  let d = 0;
  let y = x;
  while (s.p[y] !== y && d <= s.elems.length) {
    y = s.p[y]!;
    d++;
  }
  return d;
}

export function height(s: S): number {
  return s.elems.reduce((h, x) => Math.max(h, depth(s, x)), 0);
}

export function rootOf(s: S, x: number): number {
  let y = x;
  while (s.p[y] !== y) y = s.p[y]!;
  return y;
}

/** The members of each set, in increasing order, sets ordered by their smallest member. */
export function sets(s: S): number[][] {
  const by = new Map<number, number[]>();
  for (const x of s.elems) {
    const r = rootOf(s, x);
    by.set(r, [...(by.get(r) ?? []), x]);
  }
  return [...by.values()].sort((a, b) => a[0]! - b[0]!);
}

function zero(): Counters {
  return { finds: 0, steps: 0, links: 0 };
}

export function vars(s: S, c: Counters, more: Record<string, Scalar> = {}) {
  return {
    ...more,
    N: s.elems.length,
    sets: roots(s).length,
    finds: c.finds,
    steps: c.steps,
    links: c.links,
    height: height(s),
  };
}

/** A number from 0 to 99, or a sentence saying what is wrong. */
export function elemArg(arg: Value | undefined): number | string {
  const t = String(arg ?? '').trim();
  if (!/^\d+$/.test(t))
    return `"${t}" is not an element. Elements are whole numbers from 0 to ${MAX_VALUE}.`;
  const n = Number(t);
  if (n > MAX_VALUE) return `${n} is too big. Elements are whole numbers from 0 to ${MAX_VALUE}.`;
  return n;
}

function present(s: S, arg: Value | undefined): number | string {
  const x = elemArg(arg);
  if (typeof x === 'string') return x;
  if (!(x in s.p)) return `${x} is not in any set yet. Make a set for it first with Make set ${x}.`;
  return x;
}

const listWords = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

// ---------------------------------------------------------------------------------------------
// FIND-SET, shared by find and union.

interface FindCtx {
  settings: DSSettings;
  c: Counters;
  /** Pseudocode line prefix: 'f' in find, and union highlights its own call line. */
  inUnion?: string;
  /** Detail level for the walk: 2 in find, 3 inside union. */
  level: 2 | 3;
}

/** FIND-SET(x) on a copy of s; yields the steps and returns the root and the new state. */
function* findSet(s0: S, x: number, ctx: FindCtx): Generator<DStep, { root: number; s: S }, void> {
  const s = clone(s0);
  const { settings, c, level } = ctx;
  c.finds++;
  const extraLines = ctx.inUnion ? [ctx.inUnion] : [];
  const step = (
    say: string,
    lines: string[],
    marks: Mark[],
    at?: number,
    root?: number,
    lv: 1 | 2 | 3 = level,
  ): DStep => ({
    state: clone(s, c),
    marks,
    say,
    lines: [...extraLines, ...lines],
    level: lv,
    vars: vars(s, c, { x: at ?? x }),
    extra: { at, root },
  });

  // Walk up, remembering the path.
  const path = [x];
  let y = x;
  if (settings.path === 'halve') {
    yield step(
      `FIND-SET(${x}) with path halving: while x is not a root, point x at its grandparent and move there.`,
      ['f.sig'],
      [mark(nodeId(x), 'active')],
      x,
    );
    while (s.p[y] !== y) {
      const par = s.p[y]!;
      const grand = s.p[par]!;
      c.steps++;
      if (grand !== par) {
        s.p[y] = grand;
        yield step(
          `${y}.p = ${par}, not ${y}, so ${y} is not a root. Halve: ${y}.p = ${y}.p.p = ${grand}, so ${y} skips ${par} and points at ${grand}. Move x to ${grand}.`,
          ['f.while', 'f.halve', 'f.up'],
          [mark(nodeId(y), 'visit'), mark(ptrId(y), 'active'), mark(cellId('p', y), 'active')],
          grand,
        );
        y = grand;
      } else {
        yield step(
          `${y}.p = ${par}, and ${par} is a root, so there is no grandparent to skip to: ${y}.p stays ${par}. Move x to ${par}.`,
          ['f.while', 'f.halve', 'f.up'],
          [mark(nodeId(y), 'visit'), mark(ptrId(y), 'active')],
          par,
        );
        y = par;
      }
      path.push(y);
    }
    yield step(
      `${y}.p = ${y}: ${y} is a root, so ${y} names the set. FIND-SET(${x}) = ${y}.`,
      ['f.while', 'f.ret'],
      [mark(nodeId(y), 'found')],
      y,
      y,
    );
    return { root: y, s: clone(s, c) };
  }

  yield step(
    settings.path === 'compress'
      ? `FIND-SET(${x}): follow parent pointers up to the root, then point every node on the way straight at it.`
      : `FIND-SET(${x}): follow parent pointers up to the root. Nothing changes on the way.`,
    ['f.sig'],
    [mark(nodeId(x), 'active')],
    x,
  );
  while (s.p[y] !== y) {
    const par = s.p[y]!;
    c.steps++;
    yield step(
      `${y}.p = ${par}, not ${y} itself, so ${y} is not a root. Go up to ${par}.`,
      settings.path === 'compress' ? ['f.if', 'f.rec'] : ['f.while', 'f.up'],
      [mark(nodeId(y), 'visit'), mark(ptrId(y), 'active'), mark(nodeId(par), 'active')],
      par,
    );
    y = par;
    path.push(y);
  }
  const root = y;
  yield step(
    `${root}.p = ${root}: ${root} is its own parent, so it is the root. ${root} names the set.${
      path.length === 1
        ? ''
        : ` That took ${path.length - 1} ${path.length === 2 ? 'step' : 'steps'}.`
    }`,
    settings.path === 'compress' ? ['f.if', 'f.ret'] : ['f.while', 'f.ret'],
    [mark(nodeId(root), 'found')],
    root,
    root,
  );
  if (settings.path === 'compress') {
    // On the way back, deepest returns last: the nodes nearest the root are set first.
    const moved: number[] = [];
    for (let i = path.length - 3; i >= 0; i--) {
      const z = path[i]!;
      const old = s.p[z]!;
      s.p[z] = root;
      moved.push(z);
      yield step(
        `On the way back, ${z}.p = ${root}: ${z} stops pointing at ${old} and points straight at the root.`,
        ['f.rec', 'f.ret'],
        [mark(nodeId(z), 'visit'), mark(ptrId(z), 'active'), mark(cellId('p', z), 'active')],
        z,
        root,
      );
    }
  }
  return { root, s: clone(s, c) };
}

// ---------------------------------------------------------------------------------------------
// Operations

function nothing(s: S, say: string, lines: string[]): DStep {
  return { state: s, marks: [], say, lines, level: 1, vars: vars(s, s.count) };
}

const makeset: Op = {
  label: 'Make set',
  arity: 1,
  *run(s, [arg]) {
    const c = { ...s.count };
    const x = elemArg(arg);
    if (typeof x === 'string') {
      yield nothing(s, `Nothing made. ${x}`, ['m.sig']);
      return s;
    }
    if (x in s.p) {
      yield nothing(
        s,
        `${x} is already in a set: the set named ${rootOf(s, x)}. MAKE-SET needs an element that is in no set yet, because the sets must stay disjoint.`,
        ['m.sig'],
      );
      return s;
    }
    if (s.elems.length >= MAX_ELEMS) {
      yield nothing(
        s,
        `There are ${MAX_ELEMS} elements already, as many as this page draws. Clear, or work with these.`,
        ['m.sig'],
      );
      return s;
    }
    const next = clone(s, c);
    next.elems = [...next.elems, x].sort((a, b) => a - b);
    next.p[x] = x;
    next.rank[x] = 0;
    next.size[x] = 1;
    yield {
      state: next,
      marks: [mark(nodeId(x), 'new'), mark(cellId('p', x), 'new')],
      say: `MAKE-SET(${x}): ${x}.p = ${x}, so ${x} is a root, alone in its own set. Its rank is 0 and its size is 1.`,
      lines: ['m.sig', 'm.p', 'm.rank'],
      level: 1,
      vars: vars(next, c, { x }),
    };
    return next;
  },
};

const find: Op = {
  label: 'Find',
  arity: 1,
  *run(s, [arg], { settings }) {
    const c = { ...s.count };
    const x = present(s, arg);
    if (typeof x === 'string') {
      yield nothing(s, `Nothing to find. ${x}`, ['f.sig']);
      return s;
    }
    const before = depth(s, x);
    const r = yield* findSet(s, x, { settings, c, level: 2 });
    const after = height(r.s);
    const flat =
      settings.path === 'none' || before <= 1
        ? ''
        : ` ${x} is now ${depth(r.s, x)} ${depth(r.s, x) === 1 ? 'step' : 'steps'} from the root instead of ${before}, so the next FIND-SET(${x}) is quicker.`;
    yield {
      state: r.s,
      marks: [mark(nodeId(r.root), 'found')],
      say: `FIND-SET(${x}) = ${r.root}.${flat} The tallest tree has height ${after}.`,
      lines: ['f.ret'],
      level: 1,
      vars: vars(r.s, c, { x, root: r.root }),
      extra: { root: r.root },
    };
    return r.s;
  },
};

const union: Op = {
  label: 'Union',
  arity: 2,
  *run(s, [ax, ay], { settings }) {
    const c = { ...s.count };
    const x = present(s, ax);
    const y = present(s, ay);
    if (typeof x === 'string' || typeof y === 'string') {
      yield nothing(s, `Nothing joined. ${typeof x === 'string' ? x : y}`, ['u.sig']);
      return s;
    }
    yield {
      state: s,
      marks: [mark(nodeId(x), 'active'), mark(nodeId(y), 'active')],
      say: `UNION(${x}, ${y}): find the root of each, then link one root under the other.`,
      lines: ['u.sig'],
      level: 2,
      vars: vars(s, c, { x, y }),
    };
    const fx = yield* findSet(s, x, { settings, c, level: 3, inUnion: 'u.a' });
    const a = fx.root;
    const fy = yield* findSet(fx.s, y, { settings, c, level: 3, inUnion: 'u.b' });
    const b = fy.root;
    let t = fy.s;
    const both = [mark(nodeId(a), 'compare'), mark(nodeId(b), 'compare')];
    if (a === b) {
      yield {
        state: t,
        marks: [mark(nodeId(a), 'found')],
        say: `FIND-SET(${x}) = FIND-SET(${y}) = ${a}: ${x} and ${y} are in the same set already. There is nothing to link.`,
        lines: ['u.same'],
        level: 1,
        vars: vars(t, c, { x, y, a, b }),
        extra: { root: a },
      };
      return t;
    }
    yield {
      state: t,
      marks: both,
      say: `FIND-SET(${x}) = ${a} and FIND-SET(${y}) = ${b}. Different roots, so ${x} and ${y} are in different sets. LINK(${a}, ${b}).`,
      lines: ['u.same', 'u.link'],
      level: 2,
      vars: vars(t, c, { x, y, a, b }),
    };
    c.links++;
    t = clone(t, c);
    let say: string;
    let lines: string[];
    let child: number;
    let parent: number;
    if (settings.union === 'rank') {
      const ra = t.rank[a]!;
      const rb = t.rank[b]!;
      if (ra > rb) {
        child = b;
        parent = a;
        say = `${a}.rank = ${ra} is more than ${b}.rank = ${rb}, so ${b} goes under ${a}: ${b}.p = ${a}. Ranks stay as they were.`;
        lines = ['l.if', 'l.under.a'];
      } else if (ra < rb) {
        child = a;
        parent = b;
        say = `${a}.rank = ${ra} is less than ${b}.rank = ${rb}, so ${a} goes under ${b}: ${a}.p = ${b}. Ranks stay as they were.`;
        lines = ['l.if', 'l.under.b', 'l.tie'];
      } else {
        child = a;
        parent = b;
        t.rank[b] = rb + 1;
        say = `${a} and ${b} both have rank ${ra}. On a tie, ${a} goes under ${b} (${a}.p = ${b}), and ${b}.rank grows to ${rb + 1}.`;
        lines = ['l.if', 'l.under.b', 'l.tie', 'l.inc'];
      }
    } else if (settings.union === 'size') {
      const sa = t.size[a]!;
      const sb = t.size[b]!;
      if (sa > sb) {
        child = b;
        parent = a;
        say = `${a}'s tree has ${nodes(sa)} and ${b}'s has ${sb}, so the smaller one goes under: ${b}.p = ${a}, and ${a}.size = ${sa + sb}.`;
        lines = ['l.if', 'l.under.a', 'l.add.a'];
      } else {
        child = a;
        parent = b;
        say =
          sa === sb
            ? `Both trees have ${sa} ${sa === 1 ? 'node' : 'nodes'}. On a tie, ${a} goes under ${b}: ${a}.p = ${b}, and ${b}.size = ${sa + sb}.`
            : `${a}'s tree has ${nodes(sa)} and ${b}'s has ${sb}, so the smaller one goes under: ${a}.p = ${b}, and ${b}.size = ${sa + sb}.`;
        lines = ['l.if', 'l.under.b', 'l.add.b'];
      }
    } else {
      child = a;
      parent = b;
      say = `Naive LINK puts the first root under the second, whatever their sizes: ${a}.p = ${b}.`;
      lines = ['l.under.b'];
    }
    t.p[child] = parent;
    t.size[parent] = t.size[parent]! + t.size[child]!;
    // Rank only changes with union by rank, but keep it an upper bound on height otherwise too.
    if (settings.union !== 'rank') t.rank[parent] = Math.max(t.rank[parent]!, t.rank[child]! + 1);
    const h = height(t);
    yield {
      state: t,
      marks: [mark(nodeId(child), 'new'), mark(ptrId(child), 'new'), mark(nodeId(parent), 'found')],
      say: `${say} The sets are joined: ${listWords(sets(t).find((m) => m.includes(parent))!)}. ${roots(t).length === 1 ? 'Everything is in one set now.' : `There are ${roots(t).length} sets.`} The tallest tree has height ${h}.`,
      lines,
      level: 1,
      vars: vars(t, c, { x, y, a, b }),
      extra: { root: parent },
    };
    return t;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run() {
    const s: S = { elems: [], p: {}, rank: {}, size: {}, count: zero() };
    const c = s.count;
    yield {
      state: s,
      marks: [],
      say: 'Cleared. There are no elements and no sets. Make some sets, such as Make set 0 1 2 3.',
      lines: [],
      level: 1,
      vars: vars(s, c),
    };
    return s;
  },
};

export const ops = { makeset, find, union, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function findLines(settings: DSSettings) {
  if (settings.path === 'compress')
    return [
      L('f.sig', 0, 'FIND-SET(x)', 'Find the root of x:'),
      L('f.if', 1, 'if x ≠ x.p', 'If x is not a root,'),
      L('f.rec', 2, 'x.p = FIND-SET(x.p)', "find its parent's root and point x at it."),
      L('f.ret', 1, 'return x.p', 'The root names the set.'),
    ];
  if (settings.path === 'halve')
    return [
      L('f.sig', 0, 'FIND-SET(x)', 'Find the root of x:'),
      L('f.while', 1, 'while x ≠ x.p', 'While x is not a root,'),
      L('f.halve', 2, 'x.p = x.p.p', 'point x at its grandparent'),
      L('f.up', 2, 'x = x.p', 'and move up to it.'),
      L('f.ret', 1, 'return x', 'The root names the set.'),
    ];
  return [
    L('f.sig', 0, 'FIND-SET(x)', 'Find the root of x:'),
    L('f.while', 1, 'while x ≠ x.p', 'While x is not a root,'),
    L('f.up', 2, 'x = x.p', 'move up to its parent.'),
    L('f.ret', 1, 'return x', 'The root names the set.'),
  ];
}

function linkLines(settings: DSSettings) {
  if (settings.union === 'rank')
    return [
      L('l.sig', 0, 'LINK(a, b)', 'Put one root under the other:'),
      L('l.if', 1, 'if a.rank > b.rank', 'if a has the bigger rank,'),
      L('l.under.a', 2, 'b.p = a', 'b goes under a.'),
      L('l.else', 1, 'else', 'Otherwise'),
      L('l.under.b', 2, 'a.p = b', 'a goes under b,'),
      L('l.tie', 2, 'if a.rank == b.rank', 'and if the ranks were equal,'),
      L('l.inc', 3, 'b.rank = b.rank + 1', "b's rank grows by one."),
    ];
  if (settings.union === 'size')
    return [
      L('l.sig', 0, 'LINK(a, b)', 'Put one root under the other:'),
      L('l.if', 1, 'if a.size > b.size', "if a's tree is bigger,"),
      L('l.under.a', 2, 'b.p = a', 'b goes under a'),
      L('l.add.a', 2, 'a.size = a.size + b.size', "and a's size grows by b's."),
      L('l.else', 1, 'else', 'Otherwise'),
      L('l.under.b', 2, 'a.p = b', 'a goes under b'),
      L('l.add.b', 2, 'b.size = b.size + a.size', "and b's size grows by a's."),
    ];
  return [
    L('l.sig', 0, 'LINK(a, b)', 'Put one root under the other:'),
    L('l.under.b', 1, 'a.p = b', 'a goes under b, always.'),
  ];
}

export function pseudocode(settings: DSSettings): PseudoBlock[] {
  return [
    {
      op: 'makeset',
      lines: [
        L('m.sig', 0, 'MAKE-SET(x)', 'Make a set holding only x:'),
        L('m.p', 1, 'x.p = x', 'x is its own parent, a root,'),
        L(
          'm.rank',
          1,
          settings.union === 'size' ? 'x.size = 1' : 'x.rank = 0',
          settings.union === 'size' ? 'and its tree has one node.' : 'and its rank is 0.',
        ),
      ],
    },
    { op: 'find', lines: findLines(settings) },
    {
      op: 'union',
      lines: [
        L('u.sig', 0, 'UNION(x, y)', 'Join the sets of x and y:'),
        L('u.a', 1, 'a = FIND-SET(x)', 'find the root of x,'),
        L('u.b', 1, 'b = FIND-SET(y)', 'find the root of y.'),
        L('u.same', 1, 'if a == b: return', 'If they match, x and y are together already.'),
        L('u.link', 1, 'LINK(a, b)', 'Otherwise link the two roots.'),
        ...linkLines(settings),
        ...findLines(settings),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${s.elems.length} elements, 0 to ${s.elems.length - 1}, each in a set of its own: every node is a root. Try Union 1 2, then Find 1.`;
}

export function initialVars(s: S) {
  return vars(s, s.count);
}

export function describe(s: S, settings: DSSettings): string {
  if (s.elems.length === 0) return 'No elements and no sets.';
  const parts = sets(s).map((m) => `{${m.join(', ')}} with root ${rootOf(s, m[0]!)}`);
  const extra =
    settings.union === 'naive'
      ? ''
      : ` ${settings.union === 'rank' ? 'Ranks' : 'Sizes'}: ${roots(s)
          .map((r) => `${r} ${settings.union === 'rank' ? s.rank[r] : s.size[r]}`)
          .join(', ')}.`;
  return `${s.elems.length} elements in ${plural(roots(s).length, 'set')}: ${parts.join('; ')}. Parents: ${s.elems
    .map((x) => `${x}→${s.p[x]}`)
    .join(', ')}.${extra} Height ${height(s)}.`;
}

const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;
