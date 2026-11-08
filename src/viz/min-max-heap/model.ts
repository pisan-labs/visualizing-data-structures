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
import { cellId, heapEdgeId, parentPos } from '../../layouts/heap';

/** One key. The uid follows the key wherever it moves, in the tree and the array. */
export interface HeapItem {
  uid: number;
  key: number;
}

export interface MMState {
  /** The array: items[0] is the root. Positions here are always 0-based. */
  items: HeapItem[];
  nextUid: number;
}

export interface MMSettings {
  [key: string]: Scalar;
  /** min: the root is on a min level (a min-max heap, Atkinson et al.). max: a max-min heap. */
  root: 'min' | 'max';
  /** one: A[1..n]. zero: A[0..n − 1]. */
  index: 'one' | 'zero';
}

export interface MMExtra {
  out?: { key: number; label: string; from?: number };
  arg?: { label: string; text: string };
  /** Bottom-up build: positions before this one have not been trickled down yet. */
  todo?: number;
}

export type Side = 'min' | 'max';
type S = MMState;
type X = MMExtra;
type Op = OpSpec<S, MMSettings, X>;
type MStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const CAPACITY = 31;

export const defaults: MMSettings = { root: 'min', index: 'one' };

export function init(): S {
  return { items: [], nextUid: 1 };
}

export const depthOf = (p: number) => Math.floor(Math.log2(p + 1));
export const heightOf = (n: number) => (n === 0 ? -1 : depthOf(n - 1));
export const other = (s: Side): Side => (s === 'min' ? 'max' : 'min');
/** a belongs nearer the top than b on a level of this side. */
export const better = (s: Side, a: number, b: number) => (s === 'min' ? a < b : a > b);
/** Which kind of level position p is on. */
export const sideOf = (p: number, root: Side): Side => (depthOf(p) % 2 === 0 ? root : other(root));

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
  if (tokens.length === 0) return new Error('Type the keys to build from, such as 5 3 8 1.');
  if (tokens.length > CAPACITY)
    return new Error(
      `The array holds at most ${CAPACITY} keys, and the list has ${tokens.length}.`,
    );
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

class Work {
  items: HeapItem[];
  nextUid: number;
  comparisons = 0;
  swaps = 0;

  constructor(s: S) {
    this.items = s.items.map((x) => ({ ...x }));
    this.nextUid = s.nextUid;
  }

  get n(): number {
    return this.items.length;
  }

  at(p: number): HeapItem {
    return this.items[p]!;
  }

  snap(): S {
    return { items: this.items.map((x) => ({ ...x })), nextUid: this.nextUid };
  }

  swap(p: number, q: number): void {
    const a = this.items[p]!;
    this.items[p] = this.items[q]!;
    this.items[q] = a;
    this.swaps += 1;
  }
}

interface Ctx {
  W: Work;
  root: Side;
  base: 0 | 1;
  extra: X;
  vars: Record<string, Scalar>;
}

function ctx(s: S, st: MMSettings, vars: Record<string, Scalar> = {}): Ctx {
  return {
    W: new Work(s),
    root: st.root === 'max' ? 'max' : 'min',
    base: st.index === 'zero' ? 0 : 1,
    extra: {},
    vars,
  };
}

const ix = (c: Ctx, p: number) => p + c.base;

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): MStep {
  const state = c.W.snap();
  const n = state.items.length;
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      N: n,
      height: heightOf(n),
      ...c.vars,
      comparisons: c.W.comparisons,
      swaps: c.W.swaps,
    },
    level,
    extra: { ...c.extra },
  };
}

function* refuse(
  s: S,
  st: MMSettings,
  say: string,
  line: string,
  arg: { label: string; text: string },
): Generator<MStep, S, void> {
  const c = ctx(s, st);
  c.extra.arg = arg;
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
  return s;
}

const summary = (n: number) => `N = ${n}, height = ${heightOf(n)}.`;
function forget(c: Ctx): void {
  for (const k of ['i', 'm']) delete c.vars[k];
}

/** "smallest" / "largest", and the pseudocode prefix of each side. */
const est = (s: Side) => (s === 'min' ? 'smallest' : 'largest');
const pre = (s: Side) => (s === 'min' ? 'm' : 'x');

// ---------------------------------------------------------------------------------------------
// Push up (insert): one comparison with the parent picks the side, then grandparents only.

