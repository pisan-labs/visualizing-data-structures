import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseGrammar, parseWord, rulesByVariable, type Grammar } from '../_grammar/grammar';
import cppSource from './code/cpp/cyk.hpp?raw';
import javaSource from './code/java/Cyk.java?raw';
import pythonSource from './code/python/cyk.py?raw';
import ambiguous from './examples/ambiguous.json';
import anbn from './examples/anbn.json';
import balanced from './examples/balanced.json';
import alreadyCnf from './examples/already-cnf.json';
import conversion from './examples/conversion.json';
import emptyWord from './examples/empty-word.json';
import nullable from './examples/nullable-blowup.json';
import resultOnly from './examples/result-only.json';
import explain from './explain.md?raw';
import {
  MAX_WORD,
  defaults,
  describe,
  init,
  initialSay,
  looksLikeGrammar,
  ops,
  pseudocode,
  type CykExtra,
  type CykSettings,
  type CykState,
} from './model';
import { cykPractice } from './practice';
import { view } from './view';

export const GRAMMARS = {
  anbn: 'S -> aSb | eps',
  classic: 'S -> AB | BC; A -> BA | a; B -> CC | b; C -> AB | a',
  parens: 'S -> SS | (S) | eps',
  precedence: 'E -> E+T | T; T -> T*F | F; F -> (E) | a',
};

/** The input box holds a grammar (Load) or a word (Parse); the operation checks which. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (looksLikeGrammar(t)) {
    const g = parseGrammar(t);
    return g instanceof Error ? g : t;
  }
  const w = parseWord(t, undefined, MAX_WORD);
  return w instanceof Error ? w : t;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const letters = (rng: Rng, n: number, from: string) =>
  Array.from({ length: n }, () => pick(rng, [...from])).join('');

function balancedOf(rng: Rng, n: number): string {
  let open = Math.max(1, Math.floor(n / 2));
  let depth = 0;
  let out = '';
  while (open > 0 || depth > 0) {
    if (open > 0 && (depth === 0 || rng.int(0, 1))) {
      out += '(';
      open--;
      depth++;
    } else {
      out += ')';
      depth--;
    }
  }
  return out;
}

const preset = (label: string, grammar: string, word: (rng: Rng, n: number) => string): Preset => ({
  label,
  make: (rng, size) => [
    ['load', grammar],
    ['parse', word(rng, Math.min(size, MAX_WORD)) || 'eps'],
  ],
});

export const cykParsing: VizDef<CykState, CykSettings, CykExtra> = {
  id: 'cyk',
  title: 'CYK parsing',
  family: 'Automata and computability',
  blurb:
    'Convert a grammar to Chomsky normal form, stage by stage, then fill the CYK triangle cell by cell to decide whether it generates a word.',
  settings: [
    {
      kind: 'choice',
      key: 'conversion',
      label: 'Loading a grammar',
      options: [
        { value: 'stages', label: 'Show each stage of the conversion to CNF' },
        { value: 'result', label: 'Show only the result' },
      ],
      help: 'CYK needs Chomsky normal form. The conversion follows Sipser: a new start variable, then no ε-rules, no unit rules, and right sides of two variables or one terminal.',
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
      label: 'Word or grammar',
      placeholder: 'e.g. aabb, or S -> aSb | eps',
      maxLength: 200,
      sample: 'aabb',
      parse: parseInput,
    },
    buttons: [
      { op: 'parse', label: 'Parse', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('aⁿbⁿ: a word in the language', GRAMMARS.anbn, (_rng, n) => {
        const k = Math.max(1, Math.floor(n / 2));
        return 'a'.repeat(k) + 'b'.repeat(k);
      }),
      preset('aⁿbⁿ: random a’s and b’s', GRAMMARS.anbn, (rng, n) => letters(rng, n, 'ab')),
      preset('Already in CNF: random a’s and b’s', GRAMMARS.classic, (rng, n) =>
        letters(rng, n, 'ab'),
      ),
      preset('Balanced parentheses', GRAMMARS.parens, balancedOf),
      preset('Random parentheses', GRAMMARS.parens, (rng, n) => letters(rng, n, '()')),
      preset('Expressions with precedence', GRAMMARS.precedence, (rng, n) => {
        let out = 'a';
        while (out.length + 2 <= n) out += `${pick(rng, ['+', '*'])}a`;
        return out;
      }),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Parse a word of length n',
      best: {
        cost: 'Θ(n³·|G|)',
        why: 'CYK never stops early: even aab, rejected, fills every cell and tries every split.',
        example: 'anbn',
      },
      average: {
        cost: 'Θ(n³·|G|)',
        why: 'n(n+1)/2 cells, up to n − 1 splits each, and every rule A → BC checked at each split.',
        example: 'already-cnf',
      },
      worst: {
        cost: 'Θ(n³·|G|)',
        why: 'The same three loops, whatever the word: (n³ − n)/6 splits in all.',
        example: 'balanced',
      },
      note: 'Space: Θ(n²) cells. An ambiguous grammar costs no more: one cell holds a variable once, however many trees lead to it.',
    },
    {
      op: 'Convert a grammar to Chomsky normal form',
      best: {
        cost: 'O(|G|)',
        why: 'A grammar already in CNF only gains S₀ and S₀’s copy of S’s rules.',
        example: 'already-cnf',
      },
      average: {
        cost: 'O(|G|²)',
        why: 'Removing unit rules copies whole sets of rules from one variable to another.',
        example: 'conversion',
      },
      worst: {
        cost: 'exponential in |G|',
        why: 'Removing ε-rules first, as Sipser does, turns a right side with k nullable variables into up to 2ᵏ rules.',
        example: 'nullable-blowup',
      },
      note: 'Splitting long right sides before removing ε-rules keeps the conversion polynomial.',
    },
    {
      op: 'Read back a parse tree',
      best: {
        cost: 'Θ(n)',
        why: 'A CNF tree for n symbols has 2n − 1 inner nodes.',
        example: 'anbn',
      },
      average: { cost: 'Θ(n)', why: 'Each node looks up how its variable got into its cell.' },
      worst: {
        cost: 'Θ(n)',
        why: 'Even when the word has many trees, following one way down gives one tree.',
        example: 'ambiguous',
      },
    },
  ],
  practice: cykPractice(() => cykParsing),
  preview: { example: 'balanced', level: 2 },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CykSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    alreadyCnf,
    anbn,
    conversion,
    emptyWord,
    balanced,
    ambiguous,
    nullable,
    resultOnly,
  ] as unknown as SavedExample[],
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** A variable as the drivers read it: S₀ is S0. */
export const asciiSym = (s: string) =>
  [...s].map((c) => (SUB.includes(c) ? String(SUB.indexOf(c)) : c)).join('');

