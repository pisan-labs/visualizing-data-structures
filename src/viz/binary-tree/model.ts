import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { edgeShapeId, keyShapeId, nodeShapeId } from '../../layouts/binary-tree';

/** A node keeps its uid for life, so the view can animate it. Values may repeat. */
export interface TreeNode {
  uid: number;
  value: Value;
  left: number | null;
  right: number | null;
}

export interface BTState {
  nodes: Record<number, TreeNode>;
  root: number | null;
  nextUid: number;
}

export interface BTSettings {
  [key: string]: Scalar;
  /** recursive: the call stack does the bookkeeping. iterative: an explicit stack does. */
  mode: 'recursive' | 'iterative';
  /** Draw every empty child as a small square. */
  nulls: boolean;
}

export type Side = 'left' | 'right';
export type Order = 'preorder' | 'inorder' | 'postorder';

/** A frame on the call stack. A call on an empty child has uid null. */
export interface Frame {
  uid: number | null;
  parent?: number;
  side?: Side;
}

export interface BTExtra {
  /** Name of the running function, for the call stack frames. */
  fn?: string;
  /** Recursive traversals: the call stack, bottom first. */
  frames?: Frame[];
  /** Iterative traversals: the explicit stack, bottom first. */
  stack?: number[];
  /** Level order and build: the queue, front first. */
  queue?: number[];
  /** Nodes visited so far, in order. */
  output?: number[];
  /** An empty child being looked at, drawn as a small "nil" marker. */
  nil?: { parent: number; side: Side };
  /** Iterative traversals: the node x points at (null: x is nil). */
  x?: number | null;
  /** Iterative postorder: the node written last. */
  last?: number | null;
  /** A short message drawn on the stage, such as why a list was rejected. */
  message?: string;
  /** New nodes slide out of their parent: uid -> the uid they come from. */
  from?: Record<number, number>;
}

type S = BTState;
type X = BTExtra;
type Op = OpSpec<S, BTSettings, X>;
type BTStep = Step<S, X>;

export const MAX_NODES = 31;
export const MAX_TOKEN = 3;
const GAPS = new Set(['_', 'null', 'nil', 'none', '#', '-']);

export const defaults: BTSettings = { mode: 'recursive', nulls: false };

export function init(): S {
  return { nodes: {}, root: null, nextUid: 1 };
}

export function fmt(v: Value): string {
  return String(v);
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const nodeMark = (uid: number, role: Mark['role']) => mark(nodeShapeId(uid), role);

// ---------------------------------------------------------------------------------------------
// Level-order lists

/** One entry of a level-order list: a value, or null for a gap. */
export type Token = Value | null;

/**
 * Read a level-order list such as "1 2 3 _ 5" or "[1,2,3,null,5]". Children are listed only
 * for real nodes: a gap has no children of its own. Returns the tokens or a readable error.
 */
export function parseLevelOrder(raw: Value): Token[] | Error {
  const text = String(raw)
    .trim()
    .replace(/^\[|\]$/g, '');
  const words = text.split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return new Error('Type a level-order list, such as 1 2 3 _ 5.');
  const tokens: Token[] = [];
  for (const w of words) {
    if (GAPS.has(w.toLowerCase())) tokens.push(null);
    else if (w.length > MAX_TOKEN)
      return new Error(`"${w}" is too long. Keep values to ${MAX_TOKEN} characters.`);
    else if (/^-?\d+$/.test(w)) tokens.push(Number(w));
    else if (/^[A-Za-z][A-Za-z0-9]*$/.test(w)) tokens.push(w);
    else return new Error(`"${w}" is not a value. Use numbers, short words, or _ for a gap.`);
  }
  while (tokens.length > 1 && tokens[tokens.length - 1] === null) tokens.pop();
  if (tokens[0] === null) {
    return tokens.length === 1
      ? tokens
      : new Error('The first value is the root, so it cannot be _. A lone _ is the empty tree.');
  }
  const count = tokens.filter((t) => t !== null).length;
  if (count > MAX_NODES)
    return new Error(`That is ${count} nodes. Keep it to ${MAX_NODES} so the tree fits.`);
  // Each real node offers two child spots, in order. Make sure every value has one.
  let spots = 2;
  for (let i = 1; i < tokens.length; i++) {
    if (spots === 0) {
      const t = tokens[i];
      return new Error(
        `${t === null ? `The _ at position ${i + 1}` : `"${fmt(t!)}"`} has no node above it. ` +
          'Only real nodes get children, so the list is too long for this tree.',
      );
    }
    spots -= 1;
    if (tokens[i] !== null) spots += 2;
  }
  return tokens;
}

/** The canonical text of a list: gaps as _, numbers without leading zeros. */
export function formatLevelOrder(tokens: Token[]): string {
  return tokens.map((t) => (t === null ? '_' : fmt(t))).join(' ');
}

/** Level-order list of a tree, with _ for missing children and no trailing gaps. */
export function toLevelOrder(s: S): string {
  if (s.root === null) return '_';
  const out: Token[] = [];
  const queue: (number | null)[] = [s.root];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === null) {
      out.push(null);
      continue;
    }
    const n = s.nodes[u]!;
    out.push(n.value);
    queue.push(n.left, n.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return formatLevelOrder(out);
}

// ---------------------------------------------------------------------------------------------
// Readouts

export function size(s: S): number {
  return Object.keys(s.nodes).length;
}

/** Edges on the longest root-to-leaf path; -1 for the empty tree. */
export function height(s: S, uid: number | null = s.root): number {
  if (uid === null) return -1;
  const n = s.nodes[uid]!;
  return 1 + Math.max(height(s, n.left), height(s, n.right));
}

const valueOf = (s: S, uid: number) => fmt(s.nodes[uid]!.value);
const listOf = (s: S, uids: number[]) => uids.map((u) => valueOf(s, u)).join(' ');

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { size: size(s), height: height(s), ...more };
}

