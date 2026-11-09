import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseGrammar, parseWord, type Grammar, type Rule } from '../_grammar/grammar';
import cppSource from './code/cpp/cnf.hpp?raw';
import javaSource from './code/java/Cnf.java?raw';
import pythonSource from './code/python/cnf.py?raw';
import alreadyClose from './examples/already-close.json';
import anbn from './examples/anbn-derive.json';
import everyStage from './examples/every-stage.json';
import expressions from './examples/expressions.json';
import nullableChain from './examples/nullable-chain.json';
import blowup from './examples/nullable-blowup.json';
import sipserOrder from './examples/sipser-order.json';
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
  vars,
  type CnfExtra,
  type CnfSettings,
  type CnfState,
} from './model';
import { cnfPractice } from './practice';
import { view } from './view';

export const GRAMMARS = {
  sipser: 'S -> ASA | aB; A -> B | S; B -> b | eps',
  anbn: 'S -> aSb | eps',
  expressions: 'E -> E+T | T; T -> T*F | F; F -> (E) | a',
  astarbstar: 'S -> AB; A -> aA | eps; B -> bB | eps',
  parens: 'S -> SS | (S) | eps',
  close: 'S -> AB | a; A -> a; B -> b',
  palindromes: 'S -> aSa | bSb | a | b | eps',
};

/** The input box holds a grammar (Convert, Load) or a word (Derive); the operation checks which. */
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

const preset = (
  label: string,
  grammar: string,
  word?: (rng: Rng, n: number) => string,
): Preset => ({
  label,
  make: (rng, size) => [
    ['load', grammar],
    ...(word ? [['derive', word(rng, Math.min(size, MAX_WORD)) || 'eps'] as OpCall] : []),
  ],
});

