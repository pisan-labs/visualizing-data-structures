import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export interface ListNode {
  uid: number;
  value: Value;
}

export interface QueueListState {
  /** nodes[0] is the front (head) and the last node is the rear (tail). */
  nodes: ListNode[];
  nextUid: number;
}

export interface QueueListSettings {
  [key: string]: Scalar;
}

export interface QueueListExtra {
  /** A node made by enqueue, drawn after the rear. `linked`: the old rear points at it. */
  fresh?: { uid: number; value: Value; linked: boolean };
  /** The node dequeue just took off the front, drawn before the new front. */
  old?: { node: ListNode; garbage: boolean };
  /** head and tail as slots in the drawing, when they differ from what the state implies. */
  ptr?: { head?: number | null; tail?: number | null };
  out?: { value: Value; label: string };
}

type S = QueueListState;
type X = QueueListExtra;
type Op = OpSpec<S, QueueListSettings, X>;
type ListStep = Step<S, X>;

export const defaults: QueueListSettings = {};

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

const enqueue: Op = {
  label: 'Enqueue',
  arity: 1,
  *run(s, [x]) {
    const value = x as Value;
    const v = fmt(value);
    const uid = s.nextUid;
    const n = s.nodes.length;
    const rear = s.nodes[n - 1];
    const fresh = { uid, value, linked: false };
    yield {
      state: s,
      marks: [mark(`n${uid}`, 'new')],
      say: `enqueue(${v}): make a new node holding ${v}. It will be the last node, so its next is null.`,
      lines: ['enqueue.new'],
      vars: vars(s, { x: value }),
      level: 2,
      extra: { fresh },
    } satisfies ListStep;
    yield {
      state: s,
      marks: [mark('tail', 'active')],
      say: rear
        ? `Is the queue empty, with tail null? No, tail points at ${fmt(rear.value)}.`
        : 'Is the queue empty, with tail null? Yes.',
      lines: ['enqueue.check'],
      vars: vars(s, { x: value }),
      level: 2,
      extra: { fresh },
    } satisfies ListStep;
    if (rear) {
      yield {
        state: s,
        marks: [mark(`n${rear.uid}-next`, 'active')],
        say: `tail.next = node: the old last node, ${fmt(rear.value)}, now points at the new one.`,
        lines: ['enqueue.else', 'enqueue.link'],
        vars: vars(s, { x: value }),
        level: 2,
        extra: { fresh: { ...fresh, linked: true } },
      } satisfies ListStep;
    } else {
      yield {
        state: s,
        marks: [mark('head', 'active')],
        say: 'The queue is empty, so the new node is also the front: head = node.',
        lines: ['enqueue.head'],
        vars: vars(s, { x: value }),
        level: 2,
        extra: { fresh: { ...fresh, linked: true }, ptr: { head: 0, tail: null } },
      } satisfies ListStep;
    }
    const done: S = { nodes: [...s.nodes, { uid, value }], nextUid: uid + 1 };
    yield {
      state: done,
      marks: [mark('tail', 'active'), mark(`n${uid}`, 'done')],
      say: rear
        ? `tail = node. ${v} is at the back of the queue.`
        : `tail = node. With one node, head and tail point at the same node, ${v}.`,
      lines: ['enqueue.tail'],
      vars: vars(done, { x: value }),
      level: 1,
    } satisfies ListStep;
    return done;
  },
};

function* emptyCheck(s: S, op: 'dequeue' | 'peek'): Generator<ListStep, boolean, void> {
  const head = s.nodes[0];
  yield {
    state: s,
    marks: [mark('head', 'active')],
    say: head
      ? `${op}(): is head null? No, it points at ${fmt(head.value)}.`
      : `${op}(): is head null? Yes.`,
    lines: [`${op}.check`],
    vars: vars(s),
    level: 2,
  };
  if (head) return false;
  yield {
    state: s,
    marks: [mark('head', 'error')],
    say:
      op === 'dequeue'
        ? 'The queue is empty. Queue underflow: there is nothing to dequeue.'
        : 'The queue is empty, so there is nothing to peek at.',
    lines: [op === 'dequeue' ? 'dequeue.underflow' : 'peek.empty'],
    vars: vars(s),
    level: 1,
  };
  return true;
}

