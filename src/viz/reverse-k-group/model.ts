/**
 * Reversing a singly linked list in groups of k, in place.
 *
 * - The pattern: a dummy head, and `before`, the node before the next group. Walk k nodes from
 *   before to find the group's last node (`kth`) and the node after it (`after`). Turn the
 *   group's next pointers around with three pointers (prev, cur, nxt), starting prev at after so
 *   the group's new last node already points at the rest. Then before.next = kth links the group
 *   in, and before moves to the group's old first node, now its last. Every node is relinked,
 *   none is copied, O(1) extra space.
 * - A last group shorter than k stays as it is (the default), or is reversed too (the setting).
 * - The naive approach (the setting) copies the values to an array, reverses each group of the
 *   array by swaps, and writes the values back into the nodes: the values move, not the nodes.
 *
 * Nodes keep their slots while a group is turned around (its arrows point back), and the list
 * is redrawn in its new order once the group is linked in, so the animation follows the nodes.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a hop sets a pointer variable from a next
 * field (kth = kth.next, nxt = cur.next); a link writes a next field; a copy writes a value into
 * an array cell or a node.
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
export const START = [1, 2, 3, 4, 5, 6, 7, 8];
export const START_K = 3;
/** The dummy head's uid; real nodes start at 1. */
export const DUMMY = 0;

export type Rest = 'keep' | 'reverse';

export interface RKSettings {
  [key: string]: Scalar;
  approach: Approach;
  rest: Rest;
}

export const defaults: RKSettings = { approach: 'pattern', rest: 'keep' };

export interface RKState {
  /** The nodes in slot order (the dummy first while the pattern runs). */
  nodes: LNode[];
  head: number;
  nextUid: number;
}

export interface RKExtra {
  heading: string;
  /** Pointer variables, by name: the uid they point at. */
  ptrs: Record<string, number | null>;
  /** The naive approach: the values copied so far, and the two ends of a swap. */
  array?: { cells: (Copy | null)[]; markers: Record<string, number> };
  /** Array cells reserved for the whole operation (0 for none). */
  frame: { array: number };
}

export type RKStep = Step<RKState, RKExtra>;
type Op = OpSpec<RKState, RKSettings, RKExtra>;

export const init = (): RKState => ({
  nodes: makeNodes(START, 1),
  head: 1,
  nextUid: START.length + 1,
});

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const ptrMark = (name: string, role: MarkRole = 'active') => mark(`p:${name}`, role);

// ----- Reading the list -----

const nodeOf = (s: RKState, uid: number) => {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
};
const nextOf = (s: RKState, uid: number) => nodeOf(s, uid).next;
const at = (s: RKState, uid: number | null) =>
  uid === null ? 'null' : uid === DUMMY ? 'dummy' : String(nodeOf(s, uid).value);
const setNext = (s: RKState, uid: number, next: number | null): RKState => ({
  ...s,
  nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, next } : x)),
});

export const values = (s: RKState) =>
  order(s.nodes, s.head).map((u) => nodeOf(s, u).value);

/** Redraw in list order from the dummy: what the list looks like once a group is linked in. */
const tidy = (s: RKState): RKState => ({
  ...s,
  nodes: order(s.nodes, DUMMY).map((u) => nodeOf(s, u)),
});

/** The groups the values fall into, for narration: "[1 2 3] [4 5 6] [7 8]". */
export function groups(vs: readonly number[], k: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < vs.length; i += k) out.push(vs.slice(i, i + k));
  return out;
}

/** The answer, from the values alone. */
export function reversedInGroups(vs: readonly number[], k: number, rest: Rest): number[] {
  return groups(vs, k).flatMap((g) => (g.length === k || rest === 'reverse' ? [...g].reverse() : g));
}

// ----- Steps -----

interface Run {
  s: RKState;
  heading: string;
  work: Work;
  tot: Totals;
  ptrs: Record<string, number | null>;
  frame: { array: number };
  array?: RKExtra['array'];
  page: () => Record<string, Scalar>;
}

