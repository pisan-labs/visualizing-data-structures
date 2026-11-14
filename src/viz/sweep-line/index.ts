import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/sweep.hpp?raw';
import javaSource from './code/java/Sweep.java?raw';
import pythonSource from './code/python/sweep.py?raw';
import allAtOnce from './examples/all-at-once.json';
import everyStart from './examples/every-start.json';
import skylineEveryEdge from './examples/skyline-every-edge.json';
import skylineHeap from './examples/skyline-heap.json';
import skylineHidden from './examples/skyline-hidden.json';
import skylineSameHeight from './examples/skyline-same-height.json';
import sweepEvents from './examples/sweep-events.json';
import touchEndsFirst from './examples/touch-ends-first.json';
import touchStartsFirst from './examples/touch-starts-first.json';
import explain from './explain.md?raw';
import {
  bldInput,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  parseInput,
  pseudocode,
  type Bld,
  type SLExtra,
  type SLSettings,
  type SLState,
} from './model';
import { sweepPractice } from './practice';
import { view } from './view';

type Raw = { s: number; f: number; h: number };
const load = (bs: Raw[]): OpCall => ['load', bs.map((b) => bldInput({ id: 0, ...b })).join(' ')];
const solve = (bs: Raw[]): OpCall[] => [load(bs), ['sweep']];

/** n random intervals with heights, times 0 to 16. */
export function randomBuildings(rng: Rng, n: number): Raw[] {
  return Array.from({ length: n }, () => {
    const len = rng.int(2, 6);
    const s = rng.int(0, 16 - len);
    return { s, f: s + len, h: rng.int(1, 9) };
  });
}

const presets: Preset[] = [
  { label: 'Random', make: (rng, n) => solve(randomBuildings(rng, n)) },
  {
    label: 'All at once: everything overlaps',
    make: (rng, n) =>
      solve(Array.from({ length: n }, (_, k) => ({ s: k, f: 2 * n - k + 1, h: rng.int(1, 9) }))),
  },
  {
    label: 'Back to back: ends touch starts',
    make: (rng, n) =>
      solve(Array.from({ length: n }, (_, k) => ({ s: 2 * k, f: 2 * k + 2, h: rng.int(1, 9) }))),
  },
  {
    label: 'Nested: each inside the last',
    make: (_rng, n) =>
      solve(Array.from({ length: n }, (_, k) => ({ s: k, f: 2 * n - k, h: k + 1 }))),
  },
  {
    label: 'Staircase: each starts later and stands taller',
    make: (_rng, n) => solve(Array.from({ length: n }, (_, k) => ({ s: k, f: k + 4, h: k + 2 }))),
  },
  {
    label: 'Nothing overlaps',
    make: (rng, n) =>
      solve(Array.from({ length: n }, (_, k) => ({ s: 3 * k, f: 3 * k + 2, h: rng.int(1, 9) }))),
  },
];

