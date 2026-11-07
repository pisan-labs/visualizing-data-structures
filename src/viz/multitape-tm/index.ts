import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/multitape_tm.hpp?raw';
import javaSource from './code/java/MultiTapeTM.java?raw';
import pythonSource from './code/python/multitape_tm.py?raw';
import binaryAdd from './examples/binary-add.json';
import copyCompareOneTape from './examples/copy-compare-one-tape.json';
import copyCompare from './examples/copy-compare.json';
import palindromeMismatch from './examples/palindrome-mismatch.json';
import palindromeOneTape from './examples/palindrome-one-tape.json';
import palindrome from './examples/palindrome.json';
import shiftsEveryMove from './examples/shifts-every-move.json';
import unaryMultiply from './examples/unary-multiply.json';
import unequalLengths from './examples/unequal-lengths.json';
import walksForever from './examples/walks-forever.json';
import explain from './explain.md?raw';
import {
  ACCEPT,
  SEP,
  parseMachine,
  parseWords,
  tapeText,
  type MtMachine,
  type Sim,
} from './machine';
import { ADD, COPY_COMPARE, MULTIPLY, PALINDROME, WALK } from './machines';
import {
  defaults,
  describe,
  init,
  initialSay,
  ops,
  pseudocode,
  type MtExtra,
  type MtSettings,
  type MtState,
} from './model';
import { mtPractice } from './practice';
import { view } from './view';

/** Text with an arrow or a semicolon is a machine; anything else is the input. */
export const looksLikeRules = (t: string) => /->|→|;/.test(t) || /^start\s/i.test(t.trim());

/** The input box holds the input (Run, Simulate, Start) or a machine (Load). */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (looksLikeRules(t)) {
    const m = parseMachine(t);
    return m instanceof Error ? m : t;
  }
  const w = parseWords(t);
  return w instanceof Error ? w : t;
}

export const bits = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => String(rng.int(0, 1))).join('');

export function palindromeOf(rng: Rng, n: number): string {
  const half = bits(rng, Math.floor(n / 2));
  const mid = n % 2 ? String(rng.int(0, 1)) : '';
  return half + mid + [...half].reverse().join('');
}

/** w=w, or w=v with one symbol changed. */
export function copyWord(rng: Rng, n: number, miss = false): string {
  const w = bits(rng, Math.max(1, n));
  if (!miss) return `${w}=${w}`;
  const i = rng.int(0, w.length - 1);
  return `${w}=${w.slice(0, i)}${w[i] === '0' ? '1' : '0'}${w.slice(i + 1)}`;
}

const preset = (
  label: string,
  machine: string,
  op: 'run' | 'simulate',
  word: (rng: Rng, n: number) => string,
): Preset => ({
  label,
  make: (rng, size) => [
    ['load', machine],
    [op, word(rng, size) || 'ε'],
  ],
});

