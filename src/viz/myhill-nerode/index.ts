import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { automatonLines } from '../_automata/page';
import cppSource from './code/cpp/nerode.hpp?raw';
import javaSource from './code/java/Nerode.java?raw';
import pythonSource from './code/python/nerode.py?raw';
import anbnClasses from './examples/anbn-classes.json';
import anbnInfinite from './examples/anbn-infinite.json';
import apartLowerBound from './examples/apart-lower-bound.json';
import deadClass from './examples/dead-class.json';
import endsInAb from './examples/ends-in-ab.json';
import equalCounts from './examples/equal-counts.json';
import equivalentWords from './examples/equivalent-words.json';
import extraStates from './examples/extra-states.json';
import explain from './explain.md?raw';
import { wordText } from './language';
import {
  MAX_CLASSES,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pairKey,
  pseudocode,
  type MnSettings,
  type MnState,
} from './model';
import { mnPractice } from './practice';
import { view } from './view';

/** The input box holds a language for Load (an expression, a machine, anbn) or words. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a language, such as (a|b)*ab or anbn, or words such as eps a aa.');
  return t;
}

const word = (rng: Rng, n: number) => Array.from({ length: n }, () => 'ab'[rng.int(0, 1)]).join('');

/** (a|b)*a(a|b)…(a|b): the k-th symbol from the end is a; 2^k classes. */
export const fromEnd = (k: number) => `(a|b)*a${'(a|b)'.repeat(k - 1)}`;

/** A DFA counting a's modulo k: k classes. */
export function countMod(k: number): string {
  const moves = Array.from({ length: k }, (_, i) => `q${i} a -> q${(i + 1) % k}; q${i} b -> q${i}`);
  return `start q0; accept q0; ${moves.join('; ')}`;
}

/** Words ending in ab, with q3 a copy of q0 and q4 a copy of q1: five states, three classes. */
export const COPIES =
  'start q0; accept q2; q0 a -> q1; q0 b -> q3; q1 a -> q4; q1 b -> q2; q2 a -> q1; q2 b -> q3; q3 a -> q1; q3 b -> q0; q4 a -> q1; q4 b -> q2';

export const myhillNerode: VizDef<MnState, MnSettings, unknown> = {
  id: 'myhill-nerode',
  title: 'Myhill-Nerode theorem',
  family: 'Automata and computability',
  blurb:
    'Two words are equivalent when no suffix tells them apart. Sort words into classes to build the minimal DFA from words alone, or find infinitely many classes and prove no DFA exists.',
  settings: [
    {
      kind: 'choice',
      key: 'dead',
      label: 'The dead class',
      options: [
        { value: 'show', label: 'Draw it: the DFA has a move on every symbol (Sipser)' },
        { value: 'hide', label: 'Leave it out: missing moves reject' },
      ],
      help: 'The words that can never be extended into L form one class. A complete DFA has a state for it; many books leave that state out of the drawing. The count of classes includes it either way.',
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
      label: 'Language or words',
      placeholder: 'e.g. (a|b)*ab, anbn, or eps a aa',
      maxLength: 300,
      sample: 'anbn',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'classes', label: 'Find classes', usesInput: false },
      { op: 'apart', label: 'Words apart', usesInput: true },
      { op: 'family', label: 'Infinitely many', usesInput: false },
    ],
    presets: [
      {
        label: 'Words ending in a random string',
        make: (rng, size) => [['load', `(a|b)*${word(rng, size)}`], ['classes']],
      },
      {
        label: 'The k-th symbol from the end is a',
        make: (_rng, size) => [['load', fromEnd(Math.min(3, size - 1))], ['classes']],
      },
      {
        label: 'Count a’s modulo k',
        make: (_rng, size) => [['load', countMod(size)], ['classes']],
      },
      {
        label: 'A DFA with states to spare',
        make: () => [['load', COPIES], ['classes']],
      },
      {
        label: 'aⁿbⁿ: not regular',
        make: () => [['load', 'anbn'], ['family']],
      },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'Tell two words apart (a DFA with n states)',
      best: {
        cost: 'O(|x| + |y|)',
        why: 'Run both words; if one ends in an accepting state and the other does not, ε tells them apart.',
        example: 'equivalent-words',
      },
      average: {
        cost: 'O(n²·|Σ|)',
        why: 'A breadth-first search over pairs of states, from the pair the two words reach.',
        example: 'apart-lower-bound',
      },
      worst: {
        cost: 'O(n²·|Σ|)',
        why: 'Equivalent words make the search visit every pair it can reach before it gives up.',
        example: 'equivalent-words',
      },
    },
    {
      op: 'Find the k classes',
      best: {
        cost: 'O(k·|Σ|) comparisons',
        why: 'Each extension joins the first class it is compared with.',
        example: 'ends-in-ab',
      },
      average: {
        cost: 'O(k²·|Σ|) comparisons',
        why: 'Each of the k·|Σ| extensions is compared with up to k class words.',
        example: 'extra-states',
      },
      worst: {
        cost: 'never ends',
        why: 'A language with infinitely many classes keeps finding new ones: the page stops at 8.',
        example: 'anbn-classes',
      },
      note: 'Each comparison is a search for a suffix; on a DFA with n states it costs O(n²·|Σ|).',
    },
    {
      op: 'Show that L is not regular',
      best: {
        cost: 'one family',
        why: 'Find infinitely many words, pairwise told apart: aⁱ and aʲ by bⁱ.',
        example: 'anbn-infinite',
      },
      average: {
        cost: 'one family',
        why: 'The same words often work for other languages, such as as many a’s as b’s.',
        example: 'equal-counts',
      },
      worst: {
        cost: 'undecidable',
        why: 'No program can tell, for every context-free grammar, whether its language is regular.',
        example: 'anbn-classes',
      },
    },
  ],
  practice: mnPractice(() => myhillNerode),
  preview: { example: 'extra-states', level: 2, hide: ['cls-', 'pt-'] },
  // The bare language says little: open on its classes and minimal DFA.
  opening: 'ends-in-ab',
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MnSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    endsInAb,
    extraStates,
    apartLowerBound,
    equivalentWords,
    deadClass,
    anbnClasses,
    anbnInfinite,
    equalCounts,
  ] as unknown as SavedExample[],
};