const dequeue: Op = {
  label: 'Dequeue',
  arity: 0,
  *run(s) {
    if (yield* emptyCheck(s, 'dequeue')) return s;
    const [head, ...rest] = s.nodes as [ListNode, ...ListNode[]];
    const v = fmt(head.value);
    const out = { value: head.value, label: 'x' };
    yield {
      state: s,
      marks: [mark(`n${head.uid}`, 'active'), mark('out', 'active')],
      say: `x = head.value = ${v}.`,
      lines: ['dequeue.read'],
      vars: vars(s, { x: head.value }),
      level: 2,
      extra: { out },
    } satisfies ListStep;

    const done: S = { ...s, nodes: rest };
    const last = rest.length === 0;
    yield {
      state: done,
      marks: [mark('head', 'active'), mark(`n${head.uid}`, last ? 'active' : 'remove')],
      say: last
        ? `head = head.next, which is null. But tail still points at the old node, ${v}.`
        : `head = head.next: head moves to ${fmt(rest[0]!.value)}. Nothing points at the old node now.`,
      lines: ['dequeue.next'],
      vars: vars(done, { x: head.value }),
      level: 2,
      // With one node left, tail still holds on to it; otherwise it is garbage already.
      extra: { out, old: { node: head, garbage: !last }, ...(last ? { ptr: { tail: 0 } } : {}) },
    } satisfies ListStep;

    yield {
      state: done,
      marks: last
        ? [mark('tail', 'active'), mark(`n${head.uid}`, 'remove')]
        : [mark('head', 'compare')],
      say: last
        ? 'head is null, so the queue is empty: set tail = null as well. Skip this and tail keeps pointing at a node that has left the queue.'
        : `Is head null now? No, so tail stays where it is.`,
      lines: last ? ['dequeue.empty', 'dequeue.tail'] : ['dequeue.empty'],
      vars: vars(done, { x: head.value }),
      level: last ? 2 : 3,
      extra: { out, old: { node: head, garbage: true } },
    } satisfies ListStep;

    yield {
      state: done,
      marks: [mark('out', 'found')],
      say: `Return x = ${v}. The old node is garbage: Java and Python reclaim it, and C++ deletes it.`,
      lines: ['dequeue.return'],
      vars: vars(done, { x: head.value, returned: head.value }),
      level: 1,
      extra: { out: { ...out, label: 'returned' } },
    } satisfies ListStep;
    return done;
  },
};

const peek: Op = {
  label: 'Peek',
  arity: 0,
  *run(s) {
    if (yield* emptyCheck(s, 'peek')) return s;
    const head = s.nodes[0]!;
    yield {
      state: s,
      marks: [mark(`n${head.uid}`, 'found'), mark('out', 'found')],
      say: `Return head.value = ${fmt(head.value)}. Nothing moves.`,
      lines: ['peek.return'],
      vars: vars(s, { returned: head.value }),
      level: 1,
      extra: { out: { value: head.value, label: 'returned' } },
    } satisfies ListStep;
    return s;
  },
};

export const ops = { enqueue, dequeue, peek };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'enqueue',
      lines: [
        L('enqueue.sig', 0, 'enqueue(x)', 'To enqueue x:'),
        L('enqueue.new', 1, 'node = new Node(x)', 'Make a node holding x, with next null.'),
        L('enqueue.check', 1, 'if tail == null', 'If the queue is empty,'),
        L('enqueue.head', 2, 'head = node', 'the new node is also the front.'),
        L('enqueue.else', 1, 'else', 'Otherwise'),
        L('enqueue.link', 2, 'tail.next = node', 'hang it after the last node.'),
        L('enqueue.tail', 1, 'tail = node', 'Either way, it is the new last node.'),
      ],
    },
    {
      op: 'dequeue',
      lines: [
        L('dequeue.sig', 0, 'dequeue()', 'To dequeue:'),
        L('dequeue.check', 1, 'if head == null', 'If the queue is empty,'),
        L('dequeue.underflow', 2, 'error "queue underflow"', 'stop: the queue underflows.'),
        L('dequeue.read', 1, 'x = head.value', 'Copy the front value.'),
        L('dequeue.next', 1, 'head = head.next', 'Move head to the next node.'),
        L('dequeue.empty', 1, 'if head == null', 'If that was the last node,'),
        L('dequeue.tail', 2, 'tail = null', 'the queue is empty: clear tail too.'),
        L('dequeue.return', 1, 'return x', 'Hand back the copy.'),
      ],
    },
    {
      op: 'peek',
      lines: [
        L('peek.sig', 0, 'peek()', 'To peek:'),
        L('peek.check', 1, 'if head == null', 'If the queue is empty,'),
        L('peek.empty', 2, 'error "queue is empty"', 'stop: there is nothing to look at.'),
        L('peek.return', 1, 'return head.value', 'Hand back the front value and leave it there.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty queue: head and tail are both null. Enqueue adds nodes after tail; dequeue takes them from head.';
}

export function initialVars(state: S) {
  return vars(state);
}

/** The values from front to rear. */
export function items(state: S): Value[] {
  return state.nodes.map((n) => n.value);
}

/** Screen-reader summary. */
export function describe(state: S): string {
  if (state.nodes.length === 0) return 'Empty queue: head and tail are null.';
  return `Queue of ${state.nodes.length} linked nodes. From head to tail: ${items(state).join(', ')}, then null.`;
}
