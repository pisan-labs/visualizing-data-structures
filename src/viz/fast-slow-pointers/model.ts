/**
 * Fast and slow pointers on a singly linked list: two pointers walk the same list at different
 * speeds, or with a gap between them, so one walk answers a question about where the end is.
 *
 * - middle(): slow moves one node, fast two; when fast runs out, slow is halfway. Of two middles
 *   (an even count) the loop `while fast and fast.next` stops at the second; the setting switches
 *   to `while fast.next and fast.next.next`, which stops at the first.
 * - kth(k): fast goes k nodes ahead, then both move one at a time; when fast falls off the end,
 *   slow is k from the end.
 * - palindrome(): find the middle, reverse the second half, compare the halves from both ends,
 *   then reverse the second half back. O(1) extra space.
 *
 * The naive approach (the setting) counts the length first and walks again (middle, kth), or
 * copies the values to an array and compares from both ends (palindrome).
 *
 * Work, in the units of src/viz/_patterns/kit.ts:
 * - a hop sets a pointer variable from a next field (slow = slow.next; fast = fast.next.next is
 *   two hops; nxt = cur.next is one);
 * - a link writes a next field (the reversal);
 * - a copy writes a value into an array cell;
 * - a comparison compares two values.
 * middle and kth count hops only; palindrome counts all four.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import {
  arrows,
  makeNodes,
  nid,
  order,
  ordinal,
  plural,
  readK,
  readValues,
  valueVar,
  workOf,
  type Copy,
  type LNode,
} from '../_lists2/kit';

export const MAX_N = 10;
export const MAX_K = 99;
export const START = [1, 2, 3, 4, 5, 6, 7];

export type Middle = 'second' | 'first';

export interface FSSettings {
  [key: string]: Scalar;
  approach: Approach;
  middle: Middle;
}

export const defaults: FSSettings = { approach: 'pattern', middle: 'second' };

export interface FSState {
  /** The nodes in slot order. Between operations this is the list, from head to its end. */
  nodes: LNode[];
  head: number;
  nextUid: number;
}

export interface FSExtra {
  /** What is asked, drawn at the top left; the answer is added at the end. */
  heading: string;
  /** Local pointer variables of the running operation, by name: the uid they point at. */
  ptrs: Record<string, number | null>;
  /** The naive palindrome check: the values copied so far, and the indices i and j. */
  array?: { cells: (Copy | null)[]; markers: Record<string, number> };
  /** Array cells reserved for the whole operation (0 for none), so the camera holds still. */
  frame: { array: number };
}

export type FSStep = Step<FSState, FSExtra>;
type Op = OpSpec<FSState, FSSettings, FSExtra>;

export const init = (): FSState => ({
  nodes: makeNodes(START, 1),
  head: 1,
  nextUid: START.length + 1,
});

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const ptrMark = (name: string, role: MarkRole = 'active') => mark(`p:${name}`, role);

// ----- Reading the list -----

const nodeOf = (s: FSState, uid: number) => {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
};
const nextOf = (s: FSState, uid: number | null) => (uid === null ? null : nodeOf(s, uid).next);
const valOf = (s: FSState, uid: number) => nodeOf(s, uid).value;
/** "4", or "null". */
const at = (s: FSState, uid: number | null) => (uid === null ? 'null' : String(valOf(s, uid)));

export const values = (s: FSState) => order(s.nodes, s.head).map((u) => valOf(s, u));

function setNext(s: FSState, uid: number, next: number | null): FSState {
  return { ...s, nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, next } : x)) };
}

/** Index of a node in the list, counting from 0. */
const indexOf = (s: FSState, uid: number) => order(s.nodes, s.head).indexOf(uid);

// ----- Steps -----

interface Run {
  s: FSState;
  heading: string;
  work: Work;
  tot: Totals;
  ptrs: Record<string, number | null>;
  frame: { array: number };
  array?: FSExtra['array'];
  page: () => Record<string, Scalar>;
}

function step(
  r: Run,
  say: string,
  lines: string[],
  o: { marks?: Mark[]; level?: 1 | 2 | 3; heading?: string } = {},
): FSStep {
  return {
    state: r.s,
    marks: o.marks ?? [],
    say,
    lines,
    level: o.level ?? 2,
    vars: { ...r.page(), ...workVars(r.work, r.tot) },
    extra: {
      heading: o.heading ?? r.heading,
      ptrs: { ...r.ptrs },
      ...(r.array
        ? { array: { cells: [...r.array.cells], markers: { ...r.array.markers } } }
        : {}),
      frame: r.frame,
    },
  };
}

