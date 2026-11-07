import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Automaton } from '../_automata/automaton';
import { parseAutomaton } from '../_automata/parse';
import { setName } from '../_automata/automaton';
import { automatonLines, loadCall, machineOrWordsInput } from '../_automata/page';
import { randomNfa, randomWord } from '../_automata/random';
import cppSource from './code/cpp/nfa.hpp?raw';
import javaSource from './code/java/Nfa.java?raw';
import pythonSource from './code/python/nfa.py?raw';
import aOrB from './examples/a-or-b.json';
import branchesDie from './examples/branches-die.json';
import emptyWord from './examples/empty-word.json';
import endsIn01 from './examples/ends-in-01.json';
import epsLoop from './examples/eps-loop.json';
import folded from './examples/folded.json';
import manyBranches from './examples/many-branches.json';
import thirdFromEnd from './examples/third-from-end.json';
import explain from './explain.md?raw';
import { MACHINES } from './machines';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  nfaTrace,
  ops,
  pseudocode,
  type NfaExtra,
  type NfaSettings,
  type NfaState,
} from './model';
import { nfaPractice } from './practice';
import { view } from './view';

const machine = (text: string) => parseAutomaton(text) as Automaton;

/** Load a machine, then run a word of the chosen length on it. */
function preset(label: string, make: (rng: Rng) => Automaton): Preset {
  return {
    label,
    make: (rng, size): OpCall[] => {
      const a = make(rng);
      return [loadCall(a), ['run', randomWord(rng, a.alphabet, size) || 'eps']];
    },
  };
}

export const nfa: VizDef<NfaState, NfaSettings, NfaExtra> = {
  id: 'nfa',
  title: 'Nondeterministic finite automaton (NFA)',
  family: 'Automata and computability',
  blurb:
    'Run a word through an NFA by keeping the set of every state it could be in: follow every move, follow ε-moves, and let dead branches go.',
  settings: [
    {
      kind: 'choice',
      key: 'closure',
      label: 'ε-closure',
      options: [
        { value: 'separate', label: 'Its own step after each symbol' },
        { value: 'folded', label: 'Folded into the step for each symbol' },
      ],
      help: 'After each symbol, the machine also follows every ε-move it can. Seeing that as its own step makes E(S) visible; folding it in makes runs shorter.',
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
    input: machineOrWordsInput('0101'),
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'test', label: 'Test', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('Ends in 01', () => machine(MACHINES.endsIn01)),
      preset('Third symbol from the end is 1', () => machine(MACHINES.thirdFromEnd)),
      preset('Contains 11 or 101', () => machine(MACHINES.has11or101)),
      preset("Only a's or only b's, with ε-moves", () => machine(MACHINES.aStarOrBStar)),
      preset('Random NFA', (rng) => randomNfa(rng, rng.int(3, 5), { eps: false })),
      preset('Random NFA with ε-moves', (rng) => randomNfa(rng, rng.int(3, 6))),
    ],
    sizes: [3, 6, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'Run on a word of length n, with sets',
      best: {
        cost: 'Θ(n)',
        why: 'The set holds one state with one move per symbol, the way a DFA runs.',
      },
      average: {
        cost: 'O(n·|Q|²)',
        why: 'Each symbol updates a set of up to |Q| states, each with up to |Q| moves on it.',
        example: 'third-from-end',
      },
      worst: {
        cost: 'Θ(n·|Q|²)',
        why: 'With moves between every pair of states, each symbol, and each ε-closure, scans |Q|² moves.',
        example: 'many-branches',
      },
      note: 'When every branch dies, the run stops early (the a|b example on ab).',
    },
    {
      op: 'ε-closure E(S)',
      best: { cost: 'O(|S|)', why: 'No ε-moves leave the set: it stays as it is.' },
      average: {
        cost: 'O(|Q| + ε-moves)',
        why: 'Each state goes in once, and each ε-move out of it is followed once.',
        example: 'a-or-b',
      },
      worst: {
        cost: 'O(|Q|²)',
        why: 'Up to |Q|² ε-moves; a loop of them adds nothing new the second time round.',
        example: 'eps-loop',
      },
    },
    {
      op: 'Following each branch on its own',
      best: {
        cost: 'Θ(n)',
        why: 'No state ever has two moves on one symbol, so there is only one branch.',
      },
      average: {
        cost: 'Exponential',
        why: 'Branches multiply at every choice, even when they meet in the same state.',
      },
      worst: {
        cost: 'Θ(2ⁿ)',
        why: 'Every a doubles the branches: 16 after four a’s, all in q0 or q1.',
        example: 'many-branches',
      },
      note: 'Keeping a set merges branches that reach the same state, which is why the first row is polynomial.',
    },
    {
      op: 'Space',
      best: { cost: 'O(|Q|)', why: 'The set of current states, at most |Q| of them.' },
      average: {
        cost: 'O(|Q|)',
        why: 'One set at a time; the trace panel keeps one per symbol only to show them.',
      },
      worst: {
        cost: 'O(|Q|)',
        why: 'Even when every state is active, as in third-from-end.',
        example: 'third-from-end',
      },
      note: 'A DFA built from the NFA by the subset construction can need 2^|Q| states instead.',
    },
  ],
  practice: nfaPractice(() => nfa),
  preview: { example: 'third-from-end', level: 2, hide: ['trace-', 'test-', 'verdict'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as NfaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    endsIn01,
    thirdFromEnd,
    aOrB,
    branchesDie,
    epsLoop,
    emptyWord,
    folded,
    manyBranches,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: the machine's lines (see automatonLines), then "run <word>"
 * per word run or tested, with no word for ε. Each run prints "accept {q0,q2}" or "reject
 * {...}" with the final set in name order, and "{}" when every branch died.
 */
function codeScript(calls: OpCall[], settings: NfaSettings) {
  const t = new Timeline(nfa, settings, 1, calls);
  const input = automatonLines('nfa', t.initial.state.machine);
  const expected: string[] = [];
  let before = t.initial.state.machine;
  const result = (word: string, verdict: string, set: string[]) => {
    input.push(`run ${word}`.trimEnd());
    expected.push(`${verdict} ${set.length ? setName(set) : '{}'}`);
  };
  for (const e of t.entries) {
    const a = e.end.machine;
    if (a !== before) input.push(...automatonLines('nfa', a));
    before = a;
    const last = e.steps.at(-1)!.extra;
    const r = last?.run;
    if (e.call[0] === 'run' && r?.verdict) result(r.word, r.verdict, r.set);
    if (e.call[0] === 'test' && last?.test)
      for (const row of last.test.rows)
        result(row.word, row.got!, nfaTrace(a, row.word).rows.at(-1)!);
  }
  return { input, expected };
}

export default nfa;
