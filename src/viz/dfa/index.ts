import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseAutomaton } from '../_automata/parse';
import type { Automaton } from '../_automata/automaton';
import cppSource from './code/cpp/dfa.hpp?raw';
import javaSource from './code/java/Dfa.java?raw';
import pythonSource from './code/python/dfa.py?raw';
import deadState from './examples/dead-state.json';
import div3 from './examples/div-by-3.json';
import emptyWord from './examples/empty-word.json';
import endsIn01 from './examples/ends-in-01.json';
import evenEven from './examples/even-even.json';
import findTheBug from './examples/find-the-bug.json';
import longWord from './examples/long-word.json';
import missingMove from './examples/missing-move.json';
import explain from './explain.md?raw';
import { automatonLines, loadCall, machineOrWordsInput } from '../_automata/page';
import { randomDfa, randomWord } from '../_automata/random';
import { MACHINES } from './machines';
import {
  defaults,
  describe,
  deadState as deadOf,
  dfaTrace,
  init,
  initialSay,
  initialVars,
  machineFor,
  ops,
  pseudocode,
  type DfaExtra,
  type DfaSettings,
  type DfaState,
} from './model';
import { dfaPractice } from './practice';
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

export const dfa: VizDef<DfaState, DfaSettings, DfaExtra> = {
  id: 'dfa',
  title: 'Deterministic finite automaton (DFA)',
  family: 'Automata and computability',
  blurb:
    'Run a word through a DFA one symbol at a time: one state, one move per symbol, and accept or reject at the end.',
  settings: [
    {
      kind: 'choice',
      key: 'dead',
      label: 'Missing moves',
      options: [
        { value: 'hide', label: 'Leave them out: a missing move rejects (Sipser)' },
        { value: 'draw', label: 'Draw the dead state they lead to' },
      ],
      help: 'A DFA needs a move for every state and symbol. Most drawings leave out the moves into a dead state, a state no word ever leaves. Both say the same thing.',
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
      preset('Divisible by 3, in binary', () => machine(MACHINES.div3)),
      preset("Even a's and even b's", () => machine(MACHINES.evenEven)),
      preset('Starts with ab, moves left out', () => machine(MACHINES.startsAb)),
      preset('Random DFA', (rng) => randomDfa(rng, rng.int(3, 5))),
      preset('Random DFA with missing moves', (rng) =>
        randomDfa(rng, rng.int(3, 5), { partial: true }),
      ),
    ],
    sizes: [3, 6, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'Run on a word of length n',
      best: {
        cost: 'Θ(n)',
        why: 'One move per symbol, and every symbol is read, whatever the word.',
        example: 'ends-in-01',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Each move is one lookup in the table δ.',
        example: 'div-by-3',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'No backing up and no choices: sixteen symbols take sixteen moves.',
        example: 'long-word',
      },
      note: 'With moves left out, a run can stop early at a missing move (the missing-move example), but the bound is the same.',
    },
    {
      op: 'One move, δ(q, c)',
      best: { cost: 'O(1)', why: 'Look up the row for q and the column for c.' },
      average: { cost: 'O(1)', why: 'A table, an array or a hash map gives the next state.' },
      worst: {
        cost: 'O(1)',
        why: 'A missing move is one lookup that finds nothing.',
        example: 'missing-move',
      },
    },
    {
      op: 'Space',
      best: {
        cost: 'O(1) per run',
        why: 'A run keeps one state and its place in the word.',
        example: 'even-even',
      },
      average: {
        cost: 'O(|Q|·|Σ|)',
        why: 'The machine is its table: one entry per state and symbol.',
      },
      worst: {
        cost: 'O(|Q|·|Σ|)',
        why: 'A complete DFA fills every entry, the dead state included.',
        example: 'dead-state',
      },
    },
  ],
  practice: dfaPractice(() => dfa),
  preview: { example: 'even-even', level: 2, hide: ['verdict'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DfaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    endsIn01,
    div3,
    evenEven,
    missingMove,
    deadState,
    emptyWord,
    findTheBug,
    longWord,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: the machine's lines (see automatonLines), then "run <word>"
 * per word run or tested, with no word for ε. Each run prints "accept <state>", "reject
 * <state>", or "reject none" when a move is missing. The code leaves the dead state out, so a
 * run that ends in the drawn dead state prints "reject none".
 */
function codeScript(calls: OpCall[], settings: DfaSettings) {
  const t = new Timeline(dfa, settings, 1, calls);
  const input = automatonLines('dfa', t.initial.state.machine);
  const expected: string[] = [];
  let before = t.initial.state.machine;
  const result = (a: Automaton, word: string, verdict: string, q: string, stuck: boolean) => {
    input.push(`run ${word}`.trimEnd());
    expected.push(`${verdict} ${stuck || q === deadOf(a, settings) ? 'none' : q}`);
  };
  for (const e of t.entries) {
    const a = e.end.machine;
    if (a !== before) input.push(...automatonLines('dfa', a));
    before = a;
    const last = e.steps.at(-1)!.extra;
    const r = last?.run;
    if (e.call[0] === 'run' && r?.verdict) result(a, r.word, r.verdict, r.q, !!r.stuck);
    if (e.call[0] === 'test' && last?.test)
      for (const row of last.test.rows) {
        // The table holds the verdict; the state the run ended in comes from the same model.
        const tr = dfaTrace(machineFor(a, settings), row.word);
        result(a, row.word, row.got!, tr.path.at(-1)!, tr.stuckAt !== null);
      }
  }
  return { input, expected };
}

export default dfa;