function* pushUpSide(c: Ctx, side: Side, start: number): Generator<MStep, void, void> {
  const { W } = c;
  const P = `p${pre(side)}`;
  let p = start;
  for (;;) {
    const x = W.at(p);
    c.vars.i = ix(c, p);
    if (p < 3) {
      yield step(
        c,
        `${x.key} has no grandparent, so it stops at A[${ix(c, p)}].`,
        [`${P}.loop`],
        2,
        [node(x.uid, 'done')],
      );
      return;
    }
    const g = parentPos(parentPos(p));
    const y = W.at(g);
    W.comparisons += 1;
    yield step(
      c,
      `Compare ${x.key} with its grandparent A[${ix(c, g)}] = ${y.key}, the next ${side} level up.`,
      [`${P}.loop`],
      3,
      [node(x.uid, 'active'), node(y.uid, 'compare')],
    );
    if (!better(side, x.key, y.key)) {
      yield step(
        c,
        `${cmp(x.key, y.key)}: the grandparent is ${side === 'min' ? 'smaller' : 'larger'}, so ${x.key} stops at A[${ix(c, p)}].`,
        [`${P}.loop`],
        2,
        [node(x.uid, 'done'), node(y.uid, 'compare')],
      );
      return;
    }
    W.swap(p, g);
    yield step(
      c,
      `${cmp(x.key, y.key)}: swap ${x.key} with its grandparent. It skips the ${other(side)} level between them.`,
      [`${P}.swap`],
      2,
      [
        node(x.uid, 'active'),
        node(y.uid, 'visit'),
        mark(heapEdgeId(p), 'active'),
        mark(heapEdgeId(parentPos(p)), 'active'),
      ],
    );
    p = g;
  }
}

function* pushUp(c: Ctx, p: number): Generator<MStep, void, void> {
  const { W } = c;
  const x = W.at(p);
  if (p === 0) {
    yield step(c, `${x.key} is the root.`, ['pu.root'], 2, [node(x.uid, 'done')]);
    return;
  }
  const side = sideOf(p, c.root);
  const o = other(side);
  const q = parentPos(p);
  const y = W.at(q);
  W.comparisons += 1;
  c.vars.i = ix(c, p);
  yield step(
    c,
    `A[${ix(c, p)}] is on a ${side} level and its parent A[${ix(c, q)}] = ${y.key} is on a ${o} level. Compare them: ${cmp(x.key, y.key)}.`,
    ['pu.root', 'pu.level', side === 'min' ? 'pu.cmpMin' : 'pu.cmpMax'],
    3,
    [node(x.uid, 'active'), node(y.uid, 'compare'), mark(heapEdgeId(p), 'active')],
  );
  if (better(o, x.key, y.key)) {
    W.swap(p, q);
    yield step(
      c,
      `${x.key} is ${o === 'max' ? 'larger' : 'smaller'} than its ${o}-level parent, so it belongs on the ${o} levels: swap them, then push ${x.key} up through the ${o} levels only.`,
      [side === 'min' ? 'pu.swapMin' : 'pu.swapMax'],
      2,
      [node(x.uid, 'active'), node(y.uid, 'visit'), mark(heapEdgeId(p), 'active')],
    );
    yield* pushUpSide(c, o, q);
  } else {
    yield step(
      c,
      `${x.key} is fine under its parent, so it stays on the ${side} levels: push it up through the ${side} levels only.`,
      [side === 'min' ? 'pu.stayMin' : 'pu.stayMax'],
      2,
      [node(x.uid, 'active'), node(y.uid, 'compare')],
    );
    yield* pushUpSide(c, side, p);
  }
}

// ---------------------------------------------------------------------------------------------
// Trickle down (extract, build): look at children and grandchildren at once.

function kidsOf(p: number, n: number): number[] {
  return [2 * p + 1, 2 * p + 2].filter((q) => q < n);
}

