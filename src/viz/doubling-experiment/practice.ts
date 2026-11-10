import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { choice } from '../_recursion/kit';
import { ALGO, ALGOS, type AlgoId } from './algos';
import { commas, fix2, ratios, tText, type DxSettings, type DxState } from './model';

type Def = VizDef<DxState, DxSettings, undefined>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const bsOf = (s: DxState) => ratios(s.rows).map((r) => r.b);

/**
 * Starting sizes for each algorithm whose run fills all eight rows and leaves room for one more
 * doubling (n · 2⁸ ≤ the largest n), so a question can ask about the size after the table.
 */
const STARTS: Record<AlgoId, number[]> = {
  linear: [100, 500, 1000],
  binary: [1, 8, 1000],
  hash: [100, 300, 700],
  merge: [250, 500, 1000],
  insertion: [25, 50, 75],
  threesum: [3],
};

/**
 * Algorithms a learner might mistake each one for. Never one with the same growth: linear search
 * and the hash set are both linear, and only the exact counts would tell them apart.
 */
const LOOKALIKES: Record<AlgoId, AlgoId[]> = {
  linear: ['merge', 'binary', 'insertion'],
  binary: ['linear', 'hash', 'merge'],
  hash: ['merge', 'binary', 'insertion'],
  merge: ['linear', 'hash', 'insertion'],
  insertion: ['merge', 'threesum', 'linear'],
  threesum: ['insertion', 'merge', 'linear'],
};

/** About v, to two significant digits: "about 41,000,000". */
const about = (v: number) => `about ${tText(Number(v.toPrecision(2)))}`;

/**
 * Practice for doubling experiments. The picture is the finished table and plot; every answer
 * comes from running the model. `def` is a getter to avoid an import cycle.
 */
export function doublingPractice(def: () => Def): PracticeKind[] {
  const runAll = (settings: DxSettings, calls: OpCall[]) => new Timeline(def(), settings, 1, calls);
  const setup = (rng: Rng) => {
    const algo = pick(rng, ALGOS);
    const settings: DxSettings = { algo, noise: 'off', fit: 'last' };
    const n0 = pick(rng, STARTS[algo]);
    const table = runAll(settings, [['run', n0]]).endState();
    return { algo, settings, n0, table, last: table.rows.at(-1)! };
  };

  return [
    {
      id: 'which',
      title: 'Which algorithm made this table?',
      make(rng) {
        const { algo, settings, n0 } = setup(rng);
        const t = runAll(settings, [['run', n0]]);
        const end = t.entries[0]!.steps.at(-1)!;
        return {
          prompt:
            'The table counts the basic steps of one of these algorithms at n, 2n, 4n, …, with no noise. Which one?',
          setup: [['run', n0]],
          settings,
          answer: choice(
            rng,
            ALGO[algo].label,
            LOOKALIKES[algo].map((id) => ALGO[id].label),
          ),
          explain: `${end.say} Show me runs it again on new inputs.`,
          watch: [['run', n0]],
        };
      },
    },
    {
      id: 'exponent',
      title: 'What is b?',
      make(rng) {
        const { settings, n0, table, last } = setup(rng);
        const n = 2 * last.n;
        const g = runAll(settings, [
          ['run', n0],
          ['predict', n],
        ]).endState().guess!;
        const ratio = g.t! / last.t;
        const b = Math.log2(ratio);
        const answer = Math.round(b * 10) / 10;
        return {
          prompt: `The table stops at n = ${commas(last.n)}, where T(${commas(last.n)}) = ${tText(last.t)}. One more doubling: at n = ${commas(n)} the count is ${tText(g.t!)}. What is b for that doubling, to one decimal place?`,
          setup: [['run', n0]],
          settings,
          answer: { kind: 'number', value: answer },
          explain: `The ratio is ${tText(g.t!)} / ${tText(last.t)} = ${fix2(ratio)}, and b = log₂ ${fix2(ratio)} = ${fix2(b)}, which is ${answer} to one decimal place. The last b in the table was ${fix2(bsOf(table).at(-1)!)}.`,
          watch: [['predict', n]],
        };
      },
    },
    {
      id: 'predict',
      title: 'Predict a bigger n',
      make(rng) {
        const { algo, settings, n0, table, last } = setup(rng);
        const d = 4 * last.n <= ALGO[algo].maxN ? 2 : 1;
        const n = last.n * 2 ** d;
        const g = runAll(settings, [
          ['run', n0],
          ['predict', n],
        ]).endState().guess!;
        const prev = table.rows.at(-2)!;
        const ratio = last.t / prev.t;
        const wrong = [
          last.t * 2 ** d,
          last.t + d * (last.t - prev.t),
          last.t * ratio ** (d + 1),
        ].map(about);
        const doublings = d === 2 ? 'two more doublings' : 'one more doubling';
        return {
          prompt: `Use the table's model T(n) ≈ a·nᵇ, which takes b from the last two rows. About how many steps does it predict at n = ${commas(n)}, ${doublings} past the table?`,
          setup: [['run', n0]],
          settings,
          answer: choice(rng, about(g.guess), wrong),
          explain: `Each doubling multiplies T by about the last ratio, ${fix2(ratio)}, so T(${commas(n)}) ≈ ${tText(last.t)} · ${fix2(ratio)}${d === 2 ? '²' : ''} ≈ ${tText(g.guess)}. Running it counts ${tText(g.t!)}.`,
          watch: [['predict', n]],
        };
      },
    },
  ];
}
