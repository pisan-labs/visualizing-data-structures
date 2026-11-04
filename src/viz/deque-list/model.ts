import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export interface ListNode {
  uid: number;
  value: Value;
}

export interface DequeListState {
  /** nodes[0] is the first node (head) and the last one is the tail. Links run both ways. */
  nodes: ListNode[];
  nextUid: number;
}

export interface DequeListSettings {
  [key: string]: Scalar;
}

export type End = 'first' | 'last';

export interface DequeListExtra {
  /**
   * A node being added at one end, drawn outside the current list. `out`: its own link toward
   * the list is set (node.next for addFirst, node.prev for addLast). `back`: the neighbour's
   * link to it is set (head.prev or tail.next).
   */
  fresh?: { uid: number; value: Value; end: End; out: boolean; back: boolean };
  /** A node just removed from one end. `back`: the new end node still links to it. */
  old?: { node: ListNode; end: End; back: boolean; garbage: boolean };
  /** head and tail as slots in the drawing, when they differ from what the state implies. */
  ptr?: { head?: number | null; tail?: number | null };
  out?: { value: Value; label: string; end: End };
}

type S = DequeListState;
type X = DequeListExtra;
type Op = OpSpec<S, DequeListSettings, X>;
type ListStep = Step<S, X>;

export const defaults: DequeListSettings = {};

export function init(): S {
  return { nodes: [], nextUid: 1 };
}

export function fmt(v: Value): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

function vars(s: S, more: Record<string, Scalar> = {}) {
  return { ...more, n: s.nodes.length };
}

/**
 * Pointers while the only node is half in, half out: the pointer at `end` is null and the
 * other one already (or still) points at the node, which is drawn in slot 0.
 */
const onlyNode = (end: End) =>
  end === 'first' ? { head: null, tail: 0 } : { head: 0, tail: null };

/** addFirst and addLast are mirror images: head/next/prev swap with tail/prev/next. */
function add(end: End): Op {
  const first = end === 'first';
  const op = first ? 'addFirst' : 'addLast';
  const self = first ? 'head' : 'tail';
  const other = first ? 'tail' : 'head';
  const toward = first ? 'next' : 'prev';
  const back = first ? 'prev' : 'next';
  return {
    label: first ? 'Add first' : 'Add last',
    arity: 1,
    *run(s, [x]) {
      const value = x as Value;
      const v = fmt(value);
      const uid = s.nextUid;
      const n = s.nodes.length;
      const neighbour = first ? s.nodes[0] : s.nodes[n - 1];
      const fresh = { uid, value, end, out: false, back: false };
      yield {
        state: s,
        marks: [mark(`n${uid}`, 'new')],
        say: `${op}(${v}): make a new node holding ${v}, with prev and next both null.`,
        lines: [`${op}.new`],
        vars: vars(s, { x: value }),
        level: 2,
        extra: { fresh },
      } satisfies ListStep;
      yield {
        state: s,
        marks: [mark(neighbour ? `n${uid}-${toward}` : `n${uid}-${toward}-null`, 'active')],
        say: neighbour
          ? `node.${toward} = ${self}: the new node points ${first ? 'forward' : 'back'} at ${fmt(neighbour.value)}.`
          : `node.${toward} = ${self}, and ${self} is null, so it stays null.`,
        lines: [`${op}.${toward}`],
        vars: vars(s, { x: value }),
        level: 2,
        extra: { fresh: { ...fresh, out: true } },
      } satisfies ListStep;
      yield {
        state: s,
        marks: [mark(self, 'active')],
        say: neighbour
          ? `Is ${self} null? No, it points at ${fmt(neighbour.value)}.`
          : `Is ${self} null? Yes: the deque is empty.`,
        lines: [`${op}.check`],
        vars: vars(s, { x: value }),
        level: 2,
        extra: { fresh: { ...fresh, out: true } },
      } satisfies ListStep;
      if (neighbour) {
        yield {
          state: s,
          marks: [mark(`n${neighbour.uid}-${back}`, 'active')],
          say: `${self}.${back} = node: ${fmt(neighbour.value)} now points ${first ? 'back' : 'forward'} at the new node too.`,
          lines: [`${op}.else`, `${op}.${back}`],
          vars: vars(s, { x: value }),
          level: 2,
          extra: { fresh: { ...fresh, out: true, back: true } },
        } satisfies ListStep;
      } else {
        yield {
          state: s,
          marks: [mark(other, 'active')],
          say: `The deque was empty, so the new node is also the ${first ? 'last' : 'first'} one: ${other} = node.`,
          lines: [`${op}.${other}`],
          vars: vars(s, { x: value }),
          level: 2,
          extra: { fresh: { ...fresh, out: true, back: true }, ptr: onlyNode(end) },
        } satisfies ListStep;
      }
      const node = { uid, value };
      const done: S = { nodes: first ? [node, ...s.nodes] : [...s.nodes, node], nextUid: uid + 1 };
      yield {
        state: done,
        marks: [mark(self, 'active'), mark(`n${uid}`, 'done')],
        say: neighbour
          ? `${self} = node. ${v} is now the ${first ? 'first' : 'last'} item.`
          : `${self} = node. With one node, head and tail point at the same node, ${v}.`,
        lines: [`${op}.${self}`],
        vars: vars(done, { x: value }),
        level: 1,
      } satisfies ListStep;
      return done;
    },
  };
}

