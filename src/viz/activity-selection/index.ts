import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { intervalsFromArg, intervalsText, type Interval } from '../_intervals/kit';
import cppSource from './code/cpp/activities.hpp?raw';
import javaSource from './code/java/ActivitySelection.java?raw';
import pythonSource from './code/python/activities.py?raw';
import allOverlap from './examples/all-overlap.json';
import backToBack from './examples/back-to-back.json';
import eleven from './examples/eleven.json';
import elevenShortest from './examples/eleven-shortest.json';
import shortestFails from './examples/shortest-fails.json';
import startFails from './examples/start-fails.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_ACTS,
  ops,
  pseudocode,
  type ActExtra,
  type ActSettings,
  type ActState,
} from './model';
import { actPractice, randomActs } from './practice';
import { view } from './view';

export function parseActs(text: string): Value | Error {
  const acts = intervalsFromArg(text, MAX_ACTS, 'activity', 'activities');
  if (typeof acts === 'string') return new Error(acts);
  return intervalsText(acts);
}

const solve = (acts: Interval[]): OpCall[] => [['load', intervalsText(acts)], ['select']];
const make = (pairs: [number, number][]) => pairs.map(([s, f], k) => ({ id: k + 1, s, f }));

export const activitySelection: VizDef<ActState, ActSettings, ActExtra> = {
  id: 'activity-selection',
  title: 'Activity selection',
  family: 'Greedy algorithms',
  blurb:
    'Fit the most activities into one room: sort by finish time and take each one that still fits. Other greedy rules fail.',
  settings: [
    {
      kind: 'choice',
      key: 'rule',
      label: 'Greedy rule',
      options: [
        { value: 'finish', label: 'Earliest finish first (CLRS, always right)' },
        { value: 'shortest', label: 'Shortest first (can be wrong)' },
        { value: 'start', label: 'Earliest start first (can be wrong)' },
      ],
      help: 'Each rule sorts the activities its way and takes every one that fits.',
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
      label: 'Activities',
      placeholder: 'e.g. 1-4 3-5 0-6 5-7',
      maxLength: 66,
      sample: '1-4 3-5 0-6 5-7 3-9',
      parse: parseActs,
    },
    buttons: [
      { op: 'load', label: 'Load activities', usesInput: true, primary: true },
      { op: 'select', label: 'Select', usesInput: false },
    ],
    random: { label: 'Random activities', make: (rng) => solve(randomActs(rng, rng.int(6, 9))) },
    presets: [
      { label: 'Random', make: (rng, size) => solve(randomActs(rng, Math.min(size, MAX_ACTS))) },
      {
        label: 'Shortest first fails',
        make: () =>
          solve(
            make([
              [1, 5],
              [4, 7],
              [6, 10],
            ]),
          ),
      },
      {
        label: 'Earliest start fails',
        make: () =>
          solve(
            make([
              [0, 10],
              [1, 3],
              [4, 6],
              [7, 9],
            ]),
          ),
      },
      {
        label: 'Back to back (all fit)',
        make: (_rng, size) =>
          solve(
            make(Array.from({ length: Math.min(size, MAX_ACTS) }, (_, k) => [2 * k, 2 * k + 2])),
          ),
      },
      {
        label: 'Nested (one fits)',
        make: (_rng, size) =>
          solve(make(Array.from({ length: Math.min(size, 8) }, (_, k) => [k, 16 - k]))),
      },
    ],
    sizes: [5, 8, 11],
  },
  explain,
  complexity: [
    {
      op: 'select',
      best: {
        cost: 'Θ(n)',
        why: 'Already sorted by finish time: one pass, one comparison each.',
        example: 'back-to-back',
      },
      average: {
        cost: 'Θ(n log n)',
        why: 'The sort dominates; the pass after it is Θ(n).',
        example: 'eleven',
      },
      worst: { cost: 'Θ(n log n)', why: 'Still the sort.', example: 'all-overlap' },
      note: 'Earliest finish only compares with the last activity taken. The other rules here check every activity taken, O(n²), and are wrong anyway.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ActSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    eleven,
    shortestFails,
    startFails,
    allOverlap,
    backToBack,
    elevenShortest,
  ] as unknown as SavedExample[],
  practice: actPractice(() => activitySelection),
  preview: { example: 'eleven', level: 2 },
};

/**
 * Driver protocol for the code tabs: "select s-f ..." prints the number chosen and their
 * numbers in the order chosen. The code is earliest finish first, the default, so the expected
 * output comes from a run with it.
 */
function codeScript(calls: OpCall[], settings: ActSettings) {
  const t = new Timeline(activitySelection, { ...settings, rule: 'finish' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'select') continue;
    const chosen = e.end.order.filter((id) => e.end.status[id - 1] === 'chosen');
    input.push(`select ${intervalsText(e.end.acts)}`);
    expected.push([chosen.length, ...chosen].join(' '));
  }
  return { input, expected };
}

export default activitySelection;
