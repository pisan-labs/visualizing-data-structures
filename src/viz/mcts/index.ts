import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/mcts.hpp?raw';
import javaSource from './code/java/Mcts.java?raw';
import pythonSource from './code/python/mcts.py?raw';
import budget10 from './examples/budget-10.json';
import budget100 from './examples/budget-100.json';
import budget30 from './examples/budget-30.json';
import bigC from './examples/big-c.json';
import firstRounds from './examples/first-rounds.json';
import noExploration from './examples/no-exploration.json';
import explain from './explain.md?raw';
import {
  bestMove,
  cOf,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pathOf,
  pseudocode,
  ROOT,
  TREE,
  type MctsExtra,
  type MctsSettings,
  type MctsState,
  type Trace,
} from './model';
import { mctsPractice } from './practice';
import { view } from './view';

const times = (k: number, op: string): OpCall[] => Array.from({ length: k }, (): OpCall => [op]);

const preset = (label: string, make: () => OpCall[]): Preset => ({ label, make: () => make() });

export const mcts: VizDef<MctsState, MctsSettings, MctsExtra> = {
  id: 'mcts',
  title: 'Monte Carlo tree search',
  family: 'Language models and decoding',
  blurb:
    'Grow a search tree one rollout at a time: pick children by UCB1 (a good mean plus a bonus for being tried less), finish at random, score the result and pass it back up. The move is the child visited most.',
  settings: [
    {
      kind: 'choice',
      key: 'c',
      label: 'Exploration constant c',
      options: [
        { value: '0', label: '0: no exploring' },
        { value: '0.5', label: '0.5' },
        { value: 'sqrt2', label: '√2 ≈ 1.41 (UCB1)' },
        { value: '2', label: '2' },
      ],
      help: 'UCB1 = Q + c·√(ln N / n). A larger c gives children tried less often a bigger bonus. Auer et al.’s UCB1 uses c = √2 for rewards between 0 and 1.',
    },
    {
      kind: 'choice',
      key: 'budget',
      label: 'Budget (iterations for Run)',
      options: [
        { value: '10', label: '10' },
        { value: '30', label: '30' },
        { value: '100', label: '100' },
      ],
      help: 'Run iterates until the tree has had this many iterations, then picks the move. More iterations is more compute, and can change the answer.',
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
      { op: 'iterate', label: 'Iterate', usesInput: false, primary: true },
      { op: 'run', label: 'Run the budget', usesInput: false },
      { op: 'reset', label: 'Reset', usesInput: false },
    ],
    random: {
      label: 'A few iterations',
      make: (rng) => [['reset'], ...times(rng.int(1, 12), 'iterate')],
    },
    presets: [
      preset('Run the budget', () => [['reset'], ['run']]),
      preset('The first three iterations', () => [['reset'], ...times(3, 'iterate')]),
      preset('Ten iterations, one at a time', () => [['reset'], ...times(10, 'iterate')]),
      preset('Run, then five more', () => [['reset'], ['run'], ...times(5, 'iterate')]),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'One iteration',
      best: {
        cost: 'Θ(d)',
        why: 'Early on, selection stops at the root at once; a rollout walks d levels down.',
        example: 'first-rounds',
      },
      average: {
        cost: 'Θ(d · b)',
        why: 'Selection scores the b children at each of up to d levels; the rollout adds d steps.',
        example: 'budget-30',
      },
      worst: {
        cost: 'Θ(d · b)',
        why: 'The same: d levels of b scores. With a real model each rollout step is a forward pass.',
        example: 'budget-100',
      },
    },
    {
      op: 'A search of N iterations',
      best: {
        cost: 'Θ(N · d)',
        why: 'N iterations of the one above.',
        example: 'budget-10',
      },
      average: {
        cost: 'Θ(N · d · b)',
        why: 'The work grows with the budget, not with the size of the whole tree.',
        example: 'budget-30',
      },
      worst: {
        cost: 'Θ(N · d · b)',
        why: 'Searching the whole tree instead would cost Θ(bᵈ): every sentence.',
        example: 'budget-100',
      },
      note: 'The budget is the knob: more iterations, more compute, a better estimate.',
    },
    {
      op: 'Memory',
      best: {
        cost: 'Θ(N)',
        why: 'Each iteration adds at most one node.',
        example: 'first-rounds',
      },
      average: {
        cost: 'Θ(min(N, bᵈ))',
        why: 'Never more than the whole tree (22 nodes here).',
        example: 'budget-30',
      },
      worst: {
        cost: 'Θ(min(N, bᵈ))',
        why: 'Rollouts store nothing: only the path they end at.',
        example: 'budget-100',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MctsSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    budget30,
    budget100,
    firstRounds,
    noExploration,
    bigC,
    budget10,
  ] as unknown as SavedExample[],
  practice: mctsPractice(() => mcts),
  preview: { example: 'budget-30', level: 1 },
  opening: 'budget-30',
};

/** The code tabs' line for an iteration: the path, the sentence reached, and the root's children. */
export function traceLine(t: Trace, s: MctsState): string {
  const path = pathOf(t)
    .filter((id) => id !== ROOT)
    .map((id) => TREE[id]!.token);
  const kids = TREE[ROOT]!.children.map((k) => `${s.n[k]} ${round3(s.w[k]!)}`).join(' ');
  return `${path.join(' ')} > ${TREE[t.leaf]!.token} ${round3(t.r)} | ${kids}`;
}

/**
 * Driver protocol for the code tabs. "node <parent> <word> <score>" adds a node (parent -1 for
 * the root, score - for a word that is not the last); "reset" empties the search. "iterate <c>
 * <u...>" runs one iteration with these random numbers for the rollout and prints `traceLine`.
 * "move" prints the root's most visited child.
 */
function codeScript(calls: OpCall[], settings: MctsSettings) {
  const t = new Timeline(mcts, settings, 1, calls);
  const input: string[] = TREE.map(
    (n) => `node ${n.parent ?? -1} ${n.token} ${n.reward === undefined ? '-' : n.reward}`,
  );
  const expected: string[] = [];
  const c = String(cOf(settings));
  let prev = t.initial.state;
  input.push('reset');
  for (const e of t.entries) {
    const s = e.end;
    if (e.call[0] === 'reset') {
      input.push('reset');
      prev = init();
    }
    // Replay the new iterations one by one, so each line shows the counts after it.
    let cur = prev;
    for (const tr of s.history.slice(prev.history.length)) {
      cur = replay(cur, tr);
      input.push(`iterate ${c} ${tr.us.join(' ')}`.trimEnd());
      expected.push(traceLine(tr, cur));
    }
    if (e.call[0] === 'run' && s.history.length > prev.history.length) {
      input.push('move');
      expected.push(`move ${TREE[bestMove(s)!]!.token}`);
    }
    prev = s;
  }
  return { input, expected };
}

/** The state after an iteration whose trace is known. */
function replay(s: MctsState, t: Trace): MctsState {
  const n = [...s.n];
  const w = [...s.w];
  const tried = [...s.tried];
  if (t.added !== null) tried[TREE[t.added]!.parent!]!++;
  for (const id of pathOf(t)) {
    n[id]!++;
    w[id]! += t.r;
  }
  return { n, w, tried, iterations: s.iterations + 1, history: [...s.history, t] };
}

export default mcts;
