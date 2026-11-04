/**
 * Shared model code for the sorts that do not compare values (counting, radix and bucket
 * sort). They take values from a range of their own, so they need their own input parsing,
 * load operation and presets; everything else comes from kit.ts. The comparison sorts do not
 * use this file.
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpCall, OpSpec, Preset, Scalar, Value } from '../../engine/types';
import { makeState, mark, plural, type ArrayExtra, type ArrayState } from './kit';

export interface Range {
  lo: number;
  hi: number;
  /** At most this many values. */
  max: number;
}

const rangeText = (r: Range) => `whole numbers from ${r.lo} to ${r.hi}`;

/** Parse "5 3 8 1" or "5,3,8,1" with every value in the range. */
export function parseIn(text: string, r: Range): number[] | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type some numbers first, such as 5 3 8 1.');
  if (tokens.length > r.max)
    return new Error(
      `That is ${tokens.length} values. Use at most ${r.max}, so every value stays readable.`,
    );
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^-?\d+$/.test(t)) return new Error(`"${t}" is not a whole number. Use ${rangeText(r)}.`);
    const v = Math.abs(Number(t)) === 0 ? 0 : Number(t);
    if (v < r.lo || v > r.hi) return new Error(`${t} is out of range. Use ${rangeText(r)}.`);
    out.push(v);
  }
  return out;
}

/** For the input box: a list becomes "5 3 8 1"; a single number stays a number. */
export function parseInputIn(r: Range) {
  return (token: string): Value | Error => {
    const vs = parseIn(token, r);
    if (vs instanceof Error) return vs;
    return vs.length === 1 ? vs[0]! : vs.join(' ');
  };
}

/** An operation argument as a list of values in the range, or a message. */
export function listIn(arg: Value | undefined, r: Range): number[] | string {
  if (typeof arg === 'number') {
    if (!Number.isInteger(arg) || arg < r.lo || arg > r.hi)
      return `${arg} is out of range. Use ${rangeText(r)}.`;
    return [arg];
  }
  const vs = parseIn(String(arg ?? ''), r);
  return vs instanceof Error ? vs.message : vs;
}

export interface LoadInOptions<Set> {
  /** The range, which may depend on the settings (bucket sort's fractions or integers). */
  range: (settings: Set) => Range;
  /** Turn parsed numbers into stored values (hundredths into fractions). */
  convert?: (vs: number[], settings: Set) => number[];
  parse?: (arg: Value | undefined, settings: Set) => number[] | string;
  ready: string;
  vars?: (s: ArrayState) => Record<string, Scalar>;
  show?: (v: number) => string;
}

/** The load operation for a page with its own range of values. */
export function loadIn<Set>(o: LoadInOptions<Set>): OpSpec<ArrayState, Set, ArrayExtra> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg], { settings }) {
      const vs = o.parse ? o.parse(arg, settings) : listIn(arg, o.range(settings));
      if (typeof vs === 'string') {
        yield {
          state: s,
          marks: [mark('row-a', 'error')] as Mark[],
          say: `Nothing loaded. ${vs} The array stays as it was.`,
          lines: [],
          level: 1,
          vars: { n: s.a.length, ...o.vars?.(s) },
        };
        return s;
      }
      const values = o.convert ? o.convert(vs, settings) : vs;
      const next = makeState(values, s.nextUid);
      const show = o.show ?? String;
      yield {
        state: next,
        marks: [],
        say: `Loaded ${plural(values.length, 'value')} into A: ${values.map(show).join(', ')}. ${o.ready}`,
        lines: [],
        level: 1,
        vars: { n: values.length, ...o.vars?.(next) },
      };
      return next;
    },
  };
}

/** n values from lo to hi, possibly repeated. */
export const randomIn = (rng: Rng, n: number, lo: number, hi: number): number[] =>
  Array.from({ length: n }, () => rng.int(lo, hi));

export const loadCall = (vs: readonly (number | string)[]): OpCall => ['load', vs.join(' ')];

/**
 * Presets for a range: random, sorted, reverse sorted, few distinct values and all equal,
 * plus the page's own. Values are whole numbers; `show` writes them as the page types them.
 */
export function rangePresets(
  lo: number,
  hi: number,
  more: Preset[] = [],
  show: (v: number) => string = String,
): Preset[] {
  const write = (vs: number[]) => loadCall(vs.map(show));
  return [
    { label: 'Random', make: (rng, n) => [write(randomIn(rng, n, lo, hi))] },
    {
      label: 'Sorted',
      make: (rng, n) => [write(randomIn(rng, n, lo, hi).sort((a, b) => a - b))],
    },
    {
      label: 'Reverse sorted',
      make: (rng, n) => [write(randomIn(rng, n, lo, hi).sort((a, b) => b - a))],
    },
    {
      label: 'Few unique values',
      make: (rng, n) => {
        const keys = randomIn(rng, 3, lo, hi);
        return [write(Array.from({ length: n }, () => keys[rng.int(0, 2)]!))];
      },
    },
    {
      label: 'All equal',
      make: (rng, n) => {
        const v = rng.int(lo, hi);
        return [write(Array<number>(n).fill(v))];
      },
    },
    ...more,
  ];
}