// ---------------------------------------------------------------------------------------------
// Build

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [raw]) {
    const parsed = parseLevelOrder(raw!);
    if (parsed instanceof Error) {
      yield {
        state: s,
        marks: [mark('message', 'error')],
        say: `That list does not describe a binary tree. ${parsed.message} The tree is unchanged.`,
        lines: ['build.bad'],
        vars: vars(s),
        level: 1,
        extra: { message: 'Not a valid list: tree unchanged' },
      } satisfies BTStep;
      return s;
    }
    const list = formatLevelOrder(parsed);
    if (parsed[0] === null) {
      const empty: S = { nodes: {}, root: null, nextUid: s.nextUid };
      yield {
        state: empty,
        marks: [],
        say: 'The list is just _, so the tree is empty.',
        lines: ['build.empty'],
        vars: vars(empty, { list }),
        level: 1,
      } satisfies BTStep;
      return empty;
    }

    let next = s.nextUid;
    const rootUid = next++;
    let t: S = {
      nodes: { [rootUid]: { uid: rootUid, value: parsed[0]!, left: null, right: null } },
      root: rootUid,
      nextUid: next,
    };
    const queue = [rootUid];
    yield {
      state: t,
      marks: [nodeMark(rootUid, 'new')],
      say: `Start a new tree. The first value, ${fmt(parsed[0]!)}, is the root. It joins a queue of nodes waiting for their children.`,
      lines: ['build.root'],
      vars: vars(t, { list, i: 1 }),
      level: 2,
      extra: { queue: [...queue] },
    } satisfies BTStep;

    let i = 1;
    while (i < parsed.length) {
      const x = queue.shift()!;
      const xv = valueOf(t, x);
      for (const side of ['left', 'right'] as const) {
        const k = side === 'left' ? i : i + 1;
        const tok = parsed[k];
        const test = side === 'left' ? 'build.ltest' : 'build.rtest';
        const lines = side === 'left' ? ['build.deq', test] : [test];
        const intro = side === 'left' ? `Take ${xv} from the front of the queue. ` : '';
        const which = side === 'left' ? 'The next value' : 'The value after that';
        if (tok === undefined || tok === null) {
          yield {
            state: t,
            marks: [nodeMark(x, 'active')],
            say:
              tok === undefined
                ? `${intro}The list has ended, so ${xv} gets no ${side} child.`
                : `${intro}${which} is _, so ${xv} gets no ${side} child.`,
            lines: side === 'right' ? [...lines, 'build.next'] : lines,
            vars: vars(t, { list, i: side === 'left' ? i : i + 2 }),
            level: 2,
            extra: { queue: [...queue] },
          } satisfies BTStep;
          continue;
        }
        const uid = next++;
        t = {
          nodes: {
            ...t.nodes,
            [x]: { ...t.nodes[x]!, [side]: uid },
            [uid]: { uid, value: tok, left: null, right: null },
          },
          root: t.root,
          nextUid: next,
        };
        queue.push(uid);
        const add = side === 'left' ? ['build.left', 'build.lenq'] : ['build.right', 'build.renq'];
        yield {
          state: t,
          marks: [nodeMark(x, 'active'), nodeMark(uid, 'new'), mark(`q-${uid}`, 'new')],
          say: `${intro}${which}, ${fmt(tok)}, becomes ${xv}'s ${side} child and joins the back of the queue.`,
          lines: [...lines, ...add, ...(side === 'right' ? ['build.next'] : [])],
          vars: vars(t, { list, i: side === 'left' ? i : i + 2 }),
          level: 2,
          extra: { queue: [...queue], from: { [uid]: x } },
        } satisfies BTStep;
      }
      i += 2;
    }

    yield {
      state: t,
      marks: [],
      say: `The list is used up, so the tree is built: ${size(t)} ${size(t) === 1 ? 'node' : 'nodes'}, height ${height(t)}.${
        queue.length ? ' The nodes still in the queue are leaves.' : ''
      }`,
      lines: ['build.loop'],
      vars: vars(t, { list }),
      level: 1,
    } satisfies BTStep;
    return t;
  },
};

