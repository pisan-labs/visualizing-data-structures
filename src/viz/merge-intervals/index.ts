import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { intervalsFromArg, type Interval } from '../_intervals/kit';
import { ivInput } from '../_intervals2/kit';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/intervals.hpp?raw';
import javaSource from './code/java/Intervals.java?raw';
import pythonSource from './code/python/intervals.py?raw';
import everyIntervalOut from './examples/every-interval-out.json';
import insertAppendAgain from './examples/insert-append-again.json';
import insertOnePass from './examples/insert-one-pass.json';
import insideOne from './examples/inside-one.json';
import intersectEveryPair from './examples/intersect-every-pair.json';
import intersectTwoIndices from './examples/intersect-two-indices.json';
import nothingOverlaps from './examples/nothing-overlaps.json';
import oneChain from './examples/one-chain.json';
import sortThenMerge from './examples/sort-then-merge.json';
import touchingStaysApart from './examples/touching-stays-apart.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LOAD,
  ops,
  parseInput,
  pseudocode,
  type MIExtra,
  type MISettings,
  type MIState,
} from './model';
import { mergePractice } from './practice';
import { view } from './view';

const text = (ivs: { s: number; f: number }[]) => ivs.map(ivInput).join(' ');
const load = (ivs: { s: number; f: number }[]): OpCall => ['load', text(ivs)];

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** n random intervals, some overlapping. */
export function randomIntervals(rng: Rng, n: number): { s: number; f: number }[] {
  return Array.from({ length: n }, () => {
    const len = rng.int(1, 5);
    const s = rng.int(0, 18 - len);
    return { s, f: s + len };
  });
}

/** n intervals that do not overlap or touch, in start order, from time `from`. */
export function disjoint(rng: Rng, n: number, from = 0): { s: number; f: number }[] {
  const out: { s: number; f: number }[] = [];
  let t = from + rng.int(0, 1);
  for (let k = 0; k < n; k++) {
    const len = rng.int(1, 2);
    if (t + len > 24) break;
    out.push({ s: t, f: t + len });
    t += len + rng.int(1, 2);
  }
  return out;
}

const presets: Preset[] = [
  {
    label: 'Random',
    make: (rng, n) => [load(randomIntervals(rng, n)), ['merge']],
  },
  {
    label: 'Sorted by start already',
    make: (rng, n) => [
      load(randomIntervals(rng, n).sort((a, b) => a.s - b.s || a.f - b.f)),
      ['merge'],
    ],
  },
  {
    label: 'Nothing overlaps (every interval out is checked)',
    make: (rng, n) => [load(shuffle(rng, disjoint(rng, n))), ['merge']],
  },
  {
    label: 'Each overlaps the next: one comes out',
    make: (rng, n) => [
      load(
        shuffle(
          rng,
          Array.from({ length: n }, (_, k) => ({ s: 2 * k, f: 2 * k + 3 })),
        ),
      ),
      ['merge'],
    ],
  },
  {
    label: 'One long interval covers the rest',
    make: (rng, n) => {
      const inner = Array.from({ length: n - 1 }, () => {
        const s = rng.int(1, 12);
        return { s, f: s + rng.int(1, 3) };
      });
      return [load(shuffle(rng, [{ s: 0, f: 16 }, ...inner])), ['merge']];
    },
  },
  {
    label: 'Touching ends, back to back',
    make: (rng, n) => [
      load(
        shuffle(
          rng,
          Array.from({ length: n }, (_, k) => ({ s: 2 * k, f: 2 * k + 2 })),
        ),
      ),
      ['merge'],
    ],
  },
  {
    label: 'Duplicates',
    make: (rng, n) => {
      const some = randomIntervals(rng, Math.max(2, Math.ceil(n / 2)));
      return [load(shuffle(rng, [...some, ...some]).slice(0, n)), ['merge']];
    },
  },
  {
    label: 'Insert into a sorted list',
    make: (rng, n) => {
      const list = disjoint(rng, Math.max(2, n - 1));
      const s = rng.int(0, 14);
      return [load(list), ['insert', ivInput({ s, f: s + rng.int(1, 6) })]];
    },
  },
  {
    label: 'Intersect two sorted lists',
    make: (rng, n) => {
      const half = Math.max(2, Math.ceil(n / 2));
      return [load(disjoint(rng, half)), ['intersect', text(disjoint(rng, half, 1))]];
    },
  },
];

