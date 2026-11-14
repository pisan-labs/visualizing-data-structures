/**
 * K-way merge: k sorted lists into one sorted list, three ways, counting comparisons.
 *
 * - The pattern: a min-heap of the lists' heads (each list's smallest value not yet taken). The
 *   root is the smallest value left anywhere; it goes out, and its list's next value takes the
 *   root's place and sinks (or, when that list is used up, the heap's last value does). Each of
 *   the n values costs a sift in a heap of at most k: O(n log k).
 * - Merging in pairs, round by round: list 1 with list 2, list 3 with list 4..., then the results
 *   the same way. Every round touches every value once and there are ⌈log₂ k⌉ rounds: also
 *   O(n log k), with no heap, but with a new list per merge.
 * - The naive way: put everything in one array and sort it (merge sort, bottom up), as if the
 *   lists were not sorted: O(n log n).
 *
 * Equal values go out in list order in all three: the heap breaks ties by list number, and the
 * merges take the left list's value first.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: one counter, comparisons (two values compared).
 * `naive total`, `pattern total` and `pairs total` are what each way costs on these lists.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { approachOf, Work, workVars, type Totals } from '../_patterns/kit';
import { mark, value } from '../_heaps2/draw';
import { CountingHeap, type HItem } from '../_heaps2/heap';
import { mergeSort, type MergeEvent, type Rows } from '../_heaps2/merge-sort';
import { and, plural, siftSay } from '../_heaps2/say';

export const MAX_LISTS = 5;
export const MAX_LEN = 5;
export const MAX_TOTAL = 12;
export const MAX_VALUE = 99;

export const START = [
  [1, 8, 12],
  [3, 4, 10, 15],
  [2, 9, 11],
];

export type Method = 'pattern' | 'naive' | 'pairs';

export interface MergeSettings {
  [key: string]: Scalar;
  approach: Method;
}

export const defaults: MergeSettings = { approach: 'pattern' };

export const methodOf = (s: { approach?: Scalar }): Method =>
  s.approach === 'pairs' ? 'pairs' : approachOf(s as MergeSettings);

export interface MergeState {
  /** The sorted lists; an item's `src` is its list's index. */
  lists: HItem[][];
  nextUid: number;
}

export interface MergeExtra {
  /** The lists as they stand: taken values are gone (null), so slots keep their places. */
  rows?: (HItem | null)[][];
  /** The heap of heads. */
  heap?: HItem[];
  /** What has gone out so far, in order. */
  out?: HItem[];
  /** The sort: its two rows. */
  sort?: Rows;
  merge?: { lo: number; mid: number; hi: number; from: 0 | 1 };
  /** Merging in pairs: the two rows being merged and the round. */
  pair?: [number, number];
  round?: number;
  /** Frame: values in all, and the longest row. */
  n: number;
}

export type MergeStep = Step<MergeState, MergeExtra>;
type Op = OpSpec<MergeState, MergeSettings, MergeExtra>;
type Gen = Generator<MergeStep, MergeState, void>;

export function makeState(lists: readonly number[][], first = 1): MergeState {
  let uid = first;
  return {
    lists: lists.map((l, j) => l.map((key) => ({ uid: uid++, key, tie: j, src: j }))),
    nextUid: uid,
  };
}

export const init = (): MergeState => makeState(START);

export const keysOf = (xs: readonly (HItem | null)[]) =>
  xs.filter((x): x is HItem => x !== null).map((x) => x.key);

/** "L2" for list index 1. */
export const listName = (j: number) => `L${j + 1}`;

// ----- Input -----

