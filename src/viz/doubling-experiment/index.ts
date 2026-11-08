import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import { ALGO, ALGOS } from './algos';
import cppSource from './code/cpp/doubling.hpp?raw';
import javaSource from './code/java/Doubling.java?raw';
import pythonSource from './code/python/doubling.py?raw';
import fitEveryPoint from './examples/fit-every-point.json';
import fourTimesTheWork from './examples/four-times-the-work.json';
import hashSetLinear from './examples/hash-set-linear.json';
import linearExactlyTwo from './examples/linear-exactly-two.json';
import logFactorHides from './examples/log-factor-hides.json';
import logNCreeps from './examples/log-n-creeps.json';
import noiseMedian from './examples/noise-median.json';
import noiseOneRun from './examples/noise-one-run.json';
import predictAndCheck from './examples/predict-and-check.json';
import predictFromSmallN from './examples/predict-from-small-n.json';
import smallNMisleads from './examples/small-n-misleads.json';
import explain from './explain.md?raw';
import {
  MAX_ROWS,
  algoOf,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type DxSettings,
  type DxState,
} from './model';
import { doublingPractice } from './practice';
import { view } from './view';

/** The largest n any algorithm takes; each one says its own range when it runs. */
const LARGEST = Math.max(...ALGOS.map((id) => ALGO[id].maxN));

export const parseN = (token: string): Value | Error =>
  parseWhole(token.replace(/[,_]/g, ''), 1, LARGEST, 'n');

const algoFor = (settings?: Settings) => algoOf({ ...defaults, ...settings } as DxSettings);

/** A starting n near `size` that leaves room for at least four sizes. */
function startFor(size: number, settings?: Settings): number {
  const al = algoFor(settings);
  return Math.max(al.minN, Math.min(size, Math.floor(al.maxN / 8)));
}

/** The last size a run from n measures. */
function lastSize(n: number, settings?: Settings): number {
  const al = algoFor(settings);
  let m = n;
  for (let k = 1; k < MAX_ROWS && m * 2 <= al.maxN; k++) m *= 2;
  return m;
}

