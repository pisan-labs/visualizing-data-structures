import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import {
  formatGrammar,
  isVariable,
  parseGrammar,
  parseWord,
  type Grammar,
} from '../_grammar/grammar';
import cppSource from './code/cpp/derivation.hpp?raw';
import javaSource from './code/java/Derivation.java?raw';
import pythonSource from './code/python/derivation.py?raw';
import anbn from './examples/anbn.json';
import balanced from './examples/balanced.json';
import danglingElse from './examples/dangling-else.json';
import givesUp from './examples/gives-up.json';
import notInLanguage from './examples/not-in-language.json';
import palindromes from './examples/palindromes.json';
import precedence from './examples/precedence.json';
import rightmost from './examples/rightmost.json';
import twoTrees from './examples/two-trees.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  looksLikeGrammar,
  ops,
  pseudocode,
  type CfgExtra,
  type CfgSettings,
  type CfgState,
} from './model';
import { cfgPractice } from './practice';
import { view } from './view';

export const GRAMMARS = {
  anbn: 'S -> aSb | eps',
  parens: 'S -> SS | (S) | eps',
  palindromes: 'S -> aSa | bSb | a | b | eps',
  ambiguous: 'E -> E+E | E*E | (E) | a',
  precedence: 'E -> E+T | T; T -> T*F | F; F -> (E) | a',
  danglingElse: 'S -> iS | iSeS | a',
};

/** The input box holds a grammar (Load) or a word (Derive, Ambiguity); the operation checks which. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (looksLikeGrammar(t)) {
    const g = parseGrammar(t);
    return g instanceof Error ? g : t;
  }
  const w = parseWord(t);
  return w instanceof Error ? w : t;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const letters = (rng: Rng, n: number, from: string) =>
  Array.from({ length: n }, () => pick(rng, [...from])).join('');

export function palindromeOf(rng: Rng, n: number): string {
  const half = letters(rng, Math.floor(n / 2), 'ab');
  const mid = n % 2 ? pick(rng, ['a', 'b']) : '';
  return half + mid + [...half].reverse().join('');
}

/** A random balanced string of n / 2 pairs of parentheses. */
export function balancedOf(rng: Rng, n: number): string {
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

/** An expression with about n symbols: a's joined by + and *, sometimes in parentheses. */
export function expressionOf(rng: Rng, n: number): string {
  const terms = Math.max(2, Math.floor((n + 1) / 2));
  let out = 'a';
  for (let i = 1; i < terms; i++) out += `${pick(rng, ['+', '*'])}a`;
  return out;
}

const preset = (
  label: string,
  grammar: string,
  word: (rng: Rng, n: number) => string,
  op = 'derive',
): Preset => ({
  label,
  make: (rng, size) => [
    ['load', grammar],
    [op, word(rng, size) || 'eps'],
  ],
});

export const cfgDerivation: VizDef<CfgState, CfgSettings, CfgExtra> = {
  id: 'cfg-derivation',
  title: 'Grammars, derivations and parse trees',
  family: 'Automata and computability',
  blurb:
    'Type a context-free grammar, derive a word one rule at a time, and watch its parse tree grow. Then find a word with two trees.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Which variable each step replaces',
      options: [
        { value: 'leftmost', label: 'The leftmost (leftmost derivation)' },
        { value: 'rightmost', label: 'The rightmost (rightmost derivation)' },
      ],
      help: 'Both build the same parse tree, in a different order. Sipser uses leftmost derivations to define ambiguity.',
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
      { op: 'derive', label: 'Derive', usesInput: true, primary: true },
      { op: 'ambiguity', label: 'Ambiguity', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('aⁿbⁿ: a word in the language', GRAMMARS.anbn, (_rng, n) => {
        const k = Math.max(1, Math.floor(n / 2));
        return 'a'.repeat(k) + 'b'.repeat(k);
      }),
      preset('aⁿbⁿ: random a’s and b’s', GRAMMARS.anbn, (rng, n) => letters(rng, n, 'ab')),
      preset('Balanced parentheses', GRAMMARS.parens, balancedOf),
      preset('Palindromes', GRAMMARS.palindromes, palindromeOf),
      preset('Expressions with precedence', GRAMMARS.precedence, expressionOf),
      preset(
        'Expressions without precedence: two trees?',
        GRAMMARS.ambiguous,
        expressionOf,
        'ambiguity',
      ),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Derive w by breadth-first search (|w| = n)',
      best: {
        cost: 'Θ(n) forms',
        why: 'When only one rule keeps each form in step with w, the search walks straight down: aⁿbⁿ tries n/2 + 1 forms.',
        example: 'anbn',
      },
      average: {
        cost: 'exponential in n',
        why: 'Each form can branch on every rule of its variable, and the forms that still fit w multiply with each step.',
        example: 'balanced',
      },
      worst: {
        cost: 'unbounded without the cap',
        why: 'Rules like S → SS grow forms without adding terminals, so a word not in the language can keep the search busy until the cap.',
        example: 'gives-up',
      },
      note: 'CYK decides membership for any context-free grammar in Θ(n³·|G|), after converting it to Chomsky normal form.',
    },
    {
      op: 'Apply one rule A → β',
      best: { cost: 'O(|α|)', why: 'Copy the form with A swapped for β.', example: 'anbn' },
      average: { cost: 'O(|α|)', why: 'The tree only gains |β| children, at most |β| new nodes.' },
      worst: {
        cost: 'O(|α| + |β|)',
        why: 'Even a long right side is one copy; the tree has one inner node per step.',
      },
    },
    {
      op: 'Find two parse trees for w',
      best: {
        cost: 'Θ(n) forms',
        why: 'In the dangling else, the two derivations part ways at the very first step.',
        example: 'dangling-else',
      },
      average: {
        cost: 'exponential in n',
        why: 'The search keeps going after the first derivation, through every form that could still reach w.',
        example: 'two-trees',
      },
      worst: {
        cost: 'all forms up to the cap',
        why: 'When w has one tree, the search has to try everything before it can say so.',
        example: 'precedence',
      },
      note: 'Whether a grammar is ambiguous for some word is undecidable: no algorithm answers it for every grammar.',
    },
  ],
  practice: cfgPractice(() => cfgDerivation),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CfgSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    anbn,
    notInLanguage,
    balanced,
    palindromes,
    twoTrees,
    precedence,
    rightmost,
    danglingElse,
    givesUp,
  ] as unknown as SavedExample[],
};

