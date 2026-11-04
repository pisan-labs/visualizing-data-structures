import type {
  Mark,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { fmt } from '../linked-list/model';

export interface CNode {
  uid: number;
  value: Value;
  next: number | null;
}

export interface CState {
  /**
   * Every node in memory, in drawing order. Between operations: from tail.next (the front)
   * around to tail. During one it may also hold a node not linked in yet, or one just removed.
   */
  nodes: CNode[];
  /** The only pointer into the list. tail.next is the front. */
  tail: number | null;
  size: number;
  nextUid: number;
}

/** No textbook variants here: one tail pointer is how Java-based courses teach it. */
export type CSettings = Record<string, Scalar>;

export interface CExtra {
  /** Local pointer variables (new, first, cur), by name. */
  ptrs?: Record<string, number | null>;
  /** A node made but not linked in yet. */
  pending?: number;
}

type S = CState;
type X = CExtra;
type Op = OpSpec<S, CSettings, X>;
type CStep = Step<S, X>;

export const defaults: CSettings = {};

export function init(): S {
  return { nodes: [], tail: null, size: 0, nextUid: 1 };
}

export const nid = (uid: number) => `n${uid}`;
const nextId = (uid: number) => `n${uid}.next`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export function node(s: S, uid: number): CNode {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
}

const name = (s: S, uid: number | null) => (uid === null ? 'null' : fmt(node(s, uid).value));
const front = (s: S) => (s.tail === null ? null : node(s, s.tail).next);

function setNext(s: S, uid: number, next: number | null): S {
  return { ...s, nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, next } : x)) };
}

