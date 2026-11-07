import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/queens.hpp?raw';
import javaSource from './code/java/Queens.java?raw';
import pythonSource from './code/python/queens.py?raw';
import deadEnd from './examples/dead-end.json';
import eightAll from './examples/eight-all.json';
import eightFirst from './examples/eight-first.json';
import fiveStraight from './examples/five-straight.json';
import fourAll from './examples/four-all.json';
import fourFirst from './examples/four-first.json';
import sixAll from './examples/six-all.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type QueenExtra,
  type QueenSettings,
  type QueenState,
} from './model';
import { queensPractice } from './practice';
import { view } from './view';

export const nQueens: VizDef<QueenState, QueenSettings, QueenExtra> = {
  id: 'n-queens',
  title: 'N-Queens',
  family: 'Recursion',
  blurb: 'Place N queens so that none attacks another: row by row, backing up at every dead end.',
  settings: [
    { kind: 'number', key: 'n', label: 'Board size N', min: 4, max: 8 },
    {
      kind: 'choice',
      key: 'goal',
      label: 'Goal',
      options: [
        { value: 'first', label: 'Stop at the first solution' },
        { value: 'all', label: 'Count all the solutions' },
      ],
      help: 'Counting all of them goes on after each solution until row 1 runs out of columns. From 7 queens on, Solve stops at each solution instead of every move.',
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
    buttons: [
      { op: 'solve', label: 'Solve', usesInput: false, primary: true },
      { op: 'step', label: 'Next move', usesInput: false },
      { op: 'clear', label: 'Clear board', usesInput: false },
    ],
    presets: [
      { label: 'Solve', make: () => [['solve']] },
      {
        label: 'Some moves of the search',
        make: (_rng, size) => Array.from({ length: size }, () => ['step'] as OpCall),
      },
      { label: 'Two solutions in a row', make: () => [['solve'], ['solve']] },
    ],
    sizes: [3, 6, 12],
  },
  explain,
  complexity: [
    {
      op: 'Solve, stopping at the first solution: time',
      best: {
        cost: 'O(N²)',
        why: 'The first safe square in every row works (N = 5): N placements, each checked against up to N queens.',
        example: 'five-straight',
      },
      average: {
        cost: 'O(N · N!)',
        why: 'No neat formula: 8 placements for N = 4, 9 for N = 7, 113 for N = 8. It depends on how the first rows go.',
        example: 'four-first',
      },
      worst: {
        cost: 'O(N · N!)',
        why: 'At most N! ways to put one queen in each row and column, each checked in O(N). Pruning stays far below that.',
        example: 'eight-first',
      },
    },
    {
      op: 'Solve, counting every solution: time',
      best: {
        cost: 'O(N · N!)',
        why: 'Every branch is explored to the end, so there is no lucky case.',
        example: 'four-all',
      },
      average: {
        cost: 'O(N · N!)',
        why: 'Pruning keeps it far below N!: 152 placements for N = 6, against 6! = 720.',
        example: 'six-all',
      },
      worst: {
        cost: 'O(N · N!)',
        why: 'N = 8 places 2056 queens to find all 92 solutions.',
        example: 'eight-all',
      },
      note: 'No formula for the number of solutions is known. The counts for large N come from long computer searches like this one.',
    },
    {
      op: 'Stack depth',
      best: { cost: 'O(1)', why: 'Before the first queen, one call is waiting.' },
      average: {
        cost: 'O(N)',
        why: 'One call per row with a queen: the queens on the board are the frames on the stack.',
        example: 'dead-end',
      },
      worst: { cost: 'O(N)', why: 'A full board: N frames.', example: 'eight-first' },
    },
  ],
  practice: queensPractice(() => nQueens),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as QueenSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourFirst,
    deadEnd,
    fiveStraight,
    eightFirst,
    fourAll,
    sixAll,
    eightAll,
  ] as unknown as SavedExample[],
  preview: { example: 'four-first', level: 2 },
};

/**
 * Driver protocol for the code tabs: "first n" prints the columns of the first solution, from
 * 1, and "count n" prints how many solutions there are. Only a Solve that starts on an empty
 * board has a driver line; one that carries on an earlier search is left out.
 */
function codeScript(calls: OpCall[], settings: QueenSettings) {
  const t = new Timeline(nQueens, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const fresh = before.placements === 0 && !before.done;
    if (e.call[0] === 'solve' && fresh) {
      if (settings.goal === 'first') {
        input.push(`first ${settings.n}`);
        expected.push(e.end.queens.map((c) => c + 1).join(' ') || 'none');
      } else {
        input.push(`count ${settings.n}`);
        expected.push(String(e.end.solutions));
      }
    }
    before = e.end;
  }
  return { input, expected };
}

export default nQueens;
