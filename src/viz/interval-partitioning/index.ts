import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { intervalsFromArg, intervalsText, type Interval } from '../_intervals/kit';
import cppSource from './code/cpp/rooms.hpp?raw';
import javaSource from './code/java/Rooms.java?raw';
import pythonSource from './code/python/rooms.py?raw';
import allAtOnce from './examples/all-at-once.json';
import backToBack from './examples/back-to-back.json';
import soonestFree from './examples/soonest-free.json';
import tenLectures from './examples/ten-lectures.json';
import touchingClash from './examples/touching-clash.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LECTURES,
  ops,
  pseudocode,
  type PartExtra,
  type PartSettings,
  type PartState,
} from './model';
import { partPractice, randomLectures } from './practice';
import { view } from './view';

export function parseLectures(text: string): Value | Error {
  const ls = intervalsFromArg(text, MAX_LECTURES, 'lecture');
  if (typeof ls === 'string') return new Error(ls);
  return intervalsText(ls);
}

const solve = (ls: Interval[]): OpCall[] => [['load', intervalsText(ls)], ['schedule']];
const make = (pairs: [number, number][]) => pairs.map(([s, f], k) => ({ id: k + 1, s, f }));

export const intervalPartitioning: VizDef<PartState, PartSettings, PartExtra> = {
  id: 'interval-partitioning',
  title: 'Interval partitioning',
  family: 'Greedy algorithms',
  blurb:
    'Give every lecture a room, with as few rooms as possible: by start time, reuse the room free soonest from a min-heap.',
  settings: [
    {
      kind: 'choice',
      key: 'touch',
      label: 'A lecture that starts when another ends',
      options: [
        { value: 'share', label: 'Can use its room: times are [start, finish) (CLRS)' },
        { value: 'conflict', label: 'Clashes with it: times are [start, finish]' },
      ],
      help: 'Changes which lectures overlap, and so the depth.',
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
      label: 'Lectures',
      placeholder: 'e.g. 9-11 9-13 11-14',
      maxLength: 60,
      sample: '9-11 9-13 9-11 11-13',
      parse: parseLectures,
    },
    buttons: [
      { op: 'load', label: 'Load lectures', usesInput: true, primary: true },
      { op: 'schedule', label: 'Schedule', usesInput: false },
    ],
    random: {
      label: 'Random lectures',
      make: (rng) => solve(randomLectures(rng, rng.int(6, MAX_LECTURES))),
    },
    presets: [
      {
        label: 'Random',
        make: (rng, size) => solve(randomLectures(rng, Math.min(size, MAX_LECTURES))),
      },
      {
        label: 'Back to back (one room)',
        make: (_rng, size) =>
          solve(
            make(Array.from({ length: Math.min(size, MAX_LECTURES) }, (_, k) => [8 + k, 9 + k])),
          ),
      },
      {
        label: 'All at once (a room each)',
        make: (_rng, size) => solve(make(Array.from({ length: Math.min(size, 8) }, () => [9, 12]))),
      },
      {
        label: 'Staircase (two rooms)',
        make: (_rng, size) =>
          solve(
            make(Array.from({ length: Math.min(size, MAX_LECTURES) }, (_, k) => [8 + k, 10 + k])),
          ),
      },
    ],
    sizes: [5, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'schedule',
      best: {
        cost: 'Θ(n log n)',
        why: 'The sort by start time, even when one room is enough.',
        example: 'back-to-back',
      },
      average: {
        cost: 'O(n log n)',
        why: 'The sort, then one heap operation or two per lecture, O(log d) each for d rooms.',
        example: 'ten-lectures',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'Every lecture needs its own room: the heap grows to n.',
        example: 'all-at-once',
      },
      note: 'Checking every open room instead of using a heap is O(nd): fine for a few rooms, slow for many.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PartSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    tenLectures,
    backToBack,
    touchingClash,
    allAtOnce,
    soonestFree,
  ] as unknown as SavedExample[],
  practice: partPractice(() => intervalPartitioning),
  preview: { example: 'soonest-free', level: 2, hide: ['heap', 'depth', 'axis', 'tick', 'time'] },
};

/**
 * Driver protocol for the code tabs: "rooms s-f ..." prints the number of rooms and each
 * lecture's room in the order typed. The code uses half-open times, the default.
 */
function codeScript(calls: OpCall[], settings: PartSettings) {
  const t = new Timeline(intervalPartitioning, { ...settings, touch: 'share' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'schedule') continue;
    const rooms = Math.max(...e.end.room.map((r) => r ?? 0));
    input.push(`rooms ${intervalsText(e.end.lects)}`);
    expected.push([rooms, ...e.end.room].join(' '));
  }
  return { input, expected };
}

export default intervalPartitioning;
