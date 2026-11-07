import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { EPS, setName, type Automaton } from '../_automata/automaton';
import cppSource from './code/cpp/subsets.hpp?raw';
import javaSource from './code/java/Subsets.java?raw';
import pythonSource from './code/python/subsets.py?raw';
import allSubsets from './examples/all-subsets.json';
import deadState from './examples/dead-state.json';
import endsInAb from './examples/ends-in-ab.json';
import epsChain from './examples/eps-chain.json';
import fourthFromEnd from './examples/fourth-from-end.json';
import thirdFromEnd from './examples/third-from-end.json';
import explain from './explain.md?raw';
import { automatonInput } from './kit';
import {
  MAX_ALL,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  loadCheck,
  ops,
  pseudocode,
  runDfa,
  type NdExtra,
  type NdSettings,
  type NfaState,
} from './model';
import { nfaToDfaPractice } from './practice';
import { endsWith, loadCall, nthFromEnd, randomNfa, randomWord } from './presets';
import { view } from './view';

const convert: OpCall = ['convert'];

export const nfaToDfa: VizDef<NfaState, NdSettings, NdExtra> = {
  id: 'nfa-to-dfa',
  title: 'NFA to DFA (subset construction)',
  family: 'Automata and computability',
  blurb:
    'Turn an NFA into a DFA that accepts the same words: each DFA state is a set of NFA states, found one at a time.',
  settings: [
    {
      kind: 'choice',
      key: 'subsets',
      label: 'Subsets',
      options: [
        { value: 'reachable', label: 'Only the ones reached from the start' },
        { value: 'all', label: `All 2^|Q| of them (NFAs of up to ${MAX_ALL} states)` },
      ],
      help: 'The proof makes every subset a state; in practice we build only the ones the start set can reach. Both DFAs accept the same words.',
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
    input: automatonInput('start q0; accept q2; q0 a,b -> q0; q0 a -> q1; q1 b -> q2', loadCheck),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'convert', label: 'Convert', usesInput: false },
    ],
    random: {
      label: 'Random NFA',
      make: (rng) => [loadCall(randomNfa(rng, rng.int(3, 4), { maxDfa: 8 })), convert],
    },
    presets: [
      {
        label: 'n-th symbol from the end is 1 (worst case)',
        make: (_rng, size) => [loadCall(nthFromEnd(size - 1)), convert],
      },
      {
        label: 'Ends with a word (no blow-up)',
        make: (rng, size) => [loadCall(endsWith(randomWord(rng, size - 1))), convert],
      },
      {
        label: 'Random NFA with ε-moves',
        make: (rng, size) => [loadCall(randomNfa(rng, size, { eps: 0.6, maxDfa: 12 })), convert],
      },
      {
        label: 'Random NFA without ε-moves',
        make: (rng, size) => [loadCall(randomNfa(rng, size, { eps: 0, maxDfa: 12 })), convert],
      },
    ],
    sizes: [3, 4, 5],
  },
  explain,
  complexity: [
    {
      op: 'Subset construction (reachable subsets)',
      best: {
        cost: 'O(|Q|³·|Σ|)',
        why: 'No blow-up: about |Q| DFA states, each with |Σ| moves, and a move plus closure costs O(|Q|²).',
        example: 'ends-in-ab',
      },
      average: {
        cost: 'O(k·|Σ|·|Q|²)',
        why: 'For k DFA states: each needs |Σ| moves, each a union and an ε-closure of O(|Q|²).',
        example: 'eps-chain',
      },
      worst: {
        cost: 'O(2^|Q|·|Σ|·|Q|²)',
        why: 'Every subset can turn up, as when the n-th symbol from the end is 1.',
        example: 'fourth-from-end',
      },
      note: 'k, the number of DFA states, is somewhere from 1 to 2^|Q|. You only find out by building it.',
    },
    {
      op: 'ε-closure E(S)',
      best: {
        cost: 'O(|S|)',
        why: 'No ε-moves: the closure is the set itself.',
        example: 'dead-state',
      },
      average: {
        cost: 'O(|Q| + ε-moves)',
        why: 'A search: each state joins once and its ε-moves are read once.',
        example: 'eps-chain',
      },
      worst: {
        cost: 'O(|Q|²)',
        why: 'There can be an ε-move between every pair of states.',
      },
    },
    {
      op: 'All 2^|Q| subsets (the proof)',
      best: {
        cost: 'Θ(2^|Q|·|Σ|·|Q|²)',
        why: 'Every subset gets its moves, reachable or not.',
        example: 'all-subsets',
      },
      average: {
        cost: 'Θ(2^|Q|·|Σ|·|Q|²)',
        why: 'The work does not depend on the NFA, only on its size.',
      },
      worst: {
        cost: 'Θ(2^|Q|·|Σ|·|Q|²)',
        why: 'Even an NFA whose DFA needs 2 states lists all 2^|Q|.',
        example: 'all-subsets',
      },
    },
    {
      op: 'Running the DFA on a word of length n',
      best: { cost: 'Θ(n)', why: 'One table lookup per symbol.', example: 'ends-in-ab' },
      average: { cost: 'Θ(n)', why: 'Whatever the word, one state at a time.' },
      worst: {
        cost: 'Θ(n)',
        why: 'Even for the DFA of 16 states: the size is paid once, in the construction.',
        example: 'fourth-from-end',
      },
      note: 'Running the NFA directly tracks a set of states: O(n·|Q|²). The construction trades space for that time.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as NdSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    endsInAb,
    thirdFromEnd,
    fourthFromEnd,
    epsChain,
    deadState,
    allSubsets,
  ] as unknown as SavedExample[],
  practice: nfaToDfaPractice(() => nfaToDfa),
};

