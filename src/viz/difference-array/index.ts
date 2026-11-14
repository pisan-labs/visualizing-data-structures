import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/difference_array.hpp?raw';
import javaSource from './code/java/DifferenceArray.java?raw';
import pythonSource from './code/python/difference_array.py?raw';
import cancelOut from './examples/cancel-out.json';
import everyCell from './examples/every-cell.json';
import fourUpdates from './examples/four-updates.json';
import manyLongUpdates from './examples/many-long-updates.json';
import shortRanges from './examples/short-ranges.json';
import wholeArray from './examples/whole-array.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  MAX_UPDATES,
  ops,
  parseInput,
  pseudocode,
  readValues,
  type DExtra,
  type DSettings,
  type DState,
  type Update,
} from './model';
import { differencePractice } from './practice';
import { view } from './view';

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];
const addCall = (u: Update): OpCall => ['add', u.l, u.r, u.x];
const amount = (rng: Rng) => {
  const x = rng.int(-3, 5);
  return x === 0 ? 1 : x;
};

/** A batch on n zeros: load, the updates, apply. */
const batch = (n: number, us: Update[], start: number[] = Array(n).fill(0)): OpCall[] => [
  load(start),
  ...us.map(addCall),
  ['apply'],
];

/** q updates of length lo to hi (as far as n allows). */
function ranges(rng: Rng, n: number, q: number, lo: number, hi: number): Update[] {
  return Array.from({ length: q }, () => {
    const len = Math.min(n, rng.int(lo, hi));
    const l = rng.int(0, n - len);
    return { l, r: l + len - 1, x: amount(rng) };
  });
}

const presets: Preset[] = [
  { label: 'Random updates on zeros', make: (rng, n) => batch(n, ranges(rng, n, 5, 1, n)) },
  {
    label: 'Many long updates (the difference array wins)',
    make: (rng, n) => batch(n, ranges(rng, n, MAX_UPDATES, n - 2, n)),
  },
  {
    label: 'Short updates (adding to every cell wins)',
    make: (rng, n) => batch(n, ranges(rng, n, 6, 1, 2)),
  },
  {
    label: 'Every update covers the whole array',
    make: (rng, n) => batch(n, ranges(rng, n, 4, n, n)),
  },
  {
    label: 'Updates that end at the last value (r + 1 = n)',
    make: (rng, n) =>
      batch(
        n,
        Array.from({ length: 4 }, () => ({ l: rng.int(0, n - 1), r: n - 1, x: amount(rng) })),
      ),
  },
  {
    label: 'Start from values, not zeros',
    make: (rng, n) =>
      batch(
        n,
        ranges(rng, n, 4, 2, n),
        Array.from({ length: n }, () => rng.int(0, 9)),
      ),
  },
  {
    label: 'An update and its opposite',
    make: (rng, n) => {
      const [u] = ranges(rng, n, 1, 2, n);
      const [v] = ranges(rng, n, 1, 1, n);
      return batch(n, [u!, v!, { ...u!, x: -u!.x }]);
    },
  },
];

export const differenceArray: VizDef<DState, DSettings, DExtra> = {
  id: 'difference-array',
  title: 'Difference array',
  family: 'Array and string tricks',
  blurb:
    'Many updates of the form "add x to A[l..r]": instead of touching every cell, write +x at D[l] and −x at D[r + 1], then one pass of running sums applies them all. Two writes per update and one pass, against the length of every range.',
  settings: [
    approachSetting({
      pattern: 'Difference array, O(q + n)',
      naive: 'Add to every cell, O(q·n)',
    }),
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
      label: 'l r x, or values',
      placeholder: 'e.g. 1 4 3, or 5 3 8 1 to load',
      maxLength: 80,
      sample: '2',
      parse: parseInput,
    },
    buttons: [
      { op: 'apply', label: 'Apply updates', usesInput: false },
      {
        op: 'add',
        label: 'Add update',
        usesInput: true,
        primary: true,
        args: ['l', 'r', 'x'],
      },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random updates',
      make: (rng) => batch(8, ranges(rng, 8, 5, 2, 8)),
    },
    presets,
    sizes: [6, 8, 10, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'q updates, difference array',
      best: {
        cost: 'Θ(q + n)',
        why: 'Two writes per update and one pass of n sums, however long the ranges.',
        example: 'four-updates',
      },
      average: {
        cost: 'Θ(q + n)',
        why: 'The same: an update never looks at the cells it covers.',
        example: 'many-long-updates',
      },
      worst: {
        cost: 'Θ(q + n)',
        why: 'Even when every update covers the whole array: 2q writes and n sums.',
        example: 'whole-array',
      },
      note: 'The pass costs n even for one short update: worth it only when the updates are many or long.',
    },
    {
      op: 'q updates, add to every cell',
      best: {
        cost: 'Θ(q)',
        why: 'Updates of one value each: one write per update, and no pass at all.',
        example: 'short-ranges',
      },
      average: {
        cost: 'Θ(q·n)',
        why: 'A random range covers about a third of the array.',
        example: 'every-cell',
      },
      worst: {
        cost: 'Θ(q·n)',
        why: 'Every update covers all n values: q·n writes.',
        example: 'whole-array',
      },
    },
    {
      op: 'read one value, between updates',
      best: {
        cost: 'O(1)',
        why: 'Adding to every cell keeps A up to date: just read it.',
        example: 'every-cell',
      },
      average: {
        cost: 'O(n)',
        why: 'With D, a value is A[i] plus D[0] + … + D[i]: a running sum each time.',
      },
      worst: {
        cost: 'O(n)',
        why: 'Reading A[n − 1] adds up all of D.',
        example: 'four-updates',
      },
      note: 'Updates and reads mixed together call for a Fenwick tree: O(log n) for each.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(differenceArray, settings as DSettings, 1, calls);
      const s0 = t.initial.state;
      const input = [`load ${s0.a.join(' ')}`, ...s0.updates.map((u) => `add ${u.l} ${u.r} ${u.x}`)];
      const expected: string[] = [];
      let before = s0;
      for (const e of t.entries) {
        const [name] = e.call;
        if (name === 'load') {
          if (typeof readValues(e.call[1]) !== 'string') input.push(`load ${e.end.a.join(' ')}`);
        } else if (name === 'add') {
          if (e.end.updates.length > before.updates.length) {
            const u = e.end.updates.at(-1)!;
            input.push(`add ${u.l} ${u.r} ${u.x}`);
          }
        } else if (name === 'apply' && before.updates.length > 0) {
          input.push('apply');
          expected.push(e.end.a.join(' '));
        }
        before = e.end;
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourUpdates,
    everyCell,
    manyLongUpdates,
    shortRanges,
    wholeArray,
    cancelOut,
  ] as unknown as SavedExample[],
  practice: differencePractice(() => differenceArray),
  preview: { example: 'four-updates', level: 2 },
};

export default differenceArray;