// ---------------------------------------------------------------------------------------------
// Recursive traversals

const PREFIX: Record<Order, string> = { preorder: 'pre', inorder: 'in', postorder: 'post' };

function* recursive(s: S, order: Order): Generator<BTStep, S, void> {
  const p = PREFIX[order];
  const frames: Frame[] = [];
  const output: number[] = [];
  const name = (uid: number | null) => `${order}(${uid === null ? 'nil' : valueOf(s, uid)})`;
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[],
    more: Partial<X> = {},
  ): BTStep => ({
    state: s,
    marks,
    say,
    lines,
    vars: vars(s, { output: listOf(s, output), depth: frames.length }),
    level,
    extra: { fn: order, frames: frames.map((f) => ({ ...f })), output: [...output], ...more },
  });

  if (s.root === null) {
    yield step(
      `Call ${order}(nil) on the empty tree. x is nil, so it returns at once with nothing visited.`,
      [`${p}.sig`, `${p}.check`],
      1,
      [],
    );
    return s;
  }

  function* visit(u: number): Generator<BTStep, void, void> {
    output.push(u);
    yield step(
      `Visit ${valueOf(s, u)}: write it down. Output so far: ${listOf(s, output)}.`,
      [`${p}.visit`],
      1,
      [nodeMark(u, 'active'), mark(`out-${u}`, 'new')],
    );
  }

  function* call(parent: number, side: Side): Generator<BTStep, void, void> {
    const child = s.nodes[parent]![side];
    const pv = valueOf(s, parent);
    if (child === null) {
      frames.push({ uid: null, parent, side });
      const nil = { parent, side };
      yield step(
        `${name(parent)} calls ${order} on its ${side} child, which is nil.`,
        [`${p}.${side}`],
        3,
        [mark('nil', 'active')],
        { nil },
      );
      yield step(
        `x is nil, so ${order}(nil) returns at once. Back in ${name(parent)}.`,
        [`${p}.check`],
        3,
        [mark('nil', 'active')],
        { nil },
      );
      frames.pop();
      return;
    }
    frames.push({ uid: child });
    yield step(
      `${name(parent)} calls ${order} on its ${side} child: ${name(child)}.`,
      [`${p}.${side}`],
      2,
      [nodeMark(child, 'active'), mark(edgeShapeId(child), 'active')],
    );
    yield* body(child);
    frames.pop();
    yield step(
      `${name(child)} is done and returns to ${name(parent)}, back where ${pv} called its ${side} child.`,
      [`${p}.${side}`],
      2,
      [nodeMark(parent, 'active')],
    );
  }

  function* body(u: number): Generator<BTStep, void, void> {
    yield step(
      `${valueOf(s, u)} is a node, not nil, so ${name(u)} runs its body.`,
      [`${p}.check`],
      3,
      [nodeMark(u, 'active')],
    );
    if (order === 'preorder') yield* visit(u);
    yield* call(u, 'left');
    if (order === 'inorder') yield* visit(u);
    yield* call(u, 'right');
    if (order === 'postorder') yield* visit(u);
  }

  const root = s.root;
  frames.push({ uid: root });
  yield step(`Call ${name(root)} on the root.`, [`${p}.sig`], 2, [
    nodeMark(root, 'active'),
    mark(keyShapeId(root), 'active'),
  ]);
  yield* body(root);
  frames.pop();
  yield step(
    `${name(root)} returns and the call stack is empty again. ${capital(order)}: ${listOf(s, output)}.`,
    [],
    1,
    [],
  );
  return s;
}

