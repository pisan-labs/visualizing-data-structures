import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/thompson.hpp?raw';
import javaSource from './code/java/ThompsonNfa.java?raw';
import pythonSource from './code/python/thompson.py?raw';
import endsInAbb from './examples/ends-in-abb.json';
import epsAndEmpty from './examples/eps-and-empty.json';
import linearSize from './examples/linear-size.json';
import nestedStars from './examples/nested-stars.json';
import plusAndOptional from './examples/plus-and-optional.json';
import plusForUnion from './examples/plus-for-union.json';
import sipserAbb from './examples/sipser-abb.json';
import sipserStars from './examples/sipser-stars.json';
import starThenStar from './examples/star-then-star.json';
import explain from './explain.md?raw';
import { randomText, randomWord } from '../_automata/regex-random';
import {
  DEFAULT_TEXT,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  readWord,
  type RxExtra,
  type RxSettings,
  type RxState,
} from './model';
import { readRegex, showRegex, type UnionSign } from '../_automata/regex';
import { rxPractice } from './practice';
import { view } from './view';

/** The input box holds an expression for Build or a word for Run; each operation reads it. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type an expression, such as (a|b)*abb, or a word, such as abb.');
  return t;
}

const signOf = (settings?: { union?: unknown }): UnionSign => (settings?.union === '+' ? '+' : '|');

/** (a|b)*a(a|b)...(a|b): the k-th symbol from the end is a. */
const fromEnd = (k: number, u: UnionSign) => `(a${u}b)*a${`(a${u}b)`.repeat(k - 1)}`;