function* trickleDown(c: Ctx, start: number): Generator<MStep, void, void> {
  const { W } = c;
  let p = start;
  const side = sideOf(start, c.root);
  const T = `t${pre(side)}`;
  for (;;) {
    const x = W.at(p);
    const n = W.n;
    c.vars.i = ix(c, p);
    delete c.vars.m;
    const kids = kidsOf(p, n);
    if (kids.length === 0) {
      yield step(
        c,
        `trickleDown${side === 'min' ? 'Min' : 'Max'}(${ix(c, p)}): ${x.key} has no children, so it stops here.`,
        ['td.level', `${T}.has`],
        2,
        [node(x.uid, 'done')],
      );
      return;
    }
    const grand = kids.flatMap((q) => kidsOf(q, n));
    const cands = [...kids, ...grand];
    let m = cands[0]!;
    for (const q of cands.slice(1)) {
      W.comparisons += 1;
      if (better(side, W.at(q).key, W.at(m).key)) m = q;
    }
    c.vars.m = ix(c, m);
    const z = W.at(m);
    const isGrand = m > kids[kids.length - 1]!;
    yield step(
      c,
      `trickleDown${side === 'min' ? 'Min' : 'Max'}(${ix(c, p)}): ${x.key} is on a ${side} level. Of its ${plural(kids.length, 'child', 'children')} and ${plural(grand.length, 'grandchild', 'grandchildren')} (${cands.map((q) => W.at(q).key).join(', ')}), the ${est(side)} is ${z.key} at A[${ix(c, m)}], a ${isGrand ? 'grandchild' : 'child'}.`,
      ['td.level', `${T}.has`, `${T}.m`],
      3,
      [
        node(x.uid, 'active'),
        ...cands.map((q) => node(W.at(q).uid, q === m ? 'found' : 'compare')),
      ],
    );
    W.comparisons += 1;
    if (!better(side, z.key, x.key)) {
      yield step(
        c,
        `${cmp(z.key, x.key)}: nothing below is ${side === 'min' ? 'smaller' : 'larger'} than ${x.key}, so it stays at A[${ix(c, p)}].`,
        [isGrand ? `${T}.gc` : `${T}.child`, ...(isGrand ? [`${T}.cmp`] : [])],
        2,
        [node(x.uid, 'done'), node(z.uid, 'compare')],
      );
      return;
    }
    W.swap(p, m);
    if (!isGrand) {
      yield step(
        c,
        `${cmp(z.key, x.key)}, and ${z.key} is a child, so swap them. ${x.key} is now on a ${other(side)} level with no grandchildren to check: it stops.`,
        [`${T}.child`],
        2,
        [node(x.uid, 'done'), node(z.uid, 'visit'), mark(heapEdgeId(m), 'active')],
      );
      return;
    }
    yield step(
      c,
      `${cmp(z.key, x.key)}: swap ${x.key} with its grandchild ${z.key}. ${z.key} moves up two levels, and ${x.key} lands on the next ${side} level.`,
      [`${T}.gc`, `${T}.cmp`, `${T}.swap`],
      2,
      [
        node(x.uid, 'active'),
        node(z.uid, 'visit'),
        mark(heapEdgeId(m), 'active'),
        mark(heapEdgeId(parentPos(m)), 'active'),
      ],
    );
    const q = parentPos(m);
    const y = W.at(q);
    W.comparisons += 1;
    if (better(other(side), x.key, y.key)) {
      W.swap(m, q);
      yield step(
        c,
        `But ${x.key} is ${side === 'min' ? 'larger' : 'smaller'} than its new parent ${y.key}, on a ${other(side)} level: swap those two as well. ${y.key} goes back down, ${x.key} goes up to A[${ix(c, q)}].`,
        [`${T}.fix`],
        2,
        [node(x.uid, 'active'), node(y.uid, 'visit'), mark(heapEdgeId(m), 'active')],
      );
      // The key that keeps going down is now the old parent, at m.
    }
    yield step(
      c,
      `Keep trickling down from A[${ix(c, m)}], now holding ${W.at(m).key}.`,
      [`${T}.rec`],
      3,
      [node(W.at(m).uid, 'active')],
    );
    p = m;
  }
}

