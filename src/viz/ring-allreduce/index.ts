import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/ring_allreduce.hpp?raw';
import javaSource from './code/java/RingAllReduce.java?raw';
import pythonSource from './code/python/ring_allreduce.py?raw';
import fiveWorkers from './examples/five-workers.json';
import fourWorkers from './examples/four-workers.json';
import negatives from './examples/negative-gradients.json';
import oneWorker from './examples/one-worker-learns.json';
import sameGradient from './examples/same-gradient.json';
import scatterOnly from './examples/scatter-only.json';
import twoWorkers from './examples/two-workers.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  gradientText,
  init,
  initialSay,
  initialVars,
  MAX_WORKERS,
  MIN_WORKERS,
  ops,
  parseVectors,
  pseudocode,
  randomGradients,
  type RingExtra,
  type RingSettings,
  type RingState,
} from './model';
import { ringPractice } from './practice';
import { view } from './view';

const workersOf = (settings?: Settings) => Number(settings?.workers ?? defaults.workers);

const preset = (label: string, make: (rng: Rng, n: number) => number[][]): Preset => ({
  label,
  make: (rng, _size, settings) => [
    ['load', gradientText(make(rng, workersOf(settings)))],
    ['allreduce'],
  ],
});

export const ringAllreduce: VizDef<RingState, RingSettings, RingExtra> = {
  id: 'ring-allreduce',
  title: 'Ring all-reduce',
  family: 'Training',
  blurb:
    'Workers in a ring add up their gradients chunk by chunk, each talking only to its neighbour: every worker gets the sum while sending less than two copies of its vector, however many workers there are.',
  settings: [
    {
      kind: 'number',
      key: 'workers',
      label: 'Workers N',
      min: MIN_WORKERS,
      max: MAX_WORKERS,
      help: 'Each gradient is cut into N chunks, one per worker. Real rings have one worker per GPU.',
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
      label: 'Gradients, one per worker',
      placeholder: 'e.g. 1 2 3 4 / 5 6 7 8 / …',
      maxLength: 160,
      sample: '1 2 3 4 / 5 6 7 8 / 9 1 2 3 / 4 5 6 7',
      parse: (text) => {
        const g = parseVectors(text);
        return g instanceof Error ? g : gradientText(g);
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'allreduce', label: 'All-reduce', usesInput: false },
      { op: 'scatter', label: 'Reduce-scatter', usesInput: false },
      { op: 'gather', label: 'All-gather', usesInput: false },
      { op: 'fresh', label: 'New gradients', usesInput: false },
    ],
    random: {
      label: 'Random gradients',
      make: () => [['fresh'], ['allreduce']],
    },
    presets: [
      preset('Random gradients', (rng, n) => randomGradients(rng, n)),
      preset('Every worker the same', (rng, n) => {
        const row = randomGradients(rng, 1).flat();
        const v = Array.from({ length: n }, (_, c) => row[c % row.length]! + c);
        return Array.from({ length: n }, () => [...v]);
      }),
      preset('One worker has a gradient, the rest 0', (rng, n) => {
        const k = rng.int(0, n - 1);
        return Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, () => (i === k ? rng.int(1, 9) : 0)),
        );
      }),
      preset('Positive and negative', (rng, n) =>
        Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(-9, 9))),
      ),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Data each worker sends (gradient of M numbers)',
      best: {
        cost: 'M',
        why: 'Two workers: one chunk of M/2 each way in each stage.',
        example: 'two-workers',
      },
      average: {
        cost: '2(N − 1)/N · M',
        why: '2(N − 1) chunks of M/N each, under 2M however large N gets.',
        example: 'four-workers',
      },
      worst: {
        cost: 'Θ(M)',
        why: 'Approaches 2M as N grows; Patarasuk and Yuan show no all-reduce can do better.',
        example: 'five-workers',
      },
    },
    {
      op: 'Steps (rounds of sends)',
      best: { cost: '2', why: 'Two workers: one step each stage.', example: 'two-workers' },
      average: {
        cost: '2(N − 1)',
        why: 'N − 1 for reduce-scatter, N − 1 for all-gather.',
        example: 'four-workers',
      },
      worst: {
        cost: 'Θ(N)',
        why: 'Each step waits for the slowest link, so latency grows with the ring.',
        example: 'five-workers',
      },
      note: 'With a start-up cost α per message and time β per number: about 2(N − 1)·α + 2(N − 1)/N · M·β.',
    },
    {
      op: 'A parameter server, for comparison',
      best: {
        cost: 'N·M in, N·M out',
        why: 'Every worker sends its whole gradient to one server and gets the sum back.',
        example: 'four-workers',
      },
      average: {
        cost: 'Θ(N·M)',
        why: 'All of it crosses the server’s one link, so it slows down as workers are added.',
        example: 'five-workers',
      },
      worst: {
        cost: 'Θ(N·M)',
        why: 'The ring spreads the same work over N links instead.',
        example: 'five-workers',
      },
    },
    {
      op: 'Additions per worker',
      best: {
        cost: '(N − 1)/N · M',
        why: 'Only reduce-scatter adds; all-gather just copies.',
        example: 'scatter-only',
      },
      average: {
        cost: 'Θ(M)',
        why: 'One addition for every number received in reduce-scatter.',
        example: 'four-workers',
      },
      worst: {
        cost: 'Θ(M)',
        why: 'The same for any gradients.',
        example: 'negative-gradients',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RingSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourWorkers,
    twoWorkers,
    fiveWorkers,
    scatterOnly,
    sameGradient,
    oneWorker,
    negatives,
  ] as unknown as SavedExample[],
  practice: ringPractice(() => ringAllreduce),
  preview: { example: 'four-workers', level: 2 },
  opening: 'four-workers',
};

const rows = (v: number[][]) => v.map((row) => row.join(' ')).join(' / ');

/**
 * Driver protocol for the code tabs. "load <n> <n × n numbers, worker by worker>" sets the
 * gradients and prints nothing. "scatter", "gather" and "allreduce" run that part (skipping
 * what has already run, as the page does) and print every worker's vector, " / " between
 * workers.
 */
function codeScript(calls: OpCall[], settings: RingSettings) {
  const t = new Timeline(ringAllreduce, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let g: number[][] | undefined;
  const sync = (s: RingState) => {
    if (s.g !== g) input.push(`load ${s.n} ${s.g.flat().join(' ')}`);
    g = s.g;
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    if (!['scatter', 'gather', 'allreduce'].includes(String(e.call[0]))) continue;
    input.push(String(e.call[0]));
    expected.push(rows(e.end.v));
  }
  return { input, expected };
}

export default ringAllreduce;