/**
 * The drivers read grammars of one-character ASCII symbols. A grammar with S₀-style variables,
 * other characters, or an alternative spelled e, p, s (which the drivers would read as ε) is
 * left out, along with the words derived from it.
 */
export function driverReadable(g: Grammar): boolean {
  const symbols = [...g.variables, ...g.terminals];
  const ascii = symbols.every(
    (s) => s.length === 1 && s.charCodeAt(0) > 32 && s.charCodeAt(0) < 127,
  );
  const eps = g.rules.some((r) => r.rhs.join('') === 'eps');
  return ascii && !eps && g.variables.every(isVariable);
}

/**
 * Driver protocol for the code tabs: "load <grammar>" (prints nothing), then "derive <word>"
 * ("eps" for the empty word), which prints the leftmost derivation, "S => aSb => ab", or "no",
 * or "gave up" at the cap. The code finds leftmost derivations (the default), so the model runs
 * with the default settings here.
 */
function codeScript(calls: OpCall[], _settings: CfgSettings) {
  const t = new Timeline(cfgDerivation, defaults, 1, calls);
  let g = t.initial.state.grammar;
  let usable = driverReadable(g);
  const input: string[] = usable ? [`load ${formatGrammar(g, true)}`] : [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op] = e.call;
    if (op === 'load' && e.end.grammar !== g) {
      g = e.end.grammar;
      usable = driverReadable(g);
      if (usable) input.push(`load ${formatGrammar(g, true)}`);
      continue;
    }
    const last = e.steps.at(-1)!;
    if (op !== 'derive' || !usable || !e.end.word) continue;
    if (!last.lines.some((l) => l === 'play.step' || l === 'derive.none' || l === 'derive.cap'))
      continue;
    const w = e.end.word.join('');
    input.push(`derive ${w || 'eps'}`);
    if (last.lines.includes('derive.cap')) expected.push('gave up');
    else if (last.lines.includes('derive.none')) expected.push('no');
    else {
      const run = e.end.run!;
      const forms = derivationForms(g, run.steps);
      expected.push(forms.map((f) => f || 'eps').join(' => '));
    }
  }
  return { input, expected };
}

function derivationForms(g: Grammar, steps: { at: number; rule: number }[]): string[] {
  let form = [g.start];
  const out = [form.join('')];
  for (const s of steps) {
    form = [...form.slice(0, s.at), ...g.rules[s.rule]!.rhs, ...form.slice(s.at + 1)];
    out.push(form.join(''));
  }
  return out;
}

export default cfgDerivation;
