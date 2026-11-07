import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { EPS, formatPda, search, type Pda } from '../_automata/pda';
import { randomPda } from '../_automata/pda-random';
import { randomWord } from '../_automata/random';
import cppSource from './code/cpp/pda.hpp?raw';
import javaSource from './code/java/Pda.java?raw';
import pythonSource from './code/python/pda.py?raw';
import aNbN from './examples/a-n-b-n.json';
import balancedParentheses from './examples/balanced-parentheses.json';
import emptyStack from './examples/empty-stack.json';
import equalTest from './examples/equal-test.json';
import evenPalindromes from './examples/even-palindromes.json';
import everyBranchDies from './examples/every-branch-dies.json';
import grammarToPda from './examples/grammar-to-pda.json';
import leftRecursion from './examples/left-recursion.json';
import oneComputation from './examples/one-computation.json';
import explain from './explain.md?raw';
import { MACHINES } from './machines';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  type PdaExtra,
  type PdaSettings,
  type PdaState,
} from './model';
import { pdaPractice } from './practice';
import { view } from './view';

const reverse = (w: string) => [...w].reverse().join('');

/** A balanced word of n parentheses (n rounded down to even). */
function balancedWord(rng: Rng, n: number): string {
  let out = '';
  let open = 0;
  for (let left = n - (n % 2); left > 0; left--) {
    if (open > 0 && (open === left || rng.int(0, 1) === 0)) {
      out += ')';
      open--;
    } else {
      out += '(';
      open++;
    }
  }
  return out;
}

/** Load a machine, then run a word of about the chosen length on it. */
function preset(label: string, text: string, word: (rng: Rng, n: number) => string): Preset {
  return {
    label,
    make: (rng, size): OpCall[] => [
      ['load', text],
      ['run', word(rng, size) || 'eps'],
    ],
  };
}

const half = (n: number) => Math.max(1, Math.floor(n / 2));

export const pda: VizDef<PdaState, PdaSettings, PdaExtra> = {
  id: 'pda',
  title: 'Pushdown automaton',
  family: 'Automata and computability',
  blurb:
    'A finite automaton with a stack. Run a word one move at a time, watch the stack grow and shrink, and see a breadth-first search follow every guess of a nondeterministic machine.',
  settings: [
    {
      kind: 'choice',
      key: 'accept',
      label: 'Accept by',
      options: [
        { value: 'state', label: 'Final state (Sipser)' },
        { value: 'stack', label: 'Empty stack (Hopcroft and Ullman)' },
      ],
      help: 'By final state, a word is accepted when some computation reads all of it and ends in an accept state. By empty stack, when some computation reads all of it and empties the stack; accept states do not count then.',
    },
    {
      kind: 'choice',
      key: 'search',
      label: 'Show the search',
      options: [
        { value: 'all', label: 'Every branch' },
        { value: 'path', label: 'The accepting computation only' },
      ],
      help: 'A nondeterministic machine is run by a breadth-first search over its configurations. Every branch shows each move of the search, branches that die included, then plays back the accepting computation; the other choice shows only the computation.',
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
      label: 'Machine or word',
      placeholder: 'e.g. aabb, +ab -ba, or q0 a, eps -> q0 a; accept q0',
      maxLength: 600,
      sample: 'aabb',
      parse: parseInput,
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'test', label: 'Test', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('aⁿbⁿ, in the language', MACHINES.anbn, (_rng, n) =>
        'a'.repeat(half(n)).padEnd(2 * half(n), 'b'),
      ),
      preset('aⁿbⁿ, one b short', MACHINES.anbn, (_rng, n) =>
        'a'.repeat(half(n)).padEnd(2 * half(n) - 1, 'b'),
      ),
      preset('Even palindrome (nondeterministic)', MACHINES.palindromes, (rng, n) => {
        const w = randomWord(rng, ['a', 'b'], half(n));
        return w + reverse(w);
      }),
      preset('Not a palindrome', MACHINES.palindromes, (rng, n) => {
        const w = randomWord(rng, ['a', 'b'], half(n));
        const p = w + reverse(w);
        const i = rng.int(0, p.length - 1);
        return `${p.slice(0, i)}${p[i] === 'a' ? 'b' : 'a'}${p.slice(i + 1)}`;
      }),
      preset('Balanced parentheses', MACHINES.parens, (rng, n) =>
        balancedWord(rng, Math.max(2, n)),
      ),
      preset('From the grammar S → aSb | ε', MACHINES.grammar, (_rng, n) =>
        'a'.repeat(half(n)).padEnd(2 * half(n), 'b'),
      ),
      {
        label: 'Random PDA, random word',
        make: (rng, size): OpCall[] => {
          const p = randomPda(rng, rng.int(3, 4), { deterministic: rng.int(0, 1) === 0 });
          return [
            ['load', formatPda(p)],
            ['run', randomWord(rng, p.inputs, Math.min(size, 8)) || 'eps'],
          ];
        },
      },
    ],
    sizes: [4, 8, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'Run a deterministic PDA on a word of length n',
      best: {
        cost: 'Θ(n)',
        why: 'One configuration at a time: a move per symbol, plus an ε-move to push $ and one to pop it.',
        example: 'a-n-b-n',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Every move reads a symbol, or is one of a few ε-moves between two reads.',
        example: 'balanced-parentheses',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'A deterministic PDA can be rewritten so its ε-moves never loop; then each symbol costs a bounded number of moves.',
      },
    },
    {
      op: 'Breadth-first search of a nondeterministic PDA',
      best: {
        cost: 'Θ(n)',
        why: 'No configuration ever has a choice, so the search follows one computation.',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'Even palindromes: each guess of the middle starts a branch that can live for up to n/2 moves.',
        example: 'even-palindromes',
      },
      worst: {
        cost: 'Unbounded: capped',
        why: `ε-moves that push make new configurations forever. The search stops after 200 configurations, without an answer.`,
        example: 'left-recursion',
      },
      note: 'Whether a word is in a context-free language can always be decided: turn the PDA into a grammar and run CYK, in Θ(n³) time.',
    },
    {
      op: 'Stack height during a run',
      best: {
        cost: 'O(1)',
        why: 'Parentheses nested one deep, such as ()()(): the stack never holds more than ($.',
      },
      average: {
        cost: 'Θ(n)',
        why: 'aⁿbⁿ pushes one a for every a: n/2 symbols at the middle of the word.',
        example: 'a-n-b-n',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Each reading move pushes at most 4 symbols, so after n symbols the stack is at most about 4n high (without pushing ε-loops).',
        example: 'grammar-to-pda',
      },
    },
  ],
  practice: pdaPractice(() => pda),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PdaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    aNbN,
    evenPalindromes,
    oneComputation,
    everyBranchDies,
    balancedParentheses,
    grammarToPda,
    emptyStack,
    leftRecursion,
    equalTest,
  ] as unknown as SavedExample[],
};