function refuse(s: FSState, why: string): FSStep {
  return {
    state: s,
    marks: [mark('ask', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.nodes.length },
    extra: { heading: 'Nothing to do', ptrs: {}, frame: { array: 0 } },
  };
}

const ZERO: Totals = { naive: 0, pattern: 0 };

/** Both approaches' work on this input, then the steps of the one the settings ask for. */
function* both(
  units: readonly string[],
  settings: FSSettings,
  run: (a: Approach, tot: Totals) => Generator<FSStep, FSState, void>,
): Generator<FSStep, FSState, void> {
  const tot: Totals = {
    naive: workOf(run('naive', ZERO), units),
    pattern: workOf(run('pattern', ZERO), units),
  };
  return yield* run(approachOf(settings), tot);
}

// ----- build -----

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [arg]) {
    const vs = readValues(arg, MAX_N);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} The list stays as it was.`);
      return s;
    }
    const next: FSState = {
      nodes: makeNodes(vs, s.nextUid),
      head: s.nextUid,
      nextUid: s.nextUid + vs.length,
    };
    yield {
      state: next,
      marks: [ptrMark('head')],
      say: `Built a list of ${plural(vs.length, 'node')}: head → ${arrows(vs)}. Find the middle, the k-th from the end, or check for a palindrome.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
      extra: { heading: '', ptrs: {}, frame: { array: 0 } },
    };
    return next;
  },
};

// ----- middle -----

const middleWhich = (settings: FSSettings) =>
  settings.middle === 'first' ? 'the first of two middles' : 'the second of two middles';

/** The index the middle is at: n / 2, or (n − 1) / 2 for the first of two, rounded down. */
export const middleIndex = (n: number, middle: Middle) =>
  middle === 'first' ? Math.floor((n - 1) / 2) : Math.floor(n / 2);

function* middlePattern(s: FSState, settings: FSSettings, tot: Totals) {
  const first = settings.middle === 'first';
  let slow: number | null = s.head;
  let fast: number | null = s.head;
  const r: Run = {
    s,
    heading: 'Find the middle node',
    work: new Work(['hops']),
    tot,
    ptrs: { slow, fast },
    frame: { array: 0 },
    page: () => ({ slow: valueVar(s.nodes, slow), fast: valueVar(s.nodes, fast) }),
  };
  const sync = () => (r.ptrs = { slow, fast });
  const going = () =>
    first
      ? nextOf(s, fast) !== null && nextOf(s, nextOf(s, fast)) !== null
      : fast !== null && nextOf(s, fast) !== null;
  yield step(
    r,
    `slow = fast = head (${at(s, s.head)}). slow moves one node at a time and fast two, so when fast reaches the end, slow has gone half as far.`,
    ['init'],
    { marks: [ptrMark('slow'), ptrMark('fast')] },
  );
  while (going()) {
    slow = nextOf(s, slow);
    fast = nextOf(s, nextOf(s, fast));
    r.work.add('hops', 3);
    sync();
    yield step(
      r,
      `fast has room to move, so slow moves one node, to ${at(s, slow)}, and fast two, to ${at(s, fast)}.`,
      ['loop', 'slow', 'fast'],
      { marks: [ptrMark('slow'), ptrMark('fast')] },
    );
  }
  const why = first
    ? nextOf(s, fast) === null
      ? 'fast is on the last node, so the count is odd and slow is on the middle one.'
      : 'fast is on the second to last node, so the count is even and slow is on the first of the two middles.'
    : fast === null
      ? 'fast is null: it stepped past the last node, so the count is even and slow is on the second of the two middles.'
      : 'fast is on the last node, so the count is odd and slow is on the middle one.';
  yield step(r, `Stop: ${why}`, ['loop'], { level: 3, marks: [ptrMark('fast', 'compare')] });
  const i = indexOf(s, slow!);
  r.ptrs = { slow };
  r.page = () => ({ middle: valOf(s, slow!), index: i });
  yield step(
    r,
    `return slow: the middle is ${at(s, slow)}, at index ${i}. One walk took ${r.work.tally()}; counting first takes ${tot.naive}.`,
    ['ret'],
    {
      level: 1,
      marks: [mark(nid(slow!), 'found'), ptrMark('slow', 'found')],
      heading: `Middle: ${at(s, slow)}`,
    },
  );
  return s;
}

