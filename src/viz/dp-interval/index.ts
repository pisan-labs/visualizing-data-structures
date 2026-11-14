import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/intervals.hpp?raw';
import javaSource from './code/java/Intervals.java?raw';
import pythonSource from './code/python/intervals.py?raw';
import cheapestMerge from './examples/cheapest-merge.json';
import equalPiles from './examples/equal-piles.json';
import oneTile from './examples/one-tile.json';
import recursionRepeats from './examples/recursion-repeats.json';
import takeSmallFirst from './examples/take-small-first.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  readItems,
  type IVExtra,
  type IVSettings,
  type IVState,
} from './model';
import { ivPractice } from './practice';
import { view } from './view';

/** The input box holds the row: tile numbers or pile sizes. */
export function parseRow(text: string): Value | Error {
  const v = readItems(text, 'merge');
  return typeof v === 'string' ? new Error(v) : v.join(' ');
}

const between = (rng: Rng, n: number, lo: number, hi: number) =>
  Array.from({ length: n }, () => rng.int(lo, hi));

const solveIt = (v: number[]): OpCall[] => [['load', v.join(' ')], ['solve'], ['trace']];

/** Tiles 1 to 9 suit both problems (a pile may be up to 20). */
const presets: Preset[] = [
  { label: 'Random', make: (rng, n) => solveIt(between(rng, Math.min(n, MAX_N), 1, 9)) },
  {
    label: 'Small values among big ones',
    make: (rng, n) =>
      solveIt(
        Array.from({ length: Math.min(n, MAX_N) }, (_, i) =>
          i % 2 ? rng.int(1, 2) : rng.int(6, 9),
        ),
      ),
  },
  {
    label: 'Sorted, smallest first',
    make: (rng, n) => solveIt(between(rng, Math.min(n, MAX_N), 1, 9).sort((a, b) => a - b)),
  },
  {
    label: 'All the same (many ties)',
    make: (rng, n) => solveIt(Array(Math.min(n, MAX_N)).fill(rng.int(2, 5))),
  },
  {
    label: 'One big value at an end',
    make: (rng, n) => solveIt([...between(rng, Math.min(n, MAX_N) - 1, 1, 3), 9]),
  },
];

export const dpInterval: VizDef<IVState, IVSettings, IVExtra> = {
  id: 'dp-interval',
  title: 'DP over intervals',
  family: 'DP patterns',
  blurb:
    'Find the best order to take tiles from a row when each scores with its neighbours, or to merge neighbouring piles at the least cost: solve every stretch of the row by the item it deals with last, shortest stretches first. Θ(n³) for the table against 3ⁿ⁻¹ calls of plain recursion.',
  settings: [
    approachSetting({
      pattern: 'The table, by length, O(n³)',
      naive: 'Plain recursion, O(3ⁿ)',
    }),
    {
      kind: 'choice',
      key: 'problem',
      label: 'Problem',
      options: [
        { value: 'remove', label: 'Take tiles: each scores with its two neighbours' },
        { value: 'merge', label: 'Merge neighbouring piles at the least cost' },
      ],
      help: 'Taking a tile scores its number times the two things beside it (the ends of the row count as 1). Merging two piles costs their total size.',
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
      label: 'Row',
      placeholder: `up to ${MAX_N} numbers, e.g. 5 6 1 4`,
      maxLength: 40,
      sample: '5 6 1 4',
      parse: parseRow,
    },
    buttons: [
      { op: 'solve', label: 'Solve', usesInput: false },
      { op: 'trace', label: 'Trace the order', usesInput: false },
      { op: 'load', label: 'Load', usesInput: true, primary: true },
    ],
    random: { label: 'Random row', make: (rng) => solveIt(between(rng, 4, 1, 9)) },
    presets,
    sizes: [3, 4, 5, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'solve, the table by length',
      best: { cost: 'Θ(1)', why: 'One tile: one stretch, one choice.', example: 'one-tile' },
      average: {
        cost: 'Θ(n³)',
        why: 'n(n + 1)/2 stretches, each trying every k in it: 10 cells and 20 choices for 4 tiles.',
        example: 'take-small-first',
      },
      worst: {
        cost: 'Θ(n³)',
        why: 'The loops never stop early: n(n + 1)(n + 2)/6 choices for n tiles (56 for 6), (n − 1)n(n + 1)/6 for n piles (20 for 5).',
        example: 'cheapest-merge',
      },
      note: 'Space Θ(n²) for the values and the k of every stretch.',
    },
    {
      op: 'solve, plain recursion',
      best: { cost: 'Θ(1)', why: 'One tile, or one pile: one call.', example: 'one-tile' },
      average: {
        cost: 'Θ(3ⁿ)',
        why: 'A stretch of length L asks for two shorter ones for each of its L choices.',
        example: 'recursion-repeats',
      },
      worst: {
        cost: 'Θ(3ⁿ)',
        why: '3ⁿ⁻¹ calls for the whole row: 81 for 5 tiles, 243 for 6, against 15 and 21 cells.',
        example: 'recursion-repeats',
      },
    },
    {
      op: 'trace the order',
      best: { cost: 'Θ(n)', why: 'One step per tile taken, or per merge.', example: 'one-tile' },
      average: {
        cost: 'Θ(n)',
        why: 'Each stretch looks up its k once.',
        example: 'take-small-first',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'n − 1 merges, or n tiles, whatever the order.',
        example: 'equal-piles',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as IVSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    takeSmallFirst,
    recursionRepeats,
    cheapestMerge,
    equalPiles,
    oneTile,
  ] as unknown as SavedExample[],
  practice: ivPractice(() => dpInterval),
  preview: { example: 'take-small-first', level: 2, hide: ['item-', 'post-', 'strip-'] },
};

/**
 * Driver protocol for the code tabs: "best v..." and "order v..." for taking tiles, "cost v..."
 * and "tree v..." for merging piles; the first of each pair prints the answer (after Solve), the
 * second the answer and the order (after Trace the order). Refused operations are left out.
 */
function codeScript(calls: OpCall[], settings: IVSettings) {
  const t = new Timeline(dpInterval, settings, 1, calls);
  const merge = settings.problem === 'merge';
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const v = e.steps.at(-1)!.vars ?? {};
    const row = e.end.v.join(' ');
    const answer = merge ? v.cost : v.score;
    if (answer === undefined) continue;
    if (e.call[0] === 'solve') {
      input.push(`${merge ? 'cost' : 'best'} ${row}`);
      expected.push(String(answer));
    } else if (e.call[0] === 'trace' && v.order !== undefined) {
      input.push(`${merge ? 'tree' : 'order'} ${row}`);
      expected.push(`${answer} ${v.order}`);
    }
  }
  return { input, expected };
}

export default dpInterval;