const capital = (w: string) => w[0]!.toUpperCase() + w.slice(1);

// ---------------------------------------------------------------------------------------------
// Iterative traversals with an explicit stack

interface IterCtx {
  s: S;
  stack: number[];
  output: number[];
  /** Where x points; undefined before x is first assigned. */
  x: number | null | undefined;
  nil?: { parent: number; side: Side };
  last?: number | null;
  fn: Order;
}

function iterStep(
  c: IterCtx,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[],
): BTStep {
  const more: Record<string, Scalar> = { output: listOf(c.s, c.output) };
  if (c.x !== undefined) more.x = c.x === null ? 'nil' : valueOf(c.s, c.x);
  if (c.fn === 'postorder')
    more.last = c.last === null || c.last === undefined ? 'nil' : valueOf(c.s, c.last);
  return {
    state: c.s,
    marks,
    say,
    lines,
    vars: vars(c.s, more),
    level,
    extra: {
      fn: c.fn,
      stack: [...c.stack],
      output: [...c.output],
      x: c.x,
      nil: c.x === null ? c.nil : undefined,
      last: c.last,
    },
  };
}

function* emptyTree(s: S, fn: string, line: string): Generator<BTStep, S, void> {
  yield {
    state: s,
    marks: [],
    say: `The tree is empty, so ${fn} has nothing to visit.`,
    lines: [line],
    vars: vars(s, { output: '' }),
    level: 1,
  };
  return s;
}

function* preorderIterative(s: S): Generator<BTStep, S, void> {
  if (s.root === null) return yield* emptyTree(s, 'preorder', 'ipre.empty');
  const c: IterCtx = { s, stack: [s.root], output: [], x: undefined, fn: 'preorder' };
  yield iterStep(
    c,
    `Push the root, ${valueOf(s, s.root)}, onto an empty stack.`,
    ['ipre.init', 'ipre.pushroot'],
    2,
    [nodeMark(s.root, 'active'), mark(`stk-${s.root}`, 'new')],
  );
  while (c.stack.length) {
    const u = c.stack.pop()!;
    c.x = u;
    yield iterStep(
      c,
      `The stack is not empty. Pop the top node: x = ${valueOf(s, u)}.`,
      ['ipre.loop', 'ipre.pop'],
      2,
      [nodeMark(u, 'active')],
    );
    c.output.push(u);
    yield iterStep(
      c,
      `Visit ${valueOf(s, u)}. Output so far: ${listOf(s, c.output)}.`,
      ['ipre.visit'],
      1,
      [nodeMark(u, 'active'), mark(`out-${u}`, 'new')],
    );
    const n = s.nodes[u]!;
    for (const side of ['right', 'left'] as const) {
      const child = n[side];
      if (child === null) {
        yield iterStep(
          c,
          `${valueOf(s, u)} has no ${side} child, so nothing is pushed.`,
          [side === 'right' ? 'ipre.rtest' : 'ipre.ltest'],
          3,
          [nodeMark(u, 'active')],
        );
        continue;
      }
      c.stack.push(child);
      yield iterStep(
        c,
        side === 'right'
          ? `Push ${valueOf(s, child)}, the right child of ${valueOf(s, u)}. It waits until the whole left subtree is done.`
          : `Push ${valueOf(s, child)}, the left child of ${valueOf(s, u)}. It is on top now, so it comes off next.`,
        side === 'right' ? ['ipre.rtest', 'ipre.right'] : ['ipre.ltest', 'ipre.left'],
        2,
        [nodeMark(child, 'active'), mark(`stk-${child}`, 'new')],
      );
    }
  }
  yield iterStep(
    c,
    `The stack is empty, so the loop ends. Preorder: ${listOf(s, c.output)}.`,
    ['ipre.loop'],
    1,
    [],
  );
  return s;
}

