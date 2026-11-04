import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export interface ListNode {
  uid: number;
  value: Value;
}

export interface StackListState {
  /** nodes[0] is the top; each node's next is the one after it, and the last one's is null. */
  nodes: ListNode[];
  nextUid: number;
}

export interface StackListSettings {
  [key: string]: Scalar;
}

export interface StackListExtra {
  /** A node made by push, drawn in front of the top until top points at it. */
  fresh?: { uid: number; value: Value; linked: boolean };
  /** The node pop just unlinked, drawn in front of the new top. */
  garbage?: ListNode;
  /** A value on its way out. */
  out?: { value: Value; label: string };
}

type S = StackListState;
type X = StackListExtra;
type Op = OpSpec<S, StackListSettings, X>;
type ListStep = Step<S, X>;

export const defaults: StackListSettings = {};

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

const push: Op = {
  label: 'Push',
  arity: 1,
  *run(s, [x]) {
    const value = x as Value;
    const v = fmt(value);
    const uid = s.nextUid;
    const top = s.nodes[0];
    yield {
      state: s,
      marks: [mark(`n${uid}`, 'new')],
      say: `push(${v}): make a new node holding ${v}. Its next field is not set yet.`,
      lines: ['push.new'],
      vars: vars(s, { x: value }),
      level: 2,
      extra: { fresh: { uid, value, linked: false } },
    } satisfies ListStep;
    yield {
      state: s,
      marks: [mark(top ? `n${uid}-next` : `n${uid}-next-null`, 'active')],
      say: top
        ? `node.next = top: the new node points at ${fmt(top.value)}, the current top.`
        : 'node.next = top, and top is null: the stack is empty, so the new node is also the last one.',
      lines: ['push.link'],
      vars: vars(s, { x: value }),
      level: 2,
      extra: { fresh: { uid, value, linked: true } },
    } satisfies ListStep;
    const done: S = { nodes: [{ uid, value }, ...s.nodes], nextUid: uid + 1 };
    yield {
      state: done,
      marks: [mark('top', 'active'), mark(`n${uid}`, 'done')],
      say: `top = node. ${v} is on top, and no other node moved.`,
      lines: ['push.top'],
      vars: vars(done, { x: value }),
      level: 1,
    } satisfies ListStep;
    return done;
  },
};

function* emptyCheck(s: S, op: 'pop' | 'peek'): Generator<ListStep, boolean, void> {
  const top = s.nodes[0];
  yield {
    state: s,
    marks: [mark('top', 'active')],
    say: top
      ? `${op}(): is top null? No, it points at ${fmt(top.value)}.`
      : `${op}(): is top null? Yes.`,
    lines: [`${op}.check`],
    vars: vars(s),
    level: 2,
  };
  if (top) return false;
  yield {
    state: s,
    marks: [mark('top', 'error')],
    say:
      op === 'pop'
        ? 'The stack is empty. Stack underflow: there is nothing to pop.'
        : 'The stack is empty, so there is nothing to peek at.',
    lines: [op === 'pop' ? 'pop.underflow' : 'peek.empty'],
    vars: vars(s),
    level: 1,
  };
  return true;
}

const pop: Op = {
  label: 'Pop',
  arity: 0,
  *run(s) {
    if (yield* emptyCheck(s, 'pop')) return s;
    const [top, ...rest] = s.nodes as [ListNode, ...ListNode[]];
    const v = fmt(top.value);
    yield {
      state: s,
      marks: [mark(`n${top.uid}`, 'active'), mark('out', 'active')],
      say: `x = top.value = ${v}.`,
      lines: ['pop.read'],
      vars: vars(s, { x: top.value }),
      level: 2,
      extra: { out: { value: top.value, label: 'x' } },
    } satisfies ListStep;
    const done: S = { ...s, nodes: rest };
    yield {
      state: done,
      marks: [mark('top', 'active'), mark(`n${top.uid}`, 'remove')],
      say: rest[0]
        ? `top = top.next: top moves to ${fmt(rest[0].value)}. Nothing points at the old node now.`
        : 'top = top.next, which is null: the stack is empty again. Nothing points at the old node now.',
      lines: ['pop.next'],
      vars: vars(done, { x: top.value }),
      level: 2,
      extra: { garbage: top, out: { value: top.value, label: 'x' } },
    } satisfies ListStep;
    yield {
      state: done,
      marks: [mark('out', 'found')],
      say: `Return x = ${v}. The old node is garbage: Java and Python reclaim it, and C++ deletes it.`,
      lines: ['pop.return'],
      vars: vars(done, { x: top.value, returned: top.value }),
      level: 1,
      extra: { out: { value: top.value, label: 'returned' } },
    } satisfies ListStep;
    return done;
  },
};

const peek: Op = {
  label: 'Peek',
  arity: 0,
  *run(s) {
    if (yield* emptyCheck(s, 'peek')) return s;
    const top = s.nodes[0]!;
    yield {
      state: s,
      marks: [mark(`n${top.uid}`, 'found'), mark('out', 'found')],
      say: `Return top.value = ${fmt(top.value)}. top does not move.`,
      lines: ['peek.return'],
      vars: vars(s, { returned: top.value }),
      level: 1,
      extra: { out: { value: top.value, label: 'returned' } },
    } satisfies ListStep;
    return s;
  },
};

export const ops = { push, pop, peek };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'push',
      lines: [
        L('push.sig', 0, 'push(x)', 'To push x:'),
        L('push.new', 1, 'node = new Node(x)', 'Make a node holding x.'),
        L('push.link', 1, 'node.next = top', 'Point it at the current top.'),
        L('push.top', 1, 'top = node', 'Make it the new top.'),
      ],
    },
    {
      op: 'pop',
      lines: [
        L('pop.sig', 0, 'pop()', 'To pop:'),
        L('pop.check', 1, 'if top == null', 'If the stack is empty,'),
        L('pop.underflow', 2, 'error "stack underflow"', 'stop: the stack underflows.'),
        L('pop.read', 1, 'x = top.value', 'Copy the top value.'),
        L('pop.next', 1, 'top = top.next', 'Move top to the next node.'),
        L('pop.return', 1, 'return x', 'Hand back the copy.'),
      ],
    },
    {
      op: 'peek',
      lines: [
        L('peek.sig', 0, 'peek()', 'To peek:'),
        L('peek.check', 1, 'if top == null', 'If the stack is empty,'),
        L('peek.empty', 2, 'error "stack is empty"', 'stop: there is nothing to look at.'),
        L('peek.return', 1, 'return top.value', 'Hand back the top value and leave it there.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty stack: top is null. Each push adds a node in front of the top, so the stack never runs out of room.';
}

export function initialVars(state: S) {
  return vars(state);
}

/** The values from the top down. */
export function items(state: S): Value[] {
  return state.nodes.map((n) => n.value);
}

/** Screen-reader summary. */
export function describe(state: S): string {
  if (state.nodes.length === 0) return 'Empty stack: top is null.';
  return `Stack of ${state.nodes.length} linked nodes. From the top: ${items(state).join(', ')}, then null.`;
}