/** The driver lines that describe an NFA: states in name order, alphabet, start, accept, moves. */
export function automatonLines(kind: 'nfa' | 'dfa', a: Automaton): string[] {
  return [
    `${kind} ${a.states.join(' ')}`,
    `alphabet ${a.alphabet.join(' ')}`.trimEnd(),
    `start ${a.start}`,
    `accept ${a.accept.join(' ')}`.trimEnd(),
    ...a.moves.map((m) => `move ${m.from} ${m.on === EPS ? 'eps' : m.on} ${m.to}`),
  ];
}

/**
 * Driver protocol for the code tabs. "nfa <states>" starts an NFA (the code numbers the states
 * in that order, which is name order), then "alphabet", "start", "accept" and one "move p c q"
 * per move ("eps" for ε); none of these print. "convert" prints the DFA:
 * "A={q0} B={q0,q1} C={} | accept C | A-a->B A-b->A ...", states in the order found, moves in
 * state then alphabet order, "-" for none. The code builds reachable subsets only (the default
 * setting), so the script does too.
 */
function codeScript(calls: OpCall[], settings: NdSettings) {
  const t = new Timeline(nfaToDfa, { ...settings, subsets: 'reachable' }, 1, calls);
  const input = automatonLines('nfa', t.initial.state.nfa);
  const expected: string[] = [];
  let before = t.initial.state.nfa;
  for (const e of t.entries) {
    if (e.end.nfa !== before) input.push(...automatonLines('nfa', e.end.nfa));
    before = e.end.nfa;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'convert' && r?.finished) {
      const { dfa, sets } = runDfa(e.end.nfa, r);
      const order = r.rows.map((row) => row.name);
      const states = order.map((n) => `${n}=${setName(sets[n]!).replace('∅', '{}')}`).join(' ');
      const moves = order.flatMap((n) =>
        dfa.alphabet.map(
          (c) => `${n}-${c}->${dfa.moves.find((m) => m.from === n && m.on === c)!.to}`,
        ),
      );
      input.push('convert');
      expected.push(`${states} | accept ${r.accept.join(' ') || '-'} | ${moves.join(' ') || '-'}`);
    }
  }
  return { input, expected };
}

export default nfaToDfa;