function* emptyCheck(
  s: S,
  op: string,
  end: End,
  removing: boolean,
): Generator<ListStep, boolean, void> {
  const ref = end === 'first' ? 'head' : 'tail';
  const node = end === 'first' ? s.nodes[0] : s.nodes[s.nodes.length - 1];
  yield {
    state: s,
    marks: [mark(ref, 'active')],
    say: node
      ? `${op}(): is ${ref} null? No, it points at ${fmt(node.value)}.`
      : `${op}(): is ${ref} null? Yes.`,
    lines: [`${op}.check`],
    vars: vars(s),
    level: 2,
  };
  if (node) return false;
  yield {
    state: s,
    marks: [mark(ref, 'error')],
    say: removing
      ? 'The deque is empty. Deque underflow: there is nothing to remove.'
      : 'The deque is empty, so there is nothing to peek at.',
    lines: [removing ? `${op}.underflow` : `${op}.empty`],
    vars: vars(s),
    level: 1,
  };
  return true;
}

function remove(end: End): Op {
  const first = end === 'first';
  const op = first ? 'removeFirst' : 'removeLast';
  const self = first ? 'head' : 'tail';
  const other = first ? 'tail' : 'head';
  const step = first ? 'next' : 'prev';
  const back = first ? 'prev' : 'next';
  return {
    label: first ? 'Remove first' : 'Remove last',
    arity: 0,
    *run(s) {
      if (yield* emptyCheck(s, op, end, true)) return s;
      const n = s.nodes.length;
      const node = first ? s.nodes[0]! : s.nodes[n - 1]!;
      const rest = first ? s.nodes.slice(1) : s.nodes.slice(0, -1);
      const v = fmt(node.value);
      const out = { value: node.value, label: 'x', end };
      yield {
        state: s,
        marks: [mark(`n${node.uid}`, 'active'), mark('out', 'active')],
        say: `x = ${self}.value = ${v}.`,
        lines: [`${op}.read`],
        vars: vars(s, { x: node.value }),
        level: 2,
        extra: { out },
      } satisfies ListStep;

      const done: S = { ...s, nodes: rest };
      const only = rest.length === 0;
      const after = first ? rest[0] : rest[rest.length - 1];
      yield {
        state: done,
        marks: [mark(self, 'active'), mark(`n${node.uid}`, 'active')],
        say: only
          ? `${self} = ${self}.${step}, which is null. But ${other} still points at the old node, ${v}.`
          : `${self} = ${self}.${step}: ${self} moves to ${fmt(after!.value)}. That node still points ${first ? 'back' : 'forward'} at the old one.`,
        lines: [`${op}.${step}`],
        vars: vars(done, { x: node.value }),
        level: 2,
        extra: {
          out,
          old: { node, end, back: !only, garbage: false },
          ...(only ? { ptr: onlyNode(end) } : {}),
        },
      } satisfies ListStep;

      yield {
        state: done,
        marks: [
          mark(only ? other : `n${after!.uid}-${back}-null`, 'active'),
          mark(`n${node.uid}`, 'remove'),
        ],
        say: only
          ? `${self} is null, so the deque is empty: set ${other} = null too.`
          : `${self}.${back} = null: ${fmt(after!.value)} is the ${first ? 'first' : 'last'} node now, so nothing comes ${first ? 'before' : 'after'} it. Nothing points at the old node any more.`,
        lines: only
          ? [`${op}.empty`, `${op}.${other}`]
          : [`${op}.empty`, `${op}.else`, `${op}.${back}`],
        vars: vars(done, { x: node.value }),
        level: 2,
        extra: { out, old: { node, end, back: false, garbage: true } },
      } satisfies ListStep;

      yield {
        state: done,
        marks: [mark('out', 'found')],
        say: `Return x = ${v}. The old node is garbage: Java and Python reclaim it, and C++ deletes it.`,
        lines: [`${op}.return`],
        vars: vars(done, { x: node.value, returned: node.value }),
        level: 1,
        extra: { out: { ...out, label: 'returned' } },
      } satisfies ListStep;
      return done;
    },
  };
}

