import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  colName,
  defaults,
  formatMatrix,
  pairsText,
  reduced,
  rowName,
  totalOf,
  type HmExtra,
  type HmRun,
  type HmSettings,
  type HmState,
} from './model';

type Def = VizDef<HmState, HmSettings, HmExtra>;

function matrix(rng: Rng, n: number): number[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(1, 9)));
}

/** Every permutation's total, to keep only matrices with one best assignment. */
function optimaCount(cost: number[][], goal: 'min' | 'max'): number {
  const n = cost.length;
  const totals: number[] = [];
  const used = Array(n).fill(false);
  const go = (i: number, sum: number) => {
    if (i === n) {
      totals.push(sum);
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true;
      go(i + 1, sum + cost[i]![j]!);
      used[j] = false;
    }
  };
  go(0, 0);
  const best = goal === 'min' ? Math.min(...totals) : Math.max(...totals);
  return totals.filter((t) => t === best).length;
}

/**
 * Practice for the Hungarian algorithm. Every answer comes from running the model; the
 * permutation count only screens out matrices with more than one best assignment.
 */
export function hungarianPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, settings: HmSettings = defaults, unique = false) {
    for (;;) {
      const cost = matrix(rng, rng.int(3, 4));
      if (unique && optimaCount(cost, settings.goal) !== 1) continue;
      const setup: OpCall[] = [['load', formatMatrix(cost)]];
      const watch: OpCall[] = [['run']];
      const t = new Timeline(def(), settings, 1, [...setup, ...watch]);
      const steps = t.entries.at(-1)!.steps;
      const r: HmRun = steps.at(-1)!.extra!.run!;
      return { cost, setup, watch, r, steps };
    }
  }

  return [
    {
      id: 'total',
      title: 'The cheapest total',
      make(rng) {
        const { cost, setup, watch, r } = setupRun(rng);
        const total = totalOf(cost, r.rowMate);
        return {
          prompt:
            'Each row is a worker and each column a job. Give every worker a different job. What is the smallest possible total cost?',
          setup,
          answer: { kind: 'number', value: total },
          explain: `One cheapest assignment is ${pairsText(r.rowMate)}, for a total of ${total}. The final potentials add up to ${total} as well, which proves nothing cheaper exists.`,
          watch,
        };
      },
    },
    {
      id: 'assign',
      title: 'Who gets which job?',
      make(rng) {
        const { cost, setup, watch, r } = setupRun(rng, defaults, true);
        const i = rng.int(0, cost.length - 1);
        const options = cost.map((_, j) => `Column ${colName(j)}`);
        return {
          prompt: `In the cheapest assignment (there is only one), which column does row ${rowName(i)} get?`,
          setup,
          answer: { kind: 'choice', options, correct: r.rowMate[i]! },
          explain: `The cheapest assignment is ${pairsText(r.rowMate)}, total ${totalOf(cost, r.rowMate)}. Row ${rowName(i)} gets column ${colName(r.rowMate[i]!)}${cost[i]![r.rowMate[i]!]! > Math.min(...cost[i]!) ? `, even though it is not row ${rowName(i)}'s cheapest cell: another row needs that one more` : ', its cheapest cell'}.`,
          watch,
        };
      },
    },
    {
      id: 'reduce',
      title: 'Tight cells after the reductions',
      make(rng) {
        const { setup, watch, steps } = setupRun(rng);
        const first = steps.find((s) => s.lines.includes('phase'))!.extra!.run!;
        const n = first.work.length;
        let tight = 0;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) if (reduced(first, i, j) === 0) tight++;
        return {
          prompt:
            'Subtract each row’s smallest entry from that row, then each column’s smallest remaining entry from that column. How many cells are 0 (tight) afterwards?',
          setup,
          answer: { kind: 'number', value: tight },
          explain: `u = ${first.u.join(', ')} and v = ${first.v.join(', ')}. A cell is tight when c[i][j] = u[i] + v[j], and ${tight} cells are. Every row and every column has at least one.`,
          watch,
        };
      },
    },
    {
      id: 'max',
      title: 'The most valuable total',
      make(rng) {
        const settings: HmSettings = { ...defaults, goal: 'max' };
        const { cost, setup, watch, r } = setupRun(rng, settings);
        const total = totalOf(cost, r.rowMate);
        return {
          prompt:
            'Now the numbers are profits, not costs. Give every row a different column. What is the largest possible total?',
          setup,
          settings,
          answer: { kind: 'number', value: total },
          explain: `Minimize M − c with M = ${r.big}: the best assignment is ${pairsText(r.rowMate)}, worth ${total}.`,
          watch,
        };
      },
    },
  ];
}
