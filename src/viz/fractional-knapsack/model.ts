import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { andList, mark, plural, wholeFromArg } from '../_dp/kit';

export const MAX_ITEMS = 6;
export const MAX_WEIGHT = 12;
export const MAX_VALUE = 99;
export const MAX_CAPACITY = 15;

export interface Item {
  /** 1-based, in the order typed. */
  id: number;
  w: number;
  v: number;
}

export interface FracState {
  items: Item[];
  W: number;
  /** Item ids in the order drawn: as typed, then by value per weight. */
  order: number[];
  /** By id − 1: the weight taken (whole numbers, since weights and capacity are), or null. */
  taken: (number | null)[];
}

export interface FracSettings {
  [key: string]: Scalar;
  /** Take part of an item (fractional), or whole items only (the 0/1 rule, where greedy fails). */
  mode: 'fractional' | 'whole';
}

export interface FracExtra {
  at?: number;
  /** After the run: the best 0/1 value, from the knapsack table. */
  best01?: number;
}

type S = FracState;
type X = FracExtra;
type Op = OpSpec<S, FracSettings, X>;
type FracStep = Step<S, X>;
type Gen = Generator<FracStep, S, void>;

export const defaults: FracSettings = { mode: 'fractional' };

/** Three items where taking part of the last one beats any choice of whole items. */
export const START: Item[] = [
  { id: 1, w: 1, v: 6 },
  { id: 2, w: 2, v: 10 },
  { id: 3, w: 3, v: 12 },
];
export const START_W = 5;

export function stateFor(items: Item[], W: number): S {
  return { items, W, order: items.map((it) => it.id), taken: items.map(() => null) };
}

export const init = (): S => stateFor(START, START_W);

export const itemId = (id: number) => `item-${id}`;
export const partId = (id: number) => `part-${id}`;
export const itemsText = (items: Item[]) =>
  [...items]
    .sort((a, b) => a.id - b.id)
    .map((it) => `${it.w}:${it.v}`)
    .join(' ');

/** A fraction num/den in lowest terms. */
export interface Frac {
  num: number;
  den: number;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
export const frac = (num: number, den: number): Frac => {
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
};
export const addFrac = (a: Frac, b: Frac) => frac(a.num * b.den + b.num * a.den, a.den * b.den);
/** "22", "2/3" or "22 2/3". */
export function fracText(f: Frac): string {
  const whole = Math.floor(f.num / f.den);
  const rest = f.num - whole * f.den;
  if (rest === 0) return String(whole);
  return whole ? `${whole} ${rest}/${f.den}` : `${rest}/${f.den}`;
}
/** "22" or "68/3": what the code tabs print. */
export const fracPlain = (f: Frac) => (f.den === 1 ? String(f.num) : `${f.num}/${f.den}`);

export const ratioText = (it: { w: number; v: number }) => {
  const r = it.v / it.w;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
};

/** The value the taken weights are worth. */
export function valueOf(st: S): Frac {
  let total = frac(0, 1);
  st.items.forEach((it, k) => {
    const t = st.taken[k] ?? 0;
    if (t) total = addFrac(total, frac(it.v * t, it.w));
  });
  return total;
}

/** By value per weight, best first; ties keep the typed order. */
export const byRatio = (items: Item[]) =>
  [...items].sort((a, b) => b.v * a.w - a.v * b.w || a.id - b.id);

/** The best value with whole items only, from the 0/1 knapsack table. */
export function best01(items: Item[], W: number): number {
  const K = Array<number>(W + 1).fill(0);
  for (const it of items)
    for (let c = W; c >= it.w; c--) K[c] = Math.max(K[c]!, K[c - it.w]! + it.v);
  return K[W]!;
}

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
    out.push({ id: out.length + 1, w, v });
  }
  return out;
}