// ---------------------------------------------------------------------------------------------

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings }) {
    const key = parseKey(raw!);
    if (key instanceof Error)
      return yield* refuse(s, settings, `insert(${String(raw)}): ${key.message}`, 'ins.sig', {
        label: 'key',
        text: String(raw),
      });
    const c = ctx(s, settings, { key });
    const { W } = c;
    if (W.n >= CAPACITY) {
      c.extra.arg = { label: 'key', text: String(key) };
      yield step(
        c,
        `insert(${key}): the array is full. Heap overflow: ${key} is not inserted.`,
        ['ins.full'],
        1,
        [mark('arg-box', 'error')],
      );
      return s;
    }
    const uid = W.nextUid++;
    W.items.push({ uid, key });
    const p = W.n - 1;
    c.vars.i = ix(c, p);
    yield step(
      c,
      `insert(${key}): ${key} goes in A[${ix(c, p)}], the first free slot, on a ${sideOf(p, c.root)} level.`,
      ['ins.store', 'ins.push'],
      2,
      [node(uid, 'new'), mark(cellId(p), 'new')],
    );
    yield* pushUp(c, p);
    forget(c);
    yield step(
      c,
      `${key} is in after ${plural(W.comparisons, 'comparison')}. ${summary(W.n)}`,
      ['ins.sig'],
      1,
      [node(uid, 'done')],
    );
    return W.snap();
  },
};

function extractOp(want: Side): Op {
  const name = want === 'min' ? 'extractMin' : 'extractMax';
  const E = want === 'min' ? 'em' : 'ex';
  return {
    label: want === 'min' ? 'Extract min' : 'Extract max',
    arity: 0,
    *run(s, _args, { settings }) {
      const c = ctx(s, settings);
      const { W } = c;
      if (W.n === 0) {
        yield step(
          c,
          `${name}(): the heap is empty. There is nothing to extract.`,
          [`${E}.empty`],
          1,
          [mark('empty', 'error')],
        );
        return s;
      }
      let m = 0;
      if (c.root !== want && W.n > 1) {
        const kids = kidsOf(0, W.n);
        m = kids[0]!;
        if (kids.length === 2) {
          W.comparisons += 1;
          if (better(want, W.at(2).key, W.at(1).key)) m = 2;
        }
      }
      const top = W.at(m);
      c.extra.out = { key: top.key, label: want, from: top.uid };
      c.vars[want] = top.key;
      const where =
        m === 0
          ? `The root is on a ${want} level, so the ${want} is the root, ${top.key}.`
          : W.n === 2
            ? `The ${want} is on the level under the root, which has one node: ${top.key}.`
            : `The ${want} is the ${est(want)} of the root's two children, which sit on the first ${want} level: ${top.key} at A[${ix(c, m)}].`;
      yield step(c, `${name}(): ${where}`, [`${E}.empty`, `${E}.find`], 2, [
        node(top.uid, 'found'),
        mark('out', 'found'),
      ]);
      const last = W.items.pop()!;
      if (m < W.n) {
        W.items[m] = last;
        yield step(
          c,
          `Move the last key, ${last.key}, into A[${ix(c, m)}] and shrink the heap to n = ${W.n}. Then trickle it down.`,
          [`${E}.last`, `${E}.down`],
          2,
          [node(last.uid, 'active'), mark('out', 'found')],
        );
        yield* trickleDown(c, m);
      }
      forget(c);
      c.vars.returned = top.key;
      yield step(
        c,
        W.n === 0
          ? `${top.key} was the only key. Return ${top.key}; the heap is empty.`
          : `Return ${top.key}, after ${plural(W.comparisons, 'comparison')}. ${summary(W.n)}`,
        [`${E}.return`],
        1,
        [mark('out', 'found')],
      );
      return W.snap();
    },
  };
}

