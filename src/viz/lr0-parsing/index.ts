import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseGrammar, parseWord, type Rule } from '../_grammar/grammar';
import cppSource from './code/cpp/lr0.hpp?raw';
import javaSource from './code/java/Lr0.java?raw';
import pythonSource from './code/python/lr0.py?raw';
import buildAutomaton from './examples/build-automaton.json';
import emptyRule from './examples/empty-rule.json';
import parensSum from './examples/parens-sum.json';
import reduceReduce from './examples/reduce-reduce.json';
import shiftReduce from './examples/shift-reduce.json';
import slrFixes from './examples/slr-fixes-it.json';
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
  type Lr0Settings,
  type Lr0State,
} from './model';
import { lr0Practice } from './practice';
import { view } from './view';

export const GRAMMARS = {
  sums: START,
  precedence: 'E -> E+T | T; T -> T*F | F; F -> (E) | a',
  lists: 'S -> (L) | x; L -> S | L,S',
  anbn: 'S -> aSb | eps',
  twoWays: 'S -> A | B; A -> a; B -> a',
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

function sum(rng: Rng, n: number): string {
  let out = rng.int(0, 1) ? '(a+a)' : 'a';
  while (out.length + 2 <= n) out += '+a';
  return out;
}

function list(rng: Rng, n: number): string {
  const items = Array.from({ length: Math.max(1, Math.floor((n - 1) / 2)) }, () =>
    rng.int(0, 3) ? 'x' : '(x)',
  );
  return `(${items.join(',')})`.slice(0, Math.max(3, n + 2));
}

const preset = (label: string, grammar: string, word: (rng: Rng, n: number) => string): Preset => ({
  label,
  make: (rng, size) => [
    ['load', grammar],
    ['parse', word(rng, Math.min(size, MAX_WORD)) || 'eps'],
  ],
});

export const lr0Parsing: VizDef<Lr0State, Lr0Settings, unknown> = {
  id: 'lr0-parsing',
  title: 'LR(0) parsing',
  family: 'Automata and computability',
  blurb:
    'Items, closure and goto build the LR(0) automaton; its states become the ACTION and GOTO table, conflicts and all; then a shift-reduce parse runs on a stack of states.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Where a complete item reduces',
      options: [
        { value: 'lr0', label: 'LR(0): under every terminal' },
        { value: 'slr1', label: 'SLR(1): only under FOLLOW of its left side' },
      ],
      help: 'LR(0) reduces whatever comes next, so a state with a complete item and a shift conflicts. SLR(1) uses FOLLOW sets to reduce only where the next symbol can follow, which settles many of those conflicts.',
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
      placeholder: 'e.g. (a+a)+a, or S -> (L) | x; L -> S | L,S',
      maxLength: 200,
      sample: 'a+a',
      parse: parseInput,
    },
    buttons: [
      { op: 'parse', label: 'Parse', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    presets: [
      preset('Sums with parentheses', GRAMMARS.sums, sum),
      preset('Sums: a syntax error', GRAMMARS.sums, (rng, n) => sum(rng, n).slice(0, -1)),
      preset('Nested lists (x, (x), …)', GRAMMARS.lists, list),
      preset('Precedence: conflicts in LR(0)', GRAMMARS.precedence, (rng, n) => {
        let out = 'a';
        while (out.length + 2 <= n) out += `${pick(rng, ['+', '*'])}a`;
        return out;
      }),
      preset(
        'aⁿbⁿ with an ε-rule',
        GRAMMARS.anbn,
        (_rng, n) => 'a'.repeat(Math.floor(n / 2)) + 'b'.repeat(Math.floor(n / 2)),
      ),
      preset('Reduce-reduce', GRAMMARS.twoWays, () => 'a'),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Parse a word of n symbols',
      best: {
        cost: 'Θ(n)',
        why: 'n shifts, and each reduction pops what shifts and earlier reductions pushed.',
        example: 'parens-sum',
      },
      average: {
        cost: 'Θ(n)',
        why: 'One table lookup per move; the number of reductions is the size of the parse tree, O(n).',
        example: 'slr-fixes-it',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'A syntax error stops the parse at the first symbol with an empty cell.',
        example: 'syntax-error',
      },
      note: 'Linear for a table without conflicts (and a grammar without cycles of unit rules).',
    },
    {
      op: 'Build the LR(0) automaton',
      best: {
        cost: 'O(|G|²)',
        why: 'A handful of states, each a few items: closure and goto are cheap.',
        example: 'build-automaton',
      },
      average: {
        cost: 'O(|G|²) per state',
        why: 'Each goto computes a closure and compares it with every set built so far.',
        example: 'shift-reduce',
      },
      worst: {
        cost: 'exponential in |G|',
        why: 'There are grammars whose LR(0) automaton has exponentially many states, though real grammars stay small.',
      },
    },
    {
      op: 'Fill the table',
      best: {
        cost: 'O(states · |T|)',
        why: 'Shifts and GOTO come straight from the arrows.',
        example: 'build-automaton',
      },
      average: {
        cost: 'O(states · |T|)',
        why: 'Each complete item fills a row (LR(0)) or the FOLLOW columns (SLR(1)).',
        example: 'empty-rule',
      },
      worst: {
        cost: 'O(states · |T|)',
        why: 'A conflict is just a second action in a cell.',
        example: 'reduce-reduce',
      },
    },
  ],
  practice: lr0Practice(() => lr0Parsing),
  preview: { example: 'build-automaton', level: 2, hide: ['rn-', 'it-'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as Lr0Settings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    parensSum,
    buildAutomaton,
    syntaxError,
    shiftReduce,
    slrFixes,
    emptyRule,
    reduceReduce,
  ] as unknown as SavedExample[],
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const asciiSym = (s: string) =>
  [...s].map((c) => (SUB.includes(c) ? String(SUB.indexOf(c)) : c)).join('');
const driverList = (rules: readonly Rule[]) =>
  rules
    .map((r) => `${asciiSym(r.lhs)} -> ${r.rhs.length ? r.rhs.map(asciiSym).join(' ') : 'eps'}`)
    .join('; ');
const readable = (ts: readonly string[]) =>
  ts.every((t) => t.length === 1 && t > ' ' && t <= '~' && t !== ';' && t !== '|' && t !== END);

/**
 * Driver protocol: "method lr0|slr1", then "load <rules>" and "table" ("states N conflicts K")
 * for each grammar; each parse prints its verdict and moves, or "refuse".
 */
function codeScript(calls: OpCall[], settings: Lr0Settings) {
  const t = new Timeline(lr0Parsing, settings, 1, calls);
  const input = [`method ${settings.method}`];
  const expected: string[] = [];
  let usable = false;
  const loaded = (s: Lr0State) => {
    usable = readable(s.grammar.terminals);
    if (!usable) return;
    input.push(`load ${driverList(s.grammar.rules)}`, 'table');
    expected.push(`states ${s.sets.length} conflicts ${s.conflicts.length}`);
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
    const w = parseWord(String(e.call[1] ?? ''), e.end.grammar, MAX_WORD);
    if (w instanceof Error || looksLikeGrammar(String(e.call[1] ?? ''))) continue;
    if (e.steps.at(-1)!.say.startsWith('The table has')) {
      input.push(`parse ${w.join('') || 'eps'}`);
      expected.push('refuse');
      continue;
    }
    const run = e.end.run;
    if (!run?.verdict) continue;
    input.push(`parse ${w.join('') || 'eps'}`);
    expected.push(`${run.verdict} ${run.moves}`);
  }
  return { input, expected };
}

export default lr0Parsing;
