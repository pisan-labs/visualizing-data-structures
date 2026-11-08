import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, setText, type CnfExtra, type CnfSettings, type CnfState } from './model';

type Def = VizDef<CnfState, CnfSettings, CnfExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Small grammars with nullable variables and unit rules to find. */
const POOL = [
  'S -> AB; A -> aA | eps; B -> bB | eps',
  'S -> ASA | aB; A -> B | S; B -> b | eps',
  'S -> AbA | B; A -> aA | eps; B -> bB | b',
  'S -> AC | b; A -> B | a; B -> C | eps; C -> c',
  'S -> XY | a; X -> Y | x; Y -> X | eps',
  'E -> E+T | T; T -> T*F | F; F -> (E) | a',
  'S -> aSb | A; A -> cA | eps',
  'S -> AB | C; A -> a | eps; B -> b | C; C -> c | eps',
];

/** Every subset of the variables, as narration writes sets, for wrong answers. */
function subsets(vs: readonly string[]): string[] {
  const out: string[] = [];
  for (let m = 0; m < 1 << vs.length; m++) out.push(setText(vs.filter((_, i) => m & (1 << i))));
  return out;
}

/** Practice for the CNF page. Answers come from running the model. */
export function cnfPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const converted = (g: string) => run([['load', g]]).endState();

  return [
    {
      id: 'nullable',
      title: 'Nullable variables',
      make(rng) {
        const g = pick(rng, POOL);
        const end = converted(g);
        const typed = end.typed.variables;
        const right = setText(typed.filter((v) => end.nullable.includes(v)));
        const pool = shuffle(
          rng,
          subsets(typed).filter((x) => x !== right),
        ).slice(0, 3);
        const options = shuffle(rng, [right, ...pool]);
        return {
          prompt:
            'Which variables of the grammar on the stage are nullable, able to derive ε? (Leave out S₀, which the conversion adds.)',
          setup: [['show', g]],
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: `Start with the variables that have a rule A → ε, then keep adding any variable with a right side made only of nullable variables. Here that gives ${right}.`,
          watch: [['load', g]],
        };
      },
    },
    {
      id: 'unit-pairs',
      title: 'Unit pairs',
      make(rng) {
        const g = pick(rng, POOL);
        const end = converted(g);
        const pairs = end.pairs.filter(([a, b]) => a !== b);
        return {
          prompt:
            'Convert the grammar on the stage. After START and DEL, how many unit pairs (A, B) with A ≠ B are there? (A becomes B by unit rules alone.)',
          setup: [['show', g]],
          answer: { kind: 'number', value: pairs.length },
          explain: pairs.length
            ? `The unit pairs besides each (A, A) are ${pairs.map(([a, b]) => `(${a}, ${b})`).join(', ')}: ${pairs.length}. Remember that DEL can make new unit rules, and that S₀ → S is one.`
            : 'There are none: after DEL no rule has a single variable on the right.',
          watch: [['load', g]],
        };
      },
    },
    {
      id: 'rule-count',
      title: 'Rules in CNF',
      make(rng) {
        const g = pick(rng, POOL);
        const end = converted(g);
        return {
          prompt:
            'Convert the grammar on the stage with TERM before BIN. How many rules does the grammar in Chomsky normal form have?',
          setup: [['show', g]],
          answer: { kind: 'number', value: end.rules.length },
          explain: `Count the rules at the end: ${end.rules.length}. DEL and UNIT add copies, TERM adds one rule U → a per terminal, and BIN adds one rule per extra symbol on a long right side.`,
          watch: [['load', g]],
        };
      },
    },
    {
      id: 'derive-steps',
      title: 'Derivation length',
      make(rng) {
        const [g, words] = pick(rng, [
          ['S -> aSb | eps', ['ab', 'aabb', 'aaabbb']],
          ['S -> AB; A -> aA | eps; B -> bB | eps', ['a', 'ab', 'aab', 'abbb', 'aaabb']],
          ['S -> aSa | bSb | a | b | eps', ['aba', 'abba', 'b', 'aabaa']],
        ] as const);
        const w = pick(rng, words);
        const t = run([
          ['load', g],
          ['derive', w],
        ]);
        const steps = t.endState().derivation!.used.length;
        return {
          prompt: `The grammar on the stage is in Chomsky normal form. How many steps does a leftmost derivation of ${w} take in it?`,
          setup: [['load', g]],
          answer: { kind: 'number', value: steps },
          explain: `${w} has ${w.length} symbols. Each rule A → BC adds one variable to the form and each rule A → a turns one into a letter, so it takes ${w.length - 1} + ${w.length} = ${steps} steps.`,
          watch: [['derive', w]],
        };
      },
    },
  ];
}