const build: Op = {
  label: 'Build heap',
  arity: 1,
  *run(s, [raw], { settings }) {
    const keys = parseKeyList(raw!);
    if (keys instanceof Error)
      return yield* refuse(s, settings, `build: ${keys.message}`, 'bld.sig', {
        label: 'list',
        text: String(raw),
      });
    const c = ctx(s, settings);
    const { W } = c;
    W.items = keys.map((key) => ({ uid: W.nextUid++, key }));
    const n = keys.length;
    const lastInner = Math.floor(n / 2) - 1;
    c.extra.todo = lastInner + 1;
    yield step(
      c,
      `build(${keys.join(' ')}): copy the ${plural(n, 'key')} in as they are. ${lastInner < 0 ? 'One key is already a heap.' : `Then trickle down from A[${ix(c, lastInner)}], the last node with a child, back to the root.`}`,
      ['bld.copy'],
      2,
      W.items.map((x) => node(x.uid, 'new')),
    );
    for (let p = lastInner; p >= 0; p--) {
      c.extra.todo = p;
      forget(c);
      c.vars.i = ix(c, p);
      const x = W.at(p);
      yield step(
        c,
        `i = ${ix(c, p)}: ${x.key} is on a ${sideOf(p, c.root)} level, and both subtrees under it are min-max heaps already. Trickle it down.`,
        ['bld.loop', 'bld.down'],
        2,
        [node(x.uid, 'active')],
      );
      yield* trickleDown(c, p);
    }
    delete c.extra.todo;
    forget(c);
    yield step(
      c,
      `Done: a ${c.root === 'min' ? 'min-max' : 'max-min'} heap after ${plural(W.comparisons, 'comparison')} and ${plural(W.swaps, 'swap')}. ${summary(W.n)}`,
      ['bld.sig'],
      1,
      [],
    );
    return W.snap();
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx({ items: [], nextUid: s.nextUid }, settings);
    yield step(c, 'clear(): set n = 0. The heap is empty.', ['clr.reset'], 1, []);
    return c.W.snap();
  },
};

export const ops = {
  insert,
  extractMin: extractOp('min'),
  extractMax: extractOp('max'),
  build,
  clear,
};

// ---------------------------------------------------------------------------------------------

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

function pushUpLines(side: Side): PseudoLine[] {
  const P = `p${pre(side)}`;
  const Side = side === 'min' ? 'Min' : 'Max';
  const op = side === 'min' ? '<' : '>';
  return [
    L(`${P}.sig`, 0, `pushUp${Side}(i)`, `To move a key up the ${side} levels:`),
    L(
      `${P}.loop`,
      1,
      `while i has a grandparent and A[i] ${op} A[gp(i)]`,
      `while it is ${side === 'min' ? 'smaller' : 'larger'} than its grandparent,`,
    ),
    L(`${P}.swap`, 2, 'swap A[i] and A[gp(i)]; i = gp(i)', 'swap them and carry on two levels up.'),
  ];
}

function trickleLines(side: Side): PseudoLine[] {
  const T = `t${pre(side)}`;
  const Side = side === 'min' ? 'Min' : 'Max';
  const lt = side === 'min' ? '<' : '>';
  const gt = side === 'min' ? '>' : '<';
  return [
    L(`${T}.sig`, 0, `trickleDown${Side}(i)`, `To move a key down from a ${side} level:`),
    L(`${T}.has`, 1, 'if A[i] has children', 'if it has children,'),
    L(
      `${T}.m`,
      2,
      `m = the ${est(side)} child or grandchild`,
      `find the ${est(side)} key among its children and grandchildren.`,
    ),
    L(`${T}.gc`, 2, 'if m is a grandchild', 'If that is a grandchild,'),
    L(`${T}.cmp`, 3, `if A[m] ${lt} A[i]`, `and it is ${side === 'min' ? 'smaller' : 'larger'},`),
    L(`${T}.swap`, 4, 'swap A[i] and A[m]', 'swap the two,'),
    L(
      `${T}.fix`,
      4,
      `if A[m] ${gt} A[parent(m)]: swap them`,
      'fix the order with the parent in between,',
    ),
    L(`${T}.rec`, 4, `trickleDown${Side}(m)`, 'and keep going from the grandchild.'),
    L(
      `${T}.child`,
      2,
      `elseif A[m] ${lt} A[i]: swap A[i] and A[m]`,
      `If it is a ${side === 'min' ? 'smaller' : 'larger'} child, swap once and stop.`,
    ),
  ];
}