function* inorderIterative(s: S): Generator<BTStep, S, void> {
  const c: IterCtx = { s, stack: [], output: [], x: s.root, fn: 'inorder' };
  yield iterStep(
    c,
    s.root === null
      ? 'Start with an empty stack and x = root, which is nil: the tree is empty.'
      : `Start with an empty stack and x = ${valueOf(s, s.root)}, the root.`,
    ['iin.init'],
    2,
    s.root === null ? [] : [nodeMark(s.root, 'active')],
  );
  while (typeof c.x === 'number' || c.stack.length) {
    if (typeof c.x === 'number') {
      const u: number = c.x;
      c.stack.push(u);
      const left = s.nodes[u]!.left;
      c.x = left;
      c.nil = left === null ? { parent: u, side: 'left' } : undefined;
      yield iterStep(
        c,
        `x = ${valueOf(s, u)} is a node: push it and go left. ${
          left === null
            ? `${valueOf(s, u)} has no left child, so x = nil.`
            : `x = ${valueOf(s, left)}.`
        }`,
        ['iin.loop', 'iin.test', 'iin.push', 'iin.goleft'],
        2,
        [left === null ? mark('nil', 'active') : nodeMark(left, 'active'), mark(`stk-${u}`, 'new')],
      );
    } else {
      const u = c.stack.pop()!;
      c.x = u;
      yield iterStep(
        c,
        `x is nil, so go back to the last node we saved: pop ${valueOf(s, u)}, x = ${valueOf(s, u)}.`,
        ['iin.loop', 'iin.else', 'iin.pop'],
        2,
        [nodeMark(u, 'active')],
      );
      c.output.push(u);
      yield iterStep(
        c,
        `Its left subtree is done, so visit ${valueOf(s, u)}. Output so far: ${listOf(s, c.output)}.`,
        ['iin.visit'],
        1,
        [nodeMark(u, 'active'), mark(`out-${u}`, 'new')],
      );
      const right = s.nodes[u]!.right;
      c.x = right;
      c.nil = right === null ? { parent: u, side: 'right' } : undefined;
      yield iterStep(
        c,
        right === null
          ? `Go right. ${valueOf(s, u)} has no right child, so x = nil.`
          : `Go right: x = ${valueOf(s, right)}.`,
        ['iin.goright'],
        right === null ? 3 : 2,
        [right === null ? mark('nil', 'active') : nodeMark(right, 'active')],
      );
    }
  }
  yield iterStep(
    c,
    `x is nil and the stack is empty, so the loop ends. Inorder: ${listOf(s, c.output) || 'nothing'}.`,
    ['iin.loop'],
    1,
    [],
  );
  return s;
}

function* postorderIterative(s: S): Generator<BTStep, S, void> {
  const c: IterCtx = { s, stack: [], output: [], x: s.root, last: null, fn: 'postorder' };
  yield iterStep(
    c,
    s.root === null
      ? 'Start with an empty stack, last = nil, and x = root, which is nil: the tree is empty.'
      : `Start with an empty stack, last = nil, and x = ${valueOf(s, s.root)}, the root.`,
    ['ipost.init'],
    2,
    s.root === null ? [] : [nodeMark(s.root, 'active')],
  );
  while (typeof c.x === 'number' || c.stack.length) {
    if (typeof c.x === 'number') {
      const u: number = c.x;
      c.stack.push(u);
      const left = s.nodes[u]!.left;
      c.x = left;
      c.nil = left === null ? { parent: u, side: 'left' } : undefined;
      yield iterStep(
        c,
        `x = ${valueOf(s, u)} is a node: push it and go left. ${
          left === null
            ? `${valueOf(s, u)} has no left child, so x = nil.`
            : `x = ${valueOf(s, left)}.`
        }`,
        ['ipost.loop', 'ipost.test', 'ipost.push', 'ipost.goleft'],
        2,
        [left === null ? mark('nil', 'active') : nodeMark(left, 'active'), mark(`stk-${u}`, 'new')],
      );
      continue;
    }
    const y = c.stack[c.stack.length - 1]!;
    const right = s.nodes[y]!.right;
    const yv = valueOf(s, y);
    if (right !== null && right !== c.last) {
      c.x = right;
      yield iterStep(
        c,
        `x is nil. Look at the top of the stack without popping: ${yv}. Its right subtree is not done yet, so go right: x = ${valueOf(s, right)}.`,
        ['ipost.else', 'ipost.peek', 'ipost.r', 'ipost.test2', 'ipost.goright'],
        2,
        [nodeMark(y, 'active'), nodeMark(right, 'compare')],
      );
      continue;
    }
    yield iterStep(
      c,
      right === null
        ? `x is nil. The top of the stack is ${yv}, and it has no right child, so both its subtrees are done.`
        : `x is nil. The top of the stack is ${yv}, and its right child ${valueOf(s, right)} was the last node written, so both subtrees are done.`,
      ['ipost.else', 'ipost.peek', 'ipost.r', 'ipost.test2'],
      2,
      [nodeMark(y, 'active')],
    );
    c.output.push(y);
    yield iterStep(
      c,
      `Visit ${yv}. Output so far: ${listOf(s, c.output)}.`,
      ['ipost.done', 'ipost.visit'],
      1,
      [nodeMark(y, 'active'), mark(`out-${y}`, 'new')],
    );
    c.stack.pop();
    c.last = y;
    c.nil = undefined;
    yield iterStep(
      c,
      `Pop ${yv} and remember it: last = ${yv}. x stays nil, so the next round looks at the stack again.`,
      ['ipost.pop'],
      2,
      [nodeMark(y, 'done')],
    );
  }
  yield iterStep(
    c,
    `x is nil and the stack is empty, so the loop ends. Postorder: ${listOf(s, c.output) || 'nothing'}.`,
    ['ipost.loop'],
    1,
    [],
  );
  return s;
}

