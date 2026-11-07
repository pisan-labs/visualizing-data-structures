import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseRules, type Production } from '../_grammar/grammar';
import cppSource from './code/cpp/chomsky.hpp?raw';
import javaSource from './code/java/Chomsky.java?raw';
import pythonSource from './code/python/chomsky.py?raw';
import anbn from './examples/anbn.json';
import anbncn from './examples/anbncn.json';
import cfRegular from './examples/cf-but-regular.json';
import copyMirror from './examples/copy-vs-mirror.json';
import fourLevels from './examples/four-levels.json';
import halting from './examples/halting.json';
import rightLinear from './examples/right-linear.json';
import unrestricted from './examples/unrestricted.json';
import wholeMap from './examples/whole-map.json';
import explain from './explain.md?raw';
import { LANGUAGES, findLanguage } from './languages';
import {
  defaults,
  describe,
  init,
  initialSay,
  keyList,
  looksLikeGrammar,
  ops,
  pseudocode,
  type ChExtra,
  type ChSettings,
  type ChState,
} from './model';
import { chomskyPractice, randomGrammar } from './practice';
import { view } from './view';

/** The input box holds a grammar (Classify) or a language's name (Place). */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (looksLikeGrammar(t)) {
    const g = parseRules(t);
    return g instanceof Error ? g : t;
  }
  if (findLanguage(t)) return t;
  return new Error(
    `"${t}" is neither a grammar nor a language on this page. Type rules such as S -> aSb | eps, or one of ${keyList()}.`,
  );
}

const place = (id: string): OpCall => ['place', id];

const classifyRandom = (label: string, level: Parameters<typeof randomGrammar>[1]): Preset => ({
  label,
  make: (rng: Rng, size: number) => [['classify', randomGrammar(rng, level, size)]],
});

export const chomskyHierarchy: VizDef<ChState, ChSettings, ChExtra> = {
  id: 'chomsky-hierarchy',
  title: 'The Chomsky hierarchy',
  family: 'Automata and computability',
  blurb:
    'Regular inside context-free inside context-sensitive inside recursively enumerable: classify a grammar by its rules, and place languages on the map with the machine or the proof that puts them there.',
  settings: [
    {
      kind: 'boolean',
      key: 'decidable',
      label: 'Show the decidable languages',
      help: 'Sipser’s hierarchy of languages adds a band between context-sensitive and recursively enumerable: the languages a Turing machine decides, halting on every input. No grammar form matches it.',
    },
    {
      kind: 'choice',
      key: 'names',
      label: 'Name the levels',
      options: [
        { value: 'names', label: 'By name (regular, context-free, …)' },
        { value: 'types', label: 'By type (Type 3 to Type 0)' },
      ],
      help: 'Chomsky numbered the grammar types 0 to 3, most general first. Sipser names the languages.',
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
      label: 'Grammar or language',
      placeholder: 'e.g. S -> aSb | eps, or anbn',
      maxLength: 200,
      sample: 'S -> aSb | eps',
      parse: parseInput,
    },
    buttons: [
      { op: 'classify', label: 'Classify', usesInput: true, primary: true },
      { op: 'place', label: 'Place', usesInput: true },
    ],
    presets: [
      {
        label: 'Place every language',
        make: () => LANGUAGES.map((l) => place(l.id)),
      },
      {
        label: 'Place some languages at random',
        make: (rng, size) => {
          const ids = LANGUAGES.map((l) => l.id);
          for (let i = ids.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [ids[i], ids[j]] = [ids[j]!, ids[i]!];
          }
          return ids.slice(0, Math.max(1, Math.min(size, ids.length))).map(place);
        },
      },
      ...LANGUAGES.map((l) => ({ label: `Place ${l.token}`, make: () => [place(l.id)] })),
      classifyRandom('Classify a random right-linear grammar', 'regular'),
      classifyRandom('Classify a random context-free grammar', 'context-free'),
      classifyRandom('Classify a random context-sensitive grammar', 'context-sensitive'),
      classifyRandom('Classify a random unrestricted grammar', 'unrestricted'),
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'Classify a grammar by its rules (|G| symbols in all)',
      best: {
        cost: 'Θ(|G|)',
        why: 'A right-linear grammar passes the first check: one look at each rule.',
        example: 'right-linear',
      },
      average: {
        cost: 'Θ(|G|)',
        why: 'S → aSb fails right-linear at once; one more pass finds every rule context-free.',
        example: 'anbn',
      },
      worst: {
        cost: 'Θ(|G|)',
        why: 'Three passes at most, regular, context-free and context-sensitive, each reading every rule once.',
        example: 'unrestricted',
      },
      note: 'That is the form. The language is harder: no algorithm decides whether a context-free grammar generates a regular language.',
    },
    {
      op: 'Is w in L? L regular, given a DFA (|w| = n)',
      best: {
        cost: 'Θ(n)',
        why: 'One move per symbol, and the state after the last symbol answers.',
        example: 'right-linear',
      },
      average: { cost: 'Θ(n)', why: 'Each move is one table lookup.' },
      worst: {
        cost: 'Θ(n)',
        why: 'Even an NFA, simulated set by set, is O(n·|Q|²): linear in the word.',
      },
      note: 'Building the DFA can cost 2^|Q| states from an NFA, but that is paid once, not per word.',
    },
    {
      op: 'Is w in L? L context-free, by CYK',
      best: {
        cost: 'Θ(n³·|G|)',
        why: 'CYK fills every cell of its triangle even for a short reject.',
        example: 'anbn',
      },
      average: {
        cost: 'Θ(n³·|G|)',
        why: 'n²/2 cells, up to n splits each, every rule A → BC tried at each split.',
      },
      worst: {
        cost: 'Θ(n³·|G|)',
        why: 'The same three loops for every word and every grammar in Chomsky normal form.',
      },
      note: 'Parsers for programming languages use deterministic grammars (LR, LL), which run in O(n). Valiant’s algorithm gets under n³ with fast matrix multiplication.',
    },
    {
      op: 'Is w in L? L context-sensitive',
      best: {
        cost: 'O(n) for some languages',
        why: 'aⁿbⁿcⁿ only needs three counts and a check of the order.',
        example: 'anbncn',
      },
      average: {
        cost: 'exponential time',
        why: 'An LBA has |Q|·n·|Γ|ⁿ configurations; searching them all takes time exponential in n.',
      },
      worst: {
        cost: 'PSPACE-complete',
        why: 'Some context-sensitive languages are PSPACE-complete: linear space suffices, and no polynomial-time method is known.',
      },
      note: 'Every context-sensitive language is decidable: an LBA that repeats a configuration loops, so a decider can stop it.',
    },
    {
      op: 'Is w in L? L recursively enumerable',
      best: {
        cost: 'finite, when w ∈ L',
        why: 'A recognizer accepts every word in L after some number of steps, though no bound is known in advance.',
        example: 'halting',
      },
      average: {
        cost: 'no bound',
        why: 'The steps before acceptance can grow faster than any computable function of n.',
      },
      worst: {
        cost: 'undecidable',
        why: 'On a word not in L the recognizer may run forever, and no algorithm can tell when it will.',
        example: 'halting',
      },
      note: 'The halting problem is the standard example: recognizable by simulation, not decidable by any machine.',
    },
  ],
  practice: chomskyPractice(() => chomskyHierarchy),
  preview: { example: 'whole-map', level: 2 },
  opening: 'whole-map',
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ChSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rightLinear,
    anbn,
    anbncn,
    cfRegular,
    unrestricted,
    fourLevels,
    copyMirror,
    halting,
    wholeMap,
  ] as unknown as SavedExample[],
};