const fill: Op = {
  label: 'Fill the knapsack',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const whole = settings.mode === 'whole';
    const { items, W } = st;
    const order = byRatio(items).map((it) => it.id);
    const taken: (number | null)[] = items.map(() => null);
    const state = (): S => ({ items, W, order, taken: [...taken] });
    let left = W;
    const vars = () => ({ W, left, value: fracText(valueOf(state())) });
    yield {
      state: state(),
      marks: [],
      say: `Sort the items by value per unit of weight, best first: ${andList(order.map((id) => `item ${id} (${ratioText(items[id - 1]!)})`))}.`,
      lines: ['f.sort'],
      vars: vars(),
      level: 2,
    };
    for (const id of order) {
      const it = items[id - 1]!;
      if (left === 0) {
        yield {
          state: state(),
          marks: [mark(itemId(id), 'compare')],
          say: `The knapsack is full, so item ${id} and anything after it stay out.`,
          lines: ['f.loop', 'f.full'],
          vars: vars(),
          level: 2,
          extra: { at: id },
        };
        break;
      }
      let say: string;
      let lines: string[];
      let role: 'found' | 'new' | 'compare' = 'found';
      if (it.w <= left) {
        taken[id - 1] = it.w;
        left -= it.w;
        say = `Item ${id} (weight ${it.w}, value ${it.v}) fits whole. Take all of it; room ${left} is left.`;
        lines = ['f.loop', 'f.whole'];
      } else if (!whole) {
        taken[id - 1] = left;
        const part = frac(left, it.w);
        say = `Item ${id} weighs ${it.w}, but only ${left} fits. Take ${fracText(part)} of it, worth ${fracText(frac(it.v * left, it.w))}. The knapsack is full.`;
        left = 0;
        lines = ['f.loop', 'f.part'];
        role = 'new';
      } else {
        taken[id - 1] = 0;
        say = `Item ${id} weighs ${it.w}, more than the ${left} left, and it cannot be cut. Skip it.`;
        lines = ['f.loop', 'f.skip'];
        role = 'compare';
      }
      yield {
        state: state(),
        marks: [mark(itemId(id), role)],
        say,
        lines,
        vars: vars(),
        level: 2,
        extra: { at: id },
      };
    }
    const end = state();
    const value = valueOf(end);
    const b = best01(items, W);
    const used = W - left;
    const greater = value.num > b * value.den;
    yield {
      state: end,
      marks: [],
      say: whole
        ? `Greedy with whole items gets ${fracText(value)}, weight ${used} of ${W}.${value.num < b * value.den ? ` The 0/1 knapsack table finds ${b}: best ratio first is wrong when items cannot be cut.` : ` The 0/1 knapsack table finds ${b} too, this time.`}`
        : `Total value ${fracText(value)}, weight ${used} of ${W}. No packing does better when items can be cut.${greater ? ` With whole items only, the best is ${b}.` : ''}`,
      lines: ['f.ret'],
      vars: { ...vars(), '0/1 best': b, total: fracPlain(value) },
      level: 1,
      extra: { best01: b },
    };
    return end;
  },
};

const itemsOp: Op = {
  label: 'Load items',
  arity: 1,
  *run(st, [arg]): Gen {
    const items = itemsFromArg(arg);
    if (typeof items === 'string') {
      yield {
        state: st,
        marks: [],
        say: `The items stay as they were. ${items}`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const next = stateFor(items, st.W);
    yield {
      state: next,
      marks: [],
      say: `${plural(items.length, 'item')}: ${items.map((it) => `item ${it.id} weighs ${it.w} and is worth ${it.v}`).join('; ')}. Capacity ${st.W}. Press Fill the knapsack.`,
      lines: [],
      vars: { n: items.length, W: st.W },
      level: 1,
    };
    return next;
  },
};

const capacityOp: Op = {
  label: 'Capacity',
  arity: 1,
  *run(st, [arg]): Gen {
    const W = wholeFromArg(arg, 1, MAX_CAPACITY, 'the capacity');
    if (typeof W === 'string') {
      yield { state: st, marks: [], say: `The capacity stays ${st.W}. ${W}`, lines: [], level: 1 };
      return st;
    }
    const next = stateFor(st.items, W);
    yield {
      state: next,
      marks: [],
      say: `Capacity ${W}. Press Fill the knapsack.`,
      lines: [],
      vars: { n: st.items.length, W },
      level: 1,
    };
    return next;
  },
};

export const ops = { items: itemsOp, capacity: capacityOp, fill };

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FracSettings): PseudoBlock[] {
  const whole = settings.mode === 'whole';
  return [
    {
      op: 'fill',
      lines: [
        Ln(
          'f.sig',
          0,
          whole ? 'greedyWhole(w, v, W)' : 'fractionalKnapsack(w, v, W)',
          whole ? 'Greedy with whole items only:' : 'To pack the most value when items can be cut:',
        ),
        Ln(
          'f.sort',
          1,
          'sort items by v[i] / w[i], largest first; left = W',
          'put the items in order of value per unit of weight.',
        ),
        Ln('f.loop', 1, 'for each item i in that order', 'For each item, best first:'),
        Ln('f.full', 2, 'if left == 0: stop', 'once the knapsack is full, stop;'),
        Ln(
          'f.whole',
          2,
          'if w[i] <= left: take all of i; left = left - w[i]',
          'if it fits, take all of it;',
        ),
        whole
          ? Ln('f.skip', 2, 'else: skip i', 'otherwise skip it (it cannot be cut).')
          : Ln(
              'f.part',
              2,
              'else: take left / w[i] of i; left = 0',
              'otherwise take the part that fits, and the knapsack is full.',
            ),
        Ln(
          'f.ret',
          1,
          'return the value taken',
          whole ? 'The value, which may not be the best.' : 'The value, the best possible.',
        ),
      ],
    },
  ];
}

export function initialSay(st: S): string {
  return `${plural(st.items.length, 'item')} and a knapsack that holds weight ${st.W}. You may take part of an item, for that part of its value. What is the most you can carry? Press Fill the knapsack.`;
}

export const initialVars = (st: S) => ({ n: st.items.length, W: st.W });

export function describe(st: S): string {
  const parts = st.order.map((id) => {
    const it = st.items[id - 1]!;
    const t = st.taken[id - 1];
    return `item ${id} weight ${it.w} value ${it.v}${t === null ? '' : t === it.w ? ', all taken' : t === 0 ? ', left out' : `, ${t} of ${it.w} taken`}`;
  });
  return `Capacity ${st.W}. ${parts.join('; ')}. Value so far ${fracText(valueOf(st))}.`;
}
