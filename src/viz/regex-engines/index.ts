import type { Rng } from '../../engine/rng';
import type { OpCall, SavedExample, VizDef } from '../../engine/types';
import { regexSize, showRegex } from '../_automata/regex';
import { randomRegex, randomWord } from '../regex-to-nfa/gen';
import earlyMatch from './examples/early-match.json';
import emptyLoop from './examples/empty-loop.json';
import emptyWord from './examples/empty-word.json';
import everyPathTried from './examples/every-path-tried.json';
import exponentialGrowth from './examples/exponential-growth.json';
import lazyOrder from './examples/lazy-order.json';
import liveSet from './examples/live-set.json';
import nestedPlus from './examples/nested-plus.json';
import noBlowup from './examples/no-blowup.json';
import overlappingChoices from './examples/overlapping-choices.json';
import twoStars from './examples/two-stars.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_M,
  MAX_WORD,
  ops,
  parseInput,
  pseudocode,
  type EngExtra,
  type EngSettings,
  type EngState,
} from './model';
import { view } from './view';

/** A random expression over a and b with at most MAX_M symbols and operators. */
export function randomExpression(rng: Rng, symbols: number): string {
  for (;;) {
    const r = randomRegex(rng, symbols, ['a', 'b'], true);
    if (regexSize(r) <= MAX_M) return showRegex(r);
  }
}

const aN = (n: number) => 'a'.repeat(Math.max(1, Math.min(n, MAX_WORD)));

export const regexEngines: VizDef<EngState, EngSettings, EngExtra> = {
  id: 'regex-engines',
  title: 'Regex engines: backtracking vs NFA',
  family: 'Automata and computability',
  blurb:
    'Match a word two ways on the same NFA: a backtracker that tries one path at a time, and a simulation that follows every path at once. See why (a|a)*b can take exponential time.',
  settings: [
    {
      kind: 'choice',
      key: 'engine',
      label: 'Show step by step',
      options: [
        { value: 'both', label: 'Both engines, one after the other' },
        { value: 'backtrack', label: 'The backtracker only' },
        { value: 'nfa', label: 'The NFA simulation only' },
      ],
      help: 'The other engine still runs, out of sight, so the last step can compare the two.',
    },
    {
      kind: 'choice',
      key: 'order',
      label: 'The backtracker tries first',
      options: [
        { value: 'greedy', label: 'Greedy: into a star, then around it (Perl, Python, Java)' },
        { value: 'lazy', label: 'Lazy: around a star, then into it (like *?)' },
      ],
      help: 'A union always tries its left side first. The order changes how soon a match is found, never whether one is.',
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
      label: 'Expression ; word',
      placeholder: 'e.g. (a|a)*b ; aaaa, or a word: aaa',
      maxLength: 60,
      sample: '(a|a)*b ; aaa',
      parse: parseInput,
    },
    buttons: [
      { op: 'match', label: 'Match', usesInput: true, primary: true },
      { op: 'grow', label: 'Grow', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true, more: true },
    ],
    presets: [
      {
        label: 'Worst case: (a|a)*b against a’s',
        make: (_rng, size) => [['match', `(a|a)*b ; ${aN(size)}`]],
      },
      {
        label: 'Best case: a match on the first path',
        make: (_rng, size) => [['match', `(a|a)*b ; ${aN(size - 1)}b`]],
      },
      {
        label: 'Nested stars: (a*)*b against a’s',
        make: (_rng, size) => [['match', `(a*)*b ; ${aN(size)}`]],
      },
      {
        label: 'No blowup: a*b against a’s',
        make: (_rng, size) => [['match', `a*b ; ${aN(size)}`]],
      },
      {
        label: 'Grow (a|a)*b and a*b',
        make: () => [
          ['grow', '(a|a)*b ; a'],
          ['grow', 'a*b ; a'],
        ],
      },
      {
        label: 'A random expression and word',
        make: (rng, size) =>
          [
            [
              'match',
              `${randomExpression(rng, Math.min(4, Math.max(2, Math.ceil(size / 3))))} ; ${randomWord(rng, Math.min(size, 8))}`,
            ],
          ] as OpCall[],
      },
    ],
    sizes: [4, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'backtrack(w), |w| = n, m = |R|',
      best: {
        cost: 'O(m·n)',
        why: 'The first path matches: each symbol is read once, passing at most 2m states.',
        example: 'early-match',
      },
      average: {
        cost: 'O(m·n) for most patterns',
        why: 'When each piece of w can be matched only one way, a dead end backs up a step or two.',
        example: 'no-blowup',
      },
      worst: {
        cost: 'O(2ⁿ)',
        why: 'A failing match tries every path, and (a|a)* has two for every a.',
        example: 'exponential-growth',
      },
      note: 'Nested or overlapping repeats ((a|a)*, (a+)+, (a|aa)*) give exponential paths; two stars in a row give n² of them, three give n³.',
    },
    {
      op: 'simulate(w), |w| = n, m = |R|',
      best: {
        cost: 'O(m)',
        why: 'The first symbol leaves no live state, and the run stops.',
      },
      average: {
        cost: 'O(m·n)',
        why: 'Each of the n symbols moves a set of at most 2m states, along at most 2 arrows each.',
        example: 'live-set',
      },
      worst: {
        cost: 'O(m·n)',
        why: 'Each state is visited at most once per position, however many paths reach it.',
        example: 'exponential-growth',
      },
    },
    {
      op: 'extra space',
      best: {
        cost: 'O(m)',
        why: 'The simulation keeps two sets of at most 2m states.',
        example: 'live-set',
      },
      average: {
        cost: 'O(m·n)',
        why: 'The backtracker keeps a choice on its stack for each split on the current path.',
        example: 'every-path-tried',
      },
      worst: {
        cost: 'O(m·n)',
        why: 'The current path visits at most 2m states per position, and each can leave a choice.',
        example: 'nested-plus',
      },
      note: 'Recursive backtrackers keep the same choices on the call stack instead, and a long input can overflow it.',
    },
  ],
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    exponentialGrowth,
    everyPathTried,
    earlyMatch,
    nestedPlus,
    noBlowup,
    twoStars,
    overlappingChoices,
    emptyLoop,
    lazyOrder,
    liveSet,
    emptyWord,
  ] as unknown as SavedExample[],
  preview: {
    example: 'exponential-growth',
    level: 2,
    hide: ['rx', 'tape', 's-', 'm-', 'start', 'cnt-', 'stk-'],
  },
  opening: 'exponential-growth',
};

export default regexEngines;