/** A grammar's rules, one per item in typed order, as the drivers read them. */
export function driverGrammar(rules: readonly Production[]): string {
  return rules
    .map((p) => `${p.lhs.join('')} -> ${p.rhs.length ? p.rhs.join('') : 'eps'}`)
    .join('; ');
}

/**
 * The drivers read one-character ASCII symbols, a capital for a variable. A grammar with S₀-style
 * names or other characters is left out, and so is one whose side would read back differently
 * (a terminal side spelled e, p, s is ε to a driver; "-" then ">" is an arrow).
 */
export function driverReadable(rules: readonly Production[]): boolean {
  return rules.every((p) => {
    const syms = [...p.lhs, ...p.rhs];
    const ascii = syms.every(
      (s) => s.length === 1 && s > ' ' && s <= '~' && s !== ';' && s !== '|',
    );
    const sides = [p.lhs.join(''), p.rhs.join('')];
    return ascii && sides.every((t) => t !== 'eps' && !t.includes('->'));
  });
}

/**
 * Driver protocol for the code tabs: "classify <rules>" prints the level, and for a level past
 * regular, the first rule that rules out the level below:
 *   regular
 *   context-free (not regular: S -> aSb)
 * Rules print as "left -> right", with eps for the empty side. Place has no driver.
 */
function codeScript(calls: OpCall[], settings: ChSettings) {
  const t = new Timeline(chomskyHierarchy, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const g = e.end.grammar;
    if (e.call[0] !== 'classify' || !g || !e.steps.at(-1)!.lines.includes('classify.note'))
      continue;
    if (!driverReadable(g.rules)) continue;
    input.push(`classify ${driverGrammar(g.rules)}`);
    const k = g.result.checks.length - 1;
    const level = g.result.level;
    if (k === 0) {
      expected.push(level);
      continue;
    }
    const below = g.result.checks[k - 1]!;
    const rule = g.rules[below.miss]!;
    const text = `${rule.lhs.join('')} -> ${rule.rhs.length ? rule.rhs.join('') : 'eps'}`;
    expected.push(`${level} (not ${below.level}: ${text})`);
  }
  return { input, expected };
}

export default chomskyHierarchy;
