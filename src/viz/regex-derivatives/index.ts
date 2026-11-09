import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import type { Regex, UnionSign } from '../_automata/regex';
import { randomText, randomWord } from '../_automata/regex-random';
import cppSource from './code/cpp/derivatives.hpp?raw';
import javaSource from './code/java/Derivatives.java?raw';
import pythonSource from './code/python/derivatives.py?raw';
import { rightNest, show } from './derive';
import abbDfa from './examples/abb-dfa.json';
import deriveByA from './examples/derive-by-a.json';
import emptyDerivative from './examples/empty-derivative.json';
import kthFromEnd from './examples/kth-from-end.json';
import matchAbb from './examples/match-abb.json';
import nullableStart from './examples/nullable-start.json';
import plusForUnion from './examples/plus-for-union.json';
import repeatsGrow from './examples/repeats-grow.json';
import explain from './explain.md?raw';
import {
  MAX_STATES,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type RdSettings,
  type RdState,
} from './model';
import { rdPractice } from './practice';
import { view } from './view';

/** The input box holds an expression for Load, a symbol for Derive or a word for Match. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type an expression, such as (a|b)*abb, a symbol such as a, or a word.');
  return t;
}

const signOf = (settings?: Settings): UnionSign => (settings?.union === '+' ? '+' : '|');

/** (a|b)*a(a|b)…(a|b): the k-th symbol from the end is a. Its DFA needs 2^k states. */
export const fromEnd = (k: number, u: UnionSign = '|') => `(a${u}b)*a${`(a${u}b)`.repeat(k - 1)}`;

export const regexDerivatives: VizDef<RdState, RdSettings, unknown> = {
  id: 'regex-derivatives',
  title: 'Regular expression derivatives',
  family: 'Automata and computability',
  blurb:
    'What is left of a regular expression after reading one symbol. Take derivatives to match a word with no automaton at all, or to build a DFA whose states are the derivatives.',
  settings: [
    {
      kind: 'choice',
      key: 'similarity',
      label: 'Simplify',
      options: [
        {
          value: 'aci',
          label: 'With similarity: sort the alternatives of | and drop repeats (Brzozowski)',
        },
        { value: 'basic', label: 'Only drop ∅ and ε where they do nothing' },
      ],
      help: 'Both give expressions for the same languages. With the similarity rules, every expression has finitely many derivatives, so Build DFA always stops; without them, a union can keep repeating its alternatives and grow forever.',
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
      label: 'Expression, symbol or word',
      placeholder: 'e.g. (a|b)*abb, a, or abb',
      maxLength: 40,
      sample: 'a',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'derive', label: 'Derive', usesInput: true },
      { op: 'match', label: 'Match', usesInput: true },
      { op: 'dfa', label: 'Build DFA', usesInput: false },
    ],
    presets: [
      {
        label: 'A random expression and its DFA',
        make: (rng, size, settings) => [['load', randomText(rng, size, signOf(settings))], ['dfa']],
      },
      {
        label: 'A random expression and a word',
        make: (rng, size, settings) => [
          ['load', randomText(rng, size, signOf(settings))],
          ['match', randomWord(rng, rng.int(2, 6))],
        ],
      },
      {
        label: 'The k-th symbol from the end is a',
        make: (_rng, size, settings) => [
          ['load', fromEnd(size <= 4 ? 1 : size <= 6 ? 2 : 3, signOf(settings))],
          ['dfa'],
        ],
      },
      {
        label: 'Repeated stars',
        make: (_rng, _size, settings) => [['load', `(a${signOf(settings)}b)*a*b*`], ['dfa']],
      },
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'd_c(r), r of size m',
      best: {
        cost: 'O(m)',
        why: 'One pass up the parts of r; most rules just combine their parts.',
        example: 'derive-by-a',
      },
      average: {
        cost: 'O(m)',
        why: 'Each part is looked at once; simplifying adds a little sorting.',
        example: 'nullable-start',
      },
      worst: {
        cost: 'O(m²)',
        why: 'A concatenation whose first part can be empty copies both sides, so the result can be about twice as large.',
        example: 'nullable-start',
      },
    },
    {
      op: 'Match a word of length n',
      best: {
        cost: 'O(m)',
        why: 'A first symbol r cannot start with gives ∅, and the match stops.',
        example: 'empty-derivative',
      },
      average: {
        cost: 'O(n·m)',
        why: 'One derivative per symbol, and with simplification the expressions stay about as large as r.',
        example: 'match-abb',
      },
      worst: {
        cost: 'O(n·m²) or more',
        why: 'Without the similarity rules the expressions can keep growing with every symbol.',
        example: 'repeats-grow',
      },
      note: 'Building the DFA first moves the work out of matching: then each symbol is one table lookup.',
    },
    {
      op: 'Build the DFA of derivatives',
      best: {
        cost: 'O(|Σ|·m)',
        why: 'An expression like a* has one derivative by a, itself, and one by b, ∅.',
        example: 'abb-dfa',
      },
      average: {
        cost: 'O(k·|Σ|·m)',
        why: 'k states, one derivative per state and symbol; k is often close to the minimal DFA.',
        example: 'abb-dfa',
      },
      worst: {
        cost: 'O(2^m) states',
        why: 'The k-th symbol from the end needs 2^k states in any DFA, and so does this one.',
        example: 'kth-from-end',
      },
      note: `The page stops at ${MAX_STATES} states.`,
    },
  ],
  practice: rdPractice(() => regexDerivatives),
  preview: { example: 'abb-dfa', level: 3, hide: ['row', 'panel-title', 'expr'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RdSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    deriveByA,
    matchAbb,
    abbDfa,
    nullableStart,
    emptyDerivative,
    kthFromEnd,
    repeatsGrow,
    plusForUnion,
  ] as unknown as SavedExample[],
};

