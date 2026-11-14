/**
 * Merging sorted linked lists by moving pointers.
 *
 * - The pattern: a dummy head and a tail pointer. Compare the two front nodes, link the smaller
 *   one after tail (a's on a tie, so equal values keep their order), and move on in that list.
 *   When one list runs out, link the rest of the other at once. No new nodes, O(1) extra space,
 *   at most m + n − 1 comparisons.
 * - k lists: merge them in pairs, round after round (A with B, C with D, then the two results),
 *   so each node takes part in about log2(k) merges. The setting switches to one at a time
 *   (A with B, then that with C, ...), where the first list's nodes take part in k − 1 merges.
 * - The naive approach (the setting) copies every value into an array, sorts it (an insertion
 *   sort, drawn comparison by comparison) and builds a new list from it.
 *
 * The drawing keeps a board: one row per list (A, B, C, D) and an out row where the merge
 * builds its result after the dummy. A node keeps its slot in its list's row until it is taken,
 * then moves to the out row, so the animation follows the node. A finished pair's result moves
 * up into the first list's row; the last result stays in the out row.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison compares two values; a link
 * writes a next field; a copy writes a value into an array cell or a new node.
 */
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
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import {
  and,
  arrows,
  makeNodes,
  MAX_VALUE,
  nid,
  order,
  plural,
  workOf,
  type Copy,
  type LNode,
} from '../_lists2/kit';

export const MAX_LISTS = 4;
export const MAX_LEN = 5;
export const MAX_TOTAL = 10;
export const START: number[][] = [
  [1, 4, 7, 9],
  [2, 3, 8],
];
/** The dummy head's uid; real nodes start at 1. */
export const DUMMY = 0;
export const NAMES = ['A', 'B', 'C', 'D'];

export type KWay = 'pairs' | 'one';

export interface MSettings {
  [key: string]: Scalar;
  approach: Approach;
  kway: KWay;
}

export const defaults: MSettings = { approach: 'pattern', kway: 'pairs' };

export interface MState {
  /** Every node in memory (during a merge, the dummy too). */
  nodes: LNode[];
  /** The head of each list, A first; null for an empty list. */
  lists: (number | null)[];
  nextUid: number;
}

/** A row of the board: the uid in each slot, or null. */
export type Slots = (number | null)[];

export interface MExtra {
  heading: string;
  /** One row per list. */
  rows: Slots[];
  /** The out row: the dummy in slot 0, then the merged nodes. Absent when not in use. */
  out?: Slots;
  /** The two rows being merged, for the a and b labels. */
  pair?: [number, number];
  /** Pointer variables: a and b (the fronts of the pair), tail, head (the result). */
  ptrs: Record<string, number | null>;
  /** The naive approach: the array of copies, and the key being inserted. */
  array?: { cells: (Copy | null)[]; lifted?: { copy: Copy; at: number } };
  /** Slots reserved in each row for the whole operation, so the camera holds still. */
  frame: { rows: number[]; out: number; array: number };
}

export type MStep = Step<MState, MExtra>;
type Op = OpSpec<MState, MSettings, MExtra>;

export function init(): MState {
  return fromLists(START, 1);
}

function fromLists(lists: readonly number[][], uid0: number): MState {
  const nodes: LNode[] = [];
  const heads: (number | null)[] = [];
  let uid = uid0;
  for (const vs of lists) {
    const made = makeNodes(vs, uid);
    nodes.push(...made);
    heads.push(made.length ? uid : null);
    uid += vs.length;
  }
  return { nodes, lists: heads, nextUid: uid };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Reading the state -----

const nodeOf = (s: MState, uid: number) => {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
};
const valOf = (s: MState, uid: number) => nodeOf(s, uid).value;
const nextOf = (s: MState, uid: number) => nodeOf(s, uid).next;
const setNext = (s: MState, uid: number, next: number | null): MState => ({
  ...s,
  nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, next } : x)),
});

/** The values of every list, A first. */
export const listValues = (s: MState) =>
  s.lists.map((h) => order(s.nodes, h).map((u) => valOf(s, u)));

