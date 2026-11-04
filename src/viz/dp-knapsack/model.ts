import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { andList, cellId, mark, plural, wholeFromArg } from '../_dp/kit';

export const MAX_ITEMS = 6;
export const MAX_WEIGHT = 12;
export const MAX_VALUE = 99;
export const MAX_CAPACITY = 12;

export interface Item {
  w: number;
  v: number;
}

export interface KnapState {
  items: Item[];
  /** The capacity; the table has columns 0..W. */
  W: number;
  /** K[i][c], the best value from items 1..i with capacity c; null where not filled yet. */
  K: (number | null)[][];
}

export type KnapSettings = { [key: string]: Scalar };

/** View-only data for one step. */
export interface KnapExtra {
  /** The cells read for the cell being filled: skip (the cell above) and take. */
  reads?: { from: Cell; to: Cell; take: boolean; win: boolean; label?: string }[];
  path?: Cell[];
  /** Items the traceback has taken so far, by number, with the row each came from. */
  taken?: number[];
  /** What greedy by value per weight would take. */
  greedy?: { picks: number[]; value: number };
}

type S = KnapState;
type X = KnapExtra;
type Op = OpSpec<S, KnapSettings, X>;
type KnapStep = Step<S, X>;
type Gen = Generator<KnapStep, S, void>;

export const defaults: KnapSettings = {};

export const START_ITEMS: Item[] = [
  { w: 1, v: 6 },
  { w: 2, v: 10 },
  { w: 3, v: 12 },
];
export const START_W = 5;

export const emptyTable = (n: number, W: number): (number | null)[][] =>
  Array.from({ length: n + 1 }, () => Array<number | null>(W + 1).fill(null));

export function init(): S {
  return { items: START_ITEMS, W: START_W, K: emptyTable(START_ITEMS.length, START_W) };
}

/** Shape ids of an item's weight and value in the row headers. */
export const wId = (i: number) => `rh-1-${i}`;
export const vId = (i: number) => `rh-2-${i}`;

export const itemsText = (items: Item[]) => items.map((it) => `${it.w}:${it.v}`).join(' ');

/** Read "1:6 2:10 3:12" into items, or say what is wrong. */
export function itemsFromArg(arg: Value | undefined): Item[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = 'Type each item as weight:value, such as 1:6 2:10 3:12.';
  if (tokens.length === 0) return how;
  if (tokens.length > MAX_ITEMS) return `That is ${tokens.length} items. Use at most ${MAX_ITEMS}.`;
  const out: Item[] = [];
  for (const t of tokens) {
    const m = /^(\d+):(\d+)$/.exec(t);
    if (!m) return `"${t}" is not weight:value. ${how}`;
    const w = Number(m[1]);
    const v = Number(m[2]);
    if (w < 1 || w > MAX_WEIGHT) return `In "${t}", use a weight from 1 to ${MAX_WEIGHT}.`;
    if (v < 1 || v > MAX_VALUE) return `In "${t}", use a value from 1 to ${MAX_VALUE}.`;
    out.push({ w, v });
  }
  return out;
}

export function filledRows(s: S): number {
  let r = -1;
  for (let i = 0; i < s.K.length; i++) {
    if (s.K[i]!.every((v) => v !== null)) r = i;
    else break;
  }
  return r;
}

export const isFull = (s: S) => filledRows(s) === s.items.length;

/** Greedy by value per weight: best ratio first (ties to the earlier item), if it fits. */
export function greedy(items: Item[], W: number): { picks: number[]; value: number } {
  const order = items
    .map((it, k) => ({ ...it, k: k + 1 }))
    .sort((p, q) => q.v / q.w - p.v / p.w || p.k - q.k);
  let left = W;
  let value = 0;
  const picks: number[] = [];
  for (const it of order) {
    if (it.w > left) continue;
    left -= it.w;
    value += it.v;
    picks.push(it.k);
  }
  return { picks, value };
}

