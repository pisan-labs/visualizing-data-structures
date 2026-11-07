import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { EPS } from '../_automata/automaton';
import { regexSize, showRegex } from '../_automata/regex';
import { randomRegex, randomWord } from '../regex-to-nfa/gen';
import cppSource from './code/cpp/regex_engines.hpp?raw';
import javaSource from './code/java/RegexEngines.java?raw';
import pythonSource from './code/python/regex_engines.py?raw';
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
  machineOf,
  MAX_M,
  MAX_WORD,
  ops,
  parseInput,
  pseudocode,
  type EngExtra,
  type EngSettings,
  type EngState,
} from './model';
import { enginesPractice } from './practice';
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
  practice: enginesPractice(() => regexEngines),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as EngSettings),
  },
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
    hide: ['rx', 'tape', 's-', 'm-', 'start', 'cnt-', 'stk-', 'ch-key'],
  },
  opening: 'exponential-growth',
};

/**
 * The NFA as driver lines: "nfa <states> <start> <accept>" (states numbered in name order), then
 * "move <from> <symbol or eps> <to>" for every move, each state's in the order the backtracker
 * tries them under these settings.
 */
function nfaLines(s: EngState, settings: EngSettings): string[] {
  const m = machineOf(s, settings);
  const a = m.nfa;
  const k = (q: string) => a.states.indexOf(q);
  return [
    `nfa ${a.states.length} ${k(a.start)} ${k(a.accept[0]!)}`,
    ...a.states.flatMap((q) =>
      m.out[q]!.map((mv) => `move ${k(q)} ${mv.on === EPS ? 'eps' : mv.on} ${k(mv.to)}`),
    ),
  ];
}

const resultLine = (bt: string, btSteps: number, nfa: string, nfaSteps: number) =>
  `${bt} ${btSteps} ${nfa} ${nfaSteps}`;

/**
 * Driver protocol for the code tabs: the NFA as lines (nfaLines), then "match <word>" (eps for
 * the empty word), which prints "<backtracking answer> <steps> <simulation answer> <steps>", the
 * answer being accept, reject or stopped. A Match sends one match line; a Grow one per word it
 * tried; a Load, and anything the page refuses, sends nothing.
 */
function codeScript(calls: OpCall[], settings: EngSettings) {
  const t = new Timeline(regexEngines, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const s = e.end;
    const lines = e.steps.at(-1)!.lines;
    if (lines.includes('match.compare') && s.bt && s.sim) {
      input.push(...nfaLines(s, settings), `match ${s.word || 'eps'}`);
      expected.push(resultLine(s.bt.result!, s.bt.steps, s.sim.result!, s.sim.steps));
    } else if (lines.includes('grow.end') && s.growth) {
      input.push(...nfaLines(s, settings));
      for (const r of s.growth.rows) {
        input.push(`match ${s.growth.unit.repeat(r.n)}`);
        expected.push(resultLine(r.btResult, r.bt, r.nfaResult, r.nfa));
      }
    }
  }
  return { input, expected };
}

export default regexEngines;
