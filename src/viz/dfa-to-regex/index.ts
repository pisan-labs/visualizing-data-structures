import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { automatonInput, automatonLines } from '../_automata/page';
import { randomWord } from '../_automata/random';
import cppSource from './code/cpp/state_elimination.hpp?raw';
import javaSource from './code/java/StateElimination.java?raw';
import pythonSource from './code/python/state_elimination.py?raw';
import acceptsNothing from './examples/accepts-nothing.json';
import containsB from './examples/contains-b.json';
import deadState from './examples/dead-state.json';
import div3Fewest from './examples/div3-fewest.json';
import div3NameOrder from './examples/div3-name-order.json';
import evenAs from './examples/even-as.json';
import ruleAsWritten from './examples/rule-as-written.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  loadCheck,
  ops,
  pseudocode,
  type DfaState,
  type DrExtra,
  type DrSettings,
} from './model';
import { dfaToRegexPractice } from './practice';
import { countA, endsWith, loadCall, randomFit, startsWith } from './presets';
import { view } from './view';

const convert: OpCall = ['convert'];
const AB = ['a', 'b'];

export const dfaToRegex: VizDef<DfaState, DrSettings, DrExtra> = {
  id: 'dfa-to-regex',
  title: 'DFA to regular expression',
  family: 'Automata and computability',
  blurb:
    'Turn a DFA into a regular expression by ripping out its states one at a time, rewriting the labels on the arrows that went through each one.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Rip states in',
      options: [
        { value: 'name', label: 'Name order' },
        { value: 'fewest', label: 'Fewest paths through it first (arrows in × out)' },
      ],
      help: 'Any order gives an expression for the same language, but not the same expression: a good order can make it much shorter.',
    },
    {
      kind: 'choice',
      key: 'simplify',
      label: 'Simplify',
      options: [
        { value: 'identities', label: 'With ∅ and ε: R∅ = ∅, Rε = R, R ∪ ∅ = R, ε* = ∅* = ε' },
        { value: 'none', label: 'Not at all: the rule exactly as written' },
      ],
      help: 'Sipser simplifies with these identities as he goes. Without them, every ε and ∅ the rule reads stays in the label.',
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
      loadCheck,
    ),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'convert', label: 'Convert', usesInput: false },
    ],
    random: {
      label: 'Random DFA',
      make: (rng) => [loadCall(randomFit(rng, rng.int(3, 4))), convert],
    },
    presets: [
      {
        label: 'Random DFA',
        make: (rng, size) => [loadCall(randomFit(rng, size)), convert],
      },
      {
        label: 'Random DFA with missing moves',
        make: (rng, size) => [loadCall(randomFit(rng, size, { partial: true })), convert],
      },
      {
        label: 'Ends with a word',
        make: (rng, size) => [loadCall(endsWith(randomWord(rng, AB, size - 1))), convert],
      },
      {
        label: 'Starts with a word (a dead state)',
        make: (rng, size) => [loadCall(startsWith(randomWord(rng, AB, size - 2))), convert],
      },
      {
        label: 'Count a’s: a cycle, where order matters',
        make: (_rng, size) => [loadCall(countA(size)), convert],
      },
    ],
    sizes: [3, 4, 5],
  },
  explain,
  complexity: [
    {
      op: 'Convert: labels rewritten',
      best: {
        cost: 'Θ(|Q|)',
        why: 'Each state has one arrow in and one out, so each rip rewrites one label.',
        example: 'contains-b',
      },
      average: {
        cost: 'O(|Q|³)',
        why: '|Q| rips, each rewriting arrows in × arrows out, at most (|Q| + 1)² labels.',
        example: 'div3-fewest',
      },
      worst: {
        cost: 'Θ(|Q|³)',
        why: 'With an arrow between every pair, the k-th rip still rewrites about (|Q| − k)² labels.',
        example: 'div3-name-order',
      },
      note: 'That counts labels, not characters: the labels themselves grow as states go.',
    },
    {
      op: 'Size of the answer',
      best: {
        cost: 'Θ(|Q|)',
        why: 'A chain such as "starts with ab": each rip adds a symbol or two.',
        example: 'dead-state',
      },
      average: {
        cost: 'Depends on the order',
        why: 'The same DFA can give answers of very different sizes; ripping the fewest paths first usually keeps it small.',
        example: 'div3-fewest',
      },
      worst: {
        cost: '2^Θ(|Q|)',
        why: 'Each rip can copy the labels around it, and some DFAs have no short expression in any order.',
        example: 'div3-name-order',
      },
    },
    {
      op: 'Rip one state q',
      best: {
        cost: 'O(1)',
        why: 'No path runs through q (a dead state): delete it and its arrows.',
        example: 'dead-state',
      },
      average: {
        cost: 'O(in·out)',
        why: 'One new label for each arrow in paired with each arrow out.',
        example: 'contains-b',
      },
      worst: {
        cost: 'O(|Q|²)',
        why: 'Every state left has an arrow into q and an arrow out of it.',
        example: 'div3-name-order',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DrSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    containsB,
    ruleAsWritten,
    div3NameOrder,
    div3Fewest,
    deadState,
    evenAs,
    acceptsNothing,
  ] as unknown as SavedExample[],
  practice: dfaToRegexPractice(() => dfaToRegex),
  preview: { example: 'div3-fewest', level: 2, hide: ['lab-'] },
};

/**
 * Driver protocol for the code tabs, which follow the default settings (name order, the
 * identities with ∅ and ε). "dfa <states>" starts a DFA, its states in name order, which is
 * the order they are ripped in; then "alphabet", "start", "accept" and one "move p c q" per
 * move, none of which print. "convert" prints the expression, ∅ for the empty language. A
 * Convert the model refuses (its labels grow too long) is not sent.
 */
function codeScript(calls: OpCall[], _settings: DrSettings) {
  const t = new Timeline(dfaToRegex, { ...defaults }, 1, calls);
  const input = automatonLines('dfa', t.initial.state.dfa);
  const expected: string[] = [];
  let before = t.initial.state.dfa;
  for (const e of t.entries) {
    if (e.end.dfa !== before) input.push(...automatonLines('dfa', e.end.dfa));
    before = e.end.dfa;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'convert' && r?.answer) {
      input.push('convert');
      expected.push(r.answer);
    }
  }
  return { input, expected };
}

export default dfaToRegex;