/** "1 → 4 → 7 → null". */
const chainOf = (s: MState, head: number | null) =>
  arrows(order(s.nodes, head).map((u) => valOf(s, u)));

// ----- Input -----

const INT = /^\d+$/;

/** Lists separated by | or ;, each sorted, or why they cannot be read. */
export function readLists(arg: Value | undefined): number[][] | string {
  const text = String(arg ?? '').trim();
  if (!text) return 'Type some sorted lists first, such as 1 4 7 | 2 3 8.';
  const groups = text.split(/[|;]/).map((g) => g.split(/[\s,]+/).filter(Boolean));
  if (groups.length > MAX_LISTS)
    return `That is ${groups.length} lists. Use at most ${MAX_LISTS}, separated by |.`;
  const lists: number[][] = [];
  for (const [i, g] of groups.entries()) {
    const name = NAMES[i]!;
    const tokens = g.length === 1 && g[0]!.toLowerCase() === 'empty' ? [] : g;
    if (tokens.length > MAX_LEN)
      return `List ${name} has ${tokens.length} values. Use at most ${MAX_LEN} in each list.`;
    const vs: number[] = [];
    for (const t of tokens) {
      if (!INT.test(t)) return `"${t}" is not a whole number from 0 to ${MAX_VALUE}.`;
      const v = Number(t);
      if (v > MAX_VALUE) return `${t} is too big. Use whole numbers from 0 to ${MAX_VALUE}.`;
      if (vs.length && v < vs[vs.length - 1]!)
        return `List ${name} is not sorted: ${v} comes after ${vs[vs.length - 1]}. Each list must be in order, smallest first.`;
      vs.push(v);
    }
    lists.push(vs);
  }
  const total = lists.reduce((t, l) => t + l.length, 0);
  if (total > MAX_TOTAL)
    return `That is ${total} values. Use at most ${MAX_TOTAL} in all, so the merged list fits.`;
  return lists;
}

/** "1 4 7 | 2 3 8", with "empty" for an empty list. */
export const formatLists = (lists: readonly number[][]) =>
  lists.map((l) => (l.length ? l.join(' ') : 'empty')).join(' | ');

export function parseInput(token: string): Value | Error {
  const lists = readLists(token);
  return typeof lists === 'string' ? new Error(lists) : formatLists(lists);
}

// ----- The plan of pair merges -----

/** The pair merges, in order: [i, j] merges row j into row i. Each round's pairs together. */
export function plan(k: number, kway: KWay): [number, number][][] {
  const rounds: [number, number][][] = [];
  if (kway === 'one') {
    for (let j = 1; j < k; j++) rounds.push([[0, j]]);
    return rounds;
  }
  let alive = Array.from({ length: k }, (_, i) => i);
  while (alive.length > 1) {
    const round: [number, number][] = [];
    const next: number[] = [];
    for (let p = 0; p < alive.length; p += 2) {
      if (p + 1 < alive.length) round.push([alive[p]!, alive[p + 1]!]);
      next.push(alive[p]!);
    }
    rounds.push(round);
    alive = next;
  }
  return rounds;
}

/** Slots each row needs for the whole merge, and the out row's (with the dummy). */
function frameFor(lengths: number[], kway: KWay, approach: Approach) {
  const total = lengths.reduce((t, l) => t + l, 0);
  const rows = [...lengths];
  if (approach === 'pattern') {
    const len = [...lengths];
    const merges = plan(lengths.length, kway).flat();
    merges.forEach(([i, j], m) => {
      len[i] = len[i]! + len[j]!;
      len[j] = 0;
      // The last merge's result stays in the out row.
      if (m < merges.length - 1) rows[i] = Math.max(rows[i]!, len[i]!);
    });
  }
  const merges = approach === 'naive' || lengths.length > 1;
  return { rows, out: merges ? total + 1 : 0, array: approach === 'naive' ? total : 0 };
}

// ----- Steps -----

interface Board {
  s: MState;
  rows: Slots[];
  out?: Slots;
  pair?: [number, number];
  ptrs: Record<string, number | null>;
  array?: MExtra['array'];
  frame: MExtra['frame'];
  heading: string;
  work: Work;
  tot: Totals;
  page: () => Record<string, Scalar>;
}