function step(
  r: Run,
  say: string,
  lines: string[],
  o: { marks?: Mark[]; level?: 1 | 2 | 3; heading?: string } = {},
): RKStep {
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

function refuse(s: RKState, why: string): RKStep {
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

const UNITS = ['hops', 'links', 'copies'] as const;
const ZERO: Totals = { naive: 0, pattern: 0 };

function* pattern(s0: RKState, k: number, settings: RKSettings, tot: Totals) {
  const reverseRest = settings.rest === 'reverse';
  let before: number = DUMMY;
  let kth: number | null = null;
  let after: number | null = null;
  let prev: number | null = null;
  let cur: number | null = null;
  let count = 0;
  let done = 0;
  const r: Run = {
    s: { ...s0, nodes: [{ uid: DUMMY, value: -1, next: s0.head }, ...s0.nodes] },
    heading: `Reverse in groups of ${k}`,
    work: new Work(UNITS),
    tot,
    ptrs: { before },
    frame: { array: 0 },
    page: () => ({
      k,
      count,
      groups: done,
      before: before === DUMMY ? 'dummy' : valueVar(r.s.nodes, before),
      kth: kth === DUMMY ? 'dummy' : valueVar(r.s.nodes, kth),
    }),
  };
  const vs = values(s0);
  yield step(
    r,
    `Reverse ${arrows(vs)} in groups of ${k}: ${groups(vs, k)
      .map((g) => `[${g.join(' ')}]`)
      .join(' ')}. A dummy node in front gives the first group a node before it, like every other group. before = dummy.`,
    ['sig', 'init'],
    { marks: [mark(nid(DUMMY), 'new'), ptrMark('before')] },
  );

  while (nextOf(r.s, before) !== null) {
    // Find the group's last node.
    kth = before;
    count = 0;
    r.ptrs = { before, kth };
    while (count < k && nextOf(r.s, kth) !== null) {
      kth = nextOf(r.s, kth)!;
      count++;
      r.work.add('hops');
      r.ptrs = { before, kth };
      yield step(
        r,
        `kth moves to ${at(r.s, kth)}: ${plural(count, 'node')} of the group${count === k ? ', a whole group' : ''}.`,
        ['loop', 'scan0', 'scan', 'scan-step'],
        { marks: [ptrMark('kth'), mark(nid(kth), 'visit')] },
      );
    }
    const short = count < k;
    if (short && !reverseRest) {
      r.ptrs = { before, kth };
      yield step(
        r,
        `kth.next is null after ${plural(count, 'node')}: fewer than k = ${k} are left. Leave them as they are and stop.`,
        ['scan', 'short'],
        { marks: [ptrMark('kth', 'compare')] },
      );
      break;
    }
    // Turn the group around.
    after = nextOf(r.s, kth);
    r.work.add('hops');
    cur = nextOf(r.s, before);
    r.work.add('hops');
    const first: number = cur!;
    prev = after;
    r.ptrs = { before, kth, after, prev, cur };
    yield step(
      r,
      `${short ? `Only ${plural(count, 'node')} left, fewer than k = ${k}; this setting reverses them too. ` : ''}after = kth.next (${at(r.s, after)}). Turn the group around: cur = before.next (${at(r.s, cur)}) and prev = after, so the group's new last node will point at the rest.`,
      short ? ['short', 'rev-init'] : ['rev-init'],
      { marks: [ptrMark('after'), ptrMark('prev'), ptrMark('cur')] },
    );
    while (cur !== after) {
      const c: number = cur!;
      const nxt = nextOf(r.s, c);
      const back = prev;
      r.s = setNext(r.s, c, prev);
      r.work.add('hops');
      r.work.add('links');
      prev = c;
      cur = nxt;
      r.ptrs = { before, kth, after, prev, cur };
      yield step(
        r,
        `nxt = cur.next saves ${at(r.s, nxt)}. ${at(r.s, c)}.next = prev: it points at ${at(r.s, back)} now. prev and cur move up.`,
        ['rev-loop', 'rev-flip', 'rev-step'],
        { marks: [mark(`${nid(c)}.next`, 'active'), ptrMark('prev'), ptrMark('cur')] },
      );
    }
    // Link it in.
    r.s = setNext(r.s, before, kth);
    r.work.add('links');
    r.ptrs = { before, kth, after };
    yield step(
      r,
      `cur reached after: the group is turned around, ${at(r.s, kth)} first. before.next = kth links it in: ${at(r.s, before)}.next = ${at(r.s, kth)}.`,
      ['rev-loop', 'connect'],
      { marks: [mark(`${nid(before)}.next`, 'active'), ptrMark('kth')] },
    );
    done++;
    before = first;
    kth = null;
    count = 0;
    r.s = tidy(r.s);
    r.ptrs = { before };
    const now = order(r.s.nodes, nextOf(r.s, DUMMY)).map((u) => nodeOf(r.s, u).value);
    yield step(
      r,
      `before = ${at(r.s, first)}, the group's old first node and now its last: the node before the next group. The list reads ${arrows(now)}.`,
      ['next'],
      { marks: [ptrMark('before')], level: 2 },
    );
  }

  const head = nextOf(r.s, DUMMY)!;
  const end: RKState = {
    nodes: order(r.s.nodes, head).map((u) => nodeOf(r.s, u)),
    head,
    nextUid: s0.nextUid,
  };
  r.s = end;
  r.ptrs = {};
  r.page = () => ({ k, groups: done });
  yield step(
    r,
    `return dummy.next: head → ${arrows(values(end))}. ${done === 0 ? 'No group was whole, so nothing moved' : `${plural(done, 'group')} turned around with ${plural(r.work.get('hops'), 'hop')} and ${plural(r.work.get('links'), 'link')}: the nodes moved, and no value was copied`}. Copying to an array costs ${tot.naive}, and needs ${plural(end.nodes.length, 'cell')}.`,
    ['ret'],
    { level: 1, heading: `Groups of ${k}: done`, marks: [ptrMark('head', 'found')] },
  );
  return end;
}

function* naive(s: RKState, k: number, settings: RKSettings, tot: Totals) {
  const reverseRest = settings.rest === 'reverse';
  const n = s.nodes.length;
  const cells: (Copy | null)[] = Array(n).fill(null);
  let cur: number | null = s.head;
  let done = 0;
  const r: Run = {
    s,
    heading: `Reverse in groups of ${k}`,
    work: new Work(UNITS),
    tot,
    ptrs: { cur },
    frame: { array: n },
    array: { cells, markers: {} },
    page: () => ({ k, groups: done, cur: valueVar(r.s.nodes, cur) }),
  };
  const vs = values(s);
  yield step(
    r,
    `Reverse ${arrows(vs)} in groups of ${k} the naive way: copy the values into an array, reverse each group there, and write them back. The nodes stay put; their values move.`,
    ['sig'],
    { marks: [ptrMark('cur')] },
  );
  // 1. Copy.
  let len = 0;
  while (cur !== null) {
    const u: number = cur;
    cells[len++] = { uid: u, value: nodeOf(s, u).value };
    cur = nextOf(s, u);
    r.work.add('hops');
    r.work.add('copies');
    r.ptrs = { cur };
    yield step(r, `Copy ${nodeOf(s, u).value} into vals[${len - 1}].`, ['copy'], {
      marks: [mark(`cp-${u}`, 'new')],
    });
  }
  // 2. Reverse each group in the array by swaps.
  r.ptrs = {};
  for (let g = 0; g < n; g += k) {
    const end = Math.min(g + k, n) - 1;
    if (end - g + 1 < k && !reverseRest) {
      r.array!.markers = {};
      yield step(
        r,
        `vals[${g}..${end}] has fewer than k = ${k} values: leave it as it is.`,
        ['groups', 'short'],
        { marks: [mark(`arr-${g}`, 'compare')] },
      );
      break;
    }
    let i = g;
    let j = end;
    if (i >= j) {
      done++;
      continue;
    }
    while (i < j) {
      const a = cells[i]!;
      cells[i] = cells[j]!;
      cells[j] = a;
      r.work.add('copies', 2);
      r.array!.markers = { i, j };
      yield step(
        r,
        `Group vals[${g}..${end}]: swap vals[${i}] and vals[${j}] (${cells[j]!.value} and ${cells[i]!.value}).`,
        ['groups', 'swap'],
        { marks: [mark(`cp-${a.uid}`, 'active'), mark(`cp-${cells[i]!.uid}`, 'active')] },
      );
      i++;
      j--;
    }
    done++;
  }
  // 3. Write the values back.
  r.array!.markers = {};
  cur = s.head;
  r.ptrs = { cur };
  let t = 0;
  while (cur !== null) {
    const u: number = cur;
    const v = cells[t]!.value;
    r.s = { ...r.s, nodes: r.s.nodes.map((x) => (x.uid === u ? { ...x, value: v } : x)) };
    cur = nextOf(r.s, u);
    r.work.add('hops');
    r.work.add('copies');
    r.ptrs = { cur };
    yield step(r, `Write vals[${t}] = ${v} into the ${t === 0 ? 'first' : 'next'} node.`, ['write'], {
      marks: [mark(`${nid(u)}.v`, 'new'), mark(`cp-${cells[t]!.uid}`, 'active')],
    });
    t++;
  }
  r.ptrs = {};
  r.page = () => ({ k, groups: done });
  yield step(
    r,
    `return head: ${arrows(values(r.s))}. ${r.work.tally()} and an array of ${plural(n, 'cell')}; every node is where it was, holding another value. Relinking in place costs ${tot.pattern} and no array.`,
    ['ret'],
    { level: 1, heading: `Groups of ${k}: done`, marks: [ptrMark('head', 'found')] },
  );
  return r.s;
}

const reverse: Op = {
  label: 'Reverse in groups',
  arity: 1,
  *run(s, [arg], { settings }) {
    const k = readK(arg, MAX_K);
    if (typeof k === 'string') {
      yield refuse(s, k);
      return s;
    }
    const run = (a: Approach, tot: Totals) =>
      a === 'naive' ? naive(s, k, settings, tot) : pattern(s, k, settings, tot);
    const tot: Totals = {
      naive: workOf(run('naive', ZERO), UNITS),
      pattern: workOf(run('pattern', ZERO), UNITS),
    };
    return yield* run(approachOf(settings), tot);
  },
};

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [arg]) {
    const vs = readValues(arg, MAX_N);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} The list stays as it was.`);
      return s;
    }
    const next: RKState = {
      nodes: makeNodes(vs, s.nextUid),
      head: s.nextUid,
      nextUid: s.nextUid + vs.length,
    };
    yield {
      state: next,
      marks: [ptrMark('head')],
      say: `Built a list of ${plural(vs.length, 'node')}: head → ${arrows(vs)}. Type k and press Reverse in groups.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
      extra: { heading: '', ptrs: {}, frame: { array: 0 } },
    };
    return next;
  },
};

