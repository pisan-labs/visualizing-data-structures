import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { formatAutomaton } from '../_automata/parse';
import { automatonInput, automatonLines } from '../_automata/page';
import cppSource from './code/cpp/minimize.hpp?raw';
import javaSource from './code/java/Minimize.java?raw';
import pythonSource from './code/python/minimize.py?raw';
import alreadyMinimal from './examples/already-minimal.json';
import slowSplit from './examples/slow-split.json';
import subsetsShrink from './examples/subsets-shrink.json';
import tableFilling from './examples/table-filling.json';
import twoEquivalent from './examples/two-equivalent.json';
import unreachable from './examples/unreachable.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  notDfa,
  ops,
  pseudocode,
  type MinExtra,
  type MinSettings,
  type MinState,
} from './model';
import { minimizationPractice } from './practice';
import { chain, countMod, randomDfa, withCopies, withJunk } from './presets';
import { view } from './view';

const minimize: OpCall = ['minimize'];
const load = (a: Parameters<typeof formatAutomaton>[0]): OpCall => ['load', formatAutomaton(a)];

export const dfaMinimization: VizDef<MinState, MinSettings, MinExtra> = {
  id: 'dfa-minimization',
  title: 'DFA minimization',
  family: 'Automata and computability',
  blurb:
    'Shrink a DFA to the fewest states that accept the same words, by splitting blocks of states or by marking pairs that a word tells apart.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'moore', label: 'Partition refinement (Moore)' },
        { value: 'table', label: 'Table filling: mark pairs (Myhill–Nerode)' },
      ],
      help: 'Both find the same minimal DFA. Refinement splits groups of states apart; table filling marks pairs of states that some word separates.',
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
    input: automatonInput(
      'start q0; accept q2; q0 a -> q1; q0 b -> q0; q1 a -> q1; q1 b -> q2; q2 a,b -> q0',
      notDfa,
    ),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'minimize', label: 'Minimize', usesInput: false },
    ],
    random: {
      label: 'Random DFA',
      make: (rng) => [load(withCopies(rng, rng.int(4, 6))), minimize],
    },
    presets: [
      {
        label: 'States to merge',
        make: (rng, size) => [load(withCopies(rng, size)), minimize],
      },
      {
        label: 'Unreachable states and a missing move',
        make: (rng, size) => [load(withJunk(rng, size)), minimize],
      },
      {
        label: 'Random DFA',
        make: (rng, size) => [load(randomDfa(rng, size)), minimize],
      },
      {
        label: 'Already minimal: count a’s',
        make: (_rng, size) => [load(countMod(size)), minimize],
      },
      {
        label: 'One split per round (most rounds)',
        make: (_rng, size) => [load(chain(size)), minimize],
      },
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Partition refinement (Moore)',
      best: {
        cost: 'O(|Q|·|Σ|)',
        why: 'One or two rounds, each a signature per state: |Σ| lookups.',
        example: 'two-equivalent',
      },
      average: {
        cost: 'O(r·|Q|·|Σ|)',
        why: 'r rounds, and r is usually small: each round must split a block or stop.',
        example: 'already-minimal',
      },
      worst: {
        cost: 'O(|Q|²·|Σ|)',
        why: 'A chain splits off one state per round, so up to |Q| rounds.',
        example: 'slow-split',
      },
      note: 'Hopcroft’s algorithm splits with the smaller half each time and runs in O(|Q|·|Σ|·log|Q|).',
    },
    {
      op: 'Table filling (Myhill–Nerode)',
      best: {
        cost: 'Θ(|Q|²·|Σ|)',
        why: 'Every pair is looked at, on every symbol, in at least one pass.',
        example: 'table-filling',
      },
      average: {
        cost: 'O(p·|Q|²·|Σ|)',
        why: 'p passes over the |Q|²/2 pairs; p is usually small.',
        example: 'table-filling',
      },
      worst: {
        cost: 'O(|Q|³·|Σ|)',
        why: 'Up to |Q| passes when each marks only pairs one step further out.',
        example: 'slow-split',
      },
      note: 'Keeping, for each pair, the list of pairs that lead to it marks everything in one sweep: O(|Q|²·|Σ|).',
    },
    {
      op: 'Complete it, drop unreachable states',
      best: {
        cost: 'O(|Q|·|Σ|)',
        why: 'Check each state and symbol once; a search from the start.',
        example: 'two-equivalent',
      },
      average: {
        cost: 'O(|Q|·|Σ|)',
        why: 'The search reads each move once.',
        example: 'unreachable',
      },
      worst: {
        cost: 'O(|Q|·|Σ|)',
        why: 'Even when half the states go, as in the subset construction’s DFA.',
        example: 'subsets-shrink',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MinSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoEquivalent,
    tableFilling,
    alreadyMinimal,
    unreachable,
    subsetsShrink,
    slowSplit,
  ] as unknown as SavedExample[],
  practice: minimizationPractice(() => dfaMinimization),
  preview: { example: 'slow-split', level: 2, hide: ['sig-'] },
};

/**
 * Driver protocol for the code tabs. "dfa <states>" starts a DFA (the code numbers the states
 * in that order, which is name order, and numbers a dead state after them), then "alphabet",
 * "start", "accept" and one "move p c q" per move; none of these print. "minimize" prints the
 * minimal DFA: its blocks numbered from 1 in the order of their first state (a dead state
 * last), then the start block, the accept blocks and the moves between blocks:
 * "1={q0,q3} 2={q1} 3={q2} | start 1 | accept 3 | 1-a->2 1-b->1 ...", "-" for none. Both
 * methods find the same blocks, so the code (partition refinement) serves both settings.
 */
function codeScript(calls: OpCall[], settings: MinSettings) {
  const t = new Timeline(dfaMinimization, settings, 1, calls);
  const input = automatonLines('dfa', t.initial.state.dfa);
  const expected: string[] = [];
  let before = t.initial.state.dfa;
  for (const e of t.entries) {
    const dfa = e.end.dfa;
    if (dfa !== before) input.push(...automatonLines('dfa', dfa));
    before = dfa;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] !== 'minimize' || !r?.min || !r.blocks) continue;
    const order = (q: string) =>
      dfa.states.includes(q) ? dfa.states.indexOf(q) : dfa.states.length;
    const blocks = Object.entries(r.blocks)
      .map(([name, members]) => ({
        name,
        members: [...members].sort((p, q) => order(p) - order(q)),
      }))
      .sort((x, y) => order(x.members[0]!) - order(y.members[0]!));
    const num = (name: string) => blocks.findIndex((b) => b.name === name) + 1;
    const min = r.min;
    const moves = blocks.flatMap((b) =>
      min.alphabet.map(
        (c) =>
          `${num(b.name)}-${c}->${num(min.moves.find((m) => m.from === b.name && m.on === c)!.to)}`,
      ),
    );
    const accept = min.accept.map(num).sort((x, y) => x - y);
    input.push('minimize');
    expected.push(
      `${blocks.map((b, i) => `${i + 1}={${b.members.join(',')}}`).join(' ')} | start ${num(min.start)} | accept ${accept.join(' ') || '-'} | ${moves.join(' ') || '-'}`,
    );
  }
  return { input, expected };
}

export default dfaMinimization;