/** The uids from the front around to tail, once. */
export function order(s: S): number[] {
  const f = front(s);
  if (f === null) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (let u: number | null = f; u !== null && !seen.has(u); u = node(s, u).next) {
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function values(s: S): Value[] {
  return order(s).map((u) => node(s, u).value);
}

/** "10 → 20 → 30 → back to 10". */
export function ring(s: S): string {
  const vs = values(s).map(fmt);
  if (!vs.length) return 'empty';
  const shown = vs.length > 8 ? [...vs.slice(0, 3), '…', ...vs.slice(-2)] : vs;
  return `${shown.join(' → ')} → back to ${vs[0]}`;
}

/** Memory once the garbage is collected, drawn from the front around to tail. */
function tidy(s: S): S {
  return { ...s, nodes: order(s).map((u) => node(s, u)) };
}

const pv = (s: S, uid: number | null): Scalar => (uid === null ? null : node(s, uid).value);

interface StepOpts {
  marks?: Mark[];
  level?: 1 | 2 | 3;
  vars?: Record<string, Scalar>;
  ptrs?: Record<string, number | null>;
  pending?: number;
}

function st(state: S, say: string, lines: string[], o: StepOpts = {}): CStep {
  const extra: X = {};
  if (o.ptrs) extra.ptrs = o.ptrs;
  if (o.pending !== undefined) extra.pending = o.pending;
  return {
    state,
    marks: o.marks ?? [],
    say,
    lines,
    vars: { ...o.vars, n: state.size },
    level: o.level ?? 2,
    extra,
  };
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

/** insertFront and insertBack share everything but the last move of tail. */
function insert(op: 'insertFront' | 'insertBack'): Op {
  const back = op === 'insertBack';
  return {
    label: back ? 'Insert at back' : 'Insert at front',
    arity: 1,
    *run(s0, [x]) {
      const value = x as Value;
      const v = fmt(value);
      const uid = s0.nextUid;
      const vars = { x: value };
      const ptrs = { new: uid };
      // The new node goes between tail and the front, drawn in front.
      let s: S = { ...s0, nodes: [{ uid, value, next: null }, ...s0.nodes], nextUid: uid + 1 };
      yield st(s, `${op}(${v}): make a new node holding ${v}.`, [`${op}.new`], {
        marks: [mark(nid(uid), 'new')],
        ptrs,
        pending: uid,
        vars,
      });
      const empty = s.tail === null;
      yield st(
        s,
        empty
          ? 'Is tail null? Yes: the list is empty.'
          : `Is tail null? No. The new node goes between tail (${name(s, s.tail)}) and the front (${name(s, front(s))}).`,
        [`${op}.check`],
        { marks: [mark('p:tail', 'active')], ptrs, pending: uid, level: 3, vars },
      );
      if (empty) {
        s = setNext(s, uid, uid);
        yield st(
          s,
          'new.next = new: with one node, the node after the last one is itself. The circle is one node long.',
          [`${op}.self`],
          { marks: [mark(nextId(uid), 'active')], ptrs, pending: uid, vars },
        );
        if (!back) {
          s = { ...s, tail: uid };
          yield st(
            s,
            `tail = new: ${v} is the only node, so it is the front and the back.`,
            [`${op}.tail1`],
            { marks: [mark('p:tail', 'active')], ptrs, vars },
          );
        }
      } else {
        const t = s.tail!;
        const f = front(s)!;
        s = setNext(s, uid, f);
        yield st(
          s,
          `First new.next = tail.next: the new node points at ${name(s, f)}, the front. tail.next still points there too, so nothing is lost.`,
          [`${op}.link`],
          { marks: [mark(nextId(uid), 'active')], ptrs, pending: uid, vars },
        );
        s = setNext(s, t, uid);
        yield st(
          s,
          `Then tail.next = new: ${name(s, t)} points at ${v}, and the circle runs through the new node. The other order would lose ${name(s, f)}.`,
          [`${op}.close`],
          { marks: [mark(nextId(t), 'active')], ptrs, vars },
        );
      }
      if (back) {
        s = { ...s, tail: uid };
        yield st(
          s,
          empty
            ? `tail = new: ${v} is the only node, so it is the front and the back.`
            : `tail = new: tail moves one step, to ${v}. ${v} was just after the old tail, so moving tail makes it the last node instead of the first. That is the whole trick.`,
          [`${op}.tail`],
          { marks: [mark('p:tail', 'active')], ptrs, vars },
        );
      }
      s = { ...s, size: s.size + 1 };
      const done = tidy(s);
      yield st(
        done,
        back && !empty
          ? `n = ${done.size}. Redrawn from tail.next: ${ring(done)}. ${v} is at the back.`
          : `n = ${done.size}. ${ring(done)}. ${v} is at the front.`,
        [`${op}.size`],
        { marks: [mark(nid(uid), 'done')], level: 1, vars },
      );
      return done;
    },
  };
}

const removeFront: Op = {
  label: 'Remove front',
  arity: 0,
  *run(s0) {
    let s = s0;
    if (s.tail === null) {
      yield st(
        s,
        'removeFront(): tail is null, so the list is empty. There is nothing to remove.',
        ['removeFront.check', 'removeFront.error'],
        { marks: [mark('p:tail', 'error')], level: 1 },
      );
      return s;
    }
    yield st(
      s,
      'removeFront(): is tail null? No, so there is a node to remove.',
      ['removeFront.check'],
      {
        marks: [mark('p:tail', 'active')],
        level: 3,
      },
    );
    const f = front(s)!;
    const value = node(s, f).value;
    const v = fmt(value);
    const ptrs = { first: f };
    yield st(s, `first = tail.next: the front node is ${v}.`, ['removeFront.first'], {
      marks: [mark('p:first', 'active'), mark(nid(f), 'remove')],
      ptrs,
      vars: { first: value },
    });
    if (f === s.tail) {
      yield st(
        s,
        `Is first == tail? Yes: ${v} points at itself, so it is the only node.`,
        ['removeFront.one'],
        { marks: [mark(nid(f), 'remove')], ptrs, vars: { first: value } },
      );
      s = { ...s, tail: null };
      yield st(
        s,
        'tail = null: the list is empty now. Only first still points at the node.',
        ['removeFront.empty'],
        { marks: [mark('p:tail', 'active')], ptrs, vars: { first: value } },
      );
    } else {
      yield st(s, 'Is first == tail? No, there are other nodes.', ['removeFront.one'], {
        ptrs,
        level: 3,
        vars: { first: value },
      });
      const second = node(s, f).next!;
      s = setNext(s, s.tail, second);
      yield st(
        s,
        `tail.next = first.next: ${name(s, s.tail)} now points past ${v}, at ${name(s, second)}. ${name(s, second)} is the front now.`,
        ['removeFront.skip'],
        {
          marks: [mark(nextId(s.tail!), 'active'), mark(nid(f), 'remove')],
          ptrs,
          vars: { first: value },
        },
      );
    }
    s = { ...s, size: s.size - 1 };
    yield st(
      s,
      `n = ${s.size}. Return ${v}. first goes away with the call, so nothing points at ${v}'s node: it is garbage.`,
      ['removeFront.size', 'removeFront.return'],
      { marks: [mark(nid(f), 'remove')], vars: { returned: value } },
    );
    const done = tidy(s);
    yield st(
      done,
      `The garbage node is collected. The list: ${ring(done)}.`,
      ['removeFront.return'],
      {
        level: 1,
        vars: { returned: value },
      },
    );
    return done;
  },
};

const rotate: Op = {
  label: 'Rotate',
  arity: 0,
  *run(s0) {
    let s = s0;
    if (s.tail === null) {
      yield st(s, 'rotate(): tail is null, so there is nothing to rotate.', ['rotate.check'], {
        marks: [mark('p:tail', 'active')],
        level: 1,
      });
      return s;
    }
    const f = front(s)!;
    const one = f === s.tail;
    s = { ...s, tail: f };
    yield st(
      s,
      one
        ? `rotate(): tail = tail.next, which is ${name(s, f)} itself. With one node, rotating changes nothing.`
        : `rotate(): tail = tail.next: tail moves to ${name(s, f)}. The old front is now the back, and ${name(s, node(s, f).next)} is the front. One assignment, nothing else moves.`,
      ['rotate.check', 'rotate.move'],
      { marks: [mark('p:tail', 'active')] },
    );
    const done = tidy(s);
    yield st(done, `Redrawn from tail.next: ${ring(done)}.`, ['rotate.move'], { level: 1 });
    return done;
  },
};

const traverse: Op = {
  label: 'Traverse',
  arity: 0,
  *run(s) {
    if (s.tail === null) {
      yield st(
        s,
        'traverse(): tail is null, so there is nothing to visit.',
        ['traverse.check', 'traverse.empty'],
        {
          marks: [mark('p:tail', 'active')],
          level: 1,
          vars: { visited: '' },
        },
      );
      return s;
    }
    const start = front(s)!;
    let cur = start;
    const seen: Value[] = [];
    // Visited nodes stay marked, so the trip around the circle shows.
    const done: number[] = [];
    const marks = (...m: Mark[]) => [...done.map((u) => mark(nid(u), 'done')), ...m];
    const visited = () => seen.map(String).join(' ');
    yield st(
      s,
      `traverse(): start cur at tail.next, ${name(s, cur)}. There is no null at the end of a circle, so we will stop when cur gets back here.`,
      ['traverse.check', 'traverse.start'],
      {
        marks: [mark('p:cur', 'active')],
        ptrs: { cur },
        vars: { cur: pv(s, cur), visited: visited() },
      },
    );
    for (;;) {
      seen.push(node(s, cur).value);
      yield st(s, `Visit ${name(s, cur)}. Visited so far: ${visited()}.`, ['traverse.visit'], {
        marks: marks(mark(nid(cur), 'visit')),
        ptrs: { cur },
        vars: { cur: pv(s, cur), visited: visited() },
      });
      done.push(cur);
      cur = node(s, cur).next!;
      const back = cur === start;
      yield st(
        s,
        back
          ? `cur = cur.next: cur is back at tail.next (${name(s, cur)}). We have been all the way around, so stop. Testing for null here would loop forever.`
          : `cur = cur.next: cur moves to ${name(s, cur)}, which is not tail.next yet, so keep going.`,
        ['traverse.move', 'traverse.loop'],
        {
          marks: [
            ...marks(mark('p:cur', 'active')).filter((m) => !back || m.id !== nid(cur)),
            ...(back ? [mark(nid(cur), 'found')] : []),
          ],
          ptrs: { cur },
          level: back ? 2 : 3,
          vars: { cur: pv(s, cur), visited: visited() },
        },
      );
      if (back) break;
    }
    yield st(
      s,
      `Visited ${plural(seen.length, 'node')}, each once: ${visited()}.`,
      ['traverse.loop'],
      { marks: marks(), level: 1, vars: { visited: visited() } },
    );
    return s;
  },
};

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [x]) {
    const value = x as Value;
    const v = fmt(value);
    if (s.tail === null) {
      yield st(
        s,
        `search(${v}): tail is null, so the list is empty. Return -1.`,
        ['search.check', 'search.empty'],
        {
          marks: [mark('p:tail', 'active')],
          level: 1,
          vars: { x: value, returned: -1 },
        },
      );
      return s;
    }
    const start = front(s)!;
    let cur = start;
    let i = 0;
    let comparisons = 0;
    const more = () => ({ x: value, cur: pv(s, cur), i, comparisons });
    yield st(
      s,
      `search(${v}): start cur at tail.next, ${name(s, cur)}, with i = 0.`,
      ['search.check', 'search.start'],
      {
        marks: [mark('p:cur', 'active')],
        ptrs: { cur },
        vars: more(),
      },
    );
    for (;;) {
      comparisons++;
      const hit = node(s, cur).value === value;
      yield st(
        s,
        hit
          ? `Is cur.value equal to ${v}? Yes!`
          : `Is cur.value (${name(s, cur)}) equal to ${v}? No.`,
        ['search.cmp'],
        { marks: [mark(nid(cur), hit ? 'found' : 'compare')], ptrs: { cur }, vars: more() },
      );
      if (hit) {
        yield st(
          s,
          `Found ${v} at index ${i}, counting from the front. Return ${i}.`,
          ['search.found'],
          {
            marks: [mark(nid(cur), 'found')],
            ptrs: { cur },
            level: 1,
            vars: { ...more(), returned: i },
          },
        );
        return s;
      }
      cur = node(s, cur).next!;
      i++;
      const back = cur === start;
      yield st(
        s,
        back
          ? `cur = cur.next: back at tail.next. We went all the way around without finding ${v}.`
          : `cur = cur.next: cur moves to ${name(s, cur)}, i = ${i}.`,
        ['search.move', 'search.loop'],
        { marks: [mark('p:cur', 'active')], ptrs: { cur }, level: 3, vars: more() },
      );
      if (back) break;
    }
    yield st(
      s,
      `${v} is not in the list (${plural(comparisons, 'comparison')}). Return -1.`,
      ['search.none'],
      {
        ptrs: { cur },
        level: 1,
        vars: { ...more(), returned: -1 },
      },
    );
    return s;
  },
};

export const ops = {
  insertFront: insert('insertFront'),
  insertBack: insert('insertBack'),
  removeFront,
  rotate,
  traverse,
  search,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

function insertLines(op: 'insertFront' | 'insertBack'): PseudoLine[] {
  const back = op === 'insertBack';
  return [
    L(`${op}.sig`, 0, `${op}(x)`, back ? 'To insert x at the back:' : 'To insert x at the front:'),
    L(`${op}.new`, 1, 'new = Node(x)', 'Make a new node holding x.'),
    L(`${op}.check`, 1, 'if tail == null', 'If the list is empty,'),
    L(`${op}.self`, 2, 'new.next = new', 'the new node points at itself'),
    ...(back ? [] : [L(`${op}.tail1`, 2, 'tail = new', 'and it is the last node.')]),
    L(`${op}.else`, 1, 'else', 'Otherwise'),
    L(`${op}.link`, 2, 'new.next = tail.next', 'point it at the front node,'),
    L(`${op}.close`, 2, 'tail.next = new', 'then point the last node at it.'),
    ...(back ? [L(`${op}.tail`, 1, 'tail = new', 'Move tail to it: now it is the back.')] : []),
    L(`${op}.size`, 1, 'n = n + 1', 'Count one more node.'),
  ];
}

export function pseudocode(): PseudoBlock[] {
  return [
    { op: 'insertFront', lines: insertLines('insertFront') },
    { op: 'insertBack', lines: insertLines('insertBack') },
    {
      op: 'removeFront',
      lines: [
        L('removeFront.sig', 0, 'removeFront()', 'To remove the front node:'),
        L('removeFront.check', 1, 'if tail == null', 'If the list is empty,'),
        L('removeFront.error', 2, 'error "list is empty"', 'stop with an error.'),
        L('removeFront.first', 1, 'first = tail.next', 'The front node is the one after tail.'),
        L('removeFront.one', 1, 'if first == tail', 'If it is the only node,'),
        L('removeFront.empty', 2, 'tail = null', 'the list becomes empty.'),
        L('removeFront.else', 1, 'else', 'Otherwise'),
        L('removeFront.skip', 2, 'tail.next = first.next', 'the last node skips over it.'),
        L('removeFront.size', 1, 'n = n - 1', 'Count one fewer node.'),
        L('removeFront.return', 1, 'return first.value', 'Hand back its value.'),
      ],
    },
    {
      op: 'rotate',
      lines: [
        L('rotate.sig', 0, 'rotate()', 'To move the front node to the back:'),
        L('rotate.check', 1, 'if tail != null', 'if there are any nodes,'),
        L('rotate.move', 2, 'tail = tail.next', 'move tail one step forward.'),
      ],
    },
    {
      op: 'traverse',
      lines: [
        L('traverse.sig', 0, 'traverse()', 'To visit every node once:'),
        L('traverse.check', 1, 'if tail == null', 'If the list is empty,'),
        L('traverse.empty', 2, 'return', 'there is nothing to visit.'),
        L('traverse.start', 1, 'cur = tail.next', 'Start at the front.'),
        L('traverse.do', 1, 'do', 'Repeat:'),
        L('traverse.visit', 2, 'visit(cur)', 'visit this node'),
        L('traverse.move', 2, 'cur = cur.next', 'and step to the next one,'),
        L('traverse.loop', 1, 'while cur != tail.next', 'until we are back at the front.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('search.sig', 0, 'search(x)', 'To find the index of x:'),
        L('search.check', 1, 'if tail == null', 'If the list is empty,'),
        L('search.empty', 2, 'return -1', 'x is not there.'),
        L('search.start', 1, 'cur = tail.next; i = 0', 'Start at the front, index 0.'),
        L('search.do', 1, 'do', 'Repeat:'),
        L('search.cmp', 2, 'if cur.value == x', 'if this node holds x,'),
        L('search.found', 3, 'return i', 'hand back its index.'),
        L('search.move', 2, 'cur = cur.next; i = i + 1', 'Step forward and count,'),
        L('search.loop', 1, 'while cur != tail.next', 'until we are back at the front.'),
        L('search.none', 1, 'return -1', 'x is not in the list.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty circular linked list. The only pointer is tail, and it is null. Once there are nodes, the last node points back to the first, so tail.next is the front.';
}

export function initialVars(state: S): Record<string, Scalar> {
  return { n: state.size };
}

export function describe(state: S): string {
  if (state.tail === null) return 'Empty circular linked list: tail is null.';
  return `Circular linked list with ${plural(state.size, 'node')}: ${ring(state)}. tail → ${name(state, state.tail)}.`;
}