export const doublingExperiment: VizDef<DxState, DxSettings, undefined> = {
  id: 'doubling-experiment',
  title: 'Doubling experiments',
  family: 'Foundations',
  blurb:
    'Measure an algorithm at n, 2n, 4n, …; the ratio of each count to the one before gives the exponent b, the log-log plot shows it as a slope, and the model predicts bigger n.',
  settings: [
    {
      kind: 'choice',
      key: 'algo',
      label: 'Algorithm',
      options: ALGOS.map((id) => ({ value: id, label: ALGO[id].label })),
      help: 'Each one counts its basic steps: comparisons, probes, slots looked at or triples checked. The searches look for a value that is not there, their worst case.',
    },
    {
      kind: 'choice',
      key: 'noise',
      label: 'Timing noise',
      options: [
        { value: 'off', label: 'Off: count the steps exactly' },
        { value: 'one', label: 'On: one timed run per size' },
        { value: 'median', label: 'On: the median of 5 timed runs per size' },
      ],
      help: 'A timer does not count steps. It reads the steps times a random factor, and short runs stray the most. The factor comes from the seed, so a replay reads the same.',
    },
    {
      kind: 'choice',
      key: 'fit',
      label: 'Fit the model with',
      options: [
        { value: 'last', label: 'The last two sizes (Sedgewick and Wayne)' },
        { value: 'all', label: 'A least-squares line through every size' },
      ],
      help: 'The last two sizes are the biggest, so lower-order terms matter least there. A line through every size uses all the data, the small sizes included.',
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
      label: 'n',
      placeholder: 'e.g. 100',
      maxLength: 9,
      sample: '100',
      parse: parseN,
    },
    buttons: [
      { op: 'run', label: 'Run from n', usesInput: true, primary: true },
      { op: 'predict', label: 'Predict T(n)', usesInput: true },
    ],
    presets: [
      { label: 'Run from this n', make: (_rng, size, st) => [['run', startFor(size, st)]] },
      {
        label: 'Run, then predict two doublings on',
        make: (_rng, size, st) => {
          const n = startFor(size, st);
          return [
            ['run', n],
            ['predict', Math.min(algoFor(st).maxN, 4 * lastSize(n, st))],
          ];
        },
      },
      { label: 'Start at the smallest n', make: (_rng, _size, st) => [['run', algoFor(st).minN]] },
      {
        label: 'Random start',
        make: (rng, _size, st) => [['run', rng.int(algoFor(st).minN, startFor(1000, st))]],
      },
      {
        label: 'Run twice: same sizes, new inputs',
        make: (_rng, size, st) => [
          ['run', startFor(size, st)],
          ['run', startFor(size, st)],
        ],
      },
    ],
    sizes: [10, 100, 1000],
  },
  explain,
  complexity: [
    {
      op: 'linear search for a missing value',
      best: { cost: 'O(n)', why: 'Missing means every item is compared.' },
      average: { cost: 'O(n)', why: 'Exactly n comparisons, whatever the input.' },
      worst: {
        cost: 'O(n)',
        why: 'Every doubling ratio is exactly 2: b = 1.',
        example: 'linear-exactly-two',
      },
      note: 'Searching for a value that is there has a best case of O(1), the first item.',
    },
    {
      op: 'binary search for a missing value',
      best: { cost: 'O(log n)', why: 'Missing: it halves until nothing is left.' },
      average: { cost: 'O(log n)', why: '⌊log₂ n⌋ + 1 probes.' },
      worst: {
        cost: 'O(log n)',
        why: 'Each doubling adds one probe, so b creeps toward 0.',
        example: 'log-n-creeps',
      },
    },
    {
      op: 'counting distinct values with a hash set',
      best: { cost: 'O(n)', why: 'One slot per value when nothing collides.' },
      average: {
        cost: 'O(n)',
        why: 'A slot or two per value at a load of half or less: b stays near 1.',
        example: 'hash-set-linear',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Every value hashing to one cluster: no random input does that.',
      },
    },
    {
      op: 'merge sort',
      best: { cost: 'O(n log n)', why: 'It splits and merges whatever the order.' },
      average: {
        cost: 'O(n log n)',
        why: 'Ratios a little over 2: b reads about 1.1 and slides toward 1.',
        example: 'log-factor-hides',
      },
      worst: { cost: 'O(n log n)', why: 'At most n − 1 comparisons per level, log n levels.' },
    },
    {
      op: 'insertion sort',
      best: { cost: 'O(n)', why: 'Sorted input: one comparison per item.' },
      average: {
        cost: 'O(n²)',
        why: 'Random input: about n²/4 comparisons, ratios near 4.',
        example: 'four-times-the-work',
      },
      worst: { cost: 'O(n²)', why: 'Reverse order: n(n − 1)/2 comparisons.' },
    },
    {
      op: 'brute-force 3-sum',
      best: { cost: 'O(n³)', why: 'It checks every triple, n(n − 1)(n − 2)/6 of them.' },
      average: { cost: 'O(n³)', why: 'The same count for every input of size n.' },
      worst: {
        cost: 'O(n³)',
        why: 'Ratios fall toward 8 from above as n grows.',
        example: 'small-n-misleads',
      },
    },
    {
      op: 'a whole doubling run, up to size N',
      best: { cost: 'O(T(N))', why: 'The last size costs the most.' },
      average: {
        cost: 'O(T(N))',
        why: 'The sizes before it add T(N)/2ᵇ + T(N)/4ᵇ + …, less than T(N) again for b ≥ 1.',
        example: 'predict-and-check',
      },
      worst: {
        cost: 'O(T(N) log N)',
        why: 'For b near 0 (a log) each size costs about the same, and there are log N of them.',
      },
    },
  ],
  practice: doublingPractice(() => doublingExperiment),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DxSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourTimesTheWork,
    predictAndCheck,
    logFactorHides,
    logNCreeps,
    linearExactlyTwo,
    hashSetLinear,
    smallNMisleads,
    fitEveryPoint,
    predictFromSmallN,
    noiseOneRun,
    noiseMedian,
  ] as unknown as SavedExample[],
  preview: { example: 'predict-and-check', level: 2, hide: ['t-', 'p-gx', 'p-gy'] },
  opening: 'predict-and-check',
};

/** What the drivers run without taking long: up to this many steps, and inputs this big. */
const DRIVER = { steps: 50_000, n: 20_000 };

/**
 * Driver protocol for the code tabs. "run insertion 100 800 4821" runs the doubling loop from
 * n = 100 up to 800 on seed 4821's inputs and prints one line per size: n, T(n) and b (a dash
 * for the first size). "count insertion 20000 4821" prints one count. The drivers count exactly,
 * so with noise on they still match the true counts. Sizes too big for the drivers are left
 * out, and so are rejected calls.
 */
function codeScript(calls: OpCall[], settings: DxSettings) {
  const t = new Timeline(doublingExperiment, settings, 1, calls);
  const algo = algoOf(settings).id;
  const small = (n: number, steps: number) => n <= DRIVER.n && steps <= DRIVER.steps;
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.steps.length === 1) continue;
    const s = e.end;
    if (e.call[0] === 'run') {
      const rows = s.rows.filter((r, k) =>
        s.rows.slice(0, k + 1).every((q) => small(q.n, q.exact)),
      );
      if (!rows.length) continue;
      input.push(`run ${algo} ${rows[0]!.n} ${rows.at(-1)!.n} ${s.seed}`);
      rows.forEach((r, k) =>
        expected.push(
          `${r.n} ${r.exact} ${k ? Math.log2(r.exact / rows[k - 1]!.exact).toFixed(2) : '-'}`,
        ),
      );
    }
    if (e.call[0] === 'predict' && s.guess && small(s.guess.n, s.guess.exact)) {
      input.push(`count ${algo} ${s.guess.n} ${s.seed}`);
      expected.push(String(s.guess.exact));
    }
  }
  return { input, expected };
}

export default doublingExperiment;