/** Read "1 8 12 | 3 4 10 | 2 9" (lists split by |, ; or /), or say what is wrong. */
export function readLists(text: string): number[][] | string {
  const parts = text
    .split(/[|;/]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'Type some sorted lists, split by |, such as 1 8 12 | 3 4 10 | 2 9.';
  if (parts.length > MAX_LISTS)
    return `That is ${parts.length} lists. Use at most ${MAX_LISTS}, so the heap stays readable.`;
  const lists: number[][] = [];
  let total = 0;
  for (const [j, part] of parts.entries()) {
    const tokens = part.split(/[\s,]+/).filter(Boolean);
    if (tokens.length > MAX_LEN)
      return `List ${j + 1} has ${tokens.length} values. Use at most ${MAX_LEN} per list.`;
    const list: number[] = [];
    for (const t of tokens) {
      if (!/^-?\d+$/.test(t)) return `"${t}" is not a whole number.`;
      const v = Number(t) === 0 ? 0 : Number(t);
      if (v < 0 || v > MAX_VALUE)
        return `${t} is out of range. Use whole numbers from 0 to ${MAX_VALUE}.`;
      if (list.length && v < list[list.length - 1]!)
        return `List ${j + 1} is not sorted: ${v} comes after ${list[list.length - 1]}. Each list must be sorted, smallest first.`;
      list.push(v);
    }
    total += list.length;
    lists.push(list);
  }
  if (total > MAX_TOTAL)
    return `That is ${total} values in all. Use at most ${MAX_TOTAL}, so the merged list fits.`;
  return lists;
}

export const formatLists = (lists: readonly (readonly number[])[]) =>
  lists.map((l) => l.join(' ')).join(' | ');

/** For the input box: lists, kept as text in a standard form. */
export function parseInput(token: string): Value | Error {
  const lists = readLists(token);
  return typeof lists === 'string' ? new Error(lists) : formatLists(lists);
}

// ----- What each way costs -----

export function heapCost(lists: readonly (readonly number[])[]): number {
  const h = new CountingHeap('min');
  const at = lists.map(() => 0);
  let uid = 0;
  lists.forEach((l, j) => {
    if (l.length) h.push({ uid: uid++, key: l[0]!, tie: j, src: j });
  });
  while (h.size) {
    const j = h.top()!.src!;
    at[j]!++;
    if (at[j]! < lists[j]!.length) h.replaceTop({ uid: uid++, key: lists[j]![at[j]!]!, tie: j, src: j });
    else h.pop();
  }
  return h.comparisons;
}

/** Merge two sorted lists, left first on ties; returns the list and the comparisons. */
function merge2(a: readonly number[], b: readonly number[]): [number[], number] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  let c = 0;
  while (i < a.length && j < b.length) {
    c++;
    out.push(a[i]! <= b[j]! ? a[i++]! : b[j++]!);
  }
  return [[...out, ...a.slice(i), ...b.slice(j)], c];
}

export function pairsCost(lists: readonly (readonly number[])[]): number {
  let cur = lists.map((l) => [...l]);
  let c = 0;
  while (cur.length > 1) {
    const next: number[][] = [];
    for (let t = 0; t < cur.length; t += 2) {
      if (t + 1 >= cur.length) next.push(cur[t]!);
      else {
        const [m, cc] = merge2(cur[t]!, cur[t + 1]!);
        c += cc;
        next.push(m);
      }
    }
    cur = next;
  }
  return c;
}

export const sortCost = (lists: readonly (readonly number[])[]): number =>
  mergeSort(
    lists.flat().map((key, uid) => ({ uid, key })),
    'asc',
  ).comparisons;

export interface AllTotals extends Totals {
  pairs: number;
}

export const totals = (lists: readonly (readonly number[])[]): AllTotals => ({
  naive: sortCost(lists),
  pattern: heapCost(lists),
  pairs: pairsCost(lists),
});

// ----- Steps -----

