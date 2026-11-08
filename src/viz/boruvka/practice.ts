import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { keyOf } from '../_graph/graph';
import { fewWeights, randomMst } from '../_graph/mst';
import { loadCall } from '../_graph/presets';
import {
  compNames,
  defaults,
  type BoruvkaExtra,
  type BoruvkaRun,
  type BoruvkaSettings,
  type BoruvkaState,
} from './model';

type Def = VizDef<BoruvkaState, BoruvkaSettings, BoruvkaExtra>;

/**
 * Practice for Borůvka. Every answer comes from running the model: round 1's picks (read from
 * the step that lists them), the components after round 1, the rounds and the weight.
 */
export function boruvkaPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, ties = false) {
    const g = ties ? fewWeights(rng, rng.int(6, 8)) : randomMst(rng, rng.int(6, 8), 0.3);
    const ops: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), defaults, 1, [...ops, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    const runs = steps.map((s) => s.extra!.run!);
    const r: BoruvkaRun = runs.at(-1)!;
    // Round 1's picks, and the components when round 1 ends.
    const picks = steps.find((s) => s.lines.includes('picks'))!.extra!.run!;
    const after = runs.find((x) => x.round === 2) ?? r;
    return { g, ops, r, picks, after, watch: [['run']] as OpCall[] };
  }
  const intro =
    'Run Borůvka on this graph. Equal weights go to the edge earlier in name order (A-D before B-C).';

  return [
    {
      id: 'pick',
      title: 'Which edge does it pick?',
      make(rng) {
        for (;;) {
          const { g, ops, picks, watch } = setup(rng, rng.int(0, 1) === 1);
          const v = g.vertices[rng.int(0, g.vertices.length - 1)]!;
          const mine = g.edges.filter((e) => e.u === v || e.v === v);
          if (mine.length < 2) continue;
          const options = mine.map((e) => `${e.u}-${e.v} (${e.w})`);
          const k = picks.pick[v]!;
          return {
            prompt: `${intro} In round 1, every vertex is a component of its own. Which edge does ${v} pick?`,
            setup: ops,
            answer: { kind: 'choice', options, correct: mine.findIndex((e) => keyOf(e) === k) },
            explain: `${v}'s edges weigh ${mine.map((e) => e.w).join(', ')}. The cheapest (the first in the list on a tie) is ${k}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'after-one',
      title: 'Components after round 1',
      make(rng) {
        const { g, ops, after, watch } = setup(rng);
        const n = compNames(g, after.comp).length;
        return {
          prompt: `${intro} How many components are left after round 1?`,
          setup: ops,
          answer: { kind: 'number', value: n },
          explain: `Round 1 adds ${after.T.join(', ')}, which join the ${g.vertices.length} vertices into ${n} ${n === 1 ? 'piece' : 'pieces'}.`,
          watch,
        };
      },
    },
    {
      id: 'rounds',
      title: 'How many rounds?',
      make(rng) {
        const { ops, r, watch } = setup(rng, rng.int(0, 1) === 1);
        return {
          prompt: `${intro} How many rounds does it take?`,
          setup: ops,
          answer: { kind: 'number', value: r.round },
          explain: `The tree edges join in ${r.round} ${r.round === 1 ? 'round' : 'rounds'}: ${r.T.join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'weight',
      title: 'How heavy is the tree?',
      make(rng) {
        const { ops, r, watch } = setup(rng);
        return {
          prompt: 'What is the total weight of a minimum spanning tree of this graph?',
          setup: ops,
          answer: { kind: 'number', value: r.weight },
          explain: `Borůvka keeps ${r.T.join(', ')}. Together they weigh ${r.weight}.`,
          watch,
        };
      },
    },
  ];
}
