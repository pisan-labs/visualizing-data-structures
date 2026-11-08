import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseGrammar, parseWord, type Rule } from '../_grammar/grammar';
import cppSource from './code/cpp/ll1.hpp?raw';
import javaSource from './code/java/Ll1.java?raw';
import pythonSource from './code/python/ll1.py?raw';
import balanced from './examples/balanced.json';
import buildSets from './examples/build-sets.json';
import danglingElse from './examples/dangling-else.json';
import expressions from './examples/expressions.json';
import guess from './examples/guess-goes-wrong.json';
import leftRecursion from './examples/left-recursion.json';
import syntaxError from './examples/syntax-error.json';
import explain from './explain.md?raw';
import {
  END,
  MAX_WORD,
  START,
  defaults,
  describe,
  init,
  initialSay,
  looksLikeGrammar,
  ops,
  pseudocode,
  vars,
  type Ll1Extra,
  type Ll1Settings,
  type Ll1State,
} from './model';
import { ll1Practice } from './practice';
import { view } from './view';

export const GRAMMARS = {
  expressions: START,
  leftRecursive: 'E -> E+T | T; T -> T*F | F; F -> (E) | a',
  parens: 'S -> (S)S | eps',
  ifElse: 'S -> iSE | a; E -> eS | eps',
  lists: "L -> aL'; L' -> ,aL' | eps",
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

function expr(rng: Rng, n: number): string {
  let out = 'a';
  while (out.length + 2 <= n) out += `${pick(rng, ['+', '*'])}a`;
  return out;
}

function parens(rng: Rng, n: number): string {
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

export const ll1Parsing: VizDef<Ll1State, Ll1Settings, Ll1Extra> = {
  id: 'll1-parsing',
  title: 'LL(1) parsing',
  family: 'Automata and computability',
  blurb:
    'FIRST and FOLLOW sets to a fixed point, the LL(1) table with its conflicts, and a predictive parse that grows the tree top down with one symbol of lookahead.',
  settings: [
    {
      kind: 'choice',
      key: 'conflicts',
      label: 'Parsing with a conflict in the table',
      options: [
        { value: 'refuse', label: 'Refuse: the grammar is not LL(1)' },
        { value: 'first', label: 'Take the first rule in the cell, and see what happens' },
      ],
      help: 'A real LL(1) parser generator reports the conflict and stops. Taking the first rule shows why: the guess can reject good input, or loop on left recursion.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars: (s) => vars(s),
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Word or grammar',
      placeholder: 'e.g. a+a*a, or S -> (S)S | eps',
      maxLength: 200,
      sample: 'a+a',
      parse: parseInput,
    },
    buttons: [
      { op: 'parse', label: 'Parse', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('Expressions: a word in the language', GRAMMARS.expressions, expr),
      preset('Expressions: a syntax error', GRAMMARS.expressions, (rng, n) =>
        expr(rng, n).replace(/a$/, pick(rng, ['+', '*', ')'])),
      ),
      preset('Balanced parentheses', GRAMMARS.parens, parens),
      preset('Left recursion: conflicts', GRAMMARS.leftRecursive, expr),
      preset('If and else: a FIRST/FOLLOW conflict', GRAMMARS.ifElse, () => 'iiaea'),
      preset('Comma lists', GRAMMARS.lists, (_rng, n) =>
        Array.from({ length: Math.max(1, Math.floor((n + 1) / 2)) }, () => 'a').join(','),
      ),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Parse a word of n symbols',
      best: {
        cost: 'Θ(n)',
        why: 'Each symbol is matched once, and between matches the expansions are bounded by the grammar.',
        example: 'expressions',
      },
      average: {
        cost: 'Θ(n)',
        why: 'One table lookup per move and O(n) moves: a+a*a takes 16 moves for 5 symbols.',
        example: 'balanced',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'An LL(1) table never makes the parser back up; a syntax error stops it early.',
        example: 'syntax-error',
      },
      note: 'Linear only for an LL(1) table. Guessing on a conflict can loop forever on left recursion.',
    },
    {
      op: 'FIRST and FOLLOW sets',
      best: {
        cost: 'O(|G|·|T|)',
        why: 'Two rounds when nothing depends on a variable listed later.',
        example: 'build-sets',
      },
      average: {
        cost: 'O(|G|·|V|·|T|)',
        why: 'Each round costs a pass over the rules, and some set grows each round but the last.',
        example: 'build-sets',
      },
      worst: {
        cost: 'O(|G|·|V|·|T|)',
        why: 'There are at most |V|·(|T| + 2) things to add, at least one per round.',
      },
    },
    {
      op: 'Fill the table',
      best: {
        cost: 'O(|G|·|T|)',
        why: 'Each rule goes into at most |T| + 1 cells.',
        example: 'build-sets',
      },
      average: {
        cost: 'O(|G|·|T|)',
        why: 'Each rule needs FIRST of its right side and maybe FOLLOW of its left.',
        example: 'dangling-else',
      },
      worst: {
        cost: 'O(|G|·|T|)',
        why: 'Conflicts cost nothing extra to find; a cell just gets a second rule.',
        example: 'left-recursion',
      },
    },
  ],
  practice: ll1Practice(() => ll1Parsing),
  preview: { example: 'expressions', level: 2, hide: ['r-', 'm-'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as Ll1Settings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    expressions,
    buildSets,
    syntaxError,
    balanced,
    leftRecursion,
    guess,
    danglingElse,
  ] as unknown as SavedExample[],
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const asciiSym = (s: string) =>
  [...s].map((c) => (SUB.includes(c) ? String(SUB.indexOf(c)) : c)).join('');

/** Rules one by one, in order, as the drivers read them. */
const driverList = (rules: readonly Rule[]) =>
  rules
    .map((r) => `${asciiSym(r.lhs)} -> ${r.rhs.length ? r.rhs.map(asciiSym).join(' ') : 'eps'}`)
    .join('; ');

const readable = (ts: readonly string[]) =>
  ts.every((t) => t.length === 1 && t > ' ' && t <= '~' && t !== ';' && t !== '|' && t !== END);

const setLine = (vs: readonly string[], sets: Record<string, string[]>) =>
  vs
    .map(
      (v) =>
        `${asciiSym(v)}: ${(sets[v] ?? [])
          .map((x) => (x === 'ε' ? 'eps' : x))
          .sort()
          .join(' ')}`,
    )
    .join('; ');

/**
 * Driver protocol: "policy refuse|first", then for each grammar "load <rules>", "first",
 * "follow" and "table"; each parse prints its verdict and moves, or "refuse".
 */
function codeScript(calls: OpCall[], settings: Ll1Settings) {
  const t = new Timeline(ll1Parsing, settings, 1, calls);
  const input = [`policy ${settings.conflicts}`];
  const expected: string[] = [];
  let usable = false;
  const loaded = (s: Ll1State) => {
    usable = readable(s.grammar.terminals);
    if (!usable) return;
    input.push(`load ${driverList(s.grammar.rules)}`, 'first', 'follow', 'table');
    expected.push(
      setLine(s.grammar.variables, s.first),
      setLine(s.grammar.variables, s.follow),
      `conflicts ${s.conflicts.length}`,
    );
  };
  loaded(t.initial.state);
  let g = t.initial.state.grammar;
  for (const e of t.entries) {
    if (e.call[0] === 'load') {
      if (e.end.grammar !== g && e.end.phase === 'ready') {
        g = e.end.grammar;
        loaded(e.end);
      }
      continue;
    }
    if (!usable) continue;
    const last = e.steps.at(-1)!;
    if (last.say.startsWith('The table has')) {
      const w = parseWord(String(e.call[1] ?? ''), e.end.grammar, MAX_WORD);
      if (w instanceof Error) continue;
      input.push(`parse ${w.join('') || 'eps'}`);
      expected.push('refuse');
      continue;
    }
    const run = e.end.run;
    if (!run?.verdict) continue;
    input.push(`parse ${run.word.join('') || 'eps'}`);
    expected.push(`${run.verdict} ${run.moves}`);
  }
  return { input, expected };
}

export default ll1Parsing;
