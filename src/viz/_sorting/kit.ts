/**
 * Shared model code for the sorting and searching pages: the array state, input parsing, the
 * `load` operation, presets, a step builder with counters, and driver scripts for code tabs.
 * This folder has no index.ts, so the registry does not treat it as a page.
 */
import { Timeline } from '../../engine/timeline';
import type {
  Mark,
  MarkRole,
  OpCall,
  OpSpec,
  Preset,
  Scalar,
  SettingSpec,
  Settings,
  Step,
  Value,
  VizDef,
} from '../../engine/types';
import type { Rng } from '../../engine/rng';
import type { BarsCall, BarsPointer, BarsRegion } from '../../layouts/bars';

export const MAX_N = 20;
export const MAX_VALUE = 99;

/**
 * One value in the array. The uid stays with the value wherever it moves. A stale item is an
 * old copy left in memory (after a shift or a copy); it is drawn faded and is not a live value.
 */
export interface Item {
  uid: number;
  value: number;
  stale?: boolean;
}

export interface ArrayState {
  a: Item[];
  nextUid: number;
}

/** View-only data for one step. */
export interface ArrayExtra {
  pointers?: BarsPointer[];
  regions?: BarsRegion[];
  calls?: BarsCall[];
  /** A value held outside the array (key, temp) or the value being searched for. */
  held?: { uid?: number; value: number; at: number; label: string; role?: MarkRole };
  /** An auxiliary array aligned with A by index (L and R while merging). */
  aux?: { items: (Item | null)[]; from: number; to: number; label?: (i: number) => string };
  /** Index ranges that are out of play. */
  faded?: { from: number; to: number }[];
  /** A sentinel value in the slot just past the end. */
  sentinel?: Item;
}

export type ArrayStep = Step<ArrayState, ArrayExtra>;

export type Draw = 'bars' | 'cells';

export const drawSetting = (): SettingSpec => ({
  kind: 'choice',
  key: 'draw',
  label: 'Draw values as',
  options: [
    { value: 'bars', label: 'Bars (height shows the value)' },
    { value: 'cells', label: 'Cells (boxes with numbers)' },
  ],
  help: 'Bars make the order easy to see; cells look like an array in memory.',
});

export function makeState(values: number[], firstUid = 1): ArrayState {
  return {
    a: values.map((value, k) => ({ uid: firstUid + k, value })),
    nextUid: firstUid + values.length,
  };
}

export const valuesOf = (s: ArrayState): number[] => s.a.map((x) => x.value);

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const vid = (item: Item): string => `v${item.uid}`;