const sym = (s: string) => (s === EPS || s === '' ? 'eps' : s);

/**
 * Driver lines for a machine: "pda <states in name order>" starts one, then "start <state>",
 * "accept <states>" and "stack <symbols>" (either list may be empty; the stack top first),
 * "by state" or "by stack", and one "move <from> <read> <pop> <to> <push>" per move, "eps" for
 * nothing. None of them prints.
 */
export function pdaLines(p: Pda, settings: PdaSettings): string[] {
  return [
    `pda ${p.states.join(' ')}`,
    `start ${p.start}`,
    `accept ${p.accept.join(' ')}`.trimEnd(),
    `stack ${p.initial}`.trimEnd(),
    `by ${settings.accept}`,
    ...p.moves.map((m) => `move ${m.from} ${sym(m.read)} ${sym(m.pop)} ${m.to} ${sym(m.push)}`),
  ];
}

/**
 * Driver protocol for the code tabs: the machine's lines (pdaLines), then "run <word>" per
 * word run or tested, with no word for ε. Each run prints "accept <moves>" with the moves of the
 * shortest accepting computation, "reject" when every branch dies, or "stopped" when the search
 * reaches 200 configurations first.
 */
function codeScript(calls: OpCall[], settings: PdaSettings) {
  const t = new Timeline(pda, settings, 1, calls);
  const input = pdaLines(t.initial.state.machine, settings);
  const expected: string[] = [];
  let before = t.initial.state.machine;
  const result = (p: Pda, word: string) => {
    input.push(`run ${word}`.trimEnd());
    const s = search(p, word, settings.accept);
    expected.push(s.outcome === 'accept' ? `accept ${s.nodes[s.found!]!.depth}` : s.outcome);
  };
  for (const e of t.entries) {
    const p = e.end.machine;
    if (p !== before) input.push(...pdaLines(p, settings));
    before = p;
    const last = e.steps.at(-1)!.extra;
    if (e.call[0] === 'run' && last?.run) result(p, last.run.word);
    if (e.call[0] === 'test' && last?.test) for (const row of last.test.rows) result(p, row.word);
  }
  return { input, expected };
}

export default pda;