/** Terminals the drivers can read: printable ASCII other than ; and |. */
const readable = (g: Grammar) =>
  g.terminals.every((t) => t.length === 1 && t > ' ' && t <= '~' && t !== ';' && t !== '|');

/** A grammar in Chomsky normal form as the drivers read it: "S0 -> U1 S1 | eps; U1 -> a". */
export function driverGrammar(g: Grammar): string {
  return rulesByVariable(g)
    .map(
      ({ lhs, rules }) =>
        `${asciiSym(lhs)} -> ${rules.map((r) => (r.rhs.length ? r.rhs.map(asciiSym).join(' ') : 'eps')).join(' | ')}`,
    )
    .join('; ');
}

/**
 * Driver protocol for the code tabs: "load <grammar in CNF>" (prints nothing; the page converts
 * the grammar and the drivers run CYK on the result), then "parse <word>" ("eps" for the empty
 * word), which prints "yes" or "no" and then the variables in the top cell, in grammar order.
 */
function codeScript(calls: OpCall[], _settings: CykSettings) {
  const t = new Timeline(cykParsing, defaults, 1, calls);
  let g = t.initial.state.grammar;
  let usable = readable(g);
  const input: string[] = usable ? [`load ${driverGrammar(t.initial.state.cnf.cnf)}`] : [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op] = e.call;
    if (op === 'load' && e.end.grammar !== g) {
      g = e.end.grammar;
      usable = readable(g);
      if (usable) input.push(`load ${driverGrammar(e.end.cnf.cnf)}`);
      continue;
    }
    if (op !== 'parse' || !usable || e.end.accept === null || !e.end.word) continue;
    if (!e.steps.at(-1)!.lines.some((l) => l === 'parse.accept' || l === 'parse.eps')) continue;
    const w = e.end.word;
    input.push(`parse ${w.join('') || 'eps'}`);
    const verdict = e.end.accept ? 'yes' : 'no';
    const top = w.length ? e.end.table![w.length - 1]![0]! : [];
    expected.push([verdict, ...top.map(asciiSym)].join(' '));
  }
  return { input, expected };
}

export default cykParsing;
