import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import {
  ACCEPT,
  formatMachine,
  parseMachine,
  parseWord,
  tapeText,
  type Machine,
} from '../_turing/machine';
import cppSource from './code/cpp/turing_machine.hpp?raw';
import javaSource from './code/java/TuringMachine.java?raw';
import pythonSource from './code/python/turing_machine.py?raw';
import copy from './examples/copy.json';
import flipsForever from './examples/flips-forever.json';
import incrementOneWay from './examples/increment-one-way.json';
import increment from './examples/increment.json';
import palindrome from './examples/palindrome.json';
import unaryAdd from './examples/unary-add.json';
import walksForever from './examples/walks-forever.json';
import zerosOnesReject from './examples/zeros-ones-reject.json';
import zerosOnes from './examples/zeros-ones.json';
import explain from './explain.md?raw';
import { ADD, COPY, INCREMENT, PALINDROME, WALK, ZERO_ONE } from './machines';
import {
  defaults,
  describe,
  init,
  initialSay,
  ops,
  pseudocode,
  type TmExtra,
  type TmSettings,
  type TmState,
} from './model';
import { tmPractice } from './practice';
import { view } from './view';

/** Text with an arrow or a semicolon is a machine; anything else is a word. */
export const looksLikeRules = (t: string) => /->|→|;/.test(t) || /^start\s/i.test(t.trim());