export const multitapeTm: VizDef<MtState, MtSettings, MtExtra> = {
  id: 'multitape-tm',
  title: 'Multi-tape Turing machine',
  family: 'Automata and computability',
  blurb:
    'Two or three tapes, each with its own head, all moving at once. Then the same machine on a single tape, and why it costs a square.',
  settings: [
    {
      kind: 'choice',
      key: 'mark',
      label: 'Mark the heads on the single tape with',
      options: [
        { value: 'dot', label: 'A dot over the symbol (Sipser)' },
        { value: 'underline', label: 'A line under the symbol' },
      ],
      help: 'Only the picture changes. Either way the single tape needs a second copy of every symbol, a marked one, to show where each head is.',
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
      label: 'Input or rules',
      placeholder: 'e.g. 01=01, 101,011, or q0 1,_ -> q1 1,1 R,R',
      maxLength: 600,
      sample: '01=01',
      parse: parseInput,
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'simulate', label: 'Simulate', usesInput: true },
      { op: 'step', label: 'Step', usesInput: false },
      { op: 'start', label: 'Start', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('Copy, then compare: w=w', COPY_COMPARE, 'run', (rng, n) =>
        copyWord(rng, Math.floor(n / 2)),
      ),
      preset('Copy, then compare: a near miss', COPY_COMPARE, 'run', (rng, n) =>
        copyWord(rng, Math.floor(n / 2), true),
      ),
      preset('Copy, then compare, on one tape', COPY_COMPARE, 'simulate', (rng, n) =>
        copyWord(rng, Math.floor(n / 3)),
      ),
      preset('Palindromes: a palindrome', PALINDROME, 'run', palindromeOf),
      preset('Palindromes: random 0s and 1s', PALINDROME, 'run', bits),
      preset('Palindromes on one tape', PALINDROME, 'simulate', (rng, n) =>
        palindromeOf(rng, Math.ceil(n / 2)),
      ),
      preset('Binary addition: two numbers', ADD, 'run', (rng, n) => {
        const k = Math.max(1, Math.floor(n / 2));
        return `${bits(rng, k)},${bits(rng, k)}`;
      }),
      preset('Unary multiplication', MULTIPLY, 'run', (rng, n) => {
        const a = rng.int(1, 3);
        return `${'1'.repeat(a)}*${'1'.repeat(rng.int(1, Math.max(1, n - a - 1)))}`;
      }),
      preset('Two heads that never stop', WALK, 'run', (rng, n) => bits(rng, Math.min(n, 4))),
    ],
    sizes: [4, 6, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'One move of the k-tape machine',
      best: {
        cost: 'Θ(1)',
        why: 'Read k cells, look up one rule, write k cells and move k heads, all at once.',
        example: 'copy-compare',
      },
      average: { cost: 'Θ(1)', why: 'Every move does the same work, whatever is on the tapes.' },
      worst: {
        cost: 'Θ(1)',
        why: 'Even a machine that never halts makes each move in constant time.',
        example: 'walks-forever',
      },
      note: 'k is fixed by the machine, so k reads and k writes count as constant.',
    },
    {
      op: 'One move simulated on a single tape of L cells',
      best: {
        cost: 'Θ(L)',
        why: 'A scan right to read the marks and a scan back to update them: 2(L − 1) moves, even when no head moves.',
        example: 'copy-compare-one-tape',
      },
      average: {
        cost: 'Θ(L)',
        why: 'A mark that moves right costs 2 more moves; there are at most k of them.',
      },
      worst: {
        cost: 'Θ(k·L)',
        why: 'Every mark lands on a #, and each of the k shifts walks to the end of the tape and back.',
        example: 'shifts-every-move',
      },
    },
    {
      op: 't moves of the k-tape machine, simulated on one tape (input of length n ≤ t)',
      best: {
        cost: 'Θ(t·n)',
        why: 'If no head goes past the input, the tape stays about n + 2k cells long, and each move scans it twice.',
      },
      average: {
        cost: 'O(t²)',
        why: 'A tape can grow by at most one cell a move, so the single tape stays under n + 2k + kt cells.',
        example: 'palindrome-one-tape',
      },
      worst: {
        cost: 'Θ(t²)',
        why: 'Heads that always move onto new cells grow the tape by k cells a move, and every move scans all of it.',
        example: 'shifts-every-move',
      },
      note: 'Sipser, Theorem 7.8: a t(n)-time multi-tape machine, with t(n) ≥ n, has an O(t²(n))-time single-tape equivalent.',
    },
    {
      op: 'Palindromes with two tapes (word of length n)',
      best: {
        cost: 'Θ(n)',
        why: 'The machine copies and rewinds before it compares, so even a mismatch at the ends costs about 2n moves.',
        example: 'palindrome-mismatch',
      },
      average: { cost: 'Θ(n)', why: 'Copy, rewind, compare: three passes at most.' },
      worst: {
        cost: 'Θ(n)',
        why: 'A palindrome makes all three passes: about 3n moves.',
        example: 'palindrome',
      },
      note: 'One tape cannot do this: every one-tape machine for palindromes needs Ω(n²) moves. So the square in the simulation is sometimes the real price.',
    },
  ],
  practice: mtPractice(() => multitapeTm),
  preview: { example: 'copy-compare-one-tape', level: 2, hide: ['rule-'] },
  opening: 'copy-compare',
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], _settings: Settings) => codeScript(calls),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    copyCompare,
    copyCompareOneTape,
    palindrome,
    palindromeMismatch,
    palindromeOneTape,
    binaryAdd,
    unequalLengths,
    unaryMultiply,
    walksForever,
    shiftsEveryMove,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs. "machine <k> <start>" starts a machine, then one
 * "rule <state> <reads> <next> <writes> <moves>" per rule, each of the last three a string of k
 * symbols (# never appears); none of these print. "run <words>" prints "accept after 16 moves:
 * 0110=0110 | $0110" (each tape from cell 0, _ for a blank tape); "simulate <words>" prints
 * "accept after 10 moves of M and 248 on one tape: #01=01[_]#$01[_]#", the single tape with
 * each marked cell in brackets. Words are separated by commas. The code has no settings.
 */
export function machineLines(m: MtMachine): string[] {
  return [
    `machine ${m.k} ${m.start}`,
    ...m.rules.map(
      (r) => `rule ${r.from} ${r.read.join('')} ${r.to} ${r.write.join('')} ${r.move.join('')}`,
    ),
  ];
}

/** The single tape with each marked cell in brackets: "#01=01[_]#$01[_]#". */
export function simText(s: Sim): string {
  return s.cells.map((a, i) => (s.dots.includes(i) && a !== SEP ? `[${a}]` : a)).join('');
}

function codeScript(calls: OpCall[]) {
  const t = new Timeline(multitapeTm, defaults, 1, calls);
  let machine: MtMachine = t.initial.state.machine;
  const input = machineLines(machine);
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op, arg] = e.call;
    if (op === 'load' && e.end.machine !== machine) {
      machine = e.end.machine;
      input.push(...machineLines(machine));
    }
    if (op !== 'run' && op !== 'simulate') continue;
    const words = parseWords(String(arg ?? ''));
    if (words instanceof Error || words.length > machine.k) continue;
    const c = e.end.config!;
    const capped = e.steps.at(-1)!.extra?.capped;
    const verdict = capped ? 'still running' : c.state === ACCEPT ? 'accept' : 'reject';
    input.push(`${op} ${words.join(',')}`.trim());
    const n = `${c.moves} move${c.moves === 1 ? '' : 's'}`;
    expected.push(
      op === 'run'
        ? `${verdict} after ${n}: ${c.tapes.map(tapeText).join(' | ')}`
        : `${verdict} after ${n} of M and ${e.end.sim!.moves} on one tape: ${simText(e.end.sim!)}`,
    );
  }
  return { input, expected };
}

export default multitapeTm;