function step(
  b: Board,
  say: string,
  lines: string[],
  o: { marks?: Mark[]; level?: 1 | 2 | 3; heading?: string } = {},
): MStep {
  return {
    state: b.s,
    marks: o.marks ?? [],
    say,
    lines,
    level: o.level ?? 2,
    vars: { ...b.page(), ...workVars(b.work, b.tot) },
    extra: {
      heading: o.heading ?? b.heading,
      rows: b.rows.map((r) => [...r]),
      ...(b.out ? { out: [...b.out] } : {}),
      ...(b.pair ? { pair: b.pair } : {}),
      ptrs: { ...b.ptrs },
      ...(b.array
        ? {
            array: {
              cells: [...b.array.cells],
              ...(b.array.lifted ? { lifted: b.array.lifted } : {}),
            },
          }
        : {}),
      frame: b.frame,
    },
  };
}

/** A row of slots for each list as it stands: the nodes in order. */
const rowsOf = (s: MState): Slots[] => s.lists.map((h) => order(s.nodes, h));

function refuse(s: MState, why: string): MStep {
  return {
    state: s,
    marks: [mark('ask', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.nodes.length },
    extra: {
      heading: 'Nothing to do',
      rows: rowsOf(s),
      ptrs: {},
      frame: { rows: rowsOf(s).map((r) => r.length), out: 0, array: 0 },
    },
  };
}

const UNITS = ['comparisons', 'links', 'copies'] as const;
const ZERO: Totals = { naive: 0, pattern: 0 };

/** "A and B", "4 lists". */
function whatHeading(k: number, kway: KWay, approach: Approach): string {
  if (k === 2) return 'Merge A and B';
  if (approach === 'naive') return `Merge ${k} lists`;
  return kway === 'one' ? `Merge ${k} lists, one at a time` : `Merge ${k} lists in pairs`;
}

/** Where a node sits on the board. */
function rowOf(rows: Slots[], uid: number): { r: number; c: number } | null {
  for (const [r, row] of rows.entries()) {
    const c = row.indexOf(uid);
    if (c >= 0) return { r, c };
  }
  return null;
}

/** The pattern: pair merges with a dummy head. */
function* pattern(s0: MState, settings: MSettings, tot: Totals): Generator<MStep, MState, void> {
  const k = s0.lists.length;
  const lengths = rowsOf(s0).map((r) => r.length);
  const total = lengths.reduce((t, l) => t + l, 0);
  const rounds = plan(k, settings.kway);
  const merges = rounds.flat();
  let a: number | null = null;
  let b: number | null = null;
  let tail: number | null = null;
  const bd: Board = {
    s: s0,
    rows: rowsOf(s0),
    ptrs: {},
    frame: frameFor(lengths, settings.kway, 'pattern'),
    heading: whatHeading(k, settings.kway, 'pattern'),
    work: new Work(UNITS),
    tot,
    page: () => ({
      a: a === null ? null : valOf(bd.s, a),
      b: b === null ? null : valOf(bd.s, b),
      tail: tail === null ? null : tail === DUMMY ? 'dummy' : valOf(bd.s, tail),
    }),
  };
  const heads = [...s0.lists];

  if (merges.length === 0) {
    bd.page = () => ({ n: total });
    yield step(
      bd,
      k === 1
        ? `There is only one list, so it is already merged: head → ${chainOf(bd.s, heads[0]!)}.`
        : 'There are no lists to merge.',
      ['sig', 'done'],
      { level: 1, heading: 'Already merged' },
    );
    return bd.s;
  }

  if (k > 2) {
    const first = rounds[0]!.map(([i, j]) => `${NAMES[i]} with ${NAMES[j]}`);
    yield step(
      bd,
      settings.kway === 'one'
        ? `Merge ${k} lists one at a time: A with B, then the result with C${k > 3 ? ', then with D' : ''}. A's nodes take part in every merge.`
        : `Merge ${k} lists in pairs. Round 1 merges ${and(first)}; then the results are merged, until one list is left.`,
      ['sig', 'round', 'pairs'],
    );
  }

  for (const [m, [i, j]] of merges.entries()) {
    const last = m === merges.length - 1;
    const round = rounds.findIndex((rd) => rd.some(([x, y]) => x === i && y === j));
    if (k > 2 && settings.kway === 'pairs' && rounds[round]![0]![0] === i && round > 0) {
      const these = rounds[round]!.map(([x, y]) => `${NAMES[x]} with ${NAMES[y]}`);
      yield step(bd, `Round ${round + 1}: merge ${and(these)}.`, ['round', 'pairs']);
    }
    // The dummy comes in.
    bd.s = { ...bd.s, nodes: [...bd.s.nodes, { uid: DUMMY, value: -1, next: null }] };
    bd.out = [DUMMY];
    bd.pair = [i, j];
    a = heads[i]!;
    b = heads[j]!;
    tail = DUMMY;
    bd.ptrs = { a, b, tail };
    const A = NAMES[i]!;
    const B = NAMES[j]!;
    const had = [order(bd.s.nodes, a).length, order(bd.s.nodes, b).length];
    yield step(
      bd,
      `merge(${A}, ${B}): a is the front of ${A} (${a === null ? 'null' : valOf(bd.s, a)}), b the front of ${B} (${b === null ? 'null' : valOf(bd.s, b)}). The dummy node is a fake head, so the first node is linked like every other: tail starts on it.`,
      ['msig', 'init'],
      { marks: [mark(nid(DUMMY), 'new'), mark('p:tail', 'active')] },
    );
    while (a !== null && b !== null) {
      const va = valOf(bd.s, a);
      const vb = valOf(bd.s, b);
      const fromA = va <= vb;
      const x: number = fromA ? a : b;
      bd.work.add('comparisons');
      bd.s = setNext(bd.s, tail!, x);
      bd.work.add('links');
      const at = rowOf(bd.rows, x)!;
      bd.rows[at.r]![at.c] = null;
      bd.out!.push(x);
      if (fromA) a = nextOf(bd.s, x);
      else b = nextOf(bd.s, x);
      const was = tail!;
      tail = x;
      bd.ptrs = { a, b, tail };
      const cmp = va < vb ? `${va} < ${vb}` : va === vb ? `${va} = ${vb}` : `${va} > ${vb}`;
      const tie = va === vb ? ' On a tie take from a, so equal values keep their order.' : '';
      yield step(
        bd,
        `${cmp}: take ${valOf(bd.s, x)} from ${fromA ? A : B}.${tie} ${was === DUMMY ? 'dummy' : valOf(bd.s, was)}.next = ${valOf(bd.s, x)}, ${fromA ? 'a' : 'b'} moves to ${fromA ? (a === null ? 'null' : valOf(bd.s, a)) : b === null ? 'null' : valOf(bd.s, b)}, and tail moves onto ${valOf(bd.s, x)}.`,
        ['loop', 'cmp', fromA ? 'takeA' : 'takeB', 'adv'],
        {
          marks: [
            mark(nid(x), 'new'),
            mark(`${nid(was)}.next`, 'active'),
            mark(fromA ? 'p:a' : 'p:b', 'active'),
          ],
        },
      );
    }
    const rest: number | null = a ?? b;
    bd.s = setNext(bd.s, tail!, rest);
    bd.work.add('links');
    const empty = a === null ? A : B;
    const other = a === null ? B : A;
    const gone = (a === null ? had[0] : had[1])! > 0 ? 'is used up' : 'is empty';
    yield step(
      bd,
      rest === null
        ? had[0]! + had[1]! === 0
          ? 'Both lists are empty, so tail.next = null and the result is empty.'
          : 'Both lists are used up: tail.next = null.'
        : `${empty} ${gone} (${a === null ? 'a' : 'b'} is null). The rest of ${other} is already in order, so link it at once: tail.next = ${valOf(bd.s, rest)}. No more comparisons.`,
      ['loop', 'rest'],
      { marks: [mark(`${nid(tail!)}.next`, 'active')] },
    );
    // The rest joins the out row, then the result leaves the dummy behind.
    for (const u of order(bd.s.nodes, rest)) {
      const at = rowOf(bd.rows, u);
      if (at) bd.rows[at.r]![at.c] = null;
      bd.out!.push(u);
    }
    const head = nextOf(bd.s, DUMMY);
    bd.s = { ...bd.s, nodes: bd.s.nodes.filter((x) => x.uid !== DUMMY) };
    heads[i] = head;
    heads[j] = null;
    const merged = order(bd.s.nodes, head);
    a = null;
    b = null;
    tail = null;
    bd.pair = undefined;
    if (!last) {
      bd.out = undefined;
      bd.rows[i] = merged;
      bd.rows[j] = [];
      bd.ptrs = {};
      bd.s = { ...bd.s, lists: [...heads] };
      yield step(
        bd,
        `return dummy.next: ${A} now holds ${A} and ${B} merged, head → ${chainOf(bd.s, head)}. ${B} is empty.`,
        ['ret'],
        { marks: merged.map((u) => mark(nid(u), 'done')) },
      );
      continue;
    }
    // The last merge: the end state is one list.
    bd.out![0] = null;
    bd.rows = bd.rows.map(() => []);
    bd.ptrs = { head };
    const end: MState = {
      nodes: merged.map((u) => nodeOf(bd.s, u)),
      lists: [head],
      nextUid: bd.s.nextUid,
    };
    bd.s = end;
    bd.page = () => ({ n: total });
    const c = bd.work.get('comparisons');
    yield step(
      bd,
      `return dummy.next: head → ${chainOf(end, head)}. ${c === 1 ? '1 comparison' : `${c} comparisons`} and ${plural(bd.work.get('links'), 'link')}: the nodes were relinked in place, with no new nodes and no copies. Copying to an array and sorting it costs ${tot.naive}.`,
      ['ret', ...(k > 2 ? ['done'] : [])],
      {
        level: 1,
        marks: [mark('p:head', 'found')],
        heading: `Merged: ${plural(total, 'node')}`,
      },
    );
    return end;
  }
  return bd.s;
}

/** The naive approach: copy every value into an array, sort it, build a new list. */
function* naive(s0: MState, settings: MSettings, tot: Totals): Generator<MStep, MState, void> {
  const k = s0.lists.length;
  const lengths = rowsOf(s0).map((r) => r.length);
  const total = lengths.reduce((t, l) => t + l, 0);
  const cells: (Copy | null)[] = Array(total).fill(null);
  let iVar: number | null = null;
  let key: number | null = null;
  const bd: Board = {
    s: s0,
    rows: rowsOf(s0),
    ptrs: {},
    array: { cells },
    frame: frameFor(lengths, settings.kway, 'naive'),
    heading: whatHeading(k, settings.kway, 'naive'),
    work: new Work(UNITS),
    tot,
    page: () => ({ i: iVar, key }),
  };
  yield step(
    bd,
    `The naive way ignores that the lists are sorted: copy all ${plural(total, 'value')} into an array, vals, sort it, and build a new list from it.`,
    ['sig'],
  );
  // 1. Copy.
  let n = 0;
  for (const [r, head] of s0.lists.entries()) {
    for (const u of order(s0.nodes, head)) {
      cells[n] = { uid: u, value: valOf(s0, u) };
      n++;
      bd.work.add('copies');
      yield step(bd, `Copy ${valOf(s0, u)} from ${NAMES[r]} into vals[${n - 1}].`, ['copy'], {
        marks: [mark(`cp-${u}`, 'new')],
      });
    }
  }
  // 2. Insertion sort, one comparison per step.
  if (total > 1)
    yield step(
      bd,
      'Now sort vals by insertion: take each value in turn and shift the bigger ones before it one cell right, until its place opens up.',
      ['sort'],
    );
  for (let i = 1; i < total; i++) {
    iVar = i;
    const held = cells[i]!;
    key = held.value;
    cells[i] = null;
    let j = i - 1;
    for (;;) {
      const there = cells[j]!;
      bd.work.add('comparisons');
      if (there.value > held.value) {
        cells[j + 1] = there;
        cells[j] = null;
        bd.work.add('copies');
        j--;
        const placed = j < 0;
        if (placed) {
          cells[0] = held;
          bd.work.add('copies');
        }
        bd.array!.lifted = placed ? undefined : { copy: held, at: j + 1 };
        yield step(
          bd,
          `${there.value} > ${held.value}: shift ${there.value} one cell right.${placed ? ` That was the front: ${held.value} goes in vals[0].` : ''}`,
          placed ? ['cmp', 'shift', 'place'] : ['cmp', 'shift'],
          { marks: [mark(`cp-${there.uid}`, 'compare'), mark(`cp-${held.uid}`, 'active')] },
        );
        if (placed) break;
        continue;
      }
      cells[j + 1] = held;
      bd.work.add('copies');
      bd.array!.lifted = undefined;
      yield step(
        bd,
        j + 1 === i
          ? `${there.value} ≤ ${held.value}: ${held.value} is already in place.`
          : `${there.value} ≤ ${held.value}: stop shifting. ${held.value} goes in vals[${j + 1}].`,
        ['cmp', 'place'],
        { marks: [mark(`cp-${there.uid}`, 'compare'), mark(`cp-${held.uid}`, 'active')] },
      );
      break;
    }
  }
  iVar = null;
  key = null;
  // 3. Build a new list.
  const uid0 = s0.nextUid;
  bd.s = { ...bd.s, nodes: [...bd.s.nodes, { uid: DUMMY, value: -1, next: null }] };
  bd.out = [DUMMY];
  let tail = DUMMY;
  bd.ptrs = { tail };
  bd.page = () => ({ tail: tail === DUMMY ? 'dummy' : valOf(bd.s, tail) });
  yield step(
    bd,
    'vals is sorted. Build a new list from it: a dummy head, and tail on it.',
    ['binit'],
    { marks: [mark(nid(DUMMY), 'new')] },
  );
  for (let t = 0; t < total; t++) {
    const u = uid0 + t;
    const v = cells[t]!.value;
    bd.s = setNext(
      { ...bd.s, nodes: [...bd.s.nodes, { uid: u, value: v, next: null }], nextUid: u + 1 },
      tail,
      u,
    );
    bd.out.push(u);
    bd.work.add('copies');
    bd.work.add('links');
    tail = u;
    bd.ptrs = { tail };
    yield step(
      bd,
      `A new node for vals[${t}] = ${v}, linked after tail; tail moves onto it.`,
      ['bloop', 'build'],
      {
        marks: [mark(nid(u), 'new'), mark(`cp-${cells[t]!.uid}`, 'active')],
      },
    );
  }
  const head = total ? uid0 : null;
  const made = order(bd.s.nodes, head);
  const end: MState = {
    nodes: made.map((u) => nodeOf(bd.s, u)),
    lists: [head],
    nextUid: uid0 + total,
  };
  bd.s = end;
  bd.rows = bd.rows.map(() => []);
  bd.out = bd.out.map((u) => (u === DUMMY ? null : u));
  bd.ptrs = { head };
  bd.page = () => ({ n: total });
  yield step(
    bd,
    total
      ? `return dummy.next: head → ${chainOf(end, head)}. The old nodes are thrown away. ${bd.work.tally()}, an array of ${plural(total, 'cell')} and ${plural(total, 'new node')}. Relinking with a dummy head costs ${tot.pattern}.`
      : 'Every list was empty, so the result is empty too.',
    ['ret'],
    { level: 1, marks: [mark('p:head', 'found')], heading: `Merged: ${plural(total, 'node')}` },
  );
  return end;
}

const merge: Op = {
  label: 'Merge',
  arity: 0,
  *run(s, _args, { settings }) {
    const run = (a: Approach, tot: Totals) =>
      a === 'naive' ? naive(s, settings, tot) : pattern(s, settings, tot);
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
    const lists = readLists(arg);
    if (typeof lists === 'string') {
      yield refuse(s, `${lists} The lists stay as they were.`);
      return s;
    }
    const next = fromLists(lists, s.nextUid);
    const rows = rowsOf(next);
    yield {
      state: next,
      marks: [],
      say: `Built ${plural(lists.length, 'sorted list')}: ${lists.map((l, i) => `${NAMES[i]} = ${l.length ? l.join(' ') : 'empty'}`).join(', ')}. Press Merge.`,
      lines: [],
      level: 1,
      vars: { k: lists.length, n: next.nodes.length },
      extra: {
        heading: '',
        rows,
        ptrs: {},
        frame: { rows: rows.map((r) => r.length), out: 0, array: 0 },
      },
    };
    return next;
  },
};

export const ops: Record<string, Op> = { merge, build };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'merge',
        lines: [
          L(
            'sig',
            0,
            'mergeAll(lists)   // copy, sort, rebuild',
            'To merge sorted lists without using that they are sorted:',
          ),
          L('copy', 1, 'vals = every value of every list', 'Copy every value into an array.'),
          L(
            'sort',
            1,
            'for i = 1 to length(vals) − 1: key = vals[i]; j = i − 1',
            'Sort it by insertion: lift out each value in turn,',
          ),
          L(
            'cmp',
            2,
            'while j ≥ 0 and vals[j] > key',
            'and while the value before the gap is bigger,',
          ),
          L('shift', 3, 'vals[j + 1] = vals[j]; j = j − 1', 'shift it one cell right;'),
          L('place', 2, 'vals[j + 1] = key', 'then put the value in the gap.'),
          L('binit', 1, 'dummy = new node; tail = dummy', 'Build a new list after a dummy head:'),
          L('bloop', 1, 'for each v in vals', 'for each value, in order,'),
          L(
            'build',
            2,
            'tail.next = new node(v); tail = tail.next',
            'make a node for it and link it at the end.',
          ),
          L('ret', 1, 'return dummy.next', 'The list after the dummy is the result.'),
        ],
      },
    ];
  }
  const one = settings.kway === 'one';
  return [
    {
      op: 'merge',
      lines: [
        L('sig', 0, 'mergeAll(lists)', 'To merge k sorted lists:'),
        L(
          'round',
          1,
          one ? 'for i = 2 to k' : 'while more than one list is left',
          one ? 'Take the other lists one at a time:' : 'Until one list is left:',
        ),
        L(
          'pairs',
          2,
          one
            ? 'lists[1] = merge(lists[1], lists[i])'
            : 'merge them in pairs: 1 with 2, 3 with 4, …',
          one
            ? 'merge the next one into the first list.'
            : 'merge them two at a time; an odd one out waits for the next round.',
        ),
        L('done', 1, 'return lists[1]', 'The one list left is the answer.'),
        L('msig', 0, 'merge(a, b)', 'To merge two sorted lists a and b:'),
        L(
          'init',
          1,
          'dummy = new node; tail = dummy',
          'Start the result with a dummy head; tail is its last node.',
        ),
        L('loop', 1, 'while a != null and b != null', 'While both lists have nodes left:'),
        L('cmp', 2, 'if a.value <= b.value', 'if the front of a is not bigger,'),
        L('takeA', 3, 'tail.next = a; a = a.next', 'link it after tail and move on in a;'),
        L('takeB', 2, 'else: tail.next = b; b = b.next', 'otherwise do the same with b.'),
        L('adv', 2, 'tail = tail.next', 'The node just linked is the new tail.'),
        L(
          'rest',
          1,
          'tail.next = (a != null) ? a : b',
          'One list is used up: link the rest of the other, already in order.',
        ),
        L('ret', 1, 'return dummy.next', 'The result starts after the dummy.'),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: MState): string {
  return `${plural(s.lists.length, 'sorted list')}: ${listValues(s)
    .map((l, i) => `${NAMES[i]} = ${l.length ? l.join(', ') : 'empty'}`)
    .join('; ')}.`;
}

export function initialSay(s: MState): string {
  return `${plural(s.lists.length, 'sorted linked list')}, A and B. Press Merge to make one sorted list from their nodes. Type up to ${MAX_LISTS} lists separated by |, such as 1 5 | 2 3 | 4, and press Build for your own.`;
}

export const initialVars = (s: MState) => ({ k: s.lists.length, n: s.nodes.length });