function* middleNaive(s: FSState, settings: FSSettings, tot: Totals) {
  const first = settings.middle === 'first';
  let cur: number | null = s.head;
  let n = 0;
  const r: Run = {
    s,
    heading: 'Find the middle node',
    work: new Work(['hops']),
    tot,
    ptrs: { cur },
    frame: { array: 0 },
    page: () => ({ n, cur: valueVar(s.nodes, cur) }),
  };
  yield step(
    r,
    'Count first: n = 0 and cur = head. Walk to the end, counting the nodes.',
    ['init'],
    { marks: [ptrMark('cur')] },
  );
  while (cur !== null) {
    n++;
    cur = nextOf(s, cur);
    r.work.add('hops');
    r.ptrs = { cur };
    yield step(
      r,
      cur === null
        ? `n = ${n}, and cur = cur.next is null: the end. The list has ${plural(n, 'node')}.`
        : `n = ${n}, and cur moves to ${at(s, cur)}.`,
      ['count', 'inc'],
      { marks: [ptrMark('cur')] },
    );
  }
  const target = middleIndex(n, settings.middle);
  cur = s.head;
  r.ptrs = { cur };
  yield step(
    r,
    `The middle is at index ${first ? `(n − 1) / 2 = (${n} − 1) / 2` : `n / 2 = ${n} / 2`}, rounded down: ${target}. Start again from head and take ${plural(target, 'step')}.`,
    ['reset'],
    { marks: [ptrMark('cur')] },
  );
  for (let t = 1; t <= target; t++) {
    cur = nextOf(s, cur);
    r.work.add('hops');
    r.ptrs = { cur };
    yield step(r, `cur moves to ${at(s, cur)}: step ${t} of ${target}.`, ['walk', 'step'], {
      marks: [ptrMark('cur')],
    });
  }
  r.page = () => ({ n, middle: valOf(s, cur!), index: target });
  yield step(
    r,
    `return cur: the middle is ${at(s, cur)}, at index ${target}. Counting first walked the list twice: ${r.work.tally()}. Slow and fast take ${tot.pattern} in one walk.`,
    ['ret'],
    {
      level: 1,
      marks: [mark(nid(cur!), 'found'), ptrMark('cur', 'found')],
      heading: `Middle: ${at(s, cur)}`,
    },
  );
  return s;
}

const middle: Op = {
  label: 'Find middle',
  arity: 0,
  *run(s, _args, { settings }) {
    return yield* both(['hops'], settings, (a, tot) =>
      a === 'naive' ? middleNaive(s, settings, tot) : middlePattern(s, settings, tot),
    );
  },
};

// ----- kth from the end -----

function* kthPattern(s: FSState, k: number, tot: Totals) {
  let fast: number | null = s.head;
  let slow: number | null = null;
  let moved = 0;
  const r: Run = {
    s,
    heading: `Find the ${ordinal(k)} node from the end`,
    work: new Work(['hops']),
    tot,
    ptrs: { fast },
    frame: { array: 0 },
    page: () => ({ k, gap: moved, slow: valueVar(s.nodes, slow), fast: valueVar(s.nodes, fast) }),
  };
  let started = false;
  const sync = () => (r.ptrs = started ? { slow, fast } : { fast });
  yield step(
    r,
    `fast = head (${at(s, s.head)}). First move fast ${plural(k, 'node')} ahead, so there is a gap of ${k} between it and head.`,
    ['init'],
    { marks: [ptrMark('fast')] },
  );
  while (moved < k) {
    if (fast === null) {
      r.ptrs = { fast };
      r.page = () => ({ k, gap: moved, found: false });
      yield step(
        r,
        `fast is null after ${plural(moved, 'move')}: the list has only ${plural(moved, 'node')}, fewer than k = ${k}. There is no ${ordinal(k)} node from the end, so return null. That took ${r.work.tally()}.`,
        ['gap', 'short'],
        { level: 1, marks: [mark('ask', 'error')], heading: `No ${ordinal(k)} from the end` },
      );
      return s;
    }
    fast = nextOf(s, fast);
    moved++;
    r.work.add('hops');
    sync();
    yield step(
      r,
      `fast moves to ${at(s, fast)}: ${plural(moved, 'node')} ahead of head${moved === k ? ', the whole gap' : ''}.`,
      ['gap', 'ahead'],
      { marks: [ptrMark('fast')] },
    );
  }
  slow = s.head;
  started = true;
  sync();
  yield step(
    r,
    `slow = head (${at(s, slow)}). Now slow is ${k} behind fast. Move both one node at a time; the gap stays ${k}.`,
    ['slow0'],
    { marks: [ptrMark('slow')] },
  );
  while (fast !== null) {
    slow = nextOf(s, slow);
    fast = nextOf(s, fast);
    r.work.add('hops', 2);
    sync();
    yield step(
      r,
      fast === null
        ? `Both move: slow to ${at(s, slow)}, fast to null. fast has fallen off the end, so slow is ${k} from the end.`
        : `Both move: slow to ${at(s, slow)}, fast to ${at(s, fast)}.`,
      ['loop', 'both'],
      { marks: [ptrMark('slow'), ptrMark('fast')] },
    );
  }
  r.ptrs = { slow };
  r.page = () => ({ k, found: true, value: valOf(s, slow!) });
  yield step(
    r,
    `return slow: the ${ordinal(k)} node from the end is ${at(s, slow)}. One walk took ${r.work.tally()}; counting first takes ${tot.naive}, the same, but in two walks.`,
    ['ret'],
    {
      level: 1,
      marks: [mark(nid(slow!), 'found'), ptrMark('slow', 'found')],
      heading: `${ordinal(k)} from the end: ${at(s, slow)}`,
    },
  );
  return s;
}