// ---------------------------------------------------------------------------------------------
// Level order

function* levelorder(s: S): Generator<BTStep, S, void> {
  if (s.root === null) return yield* emptyTree(s, 'level order', 'lvl.empty');
  const queue = [s.root];
  const output: number[] = [];
  let x: number | undefined;
  const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): BTStep => ({
    state: s,
    marks,
    say,
    lines,
    vars: vars(s, {
      output: listOf(s, output),
      ...(x === undefined ? {} : { x: valueOf(s, x) }),
      queued: queue.length,
    }),
    level,
    extra: { fn: 'levelorder', queue: [...queue], output: [...output], x },
  });
  yield step(
    `Put the root, ${valueOf(s, s.root)}, in an empty queue.`,
    ['lvl.init', 'lvl.enqroot'],
    2,
    [nodeMark(s.root, 'active'), mark(`q-${s.root}`, 'new')],
  );
  while (queue.length) {
    const u = queue.shift()!;
    output.push(u);
    x = u;
    yield step(
      `Take ${valueOf(s, u)} from the front of the queue and visit it. Output so far: ${listOf(s, output)}.`,
      ['lvl.loop', 'lvl.deq', 'lvl.visit'],
      1,
      [nodeMark(u, 'active'), mark(`out-${u}`, 'new')],
    );
    const n = s.nodes[u]!;
    for (const side of ['left', 'right'] as const) {
      const child = n[side];
      if (child === null) {
        yield step(
          `${valueOf(s, u)} has no ${side} child, so nothing joins the queue.`,
          [side === 'left' ? 'lvl.ltest' : 'lvl.rtest'],
          3,
          [nodeMark(u, 'active')],
        );
        continue;
      }
      queue.push(child);
      yield step(
        `Add ${valueOf(s, u)}'s ${side} child, ${valueOf(s, child)}, to the back of the queue.`,
        side === 'left' ? ['lvl.ltest', 'lvl.left'] : ['lvl.rtest', 'lvl.right'],
        2,
        [nodeMark(child, 'active'), mark(`q-${child}`, 'new')],
      );
    }
  }
  yield step(
    `The queue is empty, so every level is done. Level order: ${listOf(s, output)}.`,
    ['lvl.loop'],
    1,
    [],
  );
  return s;
}

// ---------------------------------------------------------------------------------------------
// Operations

const traversal = (order: Order, label: string): Op => ({
  label,
  arity: 0,
  *run(s, _args, { settings }) {
    if (settings.mode === 'recursive') return yield* recursive(s, order);
    if (order === 'preorder') return yield* preorderIterative(s);
    if (order === 'inorder') return yield* inorderIterative(s);
    return yield* postorderIterative(s);
  },
});