export function pseudocode(settings: MMSettings): PseudoBlock[] {
  const root: Side = settings.root === 'max' ? 'max' : 'min';
  const one = settings.index !== 'zero';
  const last = one ? 'A[n]' : 'A[n − 1]';
  const trickle = [
    L('td.sig', 0, 'trickleDown(i)', 'To move a key down:'),
    L(
      'td.level',
      1,
      'if i is on a min level: trickleDownMin(i) else trickleDownMax(i)',
      'pick the version for its kind of level.',
    ),
    ...trickleLines('min'),
    ...trickleLines('max'),
  ];
  const extract = (want: Side): PseudoBlock => {
    const E = want === 'min' ? 'em' : 'ex';
    const name = want === 'min' ? 'extractMin' : 'extractMax';
    return {
      op: name,
      lines: [
        L(`${E}.sig`, 0, `${name}()`, `To remove the ${want}imum:`),
        L(`${E}.empty`, 1, 'if n == 0: error "heap is empty"', 'If the heap is empty, stop.'),
        L(
          `${E}.find`,
          1,
          root === want
            ? `m = ${one ? 1 : 0}`
            : `m = the ${est(want)} child of the root (the root if n = 1)`,
          root === want ? `The ${want} is the root.` : `The ${want} is one of the root's children.`,
        ),
        L(
          `${E}.last`,
          1,
          `x = A[m]; A[m] = ${last}; n = n − 1`,
          'Take it, move the last key there.',
        ),
        L(`${E}.down`, 1, 'if m is still in the heap: trickleDown(m)', 'Trickle that key down.'),
        L(`${E}.return`, 1, 'return x', `Hand back the ${want}imum.`),
        ...trickle,
      ],
    };
  };
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(key)', 'To insert a key:'),
        L('ins.full', 1, 'if n == capacity: error "heap overflow"', 'If the array is full, stop.'),
        L('ins.store', 1, `n = n + 1; ${last} = key`, 'Put it in the first free slot'),
        L('ins.push', 1, `pushUp(${one ? 'n' : 'n − 1'})`, 'and push it up.'),
        L('pu.sig', 0, 'pushUp(i)', 'To push a key up:'),
        L('pu.root', 1, `if i ≠ ${one ? 1 : 0}`, 'unless it is the root,'),
        L('pu.level', 2, 'if i is on a min level', 'if it is on a min level:'),
        L('pu.cmpMin', 3, 'if A[i] > A[parent(i)]', 'if it is larger than its parent,'),
        L(
          'pu.swapMin',
          4,
          'swap A[i] and A[parent(i)]; pushUpMax(parent(i))',
          'swap them and move it up the max levels;',
        ),
        L('pu.stayMin', 3, 'else pushUpMin(i)', 'otherwise move it up the min levels.'),
        L('pu.else', 2, 'else', 'If it is on a max level:'),
        L('pu.cmpMax', 3, 'if A[i] < A[parent(i)]', 'if it is smaller than its parent,'),
        L(
          'pu.swapMax',
          4,
          'swap A[i] and A[parent(i)]; pushUpMin(parent(i))',
          'swap them and move it up the min levels;',
        ),
        L('pu.stayMax', 3, 'else pushUpMax(i)', 'otherwise move it up the max levels.'),
        ...pushUpLines('min'),
        ...pushUpLines('max'),
      ],
    },
    extract('min'),
    extract('max'),
    {
      op: 'build',
      lines: [
        L('bld.sig', 0, 'build(list)', 'To build from a list:'),
        L('bld.copy', 1, `${one ? 'A[1..n]' : 'A[0..n − 1]'} = list`, 'copy the keys in,'),
        L(
          'bld.loop',
          1,
          one ? 'for i = ⌊n/2⌋ downto 1' : 'for i = ⌊n/2⌋ − 1 downto 0',
          'then from the last node with a child back to the root,',
        ),
        L('bld.down', 2, 'trickleDown(i)', 'trickle each key down.'),
        ...trickle,
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the heap:'),
        L('clr.reset', 1, 'n = 0', 'say it holds no keys.'),
      ],
    },
  ];
}

export function initialSay(_s: S, settings: MMSettings): string {
  return settings.root === 'max'
    ? 'An empty max-min heap: the root is on a max level, and the levels alternate max, min, max. The largest key is the root; the smallest is one of its children.'
    : 'An empty min-max heap: the root is on a min level, and the levels alternate min, max, min. The smallest key is the root; the largest is one of its children.';
}

export function initialVars(s: S): Record<string, Scalar> {
  const n = s.items.length;
  return { N: n, height: heightOf(n), comparisons: 0, swaps: 0 };
}

export function describe(s: S, settings: MMSettings): string {
  const kind = settings.root === 'max' ? 'max-min heap' : 'min-max heap';
  const n = s.items.length;
  if (n === 0) return `An empty ${kind}.`;
  return `A ${kind} with ${plural(n, 'key')} and height ${heightOf(n)}. The root is ${s.items[0]!.key}. The array holds ${s.items.map((x) => x.key).join(', ')}.`;
}