/** The input box holds either a word (Run, Start) or a machine (Load); the operation checks which. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (looksLikeRules(t)) {
    const m = parseMachine(t, { stay: true });
    return m instanceof Error ? m : t;
  }
  const w = parseWord(t);
  return w instanceof Error ? w : t;
}

const bits = (rng: Rng, n: number, first = '') =>
  first + Array.from({ length: n - first.length }, () => String(rng.int(0, 1))).join('');

const preset = (label: string, machine: string, word: (rng: Rng, n: number) => string): Preset => ({
  label,
  make: (rng, size) => [
    ['load', machine],
    ['run', word(rng, size) || 'ε'],
  ],
});

function palindromeOf(rng: Rng, n: number): string {
  const half = bits(rng, Math.floor(n / 2));
  const mid = n % 2 ? String(rng.int(0, 1)) : '';
  return half + mid + [...half].reverse().join('');
}

export const turingMachine: VizDef<TmState, TmSettings, TmExtra> = {
  id: 'turing-machine',
  title: 'Turing machine',
  family: 'Automata and computability',
  blurb:
    'A tape, a head and a table of rules. Run a word one move at a time, watch the configurations, and meet a machine that never halts.',
  settings: [
    {
      kind: 'choice',
      key: 'tape',
      label: 'Tape',
      options: [
        { value: 'one-way', label: 'Infinite to the right only (Sipser)' },
        { value: 'two-way', label: 'Infinite both ways' },
      ],
      help: 'On a one-way tape, a move left from cell 0 leaves the head where it is. Both kinds compute the same things.',
    },
    {
      kind: 'choice',
      key: 'moves',
      label: 'Moves',
      options: [
        { value: 'LR', label: 'L and R (Sipser)' },
        { value: 'LRS', label: 'L, R and S (stay put)' },
      ],
      help: 'S adds no power: a move right and then a move left does the same in two moves.',
    },
    {
      kind: 'choice',
      key: 'rules',
      label: 'Show the rules as',
      options: [
        { value: 'table', label: 'A transition table' },
        { value: 'diagram', label: 'A state diagram' },
      ],
      help: 'Only the picture changes. The diagram labels an arrow 1→y,L for "read 1, write y, move left" and 0→R for "read 0, leave it, move right". Machines with more than 5 states keep the table.',
    },
  ],
  defaults,
  init,
  initialSay,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Word or rules',
      placeholder: 'e.g. 0011, or q0 0 -> q1 x R; q1 0 -> q1 R',
      maxLength: 600,
      sample: '0011',
      parse: parseInput,
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'step', label: 'Step', usesInput: false },
      { op: 'start', label: 'Start', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('0ⁿ1ⁿ: a word in the language', ZERO_ONE, (_rng, n) => {
        const k = Math.floor(n / 2);
        return '0'.repeat(k) + '1'.repeat(k);
      }),
      preset('0ⁿ1ⁿ: random 0s and 1s', ZERO_ONE, (rng, n) => bits(rng, n)),
      preset('Palindromes: a palindrome', PALINDROME, palindromeOf),
      preset('Palindromes: random 0s and 1s', PALINDROME, (rng, n) => bits(rng, n)),
      preset('Binary increment: a random number', INCREMENT, (rng, n) => bits(rng, n, '1')),
      preset('Binary increment: all 1s (the longest carry)', INCREMENT, (_rng, n) => '1'.repeat(n)),
      preset('Copy a string', COPY, (rng, n) => bits(rng, n)),
      preset('Unary addition', ADD, (rng, n) => {
        const a = rng.int(0, n - 1);
        return `${'1'.repeat(a)}+${'1'.repeat(n - 1 - a)}`;
      }),
      preset('A machine that never halts', WALK, (rng, n) => bits(rng, n)),
    ],
    sizes: [4, 6, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'Decide 0ⁿ1ⁿ by crossing off (word of length n)',
      best: {
        cost: 'Θ(1)',
        why: 'A word that starts with 1 has no rule in q0, so it is rejected before the first move.',
        example: 'zeros-ones-reject',
      },
      average: {
        cost: 'O(n²)',
        why: 'Each 0 crossed off costs a walk to the 1s and back, across up to n cells.',
        example: 'zeros-ones',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'A word in the language makes n/2 round trips of about n cells each.',
        example: 'zeros-ones',
      },
      note: 'A two-tape machine does it in O(n): copy the 0s to the second tape, then cross them off against the 1s in one pass. On one tape, crossing off every other 0 and 1 gets O(n log n), and no one-tape machine can do better.',
    },
    {
      op: 'Check a palindrome (word of length n)',
      best: {
        cost: 'Θ(n)',
        why: 'If the first and last symbols differ, one trip across the word finds it.',
        example: 'palindrome',
      },
      average: {
        cost: 'Θ(n)',
        why: 'In a random word the two ends differ half the time, so a mismatch turns up after about two trips.',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'A palindrome makes n/2 round trips, each across what is left of the word.',
        example: 'palindrome',
      },
      note: 'Two tapes do it in O(n): copy the word, then read the copy backwards against the original. One tape cannot: every one-tape machine for palindromes needs Ω(n²) moves.',
    },
    {
      op: 'Binary increment (n bits)',
      best: {
        cost: 'Θ(n)',
        why: 'The walk to the right end alone is n moves; a last bit of 0 then takes the carry at once.',
        example: 'increment',
      },
      average: {
        cost: 'Θ(n)',
        why: 'The walk dominates; the carry stops after about two bits.',
      },
      worst: {
        cost: 'Θ(n)',
        why: '11…1 carries all the way back: about 2n moves.',
        example: 'increment',
      },
    },
    {
      op: 'One move',
      best: {
        cost: 'Θ(1)',
        why: 'Look up δ(q, a), write one cell, move one cell.',
        example: 'unary-add',
      },
      average: { cost: 'Θ(1)', why: 'Every move does the same three things.' },
      worst: {
        cost: 'Θ(1)',
        why: 'Even a machine that never halts makes each move in constant time; it just never stops making them.',
        example: 'walks-forever',
      },
      note: 'Space: a run of t moves visits at most t + 1 cells, so a machine never uses more space than time.',
    },
  ],
  practice: tmPractice(() => turingMachine),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as TmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    zerosOnes,
    zerosOnesReject,
    increment,
    incrementOneWay,
    palindrome,
    copy,
    unaryAdd,
    walksForever,
    flipsForever,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "load <rules>" (prints nothing), then "run <word>", which
 * prints "accept after 25 moves: xxxyyy", "reject after …" or "still running after 500 moves: …"
 * with the tape's non-blank span. The code follows the default settings (a one-way tape, moves
 * L and R), so the model runs with them here, whatever the page's settings.
 */
function codeScript(calls: OpCall[], _settings: TmSettings) {
  const t = new Timeline(turingMachine, defaults, 1, calls);
  let machine: Machine = t.initial.state.machine;
  const input = [`load ${formatMachine(machine)}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op, arg] = e.call;
    if (op === 'load' && e.end.machine !== machine) {
      machine = e.end.machine;
      input.push(`load ${formatMachine(machine)}`);
    }
    const word = parseWord(String(arg ?? ''));
    if (op !== 'run' || word instanceof Error || !e.end.config) continue;
    const c = e.end.config;
    const capped = e.steps.at(-1)!.extra?.capped;
    const verdict = capped ? 'still running' : c.state === ACCEPT ? 'accept' : 'reject';
    input.push(`run ${word}`.trim());
    expected.push(`${verdict} after ${c.moves} move${c.moves === 1 ? '' : 's'}: ${tapeText(c)}`);
  }
  return { input, expected };
}

export default turingMachine;