export const ops = {
  build,
  preorder: traversal('preorder', 'Preorder'),
  inorder: traversal('inorder', 'Inorder'),
  postorder: traversal('postorder', 'Postorder'),
  levelorder: { label: 'Level order', arity: 0, run: (s: S) => levelorder(s) } satisfies Op,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const BUILD: PseudoBlock = {
  op: 'build',
  lines: [
    L('build.sig', 0, 'build(list)', 'To build a tree from a level-order list:'),
    L('build.bad', 1, 'if list is not a tree: error', 'If the list cannot be a tree, stop.'),
    L('build.empty', 1, 'if list == [_]: return nil', 'A list that is just _ is the empty tree.'),
    L('build.root', 1, 'root = Node(list[0])', 'The first value is the root.'),
    L('build.queue', 1, 'Q = [root]; i = 1', 'It waits in a queue for its children.'),
    L('build.loop', 1, 'while i < length(list)', 'While there are values left:'),
    L('build.deq', 2, 'x = Q.dequeue()', 'take the next node waiting for children.'),
    L('build.ltest', 2, 'if list[i] ≠ _', 'If the next value is not _,'),
    L('build.left', 3, 'x.left = Node(list[i])', 'it becomes the left child'),
    L('build.lenq', 3, 'Q.enqueue(x.left)', 'and waits in the queue too.'),
    L('build.rtest', 2, 'if list[i+1] ≠ _', 'If the value after it is not _ (or missing),'),
    L('build.right', 3, 'x.right = Node(list[i+1])', 'it becomes the right child'),
    L('build.renq', 3, 'Q.enqueue(x.right)', 'and waits in the queue too.'),
    L('build.next', 2, 'i = i + 2', 'Move on two values.'),
  ],
};

function recursiveBlock(order: Order): PseudoBlock {
  const p = PREFIX[order];
  const visit = L(`${p}.visit`, 2, 'visit(x)', 'write down x,');
  const left = L(`${p}.left`, 2, `${order}(x.left)`, 'list its left subtree,');
  const right = L(`${p}.right`, 2, `${order}(x.right)`, 'list its right subtree.');
  const body =
    order === 'preorder'
      ? [visit, left, right]
      : order === 'inorder'
        ? [left, visit, right]
        : [left, right, visit];
  const firsts: Record<Order, string> = {
    preorder: 'the node before its subtrees',
    inorder: 'the node between its subtrees',
    postorder: 'the node after its subtrees',
  };
  return {
    op: order,
    lines: [
      L(`${p}.sig`, 0, `${order}(x)`, `To list the subtree at x, ${firsts[order]}:`),
      L(`${p}.check`, 1, 'if x ≠ nil', 'if there is a node here,'),
      ...body.map((l, k) => ({
        ...l,
        plain: k === 0 ? `first ${l.plain}` : k === 1 ? `then ${l.plain}` : `then ${l.plain}`,
      })),
    ],
  };
}

const ITERATIVE: PseudoBlock[] = [
  {
    op: 'preorder',
    lines: [
      L('ipre.sig', 0, 'preorder(root)', 'To list the tree in preorder:'),
      L('ipre.empty', 1, 'if root == nil: return', 'If the tree is empty, there is nothing to do.'),
      L('ipre.init', 1, 'S = new stack', 'Start with an empty stack'),
      L('ipre.pushroot', 1, 'S.push(root)', 'and put the root on it.'),
      L('ipre.loop', 1, 'while S is not empty', 'While the stack has nodes:'),
      L('ipre.pop', 2, 'x = S.pop()', 'take the top node off,'),
      L('ipre.visit', 2, 'visit(x)', 'write it down,'),
      L('ipre.rtest', 2, 'if x.right ≠ nil', 'if it has a right child,'),
      L('ipre.right', 3, 'S.push(x.right)', 'save that child for later;'),
      L('ipre.ltest', 2, 'if x.left ≠ nil', 'if it has a left child,'),
      L('ipre.left', 3, 'S.push(x.left)', 'save it on top, so it comes off first.'),
    ],
  },
  {
    op: 'inorder',
    lines: [
      L('iin.sig', 0, 'inorder(root)', 'To list the tree in inorder:'),
      L('iin.init', 1, 'S = new stack; x = root', 'Start at the root with an empty stack.'),
      L(
        'iin.loop',
        1,
        'while x ≠ nil or S is not empty',
        'While we are at a node or have nodes saved:',
      ),
      L('iin.test', 2, 'if x ≠ nil', 'if we are at a node,'),
      L('iin.push', 3, 'S.push(x)', 'save it on the stack'),
      L('iin.goleft', 3, 'x = x.left', 'and go left;'),
      L('iin.else', 2, 'else', 'otherwise we fell off the tree, so'),
      L('iin.pop', 3, 'x = S.pop()', 'go back to the last node saved,'),
      L('iin.visit', 3, 'visit(x)', 'write it down,'),
      L('iin.goright', 3, 'x = x.right', 'and go right.'),
    ],
  },
  {
    op: 'postorder',
    lines: [
      L('ipost.sig', 0, 'postorder(root)', 'To list the tree in postorder:'),
      L('ipost.init', 1, 'S = new stack; x = root', 'Start at the root with an empty stack.'),
      L('ipost.last', 1, 'last = nil', 'Nothing has been written yet.'),
      L(
        'ipost.loop',
        1,
        'while x ≠ nil or S is not empty',
        'While we are at a node or have nodes saved:',
      ),
      L('ipost.test', 2, 'if x ≠ nil', 'if we are at a node,'),
      L('ipost.push', 3, 'S.push(x)', 'save it on the stack'),
      L('ipost.goleft', 3, 'x = x.left', 'and go left;'),
      L('ipost.else', 2, 'else', 'otherwise we fell off the tree, so'),
      L('ipost.peek', 3, 'y = S.top()', 'look at the last node saved, without removing it,'),
      L('ipost.r', 3, 'r = y.right', 'and at its right child.'),
      L('ipost.test2', 3, 'if r ≠ nil and r ≠ last', 'If that child is there and not done yet,'),
      L('ipost.goright', 4, 'x = r', 'go into it;'),
      L('ipost.done', 3, 'else', 'otherwise both subtrees are done:'),
      L('ipost.visit', 4, 'visit(y)', 'write it down,'),
      L('ipost.pop', 4, 'last = S.pop()', 'take it off the stack, and remember it was last.'),
    ],
  },
];

const LEVEL: PseudoBlock = {
  op: 'levelorder',
  lines: [
    L('lvl.sig', 0, 'levelorder(root)', 'To list the tree level by level:'),
    L('lvl.empty', 1, 'if root == nil: return', 'If the tree is empty, there is nothing to do.'),
    L('lvl.init', 1, 'Q = new queue', 'Start with an empty queue'),
    L('lvl.enqroot', 1, 'Q.enqueue(root)', 'and put the root in it.'),
    L('lvl.loop', 1, 'while Q is not empty', 'While the queue has nodes:'),
    L('lvl.deq', 2, 'x = Q.dequeue()', 'take the node at the front,'),
    L('lvl.visit', 2, 'visit(x)', 'write it down,'),
    L('lvl.ltest', 2, 'if x.left ≠ nil', 'if it has a left child,'),
    L('lvl.left', 3, 'Q.enqueue(x.left)', 'add that child to the back;'),
    L('lvl.rtest', 2, 'if x.right ≠ nil', 'if it has a right child,'),
    L('lvl.right', 3, 'Q.enqueue(x.right)', 'add it to the back too.'),
  ],
};

export function pseudocode(settings: BTSettings): PseudoBlock[] {
  const orders: Order[] = ['preorder', 'inorder', 'postorder'];
  const middle = settings.mode === 'iterative' ? ITERATIVE : orders.map(recursiveBlock);
  return [BUILD, ...middle, LEVEL];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(): string {
  return 'An empty binary tree. Type a level-order list such as 1 2 3 _ 5 and press Build, or pick a shape.';
}

export function initialVars(state: S): Record<string, Scalar> {
  return vars(state);
}

/** Screen-reader summary: the root, then each node's children. */
export function describe(s: S): string {
  if (s.root === null) return 'An empty binary tree.';
  const parts: string[] = [];
  const order: number[] = [];
  const queue = [s.root];
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    const n = s.nodes[u]!;
    if (n.left !== null) queue.push(n.left);
    if (n.right !== null) queue.push(n.right);
  }
  for (const u of order) {
    const n = s.nodes[u]!;
    const kids = [
      n.left !== null ? `left ${valueOf(s, n.left)}` : '',
      n.right !== null ? `right ${valueOf(s, n.right)}` : '',
    ].filter(Boolean);
    if (kids.length) parts.push(`${valueOf(s, u)} has ${kids.join(' and ')}.`);
  }
  const n = size(s);
  return `A binary tree with ${n} ${n === 1 ? 'node' : 'nodes'} and height ${height(s)}. The root is ${valueOf(s, s.root)}. ${parts.join(' ')}`.trim();
}
