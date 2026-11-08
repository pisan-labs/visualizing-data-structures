import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Scalar, VizDef } from '../../engine/types';
import { choice, ordered, shuffle } from '../_recursion/kit';
import { exprOf } from './expr';
import { defaults, REL, type DefExtra, type DefSettings, type DefState, type Relation } from './model';
import { PAIRS } from './pairs';

type Def = VizDef<DefState, DefSettings, DefExtra>;

/** Pairs for the questions: the menu, and a few typed ones whose limit the page reads off. */
const EXTRA = [
  'n^3 ; n^2 + 100n',
  '5n + 3 ; n',
  'log n ; n',
  '2n^2 + n ; n^3',
  '4n log n + n ; n log n',
  'n^2 ; n log n',
  '2^n ; 3n^2',
  '2^n + n^5 ; 2^n',
  'n^2/4 + 2n ; n^2',
];
const ALL = [...PAIRS.map((p) => `${p.f} ; ${p.g}`), ...EXTRA];

const show = (pair: string) => {
  const [f, g] = pair.split(';');
  return { f: exprOf(f!.trim()).text, g: exprOf(g!.trim()).text };
};

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice questions for the definition page. Every answer comes from running the page's own
 * operations and reading what they report. `def` is a getter to avoid an import cycle.
 */