function* kthNaive(s: FSState, k: number, tot: Totals) {
  let cur: number | null = s.head;
  let n = 0;
  const r: Run = {
    s,
    heading: `Find the ${ordinal(k)} node from the end`,
    work: new Work(['hops']),
    tot,
    ptrs: { cur },
    frame: { array: 0 },
    page: () => ({ k, n, cur: valueVar(s.nodes, cur) }),
  };
  yield step(
    r,
    'Count first: n = 0 and cur = head. Walk to the end, counting the nodes.',
    ['init'],
    { marks: [ptrMark('cur')] },
  );
  while (cur !== null) {
    n++;
    cur = nextOf(s, cur);
    r.work.add('hops');
    r.ptrs = { cur };
    yield step(
      r,
      cur === null
        ? `n = ${n}, and cur = cur.next is null: the end. The list has ${plural(n, 'node')}.`
        : `n = ${n}, and cur moves to ${at(s, cur)}.`,
      ['count', 'inc'],
      { marks: [ptrMark('cur')] },
    );
  }
  if (k > n) {
    r.ptrs = {};
    r.page = () => ({ k, n, found: false });
    yield step(
      r,
      `k = ${k} is more than n = ${n}: there is no ${ordinal(k)} node from the end, so return null. That took ${r.work.tally()}.`,
      ['short'],
      { level: 1, marks: [mark('ask', 'error')], heading: `No ${ordinal(k)} from the end` },
    );
    return s;
  }
  cur = s.head;
  r.ptrs = { cur };
  yield step(
    r,
    `The ${ordinal(k)} from the end is the ${ordinal(n - k + 1)} from the front, at index n − k = ${n} − ${k} = ${n - k}. Start again from head.`,
    ['reset'],
    { marks: [ptrMark('cur')] },
  );
  for (let t = 1; t <= n - k; t++) {
    cur = nextOf(s, cur);
    r.work.add('hops');
    r.ptrs = { cur };
    yield step(r, `cur moves to ${at(s, cur)}: step ${t} of ${n - k}.`, ['walk', 'step'], {
      marks: [ptrMark('cur')],
    });
  }
  r.page = () => ({ k, n, found: true, value: valOf(s, cur!) });
  yield step(
    r,
    `return cur: the ${ordinal(k)} node from the end is ${at(s, cur)}. Counting first walked the list twice: ${r.work.tally()}. The gap of k takes ${tot.pattern}, in one walk.`,
    ['ret'],
    {
      level: 1,
      marks: [mark(nid(cur!), 'found'), ptrMark('cur', 'found')],
      heading: `${ordinal(k)} from the end: ${at(s, cur)}`,
    },
  );
  return s;
}

const kth: Op = {
  label: 'k-th from end',
  arity: 1,
  *run(s, [arg], { settings }) {
    const k = readK(arg, MAX_K);
    if (typeof k === 'string') {
      yield refuse(s, k);
      return s;
    }
    return yield* both(['hops'], settings, (a, tot) =>
      a === 'naive' ? kthNaive(s, k, tot) : kthPattern(s, k, tot),
    );
  },
};