export const sweepLine: VizDef<SLState, SLSettings, SLExtra> = {
  id: 'sweep-line',
  title: 'Sweep line (overlaps, skyline)',
  family: 'Intervals',
  blurb:
    'Turn each interval into a start and an end, sort the events by time, and walk them once: the most intervals open at once, and the skyline of buildings with a max-heap of the heights standing.',
  settings: [
    approachSetting({
      pattern: 'Sort the events, then one sweep, O(n log n)',
      naive: 'Check every point, O(n²)',
    }),
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find',
      options: [
        { value: 'overlap', label: 'The most intervals open at once' },
        { value: 'skyline', label: 'The skyline: the outline of buildings (uses heights)' },
      ],
      help: 'Type a height after an interval, such as 2-5:7, for the skyline; with none it is 1.',
    },
    {
      kind: 'choice',
      key: 'ties',
      label: 'At the same time',
      options: [
        { value: 'ends', label: 'Ends go first: times are [start, end) (CLRS)' },
        { value: 'starts', label: 'Starts go first: times are [start, end]' },
      ],
      help: 'Decides whether intervals that only touch overlap. For the skyline it changes only the order of the steps.',
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
      placeholder: 'e.g. 1-6 2-5 4-9, or 2-5:7 with a height',
      maxLength: 80,
      sample: '2-5:7',
      parse: parseInput,
    },
    buttons: [
      { op: 'sweep', label: 'Sweep', usesInput: false, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random intervals',
      make: (rng) => solve(randomBuildings(rng, rng.int(5, 7))),
    },
    presets,
    sizes: [4, 6, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'the most open, sorted events',
      best: {
        cost: 'Θ(n log n)',
        why: 'Sorting the 2n events, even when nothing overlaps; the sweep is 2n updates.',
        example: 'sweep-events',
      },
      average: {
        cost: 'Θ(n log n)',
        why: 'A merge sort of 2n events, then one update per event.',
        example: 'sweep-events',
      },
      worst: {
        cost: 'Θ(n log n)',
        why: 'Everything open at once changes nothing: still one update per event.',
        example: 'all-at-once',
      },
      note: 'With times that are small whole numbers, a counting sort or a difference array makes it Θ(n + T).',
    },
    {
      op: 'the most open, every start',
      best: { cost: 'Θ(n²)', why: 'Every start against every interval, whatever they hold.' },
      average: {
        cost: 'Θ(n²)',
        why: '6 intervals: 36 checks.',
        example: 'every-start',
      },
      worst: { cost: 'Θ(n²)', why: 'n points, n checks each: the loops never stop early.' },
    },
    {
      op: 'skyline, max-heap',
      best: {
        cost: 'Θ(n log n)',
        why: 'The sort of 2n edges, even when no building hides another.',
        example: 'skyline-heap',
      },
      average: {
        cost: 'O(n log n)',
        why: 'Each building is pushed once and popped at most once, O(log n) each.',
        example: 'skyline-heap',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'Many ended heights can pile up under a tall one and leave together: still one pop each.',
        example: 'skyline-hidden',
      },
    },
    {
      op: 'skyline, every building at every edge',
      best: { cost: 'Θ(n²)', why: 'Up to 2n edges, n checks each.' },
      average: {
        cost: 'Θ(n²)',
        why: '5 buildings, 9 edges: 45 checks.',
        example: 'skyline-every-edge',
      },
      worst: { cost: 'Θ(n²)', why: 'All 2n edges distinct: 2n² checks.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SLSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sweepEvents,
    everyStart,
    touchEndsFirst,
    touchStartsFirst,
    allAtOnce,
    skylineHeap,
    skylineEveryEdge,
    skylineHidden,
    skylineSameHeight,
  ] as unknown as SavedExample[],
  practice: sweepPractice(() => sweepLine),
  preview: {
    example: 'skyline-heap',
    level: 2,
    hide: ['axis', 'tick', 'time', 'sweep', 'hp-', 'heap', 'kc-'],
  },
};

/**
 * Driver protocol for the code tabs, which follow the default tie rule (ends first):
 * "most s-f ..." prints the most intervals open at once; "skyline s-f:h ..." prints the key
 * points as x,h separated by spaces.
 */
function codeScript(calls: OpCall[], settings: SLSettings) {
  const t = new Timeline(sweepLine, { ...settings, ties: 'ends' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let cur: Bld[] = t.initial.state.ivs;
  for (const e of t.entries) {
    const last = e.steps.at(-1)!;
    if (e.call[0] === 'sweep' && e.steps.length > 1) {
      if (settings.goal === 'skyline') {
        input.push(`skyline ${cur.map(bldInput).join(' ')}`);
        expected.push(last.extra!.keys!.map((k) => `${k.x},${k.h}`).join(' '));
      } else {
        input.push(`most ${cur.map((b) => `${b.s}-${b.f}`).join(' ')}`);
        expected.push(String(last.vars?.most));
      }
    }
    cur = e.end.ivs;
  }
  return { input, expected };
}

export default sweepLine;