export const cfgToCnf: VizDef<CnfState, CnfSettings, CnfExtra> = {
  id: 'cfg-to-cnf',
  title: 'CFG to Chomsky normal form',
  family: 'Automata and computability',
  blurb:
    'Turn any context-free grammar into Chomsky normal form in five stages: a new start variable, no ε-rules, no unit rules, terminals on their own, and right sides in pairs.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Last two stages',
      options: [
        { value: 'term-first', label: 'TERM, then BIN (Hopcroft, Motwani and Ullman)' },
        { value: 'bin-first', label: 'BIN, then TERM (Sipser)' },
      ],
      help: 'Both orders give a grammar in Chomsky normal form for the same language. TERM first gives every terminal its variable before long right sides are split; BIN first splits them while terminals are still in them.',
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
      label: 'Grammar or word',
      placeholder: 'e.g. S -> aSb | eps, or aabb',
      maxLength: 200,
      sample: GRAMMARS.anbn,
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Convert', usesInput: true, primary: true },
      { op: 'derive', label: 'Derive', usesInput: true },
      { op: 'show', label: 'Load', usesInput: true, more: true },
    ],
    presets: [
      preset('Sipser’s grammar: every stage has work', GRAMMARS.sipser),
      preset('aⁿbⁿ, then derive a word', GRAMMARS.anbn, (_rng, n) => {
        const k = Math.max(1, Math.floor(n / 2));
        return 'a'.repeat(k) + 'b'.repeat(k);
      }),
      preset('Expressions: a chain of unit rules', GRAMMARS.expressions, (rng, n) => {
        let out = 'a';
        while (out.length + 2 <= n) out += `${pick(rng, ['+', '*'])}a`;
        return out;
      }),
      preset('a*b*: nullable everywhere', GRAMMARS.astarbstar, (rng, n) => {
        const k = rng.int(0, n);
        return 'a'.repeat(k) + 'b'.repeat(n - k);
      }),
      preset('Palindromes', GRAMMARS.palindromes, (rng, n) => {
        const half = Array.from({ length: Math.floor(n / 2) }, () => pick(rng, ['a', 'b'])).join(
          '',
        );
        return half + (n % 2 ? 'a' : '') + [...half].reverse().join('');
      }),
      preset('Nearly in CNF already', GRAMMARS.close, () => 'ab'),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Convert a grammar of size |G|',
      best: {
        cost: 'O(|G|)',
        why: 'A grammar close to CNF only gains S₀ and S₀’s copies of S’s rules.',
        example: 'already-close',
      },
      average: {
        cost: 'O(|G|²)',
        why: 'UNIT copies whole sets of rules from one variable to every variable that reaches it.',
        example: 'expressions',
      },
      worst: {
        cost: 'exponential in |G|',
        why: 'DEL before BIN turns a right side with k nullable variables into up to 2ᵏ − 1 right sides.',
        example: 'nullable-blowup',
      },
      note: 'Doing BIN before DEL keeps every right side at two symbols, so DEL adds at most three per rule and the whole conversion stays O(|G|²).',
    },
    {
      op: 'Find the nullable variables',
      best: {
        cost: 'O(|G|)',
        why: 'One pass finds the ε-rules, and a second pass finds nothing new.',
        example: 'every-stage',
      },
      average: {
        cost: 'O(|G|·|V|)',
        why: 'Each pass over the rules adds at least one variable, or stops.',
        example: 'nullable-chain',
      },
      worst: {
        cost: 'O(|G|·|V|)',
        why: 'A chain A₁ → A₂, A₂ → A₃, … found one variable per pass, written in the worst order.',
      },
    },
    {
      op: 'Derive a word of n symbols in CNF',
      best: {
        cost: '2n − 1 steps',
        why: 'n − 1 rules A → BC make n variables, and n rules A → a turn them into letters.',
        example: 'anbn-derive',
      },
      average: {
        cost: '2n − 1 steps',
        why: 'Every derivation of the word in CNF has the same length, whatever the tree.',
        example: 'anbn-derive',
      },
      worst: {
        cost: '2n − 1 steps',
        why: 'There is no worse: a parse tree in CNF is a full binary tree with n leaves above the letters.',
      },
      note: 'Finding the tree is the expensive part: CYK takes Θ(n³·|G|).',
    },
  ],
  practice: cnfPractice(() => cfgToCnf),
  preview: { example: 'every-stage', level: 2, hide: ['r-'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CnfSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    everyStage,
    nullableChain,
    expressions,
    anbn,
    sipserOrder,
    alreadyClose,
    blowup,
  ] as unknown as SavedExample[],
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** A variable as the drivers read it: S₀ is S0. */
export const asciiSym = (s: string) =>
  [...s].map((c) => (SUB.includes(c) ? String(SUB.indexOf(c)) : c)).join('');

/** Terminals the drivers can read: printable ASCII other than ; and |, and not a capital. */
const readable = (g: Grammar) =>
  g.terminals.every((t) => t.length === 1 && t > ' ' && t <= '~' && t !== ';' && t !== '|');

/** Rules as the drivers write them: by left side in order of first appearance, symbols spaced. */
export function driverRules(rules: readonly Rule[]): string {
  const heads = [...new Set(rules.map((r) => r.lhs))];
  return heads
    .map(
      (h) =>
        `${asciiSym(h)} -> ${rules
          .filter((r) => r.lhs === h)
          .map((r) => (r.rhs.length ? r.rhs.map(asciiSym).join(' ') : 'eps'))
          .join(' | ')}`,
    )
    .join('; ');
}

/** Rules one by one, in order, as the drivers read them: "S -> a S b; S -> eps". */
const driverList = (rules: readonly Rule[]) =>
  rules
    .map((r) => `${asciiSym(r.lhs)} -> ${r.rhs.length ? r.rhs.map(asciiSym).join(' ') : 'eps'}`)
    .join('; ');

/**
 * Driver protocol for the code tabs: "order term-first" or "order bin-first" first, then
 * "convert <grammar>" for each grammar the page converted, which prints the grammar in CNF.
 */
function codeScript(calls: OpCall[], settings: CnfSettings) {
  const t = new Timeline(cfgToCnf, settings, 1, calls);
  const input = [`order ${settings.order}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'load' || e.end.phase !== 'done' || !readable(e.end.typed)) continue;
    if (!e.steps.at(-1)!.lines.includes('conv.done')) continue;
    input.push(`convert ${driverList(e.end.typed.rules)}`);
    expected.push(driverRules(e.end.rules));
  }
  return { input, expected };
}

export default cfgToCnf;