const driverWord = (x: string) => (x === '' ? 'eps' : x);

/**
 * Driver protocol for the code tabs, for the regular languages (the page's own languages that no
 * DFA accepts have no code): the complete DFA as "dfa", "alphabet", "start", "accept" and "move"
 * lines (none of them print); "classes" prints the class words in the order found and the moves
 * between classes, "eps a ab | eps-a->a eps-b->eps ...", or "more than 8 classes"; "apart w1 w2
 * ..." prints, for each pair (w2, w1), (w3, w1), (w3, w2), ..., the shortest suffix that tells
 * them apart, "-" for equivalent words, eps for the empty word.
 */
function codeScript(calls: OpCall[], settings: MnSettings) {
  const t = new Timeline(myhillNerode, settings, 1, calls);
  const start = t.initial.state.lang;
  const input = start.kind === 'regular' ? automatonLines('dfa', start.dfa) : [];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const end = e.end;
    const changed = end !== before;
    before = end;
    if (!changed) continue;
    const l = end.lang;
    if (e.call[0] === 'load') {
      if (l.kind === 'regular') input.push(...automatonLines('dfa', l.dfa));
      continue;
    }
    if (l.kind !== 'regular') continue;
    const p = end.panel;
    if (p?.kind === 'classes') {
      input.push('classes');
      if (p.stopped) expected.push(`more than ${MAX_CLASSES} classes`);
      else {
        const name = (i: number) => driverWord(p.reps[i]!);
        expected.push(
          `${p.reps.map(driverWord).join(' ')} | ${p.moves.map((m) => `${name(m.from)}-${m.on}->${name(m.to)}`).join(' ')}`,
        );
      }
    } else if (p?.kind === 'apart') {
      input.push(`apart ${p.words.map(driverWord).join(' ')}`);
      const out: string[] = [];
      for (let i = 1; i < p.words.length; i++)
        for (let j = 0; j < i; j++) {
          const z = p.table[pairKey(i, j)];
          out.push(z === null || z === undefined ? '-' : driverWord(z));
        }
      expected.push(out.join(' '));
    }
  }
  return { input, expected };
}

export { wordText };
export default myhillNerode;