function refuse(s: MergeState, why: string): MergeStep {
  return {
    state: s,
    marks: [mark('l0-name', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { k: s.lists.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const lists = readLists(String(arg ?? ''));
    if (typeof lists === 'string') {
      yield refuse(s, `${lists} The lists stay as they were.`);
      return s;
    }
    const next = makeState(lists, s.nextUid);
    const n = lists.flat().length;
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(lists.length, 'sorted list')}, ${plural(n, 'value')} in all: ${lists
        .map((l, j) => `${listName(j)} = ${l.length ? l.join(' ') : 'empty'}`)
        .join('; ')}. Press Merge.`,
      lines: [],
      level: 1,
      vars: { k: lists.length, n },
    };
    return next;
  },
};

interface Ctx {
  s: MergeState;
  n: number;
  k: number;
  work: Work;
  tot: AllTotals;
  others: string;
}

function varsOf(c: Ctx, own: Record<string, Scalar>): Record<string, Scalar> {
  return { k: c.k, n: c.n, ...own, ...workVars(c.work, c.tot), 'pairs total': c.tot.pairs };
}

const startRows = (s: MergeState): (HItem | null)[][] => s.lists.map((l) => [...l]);

/** The pattern: a min-heap of the lists' heads. */
function* pattern(c: Ctx): Gen {
  const { s, k, n } = c;
  const rows = startRows(s);
  const next = s.lists.map(() => 0);
  const h = new CountingHeap('min');
  const out: HItem[] = [];
  const sync = (count: number) => {
    const d = count - c.work.get('comparisons');
    if (d) c.work.add('comparisons', d);
  };
  const step = (
    say: string,
    lines: string[],
    marks: Mark[],
    heap: readonly HItem[],
    level: 1 | 2 = 2,
    own: Record<string, Scalar> = {},
  ): MergeStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: varsOf(c, { out: out.length, root: heap[0]?.key ?? null, ...own }),
    extra: { rows: rows.map((r) => [...r]), heap: [...heap], out: [...out], n },
  });
  const from = (x: HItem) => `${x.key} from ${listName(x.src!)}`;

  yield step(
    `Merge ${plural(k, 'sorted list')}, ${plural(n, 'value')} in all. A min-heap holds each list’s head, its smallest value not yet taken, so the root is always the smallest value left anywhere.`,
    ['init'],
    [],
    [],
  );

  for (let j = 0; j < k; j++) {
    const head = s.lists[j]![0];
    if (!head) continue;
    rows[j]![0] = null;
    next[j] = 1;
    const placed = [...h.items, head];
    const events = h.push(head);
    yield step(
      placed.length === 1
        ? `${listName(j)}’s head, ${head.key}, goes into the empty heap: it is the root.`
        : `${listName(j)}’s head, ${head.key}, goes in at the end of the heap.`,
      ['init'],
      [value(head, 'new')],
      placed,
    );
    for (const ev of events) {
      sync(ev.comparisons);
      yield step(
        siftSay(ev, 'min', 'its list comes first'),
        ['init'],
        [value(ev.challenger, 'active'), value(ev.holder, 'compare')],
        ev.items,
      );
    }
  }

  while (h.size) {
    const root = h.top()!;
    const j = root.src!;
    out.push(root);
    const nxt = s.lists[j]![next[j]!];
    if (nxt) {
      rows[j]![next[j]!] = null;
      next[j]!++;
      const replaced = [nxt, ...h.items.slice(1)];
      const events = h.replaceTop(nxt);
      yield step(
        `The root, ${from(root)}, is the smallest value left: it goes out. ${listName(j)}’s next value, ${nxt.key}, takes its place at the root.`,
        ['loop', 'pop', 'next'],
        [value(root, 'found'), value(nxt, 'new')],
        replaced,
      );
      for (const ev of events) {
        sync(ev.comparisons);
        yield step(
          siftSay(ev, 'min', 'its list comes first'),
          ['next'],
          [value(ev.moving, 'active'), value(ev.challenger, 'compare')],
          ev.items,
        );
      }
      continue;
    }
    const rest = h.items.slice(1);
    const last = rest.at(-1);
    const moved = last ? [last, ...rest.slice(0, -1)] : [];
    const { events } = h.pop();
    yield step(
      `The root, ${from(root)}, is the smallest value left: it goes out. ${listName(j)} is used up${
        last
          ? `, so the heap’s last value, ${from(last)}, moves to the root.`
          : `, and so is the heap.`
      }`,
      ['loop', 'pop', 'empty'],
      [value(root, 'found'), ...(last ? [value(last, 'active')] : [])],
      moved,
    );
    for (const ev of events) {
      sync(ev.comparisons);
      yield step(
        siftSay(ev, 'min', 'its list comes first'),
        ['empty'],
        [value(ev.moving, 'active'), value(ev.challenger, 'compare')],
        ev.items,
      );
    }
  }

  yield {
    ...step(
      `Done: ${keysOf(out).join(' ')}. The heap never held more than ${plural(k, 'value')}. ${cap(c.work.tally())}; ${c.others}.`,
      ['ret'],
      out.map((x) => value(x, 'found')),
      [],
      1,
      { merged: keysOf(out).join(' ') },
    ),
  };
  return s;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The naive way: one array, sorted. */
function* naive(c: Ctx): Gen {
  const { s, n, k } = c;
  const all = s.lists.flat();
  const run = mergeSort(all, 'asc');
  const empty = s.lists.map(() => [] as (HItem | null)[]);
  const extra = (rows: Rows, e: MergeEvent | null): MergeExtra => ({
    rows: empty,
    sort: [[...rows[0]], [...rows[1]]],
    ...(e && (e.kind === 'take' || e.kind === 'rest')
      ? { merge: { lo: e.lo, mid: e.mid, hi: e.hi, from: e.from } }
      : {}),
    n,
  });
  const vars = (w: number, own: Record<string, Scalar> = {}) => varsOf(c, { width: w, ...own });
  const name = (row: 0 | 1) => (row === 0 ? 'A' : 'B');
  const start: Rows = [[...all], Array<HItem | null>(n).fill(null)];

  yield {
    state: s,
    marks: all.map((x) => value(x, 'new')),
    say: `Merge ${plural(k, 'sorted list')} the obvious way: put all ${plural(n, 'value')} in one array A, list after list, and sort it, as if the lists were not sorted. Merge sort, bottom up.`,
    lines: ['sig', 'concat'],
    level: 2,
    vars: vars(0),
    extra: extra(start, null),
  };

  for (const e of run.events) {
    const src = name(e.from);
    const dst = name(e.from === 0 ? 1 : 0);
    if (e.kind === 'pass') {
      yield {
        state: s,
        marks: [],
        say:
          e.width === 1
            ? `Pass ${e.pass}: every value on its own is a sorted run of 1. Merge neighboring runs from ${src} into ${dst}.`
            : `Pass ${e.pass}: ${src} holds sorted runs of ${e.width}. Merge each neighboring pair into one run of ${2 * e.width} in ${dst}.`,
        lines: ['pass'],
        level: 2,
        vars: vars(e.width),
        extra: extra(e.rows, e),
      };
    } else if (e.kind === 'take') {
      c.work.add('comparisons');
      yield {
        state: s,
        marks: [value(e.taken, 'active'), value(e.other, 'compare')],
        say: `Compare the heads of the two runs, ${e.taken.key} and ${e.other.key}: ${
          e.taken.key === e.other.key ? `equal, so the left one, ${e.taken.key}` : `${e.taken.key} is smaller, so it`
        } goes to ${dst}[${e.dest}].`,
        lines: ['merge', 'take'],
        level: 2,
        vars: vars(e.width),
        extra: extra(e.rows, e),
      };
    } else {
      const vs = e.moved.map((x) => x.key);
      yield {
        state: s,
        marks: e.moved.map((x) => value(x, 'new')),
        say:
          e.kind === 'alone'
            ? `${and(vs)} ${vs.length === 1 ? 'has' : 'have'} no run to merge with this pass, so ${vs.length === 1 ? 'it moves' : 'they move'} to ${dst} as ${vs.length === 1 ? 'it is' : 'they are'}.`
            : `The ${e.side === 'left' ? 'right' : 'left'} run is used up, so ${and(vs)} ${vs.length === 1 ? 'follows' : 'follow'} with no comparison.`,
        lines: e.kind === 'alone' ? ['merge'] : ['rest'],
        level: 3,
        vars: vars(e.width),
        extra: extra(e.rows, e),
      };
    }
  }
  const last = run.events.at(-1);
  const merged = keysOf(run.sorted).join(' ');
  yield {
    state: s,
    marks: run.sorted.map((x) => value(x, 'found')),
    say: `Done: ${merged}. ${cap(c.work.tally())}, and none of them used the fact that the lists were sorted; ${c.others}.`,
    lines: ['ret'],
    level: 1,
    vars: vars(last?.width ?? 0, { merged }),
    extra: extra(last ? last.rows : start, null),
  };
  return s;
}

/** Merging in pairs, round by round. */
function* pairs(c: Ctx): Gen {
  const { s, n, k } = c;
  // Row j holds a list, or nothing once it has been merged into another row.
  const rows: (HItem | null)[][] = startRows(s);
  let out: HItem[] = [];
  let round = 0;
  let pair: [number, number] | undefined;
  const step = (
    say: string,
    lines: string[],
    marks: Mark[],
    level: 1 | 2 | 3 = 2,
    own: Record<string, Scalar> = {},
  ): MergeStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: varsOf(c, { round, ...own }),
    extra: { rows: rows.map((r) => [...r]), out: [...out], n, round, ...(pair ? { pair } : {}) },
  });
  // Rows that still hold a list (after the last merge, none do: it is all in out).
  const live = () => rows.flatMap((r, j) => (r.some((x) => x !== null) ? [j] : []));

  yield step(
    `Merge ${plural(k, 'sorted list')} two at a time: ${listName(0)} with ${listName(1)}${k > 3 ? `, ${listName(2)} with ${listName(3)}` : ''}${k > 2 ? ' and so on' : ''}. Then merge the results the same way, round after round, until one list is left.`,
    ['sig'],
    [],
  );

  while (live().length > 1) {
    round++;
    const ls = live();
    const pairs: [number, number][] = [];
    for (let t = 0; t + 1 < ls.length; t += 2) pairs.push([ls[t]!, ls[t + 1]!]);
    const alone = ls.length % 2 ? ls[ls.length - 1] : undefined;
    pair = undefined;
    yield step(
      `Round ${round}: ${plural(ls.length, 'list')} left. Merge ${and(pairs.map(([a, b]) => `${listName(a)} with ${listName(b)}`))}${
        alone !== undefined ? `; ${listName(alone)} has no partner and waits` : ''
      }.`,
      ['round', 'pair'],
      [],
    );
    for (const [a, b] of pairs) {
      pair = [a, b];
      const final = live().length === 2;
      out = [];
      const ra = rows[a]!;
      const rb = rows[b]!;
      let i = 0;
      let j = 0;
      while (i < ra.length && j < rb.length) {
        const x = ra[i]!;
        const y = rb[j]!;
        c.work.add('comparisons');
        const left = x.key <= y.key;
        const taken = left ? x : y;
        if (left) ra[i++] = null;
        else rb[j++] = null;
        out.push(taken);
        yield step(
          `Compare the heads of ${listName(a)} and ${listName(b)}, ${x.key} and ${y.key}: ${
            x.key === y.key ? `equal, so ${listName(a)}’s ${x.key}` : `${taken.key} is smaller, so it`
          } goes next.`,
          ['pair', 'take'],
          [value(taken, 'active'), value(left ? y : x, 'compare')],
        );
      }
      const rest = [...ra.slice(i), ...rb.slice(j)].filter((x): x is HItem => x !== null);
      if (rest.length) {
        const usedUp = i >= ra.length ? a : b;
        for (let t = i; t < ra.length; t++) ra[t] = null;
        for (let t = j; t < rb.length; t++) rb[t] = null;
        out.push(...rest);
        yield step(
          `${listName(usedUp)} is used up, so ${and(rest.map((x) => x.key))} ${rest.length === 1 ? 'follows' : 'follow'} with no comparison.`,
          ['rest'],
          rest.map((x) => value(x, 'new')),
          3,
        );
      }
      if (final) break;
      // The merged list takes the first row of the pair; the second row is gone.
      rows[a] = [...out];
      rows[b] = [];
      const merged = out;
      out = [];
      yield step(
        `${listName(a)} and ${listName(b)} are now one sorted list of ${merged.length}, in ${listName(a)}’s row.`,
        ['pair'],
        merged.map((x) => value(x, 'new')),
        3,
      );
    }
  }

  pair = undefined;
  if (out.length === 0) {
    // One list from the start (or one left with values): it is the answer as it is.
    const j = live()[0];
    if (j !== undefined) {
      out = rows[j]!.filter((x): x is HItem => x !== null);
      rows[j] = [];
    }
  }
  const merged = keysOf(out).join(' ');
  yield step(
    `Done: ${merged || 'nothing to merge'}. ${round === 0 ? 'One list needs no merging. ' : `${plural(round, 'round')}. `}${cap(c.work.tally())}; ${c.others}.`,
    ['ret'],
    out.map((x) => value(x, 'found')),
    1,
    { merged },
  );
  return s;
}

const mergeOp: Op = {
  label: 'Merge',
  arity: 0,
  *run(s, _args, { settings }) {
    const lists = s.lists.map((l) => l.map((x) => x.key));
    const n = lists.flat().length;
    const tot = totals(lists);
    const method = methodOf(settings);
    const others =
      method === 'pattern'
        ? `concatenating and sorting takes ${tot.naive}, merging in pairs ${tot.pairs}`
        : method === 'naive'
          ? `a heap of heads takes ${tot.pattern}, merging in pairs ${tot.pairs}`
          : `a heap of heads takes ${tot.pattern}, concatenating and sorting ${tot.naive}`;
    const c: Ctx = { s, n, k: s.lists.length, work: new Work(['comparisons']), tot, others };
    if (n === 0) {
      yield {
        state: s,
        marks: [],
        say: 'Nothing to merge: every list is empty.',
        lines: ['ret'],
        level: 1,
        vars: varsOf(c, { merged: '' }),
      };
      return s;
    }
    if (method === 'naive') return yield* naive(c);
    if (method === 'pairs') return yield* pairs(c);
    return yield* pattern(c);
  },
};

export const ops: Record<string, Op> = { merge: mergeOp, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MergeSettings): PseudoBlock[] {
  const method = methodOf(settings);
  if (method === 'naive')
    return [
      {
        op: 'merge',
        lines: [
          L('sig', 0, 'merge(L1, …, Lk)   // concatenate and sort', 'To merge k sorted lists the obvious way:'),
          L('concat', 1, 'A = L1 + L2 + … + Lk', 'put all the values in one array, list after list;'),
          L('pass', 1, 'for w = 1, 2, 4, … while w < n', 'merge sort it, bottom up: runs of length w,'),
          L(
            'merge',
            2,
            'merge each pair of runs of w into a run of 2w',
            'merge each pair of neighboring runs into one run twice as long,',
          ),
          L('take', 3, 'move the smaller head; repeat', 'by moving the smaller of the two front values, again and again;'),
          L('rest', 3, 'move the rest of the other run', 'when one run is used up, the rest of the other follows.'),
          L('ret', 1, 'return A, sorted', 'The sorted array is the merged list.'),
        ],
      },
    ];
  if (method === 'pairs')
    return [
      {
        op: 'merge',
        lines: [
          L('sig', 0, 'merge(L1, …, Lk)   // in pairs, round by round', 'To merge k sorted lists two at a time:'),
          L('round', 1, 'while more than one list is left', 'while more than one list is left,'),
          L(
            'pair',
            2,
            'merge L1 with L2, L3 with L4, …',
            'merge them in pairs, each pair into one list (a list with no partner waits);',
          ),
          L('take', 3, 'move the smaller head; repeat', 'by moving the smaller of the two front values, again and again;'),
          L('rest', 3, 'move the rest of the other list', 'when one list is used up, the rest of the other follows.'),
          L('ret', 1, 'return the one list left', 'The last list left is the merged list.'),
        ],
      },
    ];
  return [
    {
      op: 'merge',
      lines: [
        L('sig', 0, 'merge(L1, …, Lk)   // a min-heap of heads', 'To merge k sorted lists into one:'),
        L(
          'init',
          1,
          'H = min-heap of each list’s head',
          'put each list’s head, its smallest value, into a min-heap;',
        ),
        L('loop', 1, 'while H is not empty', 'while any value is left,'),
        L('pop', 2, 'x = H.min(); out.append(x)', 'the root is the smallest value left anywhere: it goes out next;'),
        L(
          'next',
          2,
          'if x’s list has more: H.replaceMin(its next value)',
          'its list’s next value takes the root’s place and sinks;',
        ),
        L(
          'empty',
          2,
          'else: H.popMin()',
          'if that list is used up, the heap’s last value takes the root instead.',
        ),
        L('ret', 1, 'return out', 'Every value went out in order: that is the merged list.'),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: MergeState): string {
  return `${plural(s.lists.length, 'sorted list')}: ${s.lists
    .map((l, j) => `${listName(j)} = ${l.length ? keysOf(l).join(' ') : 'empty'}`)
    .join('; ')}.`;
}

export function initialSay(s: MergeState): string {
  return `${plural(s.lists.length, 'sorted list')}, ${plural(s.lists.flat().length, 'value')} in all. Press Merge to merge them into one sorted list. Type lists split by |, such as 1 5 | 2 3 | 4, and press Load to start over.`;
}

export const initialVars = (s: MergeState) => ({ k: s.lists.length, n: s.lists.flat().length });