// ----- palindrome -----

const PAL_UNITS = ['hops', 'links', 'copies', 'comparisons'] as const;

function* palindromePattern(s0: FSState, settings: FSSettings, tot: Totals) {
  const first = settings.middle === 'first';
  const s = s0;
  const n = s.nodes.length;
  let slow: number | null = s.head;
  let fast: number | null = s.head;
  let same: boolean | null = null;
  const r: Run = {
    s,
    heading: 'Is it a palindrome?',
    work: new Work(PAL_UNITS),
    tot,
    ptrs: { slow, fast },
    frame: { array: 0 },
    page: () => ({ slow: valueVar(s.nodes, slow), fast: valueVar(s.nodes, fast) }),
  };
  const going = () =>
    first
      ? nextOf(r.s, fast) !== null && nextOf(r.s, nextOf(r.s, fast)) !== null
      : fast !== null && nextOf(r.s, fast) !== null;

  // 1. The middle.
  yield step(
    r,
    `Does the list read the same both ways? With no array to copy into: find the middle with slow and fast, turn the second half around, and compare the two halves from the outside in.`,
    ['init'],
    { marks: [ptrMark('slow'), ptrMark('fast')] },
  );
  while (going()) {
    slow = nextOf(r.s, slow);
    fast = nextOf(r.s, nextOf(r.s, fast));
    r.work.add('hops', 3);
    r.ptrs = { slow, fast };
    yield step(r, `slow moves to ${at(r.s, slow)}, fast to ${at(r.s, fast)}.`, ['loop', 'move'], {
      marks: [ptrMark('slow'), ptrMark('fast')],
    });
  }

  // 2. Reverse the second half.
  let prev: number | null = null;
  let cur: number | null = first ? nextOf(r.s, slow) : slow;
  if (first) r.work.add('hops');
  const half = cur === null ? 0 : order(r.s.nodes, cur).length;
  r.ptrs = { prev, cur };
  r.page = () => ({ prev: valueVar(s.nodes, prev), cur: valueVar(s.nodes, cur) });
  yield step(
    r,
    cur === null
      ? `slow is on ${at(r.s, slow)}, the middle, and nothing follows it: the second half is empty.`
      : `slow stopped at ${at(r.s, slow)}. The second half starts ${first ? 'after it' : 'there'}: ${plural(half, 'node')}. Turn it around: prev = null, cur = ${first ? 'slow.next' : 'slow'} (${at(r.s, cur)}).`,
    ['rev-init'],
    { marks: [ptrMark('cur')] },
  );
  while (cur !== null) {
    const nxt: number | null = nextOf(r.s, cur);
    const back0 = prev;
    r.s = setNext(r.s, cur, prev);
    r.work.add('hops');
    r.work.add('links');
    const was: number = cur;
    prev = cur;
    cur = nxt;
    r.ptrs = { prev, cur };
    yield step(
      r,
      back0 === null
        ? `nxt = cur.next saves ${at(r.s, nxt)}. ${at(r.s, was)}.next = prev, which is null: ${at(r.s, was)} will be the end of the turned-around half. prev and cur move up.`
        : `nxt = cur.next saves ${at(r.s, nxt)}. ${at(r.s, was)}.next = prev: it points back at ${at(r.s, back0)} now. prev and cur move up.`,
      ['rev-loop', 'rev-flip', 'rev-step'],
      { marks: [mark(`${nid(was)}.next`, 'active'), ptrMark('prev'), ptrMark('cur')] },
    );
  }
  const back = prev;

  // 3. Compare.
  let left: number | null = s.head;
  let right: number | null = back;
  r.ptrs = { left, right };
  r.page = () => ({ left: valueVar(s.nodes, left), right: valueVar(s.nodes, right), same });
  yield step(
    r,
    back === null
      ? 'left = head and right = prev, which is null: there is nothing to compare, so a one-node list is a palindrome.'
      : `left = head (${at(r.s, left)}) and right = prev (${at(r.s, right)}), the old last node. Walk them toward the middle, comparing.`,
    ['cmp-init'],
    { marks: [ptrMark('left'), ptrMark('right')] },
  );
  same = true;
  while (right !== null) {
    const a = valOf(r.s, left!);
    const b = valOf(r.s, right);
    r.work.add('comparisons');
    if (a !== b) {
      same = false;
      yield step(
        r,
        `${a} ≠ ${b}: the two ends differ, so it is not a palindrome. Stop comparing.`,
        ['cmp-loop', 'cmp', 'diff'],
        {
          marks: [mark(nid(left!), 'error'), mark(nid(right), 'error')],
        },
      );
      break;
    }
    const self = left === right;
    left = nextOf(r.s, left);
    const was = right;
    right = nextOf(r.s, right);
    r.work.add('hops', 2);
    r.ptrs = { left, right };
    yield step(
      r,
      self
        ? `${a} = ${b}: the middle node against itself. Both move on; right is null now.`
        : `${a} = ${b}. Both move one node toward the middle${right === null ? '; right is null now' : ''}.`,
      ['cmp-loop', 'cmp', 'adv'],
      {
        marks: [mark(nid(was), 'found'), ptrMark('left'), ptrMark('right')],
      },
    );
  }

  // 4. Put the second half back.
  let rprev: number | null = null;
  let rcur: number | null = back;
  r.ptrs = { prev: rprev, cur: rcur };
  r.page = () => ({ prev: valueVar(s.nodes, rprev), cur: valueVar(s.nodes, rcur), same });
  if (back !== null) {
    yield step(
      r,
      `${same ? 'Every pair matched.' : 'The answer is known.'} Now put the list back as it was: reverse the second half again, from ${at(r.s, back)}.`,
      ['restore'],
      { marks: [ptrMark('cur')] },
    );
  }
  while (rcur !== null) {
    const nxt: number | null = nextOf(r.s, rcur);
    r.s = setNext(r.s, rcur, rprev);
    r.work.add('hops');
    r.work.add('links');
    const was: number = rcur;
    rprev = rcur;
    rcur = nxt;
    r.ptrs = { prev: rprev, cur: rcur };
    yield step(
      r,
      `${at(r.s, was)}.next = ${at(r.s, nextOf(r.s, was))} again, as it was.`,
      ['restore'],
      { marks: [mark(`${nid(was)}.next`, 'active'), ptrMark('cur')] },
    );
  }
  r.ptrs = {};
  r.page = () => ({ n, palindrome: same! });
  yield step(
    r,
    `return ${same}: the list ${same ? 'is' : 'is not'} a palindrome, and it is back as it was: head → ${arrows(values(r.s))}. ${r.work.tally()}, and no extra memory. Copying to an array takes ${tot.naive} steps of work but ${plural(n, 'cell')}.`,
    ['ret'],
    {
      level: 1,
      marks: [mark('ask', same ? 'found' : 'error')],
      heading: same ? 'Palindrome: yes' : 'Palindrome: no',
    },
  );
  return r.s;
}

