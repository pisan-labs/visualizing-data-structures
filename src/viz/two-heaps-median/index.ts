import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/running_median.hpp?raw';
import javaSource from './code/java/RunningMedian.java?raw';
import pythonSource from './code/python/running_median.py?raw';
import allTheSame from './examples/all-the-same.json';
import fallingHeaps from './examples/falling-heaps.json';
import fallingStream from './examples/falling-stream.json';
import lowerMedian from './examples/lower-median.json';
import risingStream from './examples/rising-stream.json';
import runningMedian from './examples/running-median.json';
import sortedList from './examples/sorted-list.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_STREAM,
  ops,
  parseInput,
  pseudocode,
  type MedianExtra,
  type MedianSettings,
  type MedianState,
} from './model';
import { medianPractice } from './practice';
import { view } from './view';

const adds = (vs: number[]): OpCall[] => [['clear'], ...vs.map((v): OpCall => ['add', v])];

const random = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 99));

const presets: Preset[] = [
  { label: 'Random stream', make: (rng, n) => adds(random(rng, n)) },
  {
    label: 'Rising (the sorted list’s best case)',
    make: (rng, n) => adds(random(rng, n).sort((x, y) => x - y)),
  },
  {
    label: 'Falling (the sorted list’s worst case)',
    make: (rng, n) => adds(random(rng, n).sort((x, y) => y - x)),
  },
  {
    label: 'Zigzag: low, high, low, high',
    make: (rng, n) => adds(Array.from({ length: n }, (_, i) => (i % 2 ? rng.int(60, 99) : rng.int(1, 40)))),
  },
  {
    label: 'Many duplicates',
    make: (rng, n) => adds(Array.from({ length: n }, () => rng.int(1, 3) * 10)),
  },
];

export const twoHeapsMedian: VizDef<MedianState, MedianSettings, MedianExtra> = {
  id: 'two-heaps-median',
  title: 'Running median with two heaps',
  family: 'Heap patterns',
  blurb:
    'The median of a stream after every value: a max-heap holds the low half, a min-heap the high half, and the median sits on their tops. O(log n) per value, against O(n) for keeping one sorted list.',
  settings: [
    approachSetting({
      pattern: 'Two heaps, O(log n) per value',
      naive: 'A sorted list, O(n) per value',
    }),
    {
      kind: 'choice',
      key: 'even',
      label: 'Median of an even count',
      options: [
        { value: 'mean', label: 'The mean of the two middle values' },
        { value: 'lower', label: 'The lower middle value (CLRS)' },
      ],
      help: 'Textbooks differ. CLRS calls the lower of the two middle values the median; most problems ask for their mean.',
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
      label: 'Value',
      placeholder: 'e.g. 7, or 5 15 1 3',
      maxLength: 50,
      sample: '7',
      parse: parseInput,
    },
    buttons: [
      { op: 'add', label: 'Add', usesInput: true, bulk: true, primary: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Random stream', make: (rng) => adds(random(rng, 9)) },
    presets,
    sizes: [6, 8, 10, MAX_STREAM],
  },
  explain,
  complexity: [
    {
      op: 'add(x), two heaps',
      best: {
        cost: 'O(1)',
        why: 'x is no bigger than the low top, stays at the bottom of the low half, and nothing moves: one or two comparisons.',
        example: 'all-the-same',
      },
      average: {
        cost: 'O(log n)',
        why: 'One comparison to pick a half, a sift-up, and at most one top moving over: a pop and a push.',
        example: 'running-median',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Each heap holds about n/2 values, so a sift is at most about log n levels.',
        example: 'falling-heaps',
      },
      note: 'median() is O(1): it reads the tops. Over n values the heaps cost O(n log n).',
    },
    {
      op: 'add(x), a sorted list',
      best: {
        cost: 'O(1)',
        why: 'A rising stream: each value is the largest so far, one comparison and no shift.',
        example: 'rising-stream',
      },
      average: { cost: 'O(n)', why: 'x slides past about half the list.', example: 'sorted-list' },
      worst: {
        cost: 'Θ(n)',
        why: 'A falling stream: each value slides past every one before it.',
        example: 'falling-stream',
      },
      note: 'Binary search finds the place in O(log n) comparisons, but the shifts are still O(n). Over n values: O(n²).',
    },
    {
      op: 'median(), either way',
      best: { cost: 'O(1)', why: 'The two tops, or the middle of the sorted list.', example: 'running-median' },
      average: { cost: 'O(1)', why: 'Nothing is searched; the structure keeps the middle in reach.' },
      worst: { cost: 'O(1)', why: 'Reading one or two values and taking their mean.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as MedianSettings;
      const t = new Timeline(twoHeapsMedian, s, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        if (e.call[0] === 'clear') input.push('clear');
        const m = e.steps.at(-1)!.vars?.median;
        if (e.call[0] === 'add' && m !== undefined) {
          input.push(`add ${e.end.stream.at(-1)!.key}`, s.even === 'lower' ? 'lower' : 'median');
          expected.push(String(m));
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    runningMedian,
    sortedList,
    lowerMedian,
    risingStream,
    fallingStream,
    fallingHeaps,
    allTheSame,
  ] as unknown as SavedExample[],
  practice: medianPractice(() => twoHeapsMedian),
  preview: { example: 'running-median', level: 1 },
  opening: 'running-median',
};

export default twoHeapsMedian;