/** "A[3] = 8". */
export const at = (i: number, v: number | Item | undefined): string =>
  `A[${i}] = ${typeof v === 'object' ? v.value : v}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A[2..5]", or "A[2]" for one slot. */
export const span = (lo: number, hi: number, name = 'A'): string =>
  lo === hi ? `${name}[${lo}]` : `${name}[${lo}..${hi}]`;

/** "walk j from 6 down to 1", or "check j = 6 only" when there is one position. */
export const walk = (from: number, to: number, name = 'j'): string =>
  from === to
    ? `check ${name} = ${from} only`
    : `walk ${name} from ${from} ${from > to ? 'down' : 'up'} to ${to}`;

// ----- Input -----

const RANGE = `whole numbers from 0 to ${MAX_VALUE}`;

/** Parse "5 3 8 1" or "5,3,8,1". */
export function parseValues(text: string): number[] | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type some numbers first, such as 5 3 8 1.');
  if (tokens.length > MAX_N)
    return new Error(
      `That is ${tokens.length} values. Use at most ${MAX_N}, so every value stays readable.`,
    );
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^-?\d+$/.test(t)) return new Error(`"${t}" is not a whole number. Use ${RANGE}.`);
    const v = Math.abs(Number(t)) === 0 ? 0 : Number(t);
    if (v < 0 || v > MAX_VALUE) return new Error(`${t} is out of range. Use ${RANGE}.`);
    out.push(v);
  }
  return out;
}

/** For the input box: a list becomes "5 3 8 1"; a single number stays a number. */
export function parseInput(token: string): Value | Error {
  const vs = parseValues(token);
  if (vs instanceof Error) return vs;
  return vs.length === 1 ? vs[0]! : vs.join(' ');
}

/** An operation argument as a list of values, or an error message. */
export function listFromArg(arg: Value | undefined): number[] | string {
  if (typeof arg === 'number') {
    if (!Number.isInteger(arg) || arg < 0 || arg > MAX_VALUE)
      return `${arg} is out of range. Use ${RANGE}.`;
    return [arg];
  }
  const vs = parseValues(String(arg ?? ''));
  return vs instanceof Error ? vs.message : vs;
}

/** An operation argument as one value, or an error message. */
export function numberFromArg(arg: Value | undefined, what = 'value'): number | string {
  const vs = listFromArg(arg);
  if (typeof vs === 'string') return vs;
  if (vs.length !== 1) return `Type one ${what}, not a list. For example: ${vs[0]}.`;
  return vs[0]!;
}

// ----- Steps -----

export interface StepSpec {
  say: string;
  lines: string[];
  level: 1 | 2 | 3;
  marks?: Mark[];
  vars?: Record<string, Scalar>;
  extra?: ArrayExtra;
}

/**
 * The working copy of the array during one operation, with counters and the set of values
 * already in their final place. `step()` snapshots it, adds the counters to the variables and
 * marks final values as done.
 */
export class Run {
  a: Item[];
  nextUid: number;
  readonly counts: Record<string, number>;
  /** Indices whose values are in their final place. */
  readonly done = new Set<number>();

  constructor(s: ArrayState, counters: string[]) {
    this.a = [...s.a];
    this.nextUid = s.nextUid;
    this.counts = Object.fromEntries(counters.map((c) => [c, 0]));
  }

  get n(): number {
    return this.a.length;
  }

  state(): ArrayState {
    return { a: [...this.a], nextUid: this.nextUid };
  }

  v(i: number): number {
    return this.a[i]!.value;
  }

  id(i: number): string {
    return vid(this.a[i]!);
  }

  swap(i: number, j: number): void {
    const t = this.a[i]!;
    this.a[i] = this.a[j]!;
    this.a[j] = t;
  }

  count(name: string, by = 1): void {
    this.counts[name] = (this.counts[name] ?? 0) + by;
  }

  step(spec: StepSpec): ArrayStep {
    const marks = [...(spec.marks ?? [])];
    const marked = new Set(marks.map((m) => m.id));
    // Final values inside a "done" region are drawn as done by the layout; mark the rest.
    const covered = (i: number) =>
      (spec.extra?.regions ?? []).some((r) => r.tone === 'done' && r.from <= i && i <= r.to);
    for (const i of this.done) {
      const item = this.a[i];
      if (item && !item.stale && !marked.has(vid(item)) && !covered(i))
        marks.push(mark(vid(item), 'done'));
    }
    return {
      state: this.state(),
      marks,
      say: spec.say,
      lines: spec.lines,
      level: spec.level,
      vars: { ...spec.vars, ...this.counts },
      extra: spec.extra,
    };
  }

  /** Counters as a sentence: "28 comparisons and 13 swaps". */
  tally(): string {
    const parts = Object.entries(this.counts).map(([k, v]) =>
      v === 0 ? `no ${k}` : `${v} ${v === 1 ? single(k) : k}`,
    );
    return parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      : (parts[0] ?? '');
  }
}

const single = (word: string) =>
  word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.endsWith('s') ? word.slice(0, -1) : word;

/** Contiguous runs of final places, drawn as green "sorted" regions. */
export function doneRegions(r: Run, label = 'sorted'): BarsRegion[] {
  const idx = [...r.done].sort((x, y) => x - y);
  const out: BarsRegion[] = [];
  let start = -1;
  idx.forEach((i, k) => {
    if (start < 0) start = i;
    if (idx[k + 1] !== i + 1) {
      out.push({ id: `final-${out.length}`, from: start, to: i, tone: 'done', label });
      start = -1;
    }
  });
  return out;
}

export interface PairOptions {
  /** Walking from the back: talk about A[lo + 1] and its left neighbor. */
  back: boolean;
  extra: () => ArrayExtra;
  vars: () => Record<string, Scalar>;
  /** Pseudocode lines for the compare step, the "no swap" step and the swap step. */
  lines: { compare: string[]; stay: string[]; swap: string[] };
  /** Runs right after a swap, before its step is shown (to set a flag the step displays). */
  onSwap?: () => void;
}

/**
 * Compare the neighbors A[lo] and A[lo + 1] and swap them if they are out of order: a level-3
 * step for the comparison and a level-2 step for what happens. Returns whether they swapped.
 * Shared by bubble sort and cocktail shaker sort.
 */
export function* compareNeighbors(
  r: Run,
  lo: number,
  o: PairOptions,
): Generator<ArrayStep, boolean, void> {
  const hi = lo + 1;
  const [x, y] = [r.v(lo), r.v(hi)];
  r.count('comparisons');
  const pair = (role: MarkRole) => [mark(r.id(lo), role), mark(r.id(hi), role)];
  yield r.step({
    say: o.back
      ? `Compare ${at(hi, y)} with its left neighbor, ${at(lo, x)}.`
      : `Compare ${at(lo, x)} with its right neighbor, ${at(hi, y)}.`,
    lines: o.lines.compare,
    level: 3,
    marks: pair('compare'),
    vars: o.vars(),
    extra: o.extra(),
  });
  if (x > y) {
    r.swap(lo, hi);
    r.count('swaps');
    o.onSwap?.();
    yield r.step({
      say: o.back
        ? `${y} < ${x}, so swap them. ${y} moves left to A[${lo}].`
        : `${x} > ${y}, so swap them. ${x} moves right to A[${hi}].`,
      lines: o.lines.swap,
      level: 2,
      marks: pair('active'),
      vars: o.vars(),
      extra: o.extra(),
    });
    return true;
  }
  yield r.step({
    say: o.back
      ? `${y} is not smaller than ${x}, so they stay where they are.`
      : `${x} is not bigger than ${y}, so they stay where they are.`,
    lines: o.lines.stay,
    level: 2,
    marks: pair('compare'),
    vars: o.vars(),
    extra: o.extra(),
  });
  return false;
}

/**
 * After a sort: did equal values end up in a different order than they started in? Returns a
 * sentence for the narration, or "" when every group of equal values kept its order.
 */
export function stabilityNote(start: readonly Item[], end: readonly Item[]): string {
  const pos = new Map(start.map((x, i) => [x.uid, i]));
  const seen = new Map<number, number[]>();
  for (const x of end) seen.set(x.value, [...(seen.get(x.value) ?? []), pos.get(x.uid) ?? 0]);
  for (const [value, order] of seen) {
    if (order.every((p, k) => k === 0 || order[k - 1]! < p)) continue;
    return order.length === 2
      ? ` The two ${value}s ended up in the opposite order from how they started, so this run was not stable.`
      : ` The ${value}s ended up in a different order from how they started, so this run was not stable.`;
  }
  return '';
}

/** Is the array (live values) in non-decreasing order? Returns the first descent, if any. */
export function firstDescent(vs: readonly number[]): number {
  for (let i = 0; i + 1 < vs.length; i++) if (vs[i]! > vs[i + 1]!) return i;
  return -1;
}

// ----- The load operation -----

export interface LoadOptions {
  /** What to say after a successful load, after "Loaded n values". */
  ready: string;
  vars?: (s: ArrayState) => Record<string, Scalar>;
  /** A warning about the new values (binary search: they are not sorted). */
  warn?: (s: ArrayState) => { say: string; marks: Mark[] } | null;
}

export function loadOp<Set>(opts: LoadOptions): OpSpec<ArrayState, Set, ArrayExtra> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const vs = listFromArg(arg);
      if (typeof vs === 'string') {
        yield {
          state: s,
          marks: [mark('row-a', 'error')],
          say: `Nothing loaded. ${vs} The array stays as it was.`,
          lines: [],
          level: 1,
          vars: { n: s.a.length, ...opts.vars?.(s) },
        };
        return s;
      }
      const next = makeState(vs, s.nextUid);
      const warning = opts.warn?.(next);
      yield {
        state: next,
        marks: warning?.marks ?? [],
        say:
          `Loaded ${plural(vs.length, 'value')} into A: ${vs.join(', ')}. ` +
          (warning ? warning.say : opts.ready),
        lines: [],
        level: 1,
        vars: { n: vs.length, ...opts.vars?.(next) },
      };
      return next;
    },
  };
}

// ----- Presets -----

/** n random values from 1 to 99, possibly repeated. */
export function randomValues(rng: Rng, n: number, lo = 1, hi = MAX_VALUE): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

/** n distinct values from 1 to 99, in random order. */
export function distinctValues(rng: Rng, n: number): number[] {
  const pool = Array.from({ length: MAX_VALUE }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

export const ascending = (vs: number[]) => [...vs].sort((x, y) => x - y);
export const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** Sorted, then a few neighbors swapped. */
export function nearlySorted(rng: Rng, n: number): number[] {
  const vs = ascending(distinctValues(rng, n));
  const swaps = Math.max(1, Math.round(n / 6));
  for (let k = 0; k < swaps; k++) {
    const i = rng.int(0, n - 2);
    [vs[i], vs[i + 1]] = [vs[i + 1]!, vs[i]!];
  }
  return vs;
}

/** Values drawn from just three distinct numbers. */
export function fewUnique(rng: Rng, n: number): number[] {
  const keys = distinctValues(rng, 3);
  return Array.from({ length: n }, () => keys[rng.int(0, 2)]!);
}

/**
 * The presets every sorting page offers. `labels` renames one where it is also this page's
 * best or worst case ("Reverse sorted (worst case)"); `more` adds the page's own.
 */
export function sortPresets(
  labels: Partial<Record<'sorted' | 'reverse' | 'nearly' | 'few', string>> = {},
  more: Preset[] = [],
): Preset[] {
  return [
    { label: 'Random', make: (rng, n) => [load(randomValues(rng, n))] },
    {
      label: labels.sorted ?? 'Sorted',
      make: (rng, n) => [load(ascending(distinctValues(rng, n)))],
    },
    {
      label: labels.reverse ?? 'Reverse sorted',
      make: (rng, n) => [load(ascending(distinctValues(rng, n)).reverse())],
    },
    { label: labels.nearly ?? 'Nearly sorted', make: (rng, n) => [load(nearlySorted(rng, n))] },
    { label: labels.few ?? 'Few unique values', make: (rng, n) => [load(fewUnique(rng, n))] },
    ...more,
  ];
}

export const SORT_SIZES = [8, 12, 16, 20];

/**
 * What every sorting page starts with. Six values keep a first run short (15 comparisons for
 * an O(n²) sort) and keep the shared random-sequence checks fast.
 */
export const SORT_START = [42, 17, 63, 8, 35, 24];

// ----- Code tabs -----

/**
 * Driver protocol shared by the sorting and searching pages. The driver keeps one array.
 * "load v1 v2 ..." replaces it and prints nothing. Every other line is a query that prints one
 * line. Calls the model rejects (bad input) are left out, so drivers only see valid input.
 */
export function driverScript<S extends Settings>(
  def: VizDef<ArrayState, S, ArrayExtra>,
  calls: OpCall[],
  settings: S,
  query: (
    call: OpCall,
    before: ArrayState,
    steps: ArrayStep[],
  ) => { line: string; out: string } | null,
): { input: string[]; expected: string[] } {
  const t = new Timeline(def, settings, 1, calls);
  const input = [`load ${valuesOf(t.initial.state).join(' ')}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    if (e.call[0] === 'load') {
      if (e.end !== before) input.push(`load ${valuesOf(e.end).join(' ')}`);
    } else {
      const q = query(e.call, before, e.steps);
      if (q) {
        input.push(q.line);
        expected.push(q.out);
      } else if (e.end !== before) {
        // The operation changed the array without a query (binary search: "sort first").
        input.push(`load ${valuesOf(e.end).join(' ')}`);
      }
    }
    before = e.end;
  }
  return { input, expected };
}

/** For sorting pages: "sort" prints the sorted array. */
export function sortQuery(call: OpCall, _before: ArrayState, steps: ArrayStep[]) {
  if (call[0] !== 'sort') return null;
  return { line: 'sort', out: valuesOf(steps[steps.length - 1]!.state).join(' ') };
}
