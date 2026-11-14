import { Timeline } from '../../engine/timeline';
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/state_bfs.hpp?raw';
import javaSource from './code/java/StateBfs.java?raw';
import pythonSource from './code/python/state_bfs.py?raw';
import aroundTheWall from './examples/around-the-wall.json';
import coldToWarm from './examples/cold-to-warm.json';
import everySequence from './examples/every-sequence.json';
import everyWordSequence from './examples/every-word-sequence.json';
import noLadder from './examples/no-ladder.json';
import roundTheBack from './examples/round-the-back.json';
import threeWheels from './examples/three-wheels.json';
import walledIn from './examples/walled-in.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  type Puzzle,
  type SSExtra,
  type SSSettings,
  type SSState,
} from './model';
import { stateBfsPractice } from './practice';
import { view } from './view';

const puzzleOf = (settings?: Settings): Puzzle => (settings?.puzzle === 'words' ? 'words' : 'lock');

const two = (n: number) => String(n).padStart(2, '0');

/** Word lists of our own: the first word is the start, `goal` a word to reach (or not). */
const WORD_SETS: { words: string; goal: string }[] = [
  { words: 'cold cord bold colt card word ward warm worm', goal: 'warm' },
  { words: 'cat cot cog dog cut hat hot hog', goal: 'dog' },
  { words: 'lead load goad gold bold bolt boat beat bead', goal: 'gold' },
  { words: 'hand hard card cart dart dark bark', goal: 'bark' },
];

const solve = (list: string, goal: string): OpCall[] => [
  ['load', list],
  ['search', goal],
];

/** `count` barred combinations of a 2-wheel lock, none of them 00 or the goal. */
function barred(rng: Rng, count: number, goal: string): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    const c = two(rng.int(1, 99));
    if (c !== goal) out.add(c);
  }
  return [...out];
}

const presets: Preset[] = [
  {
    label: 'Random',
    make: (rng, size, settings) => {
      if (puzzleOf(settings) === 'words') {
        const w = WORD_SETS[rng.int(0, WORD_SETS.length - 1)]!;
        return solve(w.words, w.goal);
      }
      const goal = two(rng.int(1, 99));
      return solve(barred(rng, size, goal).join(' '), goal);
    },
  },
  {
    label: 'A wall to go around',
    make: (rng, size, settings) => {
      if (puzzleOf(settings) === 'words') return solve(WORD_SETS[0]!.words, WORD_SETS[0]!.goal);
      // A row of barred combinations across the second wheel's 1, as wide as the size.
      const wall = Array.from({ length: size }, (_, i) => `${i}1`);
      return solve(wall.join(' '), `${rng.int(0, Math.max(0, size - 2))}2`);
    },
  },
  {
    label: 'The goal one move away',
    make: (rng, size, settings) => {
      if (puzzleOf(settings) === 'words') return solve('cold cord bold colt', 'bold');
      return solve(barred(rng, size, '10').join(' '), '10');
    },
  },
  {
    label: 'Far away: the goal is 55 (worst for every sequence)',
    make: (rng, size, settings) => {
      if (puzzleOf(settings) === 'words') return solve(WORD_SETS[3]!.words, WORD_SETS[3]!.goal);
      return solve(barred(rng, Math.min(size, 4), '55').join(' '), '55');
    },
  },
  {
    label: 'No way to the goal',
    make: (_rng, _size, settings) => {
      if (puzzleOf(settings) === 'words') return solve('cat cot cog dog pig', 'pig');
      return solve('45 65 54 56', '55');
    },
  },
  {
    label: 'Three wheels',
    make: (rng, _size, settings) => {
      if (puzzleOf(settings) === 'words') return solve(WORD_SETS[1]!.words, WORD_SETS[1]!.goal);
      const goal = ['110', '101', '011', '210'][rng.int(0, 3)]!;
      return solve('100 010 900', goal);
    },
  },
];