export const regexToNfa: VizDef<RxState, RxSettings, RxExtra> = {
  id: 'regex-to-nfa',
  title: 'Regular expression to NFA',
  family: 'Automata and computability',
  blurb:
    "Build an NFA from a regular expression one piece at a time, by Thompson's or Sipser's construction, then run a word on it.",
  settings: [
    {
      kind: 'choice',
      key: 'construction',
      label: 'Construction',
      options: [
        { value: 'thompson', label: "Thompson's: one start and one accept state per piece" },
        { value: 'sipser', label: "Sipser's: fewer states, several accept states" },
      ],
      help: "Both build an NFA for the same language. Thompson's pieces always have one way in and one way out; Sipser's, from the proof of his Lemma 1.55, reuse accept states instead of adding new ones.",
    },
    {
      kind: 'choice',
      key: 'union',
      label: 'Union is written',
      options: [
        { value: '|', label: 'a|b (and a+ means one or more)' },
        { value: '+', label: 'a+b (as in Hopcroft and Ullman)' },
      ],
      help: 'Books differ. With +, there is no one-or-more; write aa* instead. ? (optional) works either way.',
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
      label: 'Expression or word',
      placeholder: 'e.g. (a|b)*abb, or a word: aabb',
      maxLength: 40,
      sample: 'abb',
      parse: parseInput,
    },
    buttons: [
      { op: 'build', label: 'Build', usesInput: true, primary: true },
      { op: 'run', label: 'Run', usesInput: true },
    ],
    presets: [
      {
        label: 'A random expression',
        make: (rng, size, settings) => [
          ['build', randomText(rng, size, signOf(settings))],
          ['run', randomWord(rng, rng.int(2, 5))],
        ],
      },
      {
        label: 'The k-th symbol from the end is a',
        make: (rng, size, settings) => [
          ['build', fromEnd(Math.min(size, 5), signOf(settings))],
          ['run', randomWord(rng, Math.min(size, 5) + 2)],
        ],
      },
      {
        label: 'Stars inside stars',
        make: (rng, size) => {
          let t = 'a';
          for (let i = 1; i < Math.min(size, 4); i++) t = `(${t}*${'ba'[i % 2]})`;
          return [
            ['build', `${t}*`],
            ['run', randomWord(rng, 4)],
          ];
        },
      },
      {
        label: 'A union of symbols',
        make: (rng, size, settings) => {
          const syms = 'abcde'.slice(0, Math.min(size, 5)).split('');
          return [
            ['build', syms.join(signOf(settings))],
            ['run', syms[rng.int(0, syms.length - 1)]!],
          ] as OpCall[];
        },
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: "build(R), Thompson's construction",
      best: {
        cost: 'O(m)',
        why: 'Each symbol or operator becomes one piece, with 2 new states and at most 4 arrows.',
        example: 'star-then-star',
      },
      average: {
        cost: 'O(m)',
        why: 'A piece never looks inside its parts: it only joins their start and accept states.',
        example: 'ends-in-abb',
      },
      worst: {
        cost: 'O(m)',
        why: 'Every part costs the same constant amount, however deeply it is nested.',
        example: 'linear-size',
      },
      note: 'm is the number of symbols and operators. The NFA has exactly 2m states, and at most 2 arrows leave any state.',
    },
    {
      op: "build(R), Sipser's construction",
      best: {
        cost: 'O(m)',
        why: 'Symbols, unions and concatenations of one-accept pieces add a few arrows each.',
        example: 'sipser-abb',
      },
      average: {
        cost: 'O(m)',
        why: 'Most pieces have one or two accept states, so each part adds a few arrows.',
      },
      worst: {
        cost: 'O(m²)',
        why: 'A star adds an arrow from every accept state of its body, and nested stars keep them all.',
        example: 'sipser-stars',
      },
      note: 'At most 2m states either way; only the arrows can grow faster.',
    },
    {
      op: 'run(w) on the NFA, |w| = n',
      best: {
        cost: 'O(m)',
        why: 'The first symbol leaves no active state, and the run stops.',
        example: 'plus-and-optional',
      },
      average: {
        cost: 'O(n·m)',
        why: 'Each of the n symbols moves a set of at most 2m states, along at most 2 arrows each.',
        example: 'ends-in-abb',
      },
      worst: {
        cost: 'O(n·m)',
        why: 'Even with every state active, a step costs O(m). Nothing backtracks.',
        example: 'linear-size',
      },
      note: 'Simulating the set of states is what keeps this polynomial. Trying one path at a time, as backtracking matchers do, can take exponential time.',
    },
  ],
  practice: rxPractice(() => regexToNfa),
  preview: { example: 'ends-in-abb', level: 2, hide: ['rx-'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RxSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    endsInAbb,
    starThenStar,
    nestedStars,
    epsAndEmpty,
    linearSize,
    sipserAbb,
    sipserStars,
    plusForUnion,
    plusAndOptional,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs, which follow the defaults (Thompson's construction, | for
 * union): "build <regex>" prints "<n> states, <m> moves" and "run <word>" prints accept or
 * reject; anything the model refuses prints "error". The script starts with the page's own
 * first build. An expression written with + for union is sent rewritten with |, and input the
 * model refuses is sent as something the drivers refuse too, so both sides agree.
 */
function codeScript(calls: OpCall[], settings: RxSettings) {
  const plain: RxSettings = { construction: 'thompson', union: '|' };
  const sent: OpCall[] = [['build', DEFAULT_TEXT['|']]];
  for (const [op, arg] of calls) {
    const text = String(arg ?? '');
    if (op === 'build') {
      const p = readRegex(text, { union: settings.union });
      sent.push(['build', p instanceof Error ? ')' : showRegex(p.tree.r, '|')]);
    } else {
      const w = readWord(text);
      sent.push(['run', w instanceof Error ? '-' : w || 'ε']);
    }
  }
  const t = new Timeline(regexToNfa, plain, 1, sent);
  const expected = t.entries.map((e) => {
    const last = e.steps.at(-1)!;
    if (last.lines.includes('build.return'))
      return `${e.end.nfa.states.length} states, ${e.end.nfa.moves.length} moves`;
    if (last.lines.includes('run.accept')) return 'accept';
    if (last.lines.includes('run.reject') || last.lines.includes('run.dead')) return 'reject';
    return 'error';
  });
  return { input: sent.map(([op, arg]) => `${op} ${String(arg)}`), expected };
}

export default regexToNfa;