export function definitionPractice(def: () => Def): PracticeKind[] {
  const settingsFor = (relation: Relation): DefSettings => ({ ...defaults, relation });
  const run = (cs: OpCall[], settings: DefSettings) => new Timeline(def(), settings, 1, cs);
  const last = (cs: OpCall[], settings: DefSettings) => run(cs, settings).entries.at(-1)!.steps.at(-1)!;
  const varOf = (cs: OpCall[], settings: DefSettings, key: string): Scalar | undefined =>
    last(cs, settings).vars?.[key];

  return [
    {
      id: 'is-it',
      title: 'Is f = O(g)?',
      make(rng) {
        const pair = pick(rng, ALL);
        const relation = pick(rng, ['O', 'Omega', 'Theta'] as const);
        const settings = settingsFor(relation);
        const setup: OpCall[] = [['compare', pair]];
        const watch: OpCall[] = [['limit']];
        const lim = String(varOf([...setup, ...watch], settings, 'f/g →'));
        const holds =
          relation === 'O' ? lim !== '∞' : relation === 'Omega' ? lim !== '0' : lim !== '0' && lim !== '∞';
        const { f, g } = show(pair);
        return {
          prompt: `Is ${f} = ${REL[relation]}(${g})?`,
          setup,
          settings,
          answer: ordered(['Yes', 'No'], holds ? 'Yes' : 'No'),
          explain: `${last([...setup, ...watch], settings).say}`,
          watch,
        };
      },
    },
    {
      id: 'smallest-n0',
      title: 'Find n₀ for this c',
      make(rng) {
        // Pairs and constants whose smallest n₀ lies inside 2 to 50; the page finds it.
        const cases: [string, Relation, string][] = [
          ['3n^2 + 10n + 5 ; n^2', 'O', pick(rng, ['4', '5', '6', '8', '13'])],
          ['100n ; n^2', 'O', pick(rng, ['2', '3', '4', '5', '10'])],
          ['n^2 ; n', 'Omega', pick(rng, ['3', '7', '12', '25', '40'])],
          ['n log n ; n', 'Omega', pick(rng, ['2', '3', '4', '5'])],
          ['n^2/2 - 3n ; n^2', 'Omega', pick(rng, ['1/14', '1/10', '1/4', '1/3'])],
          ['n log n + n ; n log n', 'O', pick(rng, ['2', '1.5', '1.25', '1.2'])],
          ['2^n ; n!', 'O', pick(rng, ['1', '1/2', '1/5'])],
          ['5n + 3 ; n', 'O', pick(rng, ['6', '7', '5.5'])],
        ];
        const [pair, relation, c] = pick(rng, cases);
        const settings = settingsFor(relation);
        const setup: OpCall[] = [['compare', pair]];
        const watch: OpCall[] = [['find', c]];
        const t = run([...setup, ...watch], settings);
        const n0 = t.endState().n0 ?? 0;
        const { f, g } = show(pair);
        const sign = relation === 'O' ? '≤' : '≥';
        const failing = t.entries.at(-1)!.steps.find((s) => s.lines.includes('find.ret'));
        return {
          prompt: `f(n) = ${f} and g(n) = ${g}. For c = ${c}, what is the smallest n₀ such that f(n) ${sign} c·g(n) for every n from n₀ to 50?`,
          setup,
          settings,
          answer: { kind: 'number', value: n0 },
          explain: failing ? failing.say : `Nothing breaks it from 1 to 50, so n₀ = ${n0}.`,
          watch,
        };
      },
    },
    {
      id: 'which-witness',
      title: 'Which constants are witnesses?',
      make(rng) {
        // Each case: a pair, the relation it satisfies, and constants to try as c and n₀.
        const cases: [string, Relation, string[]][] = [
          ['3n^2 + 10n + 5 ; n^2', 'O', ['3 1', '3 20', '4 1', '4 10', '4 11', '18 1', '4 50', '5 8', '5 7']],
          ['100n ; n^2', 'O', ['1 1', '1 99', '1 100', '2 50', '2 49', '100 1', '50 2', '50 1']],
          ['n log n ; n', 'Omega', ['1 1', '1 2', '2 3', '2 4', '3 8', '3 7', '1/2 2']],
          ['2^n ; n!', 'O', ['1 1', '1 3', '1 4', '2 1', '1/2 1', '1/2 5', '1/2 6']],
          ['n log n + n ; n log n', 'O', ['2 1', '2 2', '1 2', '1.5 4', '1.5 3', '3 2']],
          ['n^2/2 - 3n ; n^2', 'O', ['1/2 1', '1/2 5', '1/2 6', '1/4 6', '1 6', '1/3 7']],
        ];
        const [pair, relation, tries] = pick(rng, cases);
        const settings = settingsFor(relation);
        const setup: OpCall[] = [['compare', pair]];
        const past = `past ${settings.range}`;
        const verdict = (w: string) => {
          const v = last([...setup, ['check', w]], settings).vars ?? {};
          return v['first failure'] === 'none' && v[past] === 'proved';
        };
        const label = (w: string) => {
          const [c, n0] = w.split(' ');
          return `c = ${c}, n₀ = ${n0}`;
        };
        const good = shuffle(rng, tries.filter(verdict));
        const bad = shuffle(
          rng,
          tries.filter((w) => !verdict(w)),
        );
        const right = good[0]!;
        const { f, g } = show(pair);
        return {
          prompt: `f(n) = ${f} and g(n) = ${g}. Which constants prove f = ${REL[relation]}(g), for every n ≥ n₀ and not just up to 50?`,
          setup,
          settings,
          answer: choice(rng, label(right), bad.map(label)),
          explain: last([...setup, ['check', right]], settings).say,
          watch: [['check', right]],
        };
      },
    },
    {
      id: 'limit',
      title: 'Where does f/g go?',
      make(rng) {
        const pair = pick(rng, ALL);
        const setup: OpCall[] = [['compare', pair]];
        const watch: OpCall[] = [['limit']];
        const settings = settingsFor('O');
        const lim = String(varOf([...setup, ...watch], settings, 'f/g →'));
        const { f, g } = show(pair);
        const lead = exprOf(pair.split(';')[0]!.trim()).terms[0]!.k;
        const distractors = ['0', '∞', '1', String(lead.n), '1/2', '3'];
        return {
          prompt: `As n grows, what does f(n)/g(n) tend to, for f(n) = ${f} and g(n) = ${g}?`,
          setup,
          settings,
          answer: choice(rng, lim, distractors),
          explain: last([...setup, ...watch], settings).say,
          watch,
        };
      },
    },
  ];
}