function* palindromeNaive(s: FSState, _settings: FSSettings, tot: Totals) {
  const n = s.nodes.length;
  const cells: (Copy | null)[] = Array(n).fill(null);
  let cur: number | null = s.head;
  let same: boolean | null = null;
  const r: Run = {
    s,
    heading: 'Is it a palindrome?',
    work: new Work(PAL_UNITS),
    tot,
    ptrs: { cur },
    frame: { array: n },
    array: { cells, markers: {} },
    page: () => ({ cur: valueVar(s.nodes, cur) }),
  };
  yield step(
    r,
    `Does the list read the same both ways? Copy the values into an array A first, then compare A from both ends. A list cannot walk backwards; an array can.`,
    ['init'],
    { marks: [ptrMark('cur')] },
  );
  let len = 0;
  while (cur !== null) {
    const u: number = cur;
    cells[len] = { uid: u, value: valOf(s, u) };
    len++;
    cur = nextOf(s, cur);
    r.work.add('copies');
    r.work.add('hops');
    r.ptrs = { cur };
    yield step(
      r,
      `Copy ${valOf(s, u)} into A[${len - 1}]; cur moves to ${at(s, cur)}.`,
      ['copy-loop', 'copy'],
      { marks: [mark(`cp-${u}`, 'new'), ptrMark('cur')] },
    );
  }
  let i = 0;
  let j = n - 1;
  r.ptrs = {};
  r.array!.markers = { i, j };
  r.page = () => ({ i, j, same });
  yield step(
    r,
    `A holds all ${plural(n, 'value')}. i = 0 and j = ${n - 1}: the two ends.`,
    ['ij'],
    { marks: [mark('ix:i', 'active'), mark('ix:j', 'active')] },
  );
  same = true;
  while (i < j) {
    const a = cells[i]!;
    const b = cells[j]!;
    r.work.add('comparisons');
    if (a.value !== b.value) {
      same = false;
      yield step(
        r,
        `A[${i}] = ${a.value} ≠ A[${j}] = ${b.value}: not a palindrome.`,
        ['cmp-loop', 'cmp'],
        { marks: [mark(`cp-${a.uid}`, 'error'), mark(`cp-${b.uid}`, 'error')] },
      );
      break;
    }
    i++;
    j--;
    r.array!.markers = { i, j };
    yield step(
      r,
      `A[${i - 1}] = A[${j + 1}] = ${a.value}. i and j move one cell toward the middle${i >= j ? `: they ${i === j ? 'meet' : 'cross'}, so every pair has been checked` : ''}.`,
      ['cmp-loop', 'cmp', 'adv'],
      { marks: [mark(`cp-${a.uid}`, 'found'), mark(`cp-${b.uid}`, 'found')] },
    );
  }
  r.page = () => ({ n, palindrome: same! });
  yield step(
    r,
    `return ${same}: the list ${same ? 'is' : 'is not'} a palindrome. ${r.work.tally()}, with an array of ${plural(n, 'cell')}. Reversing the second half in place takes ${tot.pattern} steps of work and no array.`,
    ['ret'],
    {
      level: 1,
      marks: [mark('ask', same ? 'found' : 'error')],
      heading: same ? 'Palindrome: yes' : 'Palindrome: no',
    },
  );
  return s;
}

