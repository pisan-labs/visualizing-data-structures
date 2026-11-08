import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Scalar, VizDef } from '../../engine/types';
import { choice, shuffle } from '../_recursion/kit';
import { patternOf, plugText, type LcSettings, type LcState } from './model';
import { DOUBLING, ORDERS, PATTERNS, type Found, type Order, type PatternId } from './patterns';

type Def = VizDef<LcState, LcSettings, undefined>;

const FOUNDS: Found[] = ['first', 'middle', 'missing'];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Where x is, for questions on the early-exit search. */
const WHERE: Record<Found, string> = {
  first: ' Here x is the first item of A.',
  middle: ' Here x is in the middle of A, at position ⌈n/2⌉.',
  missing: ' Here x is not in A at all.',
};

/** Wrong orders a learner is likely to pick, by pattern. */
const ORDER_TRAPS: Record<PatternId, Order[]> = {
  single: ['1', 'log n', 'n²'],
  nested: ['n', 'n log n', 'n³'],
  triangle: ['n', 'n log n', 'n³'],
  pairs: ['n', 'n log n', 'n³'],
  sequence: ['n²', 'n log n', '1'],
  halving: ['n', '√n', 'n log n'],
  sqrt: ['log n', 'n', 'n²'],
  doubling: ['n²', 'n', 'log n'],
  geometric: ['n log n', 'n²', 'log n'],
  search: ['1', 'log n', 'n', 'n²'],
  triple: ['n²', 'n log n', 'n'],
};

/** Wrong formulas that look right, by pattern (the search is left out: it has a case). */
const FORMULA_TRAPS: Record<Exclude<PatternId, 'search'>, string[]> = {
  single: ['n + 1', 'n − 1', 'n²'],
  nested: ['n(n+1)/2', '2n', 'n² − 1'],
  triangle: ['n(n−1)/2', 'n²', 'n²/2'],
  pairs: ['n(n+1)/2', 'n²', 'n²/2'],
  sequence: ['n²', 'n + 1', 'n'],
  halving: ['⌊log₂ n⌋ + 1', '⌊n/2⌋', '⌊√n⌋'],
  sqrt: ['⌊n/2⌋', '⌊log₂ n⌋', '⌈√n⌉'],
  doubling: ['n⌊log₂ n⌋', 'n²', '⌊log₂ n⌋ + 1'],
  geometric: ['n(⌊log₂ n⌋ + 1)', 'n²/2', '2ᵏ, k = ⌊log₂ n⌋'],
  triple: ['n³/6', 'n(n−1)(n−2)/6', 'n²(n+1)/2'],
};

/**
 * Practice for counting loops. The picture is the code card with the counted line highlighted;
 * every answer comes from running the model. `def` is a getter to avoid an import cycle.
 */
export function loopPractice(def: () => Def): PracticeKind[] {
  const last = (settings: LcSettings, calls: OpCall[]) => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries.at(-1)!.steps.at(-1)!;
  };
  const read = (vars: Record<string, Scalar> | undefined, key: string) => String(vars?.[key]);
  const setup = (rng: Rng, patterns: readonly PatternId[] = PATTERNS) => {
    const pattern = pick(rng, patterns);
    const found = pattern === 'search' ? pick(rng, FOUNDS) : 'missing';
    const settings: LcSettings = { pattern, found };
    return {
      settings,
      p: patternOf(settings),
      found,
      where: pattern === 'search' ? WHERE[found] : '',
    };
  };

  return [
    {
      id: 'count',
      title: 'How many times does it run?',
      make(rng) {
        const { settings, p, found, where } = setup(rng);
        const n = p.maxN < 16 ? rng.int(2, p.maxN) : rng.int(4, 12);
        const end = last(settings, [['run', n]]);
        const count = end.state.run!.count;
        return {
          prompt: `How many times does the highlighted line run when n = ${n}?${where}`,
          setup: [],
          settings,
          answer: { kind: 'number', value: count },
          explain: `T(n) = ${p.formula(found)}, so T(${n}) = ${plugText(p, n, found)}. Show me lights one cell each time the line runs.`,
          watch: [['run', n]],
        };
      },
    },
    {
      id: 'big-o',
      title: 'What is the Big-O?',
      make(rng) {
        const { settings, p, where } = setup(rng);
        const n = Math.min(8, p.maxN);
        const end = last(settings, [['run', n]]);
        const right = read(end.vars, 'Big-O');
        const wrong = ORDER_TRAPS[p.id].map((o) => `O(${o})`);
        return {
          prompt: `What is the Big-O of the number of times the highlighted line runs?${where}`,
          setup: [],
          settings,
          answer: choice(rng, right, wrong),
          explain: end.say,
          watch: [['run', n]],
        };
      },
    },
    {
      id: 'formula',
      title: 'Which formula counts it exactly?',
      make(rng) {
        const ids = PATTERNS.filter((id): id is Exclude<PatternId, 'search'> => id !== 'search');
        const { settings, p } = setup(rng, ids);
        const n = Math.min(8, p.maxN);
        const end = last(settings, [['run', n]]);
        const right = read(end.vars, 'T(n)');
        const traps = FORMULA_TRAPS[p.id as Exclude<PatternId, 'search'>];
        return {
          prompt: 'Which formula gives T(n), the exact number of times the highlighted line runs?',
          setup: [],
          settings,
          answer: choice(rng, right, traps),
          explain: `${p.why('missing')} Show me runs it for n = ${n} and checks the formula against the count.`,
          watch: [['run', n]],
        };
      },
    },
    {
      id: 'doubling',
      title: 'What does doubling n do?',
      make(rng) {
        const { settings, where } = setup(rng);
        const end = last(settings, [['grow', 8]]);
        const right = read(end.vars, 'each doubling');
        const others = ORDERS.map((o) => DOUBLING[o]).filter((d) => d !== right);
        return {
          prompt: `When n doubles, what happens to the number of times the highlighted line runs?${where}`,
          setup: [],
          settings,
          answer: choice(rng, right, shuffle(rng, others).slice(0, 3)),
          explain: end.say,
          watch: [['grow', 8]],
        };
      },
    },
  ];
}