export const mergeIntervals: VizDef<MIState, MISettings, MIExtra> = {
  id: 'merge-intervals',
  title: 'Merge intervals',
  family: 'Intervals',
  blurb:
    'Sort by start, then one pass: each interval either reaches the last one out and merges, or starts a new one. Also inserting one interval into a sorted list, and intersecting two lists with one index in each.',
  settings: [
    approachSetting({
      pattern: 'Sort by start, then one pass, O(n log n)',
      naive: 'Check every interval out, O(n²)',
      help: 'Both give the same list. Insert and intersect switch too: one pass against appending and merging again, two indices against every pair. Watch the work counters, or use Compare.',
    }),
    {
      kind: 'choice',
      key: 'touch',
      label: 'Intervals that only touch (1–3 and 3–5)',
      options: [
        { value: 'merge', label: 'Merge: times are [start, end]' },
        {
          value: 'apart',
          label: 'Stay apart: times are [start, end), as on Interval partitioning',
        },
      ],
      help: 'Most interview problems merge touching intervals. With half-open times they share no moment.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Intervals',
      placeholder: 'e.g. 4-7 1-3 2-5, or 5-8 to insert',
      maxLength: 80,
      sample: '5-8',
      parse: parseInput,
    },
    buttons: [
      { op: 'merge', label: 'Merge', usesInput: false, primary: true },
      { op: 'insert', label: 'Insert', usesInput: true },
      { op: 'intersect', label: 'Intersect with', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random intervals',
      make: (rng) => [load(randomIntervals(rng, rng.int(5, MAX_LOAD))), ['merge']],
    },
    presets,
    sizes: [4, 6, MAX_LOAD],
  },
  explain,
  complexity: [
    {
      op: 'merge, sort then one pass',
      best: {
        cost: 'Θ(n log n)',
        why: 'The sort, even when nothing merges; the pass itself is n − 1 checks.',
        example: 'nothing-overlaps',
      },
      average: {
        cost: 'Θ(n log n)',
        why: 'A merge sort by start, then one check per interval against the last one out.',
        example: 'sort-then-merge',
      },
      worst: {
        cost: 'Θ(n log n)',
        why: 'The pass never looks back, so it is n − 1 checks whatever merges.',
        example: 'one-chain',
      },
      note: 'Already sorted by start? Then the pass alone is O(n).',
    },
    {
      op: 'merge, check every interval out',
      best: {
        cost: 'Θ(n)',
        why: 'When everything merges into one as it comes, each new interval meets one interval out.',
        example: 'one-chain',
      },
      average: {
        cost: 'O(n²)',
        why: 'Each new interval is checked against all the intervals out so far.',
        example: 'every-interval-out',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Nothing overlaps: the list out grows by one each time, n(n − 1)/2 checks.',
        example: 'nothing-overlaps',
      },
    },
    {
      op: 'insert into a sorted list',
      best: {
        cost: 'Θ(n)',
        why: 'Building the new list copies every interval, even when two checks place x.',
        example: 'insert-one-pass',
      },
      average: {
        cost: 'Θ(n)',
        why: 'One pass: copy, absorb, copy. Appending and merging again costs a sort, Θ(n log n).',
        example: 'insert-append-again',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'x covers the whole list: every interval is absorbed, still one pass.',
      },
    },
    {
      op: 'intersect two sorted lists',
      best: {
        cost: 'Θ(m + n)',
        why: 'Two indices: each check moves one of them, so at most m + n − 1 checks.',
        example: 'intersect-two-indices',
      },
      average: { cost: 'Θ(m + n)', why: 'The same walk; the overlaps found do not change it.' },
      worst: {
        cost: 'Θ(mn) every pair',
        why: 'Checking every pair is m × n checks, whatever the lists hold.',
        example: 'intersect-every-pair',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MISettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sortThenMerge,
    everyIntervalOut,
    touchingStaysApart,
    nothingOverlaps,
    oneChain,
    insideOne,
    insertOnePass,
    insertAppendAgain,
    intersectTwoIndices,
    intersectEveryPair,
  ] as unknown as SavedExample[],
  practice: mergePractice(() => mergeIntervals),
  preview: { example: 'sort-then-merge', level: 2, hide: ['axis', 'tick', 'time', 'end'] },
};

/**
 * Driver protocol for the code tabs, which follow the default settings (touching ends merge):
 * "merge s-f ..." prints the merged list; "insert x s-f ..." inserts x into the list;
 * "intersect s-f ... | s-f ..." prints what the two lists have in common. Each prints its
 * intervals as s-f separated by spaces, or "none".
 */
function codeScript(calls: OpCall[], settings: MISettings) {
  const t = new Timeline(mergeIntervals, { ...settings, touch: 'merge' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const show = (ivs: Interval[]) => (ivs.length ? text(ivs) : 'none');
  let cur = t.initial.state.ivs;
  for (const e of t.entries) {
    const ran = e.steps.length > 1;
    const [op, arg] = e.call;
    if (ran && op === 'merge') {
      input.push(`merge ${text(cur)}`);
      expected.push(show(e.end.ivs));
    } else if (ran && op === 'insert') {
      const x = intervalsFromArg(arg, MAX_LOAD, 'interval') as Interval[];
      input.push(`insert ${ivInput(x[0]!)} ${text(cur)}`.trimEnd());
      expected.push(show(e.end.ivs));
    } else if (ran && op === 'intersect') {
      const b = intervalsFromArg(arg, MAX_LOAD, 'interval') as Interval[];
      input.push(`intersect ${text(cur)} | ${text(b)}`.replace(/\s+/g, ' ').trim());
      expected.push(show(e.end.ivs));
    }
    cur = e.end.ivs;
  }
  return { input, expected };
}

export default mergeIntervals;