const ratio = (it: Item) => {
  const r = it.v / it.w;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

function* fillRows(s: S, last: number): Gen {
  const { items, W } = s;
  const n = items.length;
  const K = s.K.map((r) => [...r]);
  const state = (): S => ({ items, W, K: K.map((r) => [...r]) });
  let from = filledRows(s) + 1;
  if (from === 0) {
    for (let c = 0; c <= W; c++) K[0]![c] = 0;
    yield {
      state: state(),
      marks: Array.from({ length: W + 1 }, (_, c) => mark(cellId(0, c), 'new')),
      say: 'Row 0 uses no items, so its best value is 0 for every capacity.',
      lines: ['k.base'],
      vars: { n, W, i: 0 },
      level: last === 0 ? 1 : 2,
    };
    from = 1;
  }
  for (let i = from; i <= last; i++) {
    const { w, v } = items[i - 1]!;
    for (let c = 0; c <= W; c++) {
      const skip = K[i - 1]![c]!;
      const vars = { i, c, w, v };
      let say: string;
      let reads: X['reads'];
      let lines: string[];
      let value: number;
      if (w > c) {
        value = skip;
        say = `Item ${i} weighs ${w}, more than c = ${c}, so it does not fit: K[${i}][${c}] = K[${i - 1}][${c}] = ${skip}.`;
        reads = [{ from: [i - 1, c], to: [i, c], take: false, win: true }];
        lines = ['k.loop', 'k.skip', 'k.fits'];
      } else {
        const take = K[i - 1]![c - w]! + v;
        value = Math.max(skip, take);
        const takes = take > skip;
        say = `K[${i}][${c}] = max(K[${i - 1}][${c}], K[${i - 1}][${c - w}] + ${v}) = max(${skip}, ${take}) = ${value}: ${takes ? `take item ${i}` : take === skip ? `skipping item ${i} is as good, so skip it` : `skip item ${i}`}.`;
        reads = [
          { from: [i - 1, c], to: [i, c], take: false, win: !takes },
          { from: [i - 1, c - w], to: [i, c], take: true, win: takes, label: `+${v}` },
        ];
        lines = takes ? ['k.loop', 'k.skip', 'k.fits', 'k.take'] : ['k.loop', 'k.skip', 'k.fits'];
      }
      K[i]![c] = value;
      const rowDone = c === W;
      if (rowDone)
        say += ` Row ${i} is done: with items 1 to ${i}, the best value for capacity ${W} is ${value}.`;
      yield {
        state: state(),
        marks: [
          mark(cellId(i, c), 'active'),
          mark(wId(i), 'compare'),
          mark(vId(i), 'compare'),
          ...reads.map((r) => mark(cellId(r.from[0], r.from[1]), 'compare')),
        ],
        say,
        lines,
        vars: { ...vars, 'K[i][c]': value },
        level: rowDone ? 1 : 2,
        extra: { reads },
      };
    }
  }
  return state();
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(s): Gen {
    const n = s.items.length;
    if (isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(n, s.W), 'found')],
        say: `The table is already full: K[${n}][${s.W}] = ${s.K[n]![s.W]}. Press Trace back to see which items, or change the items or the capacity.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const end = yield* fillRows(s, n);
    const best = end.K[n]![s.W]!;
    yield {
      state: end,
      marks: [mark(cellId(n, s.W), 'found')],
      say: `K[${n}][${s.W}] = ${best}: the best value that fits in capacity ${s.W}.${best ? ' Press Trace back to see which items make it.' : ' No item fits.'}`,
      lines: ['k.ret'],
      vars: { n, W: s.W, best },
      level: 1,
    };
    return end;
  },
};

const row: Op = {
  label: 'Fill one row',
  arity: 0,
  *run(s): Gen {
    const done = filledRows(s);
    if (done === s.items.length) {
      yield {
        state: s,
        marks: [],
        say: 'Every row is filled already. Press Trace back, or change the items or the capacity.',
        lines: [],
        level: 1,
      };
      return s;
    }
    return yield* fillRows(s, done + 1);
  },
};

const trace: Op = {
  label: 'Trace back',
  arity: 0,
  *run(s): Gen {
    const { items, W } = s;
    const n = items.length;
    if (!isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(n, W), 'error')],
        say: `Fill the table first. The traceback starts at K[${n}][${W}] and reads a cell in every row above it.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const best = s.K[n]![W]!;
    let c = W;
    const path: Cell[] = [[n, c]];
    const taken: number[] = [];
    const extra = (): X => ({ path: [...path], taken: [...taken] });
    yield {
      state: s,
      marks: [mark(cellId(n, c), 'active')],
      say: `Start at K[${n}][${W}] = ${best} and walk up one row per item, asking whether each value came from taking that item.`,
      lines: ['t.sig'],
      vars: { i: n, c, best },
      level: 2,
      extra: extra(),
    };
    for (let i = n; i >= 1; i--) {
      const here = s.K[i]![c]!;
      const above = s.K[i - 1]![c]!;
      const { w, v } = items[i - 1]!;
      let say: string;
      const marks = [];
      if (here !== above) {
        taken.push(i);
        say = `K[${i}][${c}] = ${here} differs from K[${i - 1}][${c}] = ${above}, so item ${i} (weight ${w}, value ${v}) is in. Take it and move to capacity ${c} − ${w} = ${c - w}.`;
        marks.push(mark(wId(i), 'found'), mark(vId(i), 'found'), mark(cellId(i, c), 'found'));
        c -= w;
      } else {
        say = `K[${i}][${c}] = ${here} equals K[${i - 1}][${c}], so item ${i} is not needed. Move up.`;
        marks.push(mark(cellId(i, c), 'visit'));
      }
      path.push([i - 1, c]);
      marks.push(mark(cellId(i - 1, c), 'active'));
      yield {
        state: s,
        marks,
        say,
        lines: here !== above ? ['t.loop', 't.take'] : ['t.loop', 't.skip'],
        vars: { i: i - 1, c, best, taken: taken.length },
        level: 2,
        extra: extra(),
      };
    }
    const chosen = [...taken].reverse();
    const weight = chosen.reduce((sum, k) => sum + items[k - 1]!.w, 0);
    const g = greedy(items, W);
    const ratios = [...items.keys()]
      .map((k) => ({ k: k + 1, r: items[k]!.v / items[k]!.w }))
      .sort((p, q) => q.r - p.r || p.k - q.k)
      .map((x) => `${x.k} (${ratio(items[x.k - 1]!)} per unit)`);
    const g2 = [...g.picks].sort((p, q) => p - q);
    const same = g2.length === chosen.length && g2.every((k, idx) => k === chosen[idx]);
    yield {
      state: s,
      marks: [mark(cellId(n, W), 'found')],
      say:
        `Compare greedy by value per weight. It tries the items in the order ${andList(ratios)}, taking each one that still fits: ${g.picks.length ? `items ${andList(g.picks)}` : 'nothing'}, worth ${g.value}.` +
        (g.value < best
          ? ` The table's choice is worth ${best}. The best ratio first is not always best.`
          : same
            ? ' Here greedy picks the same items as the table.'
            : ` That matches the table's ${best}.`),
      lines: ['g.sig'],
      vars: { best, greedy: g.value },
      level: 2,
      extra: { ...extra(), greedy: g },
    };
    yield {
      state: s,
      marks: [mark(cellId(n, W), 'found')],
      say:
        chosen.length === 0
          ? `No item fits in capacity ${W}, so the best value is 0.`
          : `Take ${chosen.length === 1 ? 'item' : 'items'} ${andList(chosen)}: weight ${weight} of ${W}, value ${best}.${g.value < best ? ` Greedy by value per weight gets ${g.value}.` : ''}`,
      lines: ['t.ret'],
      vars: { best, weight, items: chosen.join(' '), greedy: g.value },
      level: 1,
      extra: { ...extra(), greedy: g },
    };
    return s;
  },
};