export const ops: Record<string, Op> = { reverse, build };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RKSettings): PseudoBlock[] {
  const keep = settings.rest !== 'reverse';
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'reverse',
        lines: [
          L(
            'sig',
            0,
            'reverseKGroup(head, k)   // copy to an array',
            'To reverse the list in groups of k, copy it to an array:',
          ),
          L('copy', 1, 'vals = the values, in order', 'Copy every value into an array.'),
          L(
            'groups',
            1,
            'for each group vals[g .. g + k − 1]',
            'Go through the array a group of k at a time:',
          ),
          L(
            'short',
            2,
            keep ? 'if it has fewer than k values: stop' : 'a last group shorter than k too',
            keep ? 'a last group shorter than k stays as it is;' : 'reverse a short last group too;',
          ),
          L('swap', 2, 'swap its ends, moving inward', 'reverse the group by swapping from both ends.'),
          L(
            'write',
            1,
            'cur = head; for each v in vals: cur.value = v; cur = cur.next',
            'Write the values back into the nodes, in order.',
          ),
          L('ret', 1, 'return head', 'The nodes are where they were, holding the new order.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'reverse',
      lines: [
        L('sig', 0, 'reverseKGroup(head, k)', 'To reverse the list in groups of k, in place:'),
        L(
          'init',
          1,
          'dummy.next = head; before = dummy',
          'Put a dummy node in front; before is the node before the next group.',
        ),
        L('loop', 1, 'while before.next != null', 'While nodes are left:'),
        L('scan0', 2, 'kth = before; count = 0', 'find the group’s last node:'),
        L('scan', 2, 'while count < k and kth.next != null', 'walk up to k nodes from before,'),
        L('scan-step', 3, 'kth = kth.next; count = count + 1', 'one at a time.'),
        L(
          'short',
          2,
          keep ? 'if count < k: break' : 'if count < k: this short last group is reversed too',
          keep
            ? 'Fewer than k nodes left: leave them as they are and stop.'
            : 'Fewer than k nodes left: reverse them too.',
        ),
        L(
          'rev-init',
          2,
          'after = kth.next; prev = after; cur = before.next; first = cur',
          'Note the node after the group; prev starts there, cur at the group’s first node.',
        ),
        L('rev-loop', 2, 'while cur != after', 'For each node of the group:'),
        L('rev-flip', 3, 'nxt = cur.next; cur.next = prev', 'save the next node and point back;'),
        L('rev-step', 3, 'prev = cur; cur = nxt', 'then move prev and cur up.'),
        L('connect', 2, 'before.next = kth', 'Link the turned-around group in after before.'),
        L(
          'next',
          2,
          'before = first',
          'The group’s old first node is now its last: the node before the next group.',
        ),
        L('ret', 1, 'return dummy.next', 'The list starts after the dummy.'),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: RKState): string {
  return `The list holds ${plural(s.nodes.length, 'node')}: head → ${arrows(values(s))}.`;
}

export function initialSay(s: RKState): string {
  return `A singly linked list of ${plural(s.nodes.length, 'node')}. Type k, such as ${START_K}, and press Reverse in groups to turn every k nodes around by moving pointers. Type values and press Build for a list of your own.`;
}

export const initialVars = (s: RKState) => ({ n: s.nodes.length });