/** The expression in prefix form for the drivers: | . * + ? on their parts, eps, empty, symbols. */
export function prefix(r: Regex): string {
  switch (r.kind) {
    case 'sym':
      return r.c;
    case 'eps':
      return 'eps';
    case 'empty':
      return 'empty';
    case 'union':
      return `| ${prefix(r.a)} ${prefix(r.b)}`;
    case 'concat':
      return `. ${prefix(r.a)} ${prefix(r.b)}`;
    case 'star':
      return `* ${prefix(r.a)}`;
    case 'plus':
      return `+ ${prefix(r.a)}`;
    case 'opt':
      return `? ${prefix(r.a)}`;
  }
}

/**
 * Driver protocol for the code tabs: "regex <prefix form>" (prints nothing) reads an expression
 * as typed; "derive <c>" prints d_c(r) with | for union; "match <word>" (eps for the empty word)
 * prints "accept" or "reject"; "dfa" prints "<k> states, <j> accepting", or "more than 10
 * states". The code simplifies with the similarity rules (the default), so the model runs that
 * way here, whatever the page's settings.
 */
function codeScript(calls: OpCall[], settings: RdSettings) {
  const t = new Timeline(regexDerivatives, { ...settings, similarity: 'aci' }, 1, calls);
  let tree = t.initial.state.tree;
  const input = [`regex ${prefix(rightNest(tree.r))}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const end = e.end;
    const changed = end !== before;
    before = end;
    if (!changed) continue;
    const p = end.panel;
    if (e.call[0] === 'load') {
      tree = end.tree;
      input.push(`regex ${prefix(rightNest(tree.r))}`);
    } else if (p?.kind === 'derive') {
      input.push(`derive ${p.c}`);
      expected.push(show(p.rows.at(-1)!.d, '|'));
    } else if (p?.kind === 'match') {
      input.push(`match ${p.word || 'eps'}`);
      expected.push(p.verdict!);
    } else if (p?.kind === 'dfa') {
      input.push('dfa');
      expected.push(
        p.stopped
          ? `more than ${MAX_STATES} states`
          : `${p.states.length} states, ${p.states.filter((q) => q.nu).length} accepting`,
      );
    }
  }
  return { input, expected };
}

export default regexDerivatives;