export const stateSpaceBfs: VizDef<SSState, SSSettings, SSExtra> = {
  id: 'state-space-bfs',
  title: 'BFS over states',
  family: 'Search templates',
  blurb:
    'Breadth-first search on a graph that is never stored: the states of a puzzle, with each state’s moves made when it leaves the queue. A visited set keeps every state to one visit, and the layer a state lands in is its distance.',
  settings: [
    approachSetting({
      pattern: 'BFS with a visited set, O(states × moves)',
      naive: 'No visited set: every sequence of moves, O(bᵈ)',
    }),
    {
      kind: 'choice',
      key: 'puzzle',
      label: 'Puzzle',
      options: [
        { value: 'lock', label: 'A lock: turn one wheel at a time' },
        { value: 'words', label: 'Words: change one letter at a time' },
      ],
      help: 'Each puzzle keeps its own setup. Load barred combinations or a word list to change it.',
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
      label: 'Goal, or a list',
      placeholder: 'e.g. 02, or 01 11 21 to bar',
      maxLength: 80,
      sample: '02',
      parse: parseInput,
    },
    buttons: [
      { op: 'search', label: 'Search', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random lock',
      make: (rng) => {
        const goal = two(rng.int(1, 99));
        return solve(barred(rng, 4, goal).join(' '), goal);
      },
    },
    presets,
    sizes: [2, 4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'BFS over states, with a visited set',
      best: {
        cost: 'O(1)',
        why: 'The goal is one move away: one state leaves the queue.',
      },
      average: {
        cost: 'O(V · m)',
        why: 'Each state leaves the queue at most once and makes its m moves: 17 states and 65 moves around the wall.',
        example: 'around-the-wall',
      },
      worst: {
        cost: 'O(V · m)',
        why: 'No way to the goal: every state that can be reached is visited before the queue runs out, 95 of them.',
        example: 'walled-in',
      },
      note: 'V is the number of states that can be reached, m the moves per state: 2 per wheel, or 25 per letter.',
    },
    {
      op: 'No visited set: every sequence of moves',
      best: {
        cost: 'O(1)',
        why: 'The goal is one move away, the same as BFS.',
      },
      average: {
        cost: 'O(bᵈ)',
        why: 'Layer L holds every sequence of L moves, so it grows by the branching factor b each time.',
        example: 'every-sequence',
      },
      worst: {
        cost: 'never ends',
        why: 'With no way to the goal, sequences go round and round for ever.',
        example: 'no-ladder',
      },
      note: 'd is the distance to the goal and b the moves that are allowed from a state.',
    },
    {
      op: 'Extra space',
      best: {
        cost: 'O(1)',
        why: 'The goal next to the start: the queue never grows.',
      },
      average: {
        cost: 'O(V)',
        why: 'The visited set holds every state found, and the queue up to a layer of them.',
        example: 'three-wheels',
      },
      worst: {
        cost: 'O(V)',
        why: 'Every state that can be reached ends up in the visited set.',
        example: 'walled-in',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      // The code is BFS with a visited set, whatever the approach shown.
      const s = { ...(settings as SSSettings), approach: 'pattern' as const };
      const t = new Timeline(stateSpaceBfs, s, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        if (e.call[0] !== 'search') continue;
        const v = e.steps.at(-1)!.vars ?? {};
        if (v.distance === undefined) continue;
        input.push(
          s.puzzle === 'words'
            ? `words ${v.goal} ${e.end.words.join(' ')}`
            : `lock ${v.goal} ${e.end.barred.join(' ')}`,
        );
        expected.push(String(v.distance));
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    aroundTheWall,
    everySequence,
    roundTheBack,
    walledIn,
    threeWheels,
    coldToWarm,
    everyWordSequence,
    noLadder,
  ] as unknown as SavedExample[],
  practice: stateBfsPractice(() => stateSpaceBfs),
  preview: {
    example: 'around-the-wall',
    level: 2,
    hide: ['heading', 'puzzle', 'moves-', 'q-', 'queue-'],
  },
};

export default stateSpaceBfs;