const itemsOp: Op = {
  label: 'Load items',
  arity: 1,
  *run(s, [arg]): Gen {
    const items = itemsFromArg(arg);
    if (typeof items === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The items stay as they were. ${items}`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next: S = { items, W: s.W, K: emptyTable(items.length, s.W) };
    yield {
      state: next,
      marks: [],
      say: `${plural(items.length, 'item')}: ${items.map((it, k) => `item ${k + 1} weighs ${it.w} and is worth ${it.v}`).join('; ')}. Capacity ${s.W}. Press Fill the table.`,
      lines: [],
      vars: { n: items.length, W: s.W },
      level: 1,
    };
    return next;
  },
};

const capacityOp: Op = {
  label: 'Capacity',
  arity: 1,
  *run(s, [arg]): Gen {
    const W = wholeFromArg(arg, 0, MAX_CAPACITY, 'the capacity');
    if (typeof W === 'string') {
      yield {
        state: s,
        marks: [],
        say: `The capacity stays ${s.W}. ${W} To change the items, use Load items.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next: S = { items: s.items, W, K: emptyTable(s.items.length, W) };
    yield {
      state: next,
      marks: [],
      say: `Capacity ${W}: the table gets a column for every capacity from 0 to ${W}. Press Fill the table.`,
      lines: [],
      vars: { n: s.items.length, W },
      level: 1,
    };
    return next;
  },
};

export const ops = { items: itemsOp, capacity: capacityOp, fill, row, trace };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'fill',
      lines: [
        L(
          'k.sig',
          0,
          'knapsack(w[1..n], v[1..n], W)',
          'To fill the table for n items and capacity W:',
        ),
        L('k.base', 1, 'K[0][c] = 0 for c = 0 to W', 'With no items, every capacity is worth 0.'),
        L('k.loop', 1, 'for i = 1 to n, for c = 0 to W', 'Item by item, capacity by capacity:'),
        L('k.skip', 2, 'K[i][c] = K[i - 1][c]', 'skipping item i keeps the best without it;'),
        L('k.fits', 2, 'if w[i] <= c', 'if item i fits,'),
        L(
          'k.take',
          3,
          'K[i][c] = max(K[i][c], K[i - 1][c - w[i]] + v[i])',
          'taking it adds its value to the best for the room that is left.',
        ),
        L('k.ret', 1, 'return K[n][W]', 'The bottom-right cell is the best value.'),
      ],
    },
    {
      op: 'trace',
      lines: [
        L('t.sig', 0, 'traceBack(c = W)', 'To find the items, start at the bottom-right:'),
        L('t.loop', 1, 'for i = n down to 1', 'for each item, from the last row up,'),
        L(
          't.take',
          2,
          'if K[i][c] != K[i - 1][c]: take i; c = c - w[i]',
          'if the value changed, item i is in: take it and give up its room;',
        ),
        L('t.skip', 2, '(else item i is left out)', 'otherwise it is left out.'),
        L('t.ret', 1, 'return the items taken', 'Those items make the best value.'),
        L(
          'g.sig',
          0,
          'greedy: best v[i]/w[i] first, if it fits',
          'For comparison, greedy by value per weight.',
        ),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `${plural(state.items.length, 'item')} (weight:value ${itemsText(state.items)}) and a knapsack of capacity ${state.W}. Each item goes in whole or not at all. Press Fill the table, or type new items or a new capacity.`;
}

export function initialVars(state: S) {
  return { n: state.items.length, W: state.W };
}

export function describe(state: S): string {
  const rows = state.K.map(
    (r, i) =>
      `row ${i}${i ? ` (item ${i}: weight ${state.items[i - 1]!.w}, value ${state.items[i - 1]!.v})` : ''}: ${r.map((v) => (v === null ? 'empty' : String(v))).join(' ')}`,
  );
  return `Knapsack table, capacity ${state.W}. ${rows.join('; ')}.`;
}
