/**
 * Cartesian tree: built from an array, left to right, with the right-spine stack. Heap order on
 * the values (the smallest on top by default), inorder = array order. A range-minimum query is a
 * walk down to the lowest common ancestor of the two ends.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { edgeShapeId, nodeShapeId } from '../../layouts/binary-tree';
import { L, clearBlock, plural, treeHeight, type TreeNode } from '../_bst/tree-kit';

export interface CartesianSettings {
  [key: string]: Scalar;
  /** min: the smallest value is the root (a min-heap). max: the largest is. */
  heap: 'min' | 'max';
}

export interface CartesianState {
  /** Node uids in array order: order[i] holds A[i]. */
  order: number[];
  /** key = the value. */
  nodes: Record<number, TreeNode>;
  root: number | null;
  nextUid: number;
  /** Pops since the array was last cleared: never more than the number of appends. */
  pops: number;
}

export interface CartesianExtra {
  /** A refused argument, drawn in a box with an error mark. */
  arg?: { text: string };
  /** The node being appended, waiting under its array cell until it is linked. */
  waiting?: number;
  /** The right spine, root end first: the stack the build keeps. */
  stack?: number[];
  /** Nodes popped by this append, in order. */
  popped?: number[];
  /** A range query: the array indexes, both ends included. */
  range?: [number, number];
  /** Nodes the query walked through. */
  path?: number[];
}

type S = CartesianState;
type X = CartesianExtra;
type Op = OpSpec<S, CartesianSettings, X>;
type CStep = Step<S, X>;

/** Values fit in a node as two digits. */
export const MAX_VALUE = 99;
/** The array holds at most this many values, so the drawing stays readable. */
export const MAX_LENGTH = 12;

export const defaults: CartesianSettings = { heap: 'min' };

export function init(): S {
  return { order: [], nodes: {}, root: null, nextUid: 1, pops: 0 };
}

export function parseValue(raw: Value): number | Error {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text) || Number(text) > MAX_VALUE)
    return new Error(`Values are whole numbers from 0 to ${MAX_VALUE}, such as 42.`);
  return Number(text);
}

export function parseIndex(raw: Value, n: number): number | Error {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text))
    return new Error(
      n === 0 ? 'The array is empty: append values first.' : `Indexes run from 0 to ${n - 1}.`,
    );
  const i = Number(text);
  if (i >= n)
    return new Error(
      n === 0 ? 'The array is empty: append values first.' : `Indexes run from 0 to ${n - 1}.`,
    );
  return i;
}

/** True when value a belongs strictly above value b. Equal values keep the earlier one on top. */
export const above = (st: CartesianSettings, a: number, b: number) =>
  st.heap === 'min' ? a < b : a > b;

const bigger = (st: CartesianSettings) => (st.heap === 'min' ? 'bigger' : 'smaller');
const smallest = (st: CartesianSettings) => (st.heap === 'min' ? 'smallest' : 'largest');

/** The right spine, root first: exactly the stack the build keeps. */
export function rightSpine(s: { nodes: Record<number, TreeNode>; root: number | null }): number[] {
  const out: number[] = [];
  for (let u = s.root; u !== null; u = s.nodes[u]!.right) out.push(u);
  return out;
}

export function readouts(s: S): Record<string, Scalar> {
  return {
    N: s.order.length,
    height: treeHeight(s),
    stack: rightSpine(s).length,
    pops: s.pops,
  };
}

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });
const nodeMark = (u: number, role: Mark['role']) => mk(nodeShapeId(u), role);
export const cellShapeId = (u: number) => `cell-${u}`;

function copy(s: S): S {
  const nodes: Record<number, TreeNode> = {};
  for (const [k, n] of Object.entries(s.nodes)) nodes[Number(k)] = { ...n };
  return { ...s, order: [...s.order], nodes };
}

function make(
  s: S,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[],
  extra: X,
  vars: Record<string, Scalar> = {},
): CStep {
  const state = copy(s);
  const x: X = { ...extra };
  if (x.stack) x.stack = [...x.stack];
  if (x.popped) x.popped = [...x.popped];
  if (x.path) x.path = [...x.path];
  return { state, marks, say, lines, level, extra: x, vars: { ...readouts(state), ...vars } };
}

function* refuse(s: S, call: string, why: string, line: string, text: string) {
  yield make(s, `${call}: ${why} Nothing changes.`, [line], 1, [mk('arg-box', 'error')], {
    arg: { text },
  });
  return s;
}

// ---------------------------------------------------------------------------------------------
// append(x): the O(n) build, one value at a time