const palindrome: Op = {
  label: 'Palindrome?',
  arity: 0,
  *run(s, _args, { settings }) {
    return yield* both(PAL_UNITS, settings, (a, tot) =>
      a === 'naive' ? palindromeNaive(s, settings, tot) : palindromePattern(s, settings, tot),
    );
  },
};

export const ops: Record<string, Op> = { middle, kth, palindrome, build };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FSSettings): PseudoBlock[] {
  const first = settings.middle === 'first';
  const loop = first
    ? L(
        'loop',
        1,
        'while fast.next != null and fast.next.next != null',
        'While fast can still move two nodes (stop one early, at the first of two middles):',
      )
    : L(
        'loop',
        1,
        'while fast != null and fast.next != null',
        'While fast can still move two nodes:',
      );
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'middle',
        lines: [
          L('sig', 0, 'middle(head)   // count first', 'To find the middle node, count first:'),
          L('init', 1, 'n = 0; cur = head', 'Start counting at the head.'),
          L('count', 1, 'while cur != null', 'Walk to the end:'),
          L('inc', 2, 'n = n + 1; cur = cur.next', 'count the node and move on.'),
          L(
            'reset',
            1,
            first ? 'm = (n − 1) / 2; cur = head' : 'm = n / 2; cur = head',
            first
              ? 'The middle is at index (n − 1) / 2, rounded down. Start again at the head.'
              : 'The middle is at index n / 2, rounded down. Start again at the head.',
          ),
          L('walk', 1, 'repeat m times', 'Take m steps:'),
          L('step', 2, 'cur = cur.next', 'move to the next node.'),
          L('ret', 1, 'return cur', 'That node is the middle.'),
        ],
      },
      {
        op: 'kth',
        lines: [
          L(
            'sig',
            0,
            'kthFromEnd(head, k)   // count first',
            'To find the k-th node from the end, count first:',
          ),
          L('init', 1, 'n = 0; cur = head', 'Start counting at the head.'),
          L('count', 1, 'while cur != null', 'Walk to the end:'),
          L('inc', 2, 'n = n + 1; cur = cur.next', 'count the node and move on.'),
          L('short', 1, 'if k > n: return null', 'A list shorter than k has no k-th from the end.'),
          L('reset', 1, 'cur = head', 'Start again at the head.'),
          L('walk', 1, 'repeat n − k times', 'The k-th from the end is n − k steps from the front:'),
          L('step', 2, 'cur = cur.next', 'move to the next node.'),
          L('ret', 1, 'return cur', 'That node is k from the end.'),
        ],
      },
      {
        op: 'palindrome',
        lines: [
          L(
            'sig',
            0,
            'isPalindrome(head)   // copy to an array',
            'To check whether the list reads the same both ways, copy it to an array:',
          ),
          L('init', 1, 'A = empty array; cur = head', 'Start with an empty array at the head.'),
          L('copy-loop', 1, 'while cur != null', 'Walk to the end:'),
          L('copy', 2, 'append cur.value to A; cur = cur.next', 'copy each value into A.'),
          L('ij', 1, 'i = 0; j = length(A) − 1', 'Put i at the front of A and j at the back.'),
          L('cmp-loop', 1, 'while i < j', 'Until they meet in the middle:'),
          L('cmp', 2, 'if A[i] != A[j]: return false', 'two values that differ mean no;'),
          L('adv', 2, 'i = i + 1; j = j − 1', 'otherwise move both toward the middle.'),
          L('ret', 1, 'return true', 'Every pair matched: yes.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'middle',
      lines: [
        L('sig', 0, 'middle(head)', 'To find the middle node:'),
        L('init', 1, 'slow = head; fast = head', 'Both pointers start at the head.'),
        loop,
        L('slow', 2, 'slow = slow.next', 'slow moves one node,'),
        L('fast', 2, 'fast = fast.next.next', 'and fast moves two.'),
        L('ret', 1, 'return slow', 'slow has gone half as far as fast: the middle.'),
      ],
    },
    {
      op: 'kth',
      lines: [
        L('sig', 0, 'kthFromEnd(head, k)', 'To find the k-th node from the end:'),
        L('init', 1, 'fast = head', 'Start fast at the head.'),
        L('gap', 1, 'repeat k times', 'Move it k nodes ahead:'),
        L('short', 2, 'if fast == null: return null', 'if the list runs out first, it is too short;'),
        L('ahead', 2, 'fast = fast.next', 'otherwise move fast one node.'),
        L('slow0', 1, 'slow = head', 'Start slow at the head, k behind fast.'),
        L('loop', 1, 'while fast != null', 'Until fast falls off the end:'),
        L('both', 2, 'slow = slow.next; fast = fast.next', 'move both one node; the gap stays k.'),
        L('ret', 1, 'return slow', 'slow is k from the end.'),
      ],
    },
    {
      op: 'palindrome',
      lines: [
        L('sig', 0, 'isPalindrome(head)', 'To check whether the list reads the same both ways:'),
        L('init', 1, 'slow = head; fast = head', 'Find the middle with slow and fast:'),
        loop,
        L('move', 2, 'slow = slow.next; fast = fast.next.next', 'slow one node, fast two.'),
        L(
          'rev-init',
          1,
          first ? 'prev = null; cur = slow.next' : 'prev = null; cur = slow',
          first
            ? 'The second half starts after slow. Turn it around:'
            : 'The second half starts at slow. Turn it around:',
        ),
        L('rev-loop', 1, 'while cur != null', 'for each node in it,'),
        L('rev-flip', 2, 'nxt = cur.next; cur.next = prev', 'save the next node and point back;'),
        L('rev-step', 2, 'prev = cur; cur = nxt', 'then move prev and cur up.'),
        L(
          'cmp-init',
          1,
          'left = head; right = prev; same = true',
          'left starts at the head, right at the old last node.',
        ),
        L('cmp-loop', 1, 'while right != null', 'Walk them toward the middle:'),
        L('cmp', 2, 'if left.value != right.value', 'if two values differ,'),
        L('diff', 3, 'same = false; break', 'it is not a palindrome: stop;'),
        L('adv', 2, 'left = left.next; right = right.next', 'otherwise move both on.'),
        L(
          'restore',
          1,
          'reverse the second half again, from prev',
          'Put the list back as it was: turn the second half around again.',
        ),
        L('ret', 1, 'return same', 'Hand back the answer.'),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: FSState): string {
  return `The list holds ${plural(s.nodes.length, 'node')}: head → ${arrows(values(s))}.`;
}

export function initialSay(s: FSState): string {
  return `A singly linked list of ${plural(s.nodes.length, 'node')}: you can only walk it forwards, and nobody told you its length. Press Find middle, type k and press k-th from end, or press Palindrome? Type values and press Build for a list of your own.`;
}

export const initialVars = (s: FSState) => ({ n: s.nodes.length });

/** For the concept page and tests: the middle's index, and the pattern's hops for it. */
export const middleHops = (n: number, middle: Middle) =>
  3 * (middle === 'first' ? Math.floor((n - 1) / 2) : Math.floor(n / 2));