function peek(end: End): Op {
  const first = end === 'first';
  const op = first ? 'peekFirst' : 'peekLast';
  const self = first ? 'head' : 'tail';
  return {
    label: first ? 'Peek first' : 'Peek last',
    arity: 0,
    *run(s) {
      if (yield* emptyCheck(s, op, end, false)) return s;
      const node = first ? s.nodes[0]! : s.nodes[s.nodes.length - 1]!;
      yield {
        state: s,
        marks: [mark(`n${node.uid}`, 'found'), mark('out', 'found')],
        say: `Return ${self}.value = ${fmt(node.value)}. Nothing moves.`,
        lines: [`${op}.return`],
        vars: vars(s, { returned: node.value }),
        level: 1,
        extra: { out: { value: node.value, label: 'returned', end } },
      } satisfies ListStep;
      return s;
    },
  };
}

export const ops = {
  addFirst: add('first'),
  addLast: add('last'),
  removeFirst: remove('first'),
  removeLast: remove('last'),
  peekFirst: peek('first'),
  peekLast: peek('last'),
};

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function addLines(end: End) {
  const first = end === 'first';
  const op = first ? 'addFirst' : 'addLast';
  const [self, other, toward, back] = first
    ? ['head', 'tail', 'next', 'prev']
    : ['tail', 'head', 'prev', 'next'];
  return [
    L(`${op}.sig`, 0, `${op}(x)`, `To add x at the ${first ? 'front' : 'back'}:`),
    L(`${op}.new`, 1, 'node = new Node(x)', 'Make a node holding x.'),
    L(
      `${op}.${toward}`,
      1,
      `node.${toward} = ${self}`,
      `Point it at the current ${first ? 'first' : 'last'} node.`,
    ),
    L(`${op}.check`, 1, `if ${self} == null`, 'If the deque is empty,'),
    L(
      `${op}.${other}`,
      2,
      `${other} = node`,
      `the node is also the ${first ? 'last' : 'first'} one.`,
    ),
    L(`${op}.else`, 1, 'else', 'Otherwise'),
    L(
      `${op}.${back}`,
      2,
      `${self}.${back} = node`,
      `make the old ${first ? 'first' : 'last'} node point at it too.`,
    ),
    L(`${op}.${self}`, 1, `${self} = node`, `It is the new ${first ? 'first' : 'last'} node.`),
  ];
}

function removeLines(end: End) {
  const first = end === 'first';
  const op = first ? 'removeFirst' : 'removeLast';
  const [self, other, step, back] = first
    ? ['head', 'tail', 'next', 'prev']
    : ['tail', 'head', 'prev', 'next'];
  return [
    L(`${op}.sig`, 0, `${op}()`, `To remove the ${first ? 'first' : 'last'} item:`),
    L(`${op}.check`, 1, `if ${self} == null`, 'If the deque is empty,'),
    L(`${op}.underflow`, 2, 'error "deque underflow"', 'stop: the deque underflows.'),
    L(`${op}.read`, 1, `x = ${self}.value`, 'Copy its value.'),
    L(
      `${op}.${step}`,
      1,
      `${self} = ${self}.${step}`,
      `Move ${self} to the ${first ? 'next' : 'previous'} node.`,
    ),
    L(`${op}.empty`, 1, `if ${self} == null`, 'If that was the only node,'),
    L(`${op}.${other}`, 2, `${other} = null`, `the deque is empty: clear ${other} too.`),
    L(`${op}.else`, 1, 'else', 'Otherwise'),
    L(`${op}.${back}`, 2, `${self}.${back} = null`, 'cut its link to the removed node.'),
    L(`${op}.return`, 1, 'return x', 'Hand back the copy.'),
  ];
}

function peekLines(end: End) {
  const first = end === 'first';
  const op = first ? 'peekFirst' : 'peekLast';
  const self = first ? 'head' : 'tail';
  return [
    L(`${op}.sig`, 0, `${op}()`, `To look at the ${first ? 'first' : 'last'} item:`),
    L(`${op}.check`, 1, `if ${self} == null`, 'If the deque is empty,'),
    L(`${op}.empty`, 2, 'error "deque is empty"', 'stop: there is nothing to look at.'),
    L(`${op}.return`, 1, `return ${self}.value`, 'Hand back its value and leave it there.'),
  ];
}

export function pseudocode(): PseudoBlock[] {
  return [
    { op: 'addFirst', lines: addLines('first') },
    { op: 'addLast', lines: addLines('last') },
    { op: 'removeFirst', lines: removeLines('first') },
    { op: 'removeLast', lines: removeLines('last') },
    { op: 'peekFirst', lines: peekLines('first') },
    { op: 'peekLast', lines: peekLines('last') },
  ];
}

export function initialSay(): string {
  return 'An empty deque: head and tail are both null. Every node will link forward with next and back with prev, so both ends can grow and shrink.';
}

export function initialVars(state: S) {
  return vars(state);
}

/** The values from head to tail. */
export function items(state: S): Value[] {
  return state.nodes.map((n) => n.value);
}

/** Screen-reader summary. */
export function describe(state: S): string {
  if (state.nodes.length === 0) return 'Empty deque: head and tail are null.';
  return `Deque of ${state.nodes.length} doubly linked nodes. From head to tail: ${items(state).join(', ')}.`;
}