const append: Op = {
  label: 'Append',
  arity: 1,
  *run(s0, [raw], { settings: st }) {
    const x = parseValue(raw!);
    const call = `append(${String(raw)})`;
    if (x instanceof Error) return yield* refuse(s0, call, x.message, 'app.sig', String(raw));
    if (s0.order.length >= MAX_LENGTH)
      return yield* refuse(
        s0,
        call,
        `This array holds at most ${MAX_LENGTH} values, so the drawing stays readable. Clear it to start again.`,
        'app.sig',
        String(raw),
      );
    const s = copy(s0);
    const z = s.nextUid;
    s.nextUid += 1;
    s.nodes[z] = { uid: z, key: x, left: null, right: null, parent: null };
    s.order.push(z);
    const i = s.order.length - 1;
    const stack = rightSpine(s0);
    const popped: number[] = [];
    const ex = (): X => ({ waiting: z, stack, popped });
    const v = (more: Record<string, Scalar> = {}) => ({ x, ...more });
    const keys = (us: number[]) => us.map((u) => s.nodes[u]!.key).join(', ');

    yield make(
      s,
      stack.length === 0
        ? `${call}: A[${i}] = ${x}. The stack is empty, so there is nothing to compare with.`
        : `${call}: A[${i}] = ${x}. The stack holds the right spine: ${keys(stack)}. Compare ${x} with its top, ${s.nodes[stack.at(-1)!]!.key}.`,
      ['app.node', 'app.last'],
      2,
      [nodeMark(z, 'new'), mk(cellShapeId(z), 'new')],
      ex(),
      v(),
    );

    // Pop every node whose value belongs below x.
    while (stack.length > 0) {
      const top = stack.at(-1)!;
      const tv = s.nodes[top]!.key;
      if (!above(st, x, tv)) break;
      stack.pop();
      popped.push(top);
      s.pops += 1;
      const next = stack.at(-1);
      yield make(
        s,
        `${tv} is ${bigger(st)} than ${x}, so ${tv} belongs below ${x}: pop it. ${
          next === undefined
            ? 'The stack is empty now.'
            : `Next, compare ${x} with ${s.nodes[next]!.key}.`
        }`,
        ['app.loop', 'app.pop'],
        2,
        [nodeMark(top, 'remove'), nodeMark(z, 'active')],
        ex(),
        v({ top: tv }),
      );
    }

    // Link: the last popped node hangs on the left, x hangs on the right of the new top.
    const last = popped.at(-1) ?? null;
    const top = stack.at(-1) ?? null;
    const zn = s.nodes[z]!;
    if (last !== null) {
      // last was the right child of top (or the root); x takes its place.
      zn.left = last;
      s.nodes[last]!.parent = z;
    }
    if (top !== null) {
      s.nodes[top]!.right = z;
      zn.parent = top;
    } else {
      s.root = z;
    }
    stack.push(z);
    const stopWhy =
      top === null
        ? popped.length === 0
          ? `${x} is the first value, so it is the root.`
          : `The stack is empty, so ${x} is the ${smallest(st)} value so far and becomes the root.`
        : `${s.nodes[top]!.key} is not ${bigger(st)} than ${x}, so the popping stops. ${x} becomes the right child of ${s.nodes[top]!.key}.`;
    const leftWhy =
      last === null
        ? ''
        : ` The last node popped, ${s.nodes[last]!.key}, becomes the left child of ${x}, and brings its subtree along.`;
    const marks: Mark[] = [nodeMark(z, 'new'), mk(cellShapeId(z), 'new')];
    if (zn.parent !== null) marks.push(mk(edgeShapeId(z), 'new'));
    if (last !== null) marks.push(mk(edgeShapeId(last), 'new'));
    yield make(
      s,
      `${stopWhy}${leftWhy} Push ${x}. This append popped ${plural(popped.length, 'node')}; ${plural(s.pops, 'pop')} in all for ${plural(s.order.length, 'value')}.`,
      [
        'app.loop',
        ...(last !== null ? ['app.left'] : []),
        top !== null ? 'app.right' : 'app.root',
        'app.push',
      ],
      1,
      marks,
      { stack, popped },
      v(),
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// rmq(i, j): walk down until the node's index falls in i..j

const rmq: Op = {
  label: 'Range minimum',
  arity: 2,
  *run(s, [ri, rj], { settings: st }) {
    const n = s.order.length;
    const call = `rmq(${String(ri)}, ${String(rj)})`;
    const a = parseIndex(ri!, n);
    if (a instanceof Error) return yield* refuse(s, call, a.message, 'rmq.sig', String(ri));
    const b = parseIndex(rj!, n);
    if (b instanceof Error) return yield* refuse(s, call, b.message, 'rmq.sig', String(rj));
    const [i, j] = a <= b ? [a, b] : [b, a];
    const index = new Map(s.order.map((u, k) => [u, k]));
    const word = st.heap === 'min' ? 'minimum' : 'maximum';
    const path: number[] = [];
    const range: [number, number] = [i, j];
    const cells = s.order.slice(i, j + 1).map((u) => mk(cellShapeId(u), 'active'));
    const vars = (more: Record<string, Scalar> = {}) => ({ i, j, visited: path.length, ...more });
    let x = s.root!;
    yield make(
      s,
      `${call}: the ${word} of A[${i}..${j}] sits at the lowest common ancestor of the nodes for A[${i}] and A[${j}]. ${
        a > b ? `(The ends were swapped so that i ≤ j.) ` : ''
      }Start at the root.`,
      ['rmq.init'],
      2,
      [...cells, nodeMark(x, 'active')],
      { range, path },
      vars(),
    );
    for (;;) {
      path.push(x);
      const k = index.get(x)!;
      const key = s.nodes[x]!.key;
      if (k >= i && k <= j) break;
      const side = k < i ? 'right' : 'left';
      const next = s.nodes[x]![side]!;
      yield make(
        s,
        k < i
          ? `${key} is A[${k}], left of the range (${k} < ${i}). The whole range is in its right subtree: go right to ${s.nodes[next]!.key}.`
          : `${key} is A[${k}], right of the range (${k} > ${j}). The whole range is in its left subtree: go left to ${s.nodes[next]!.key}.`,
        ['rmq.loop', k < i ? 'rmq.right' : 'rmq.left'],
        2,
        [
          ...cells,
          nodeMark(x, 'compare'),
          nodeMark(next, 'active'),
          mk(edgeShapeId(next), 'active'),
        ],
        { range, path },
        vars(),
      );
      x = next;
    }
    const k = index.get(x)!;
    const key = s.nodes[x]!.key;
    yield make(
      s,
      `${key} is A[${k}], inside ${i}..${j}: A[${i}] and A[${j}] lie on different sides of it (or are it), so it is their common ancestor and the ${word}: ${key}. The walk visited ${plural(path.length, 'node')}; a scan would read ${plural(j - i + 1, 'cell')}.`,
      ['rmq.loop', 'rmq.ret'],
      1,
      [...cells, nodeMark(x, 'found'), mk(cellShapeId(x), 'found')],
      { range, path },
      vars({ index: k, [word === 'minimum' ? 'min' : 'max']: key }),
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
      s.order.length === 0
        ? 'clear(): the array was already empty.'
        : 'clear(): the array and the tree are empty again, and the pop count starts at 0.',
      ['clear.root'],
      1,
      [],
      {},
    );
    return empty;
  },
};

export const ops = { append, rmq, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

export function pseudocode(st: CartesianSettings): PseudoBlock[] {
  const gt = st.heap === 'min' ? '>' : '<';
  const big = bigger(st);
  const word = st.heap === 'min' ? 'smallest' : 'largest';
  return [
    {
      op: 'append',
      lines: [
        L('app.sig', 0, 'append(x)', 'To add x at the end of the array:'),
        L('app.node', 1, 'z = new node(x); A.push(z)', 'make a node for x at the end,'),
        L('app.last', 1, 'last = nil', 'with nothing popped yet.'),
        L(
          'app.loop',
          1,
          `while stack ≠ ∅ and top.value ${gt} x`,
          `While the top of the stack is ${big} than x,`,
        ),
        L('app.pop', 2, 'last = stack.pop()', 'pop it: it belongs below x.'),
        L('app.left', 1, 'z.left = last', 'The last node popped becomes x’s left child.'),
        L(
          'app.right',
          1,
          'if stack ≠ ∅: top.right = z',
          'x becomes the right child of the new top,',
        ),
        L('app.root', 1, 'else: root = z', `or the root, if x is the ${word} so far.`),
        L('app.push', 1, 'stack.push(z)', 'Push x: it is the new end of the right spine.'),
      ],
    },
    {
      op: 'rmq',
      lines: [
        L(
          'rmq.sig',
          0,
          'rmq(i, j)',
          `To find the ${st.heap === 'min' ? 'smallest' : 'largest'} value in A[i..j]:`,
        ),
        L('rmq.init', 1, 'x = root', 'start at the root.'),
        L('rmq.loop', 1, 'while x.index < i or x.index > j', 'Until x sits inside the range:'),
        L('rmq.right', 2, 'if x.index < i: x = x.right', 'if x is left of the range, go right,'),
        L('rmq.left', 2, 'else: x = x.left', 'if it is right of the range, go left.'),
        L('rmq.ret', 1, 'return x.value', 'x is the common ancestor of i and j: the answer.'),
      ],
    },
    {
      op: 'clear',
      lines: clearBlock().lines.map((l) =>
        l.id === 'clear.root'
          ? { ...l, text: 'A = []; root = nil', plain: 'forget the array and the tree.' }
          : l,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(): string {
  return 'An empty array. Append values, such as 5 2 8 6 9 1: each one joins the tree through the right-spine stack.';
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

export function describe(s: S): string {
  const values = s.order.map((u) => s.nodes[u]!.key);
  if (s.root === null)
    return s.order.length === 0
      ? 'An empty array and an empty Cartesian tree.'
      : `The array ${values.join(', ')}; the tree is still empty.`;
  const parts = s.order.map((u) => {
    const n = s.nodes[u]!;
    const kids = [
      n.left !== null ? `left ${s.nodes[n.left]!.key}` : '',
      n.right !== null ? `right ${s.nodes[n.right]!.key}` : '',
    ].filter(Boolean);
    return kids.length ? `${n.key} has ${kids.join(' and ')}.` : `${n.key} is a leaf.`;
  });
  return `The array ${values.join(', ')} and its Cartesian tree of height ${treeHeight(s)}. The root is ${s.nodes[s.root!]!.key}. ${parts.join(' ')}`;
}
