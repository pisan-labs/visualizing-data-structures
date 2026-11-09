import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { keyOf } from '../_graph/graph';
import { loadCall } from '../_graph/presets';
import { withNegativeCycle, withNegativeEdges } from '../_paths/presets';
import {
  defaults,
  fmt,
  signed,
  type JohnsonExtra,
  type JohnsonRun,
  type JohnsonSettings,
  type JohnsonState,
} from './model';

type Def = VizDef<JohnsonState, JohnsonSettings, JohnsonExtra>;

/**
 * Practice for Johnson. Every answer comes from running the model: h from Bellman-Ford, the
 * reweighted arcs, the result matrix and the negative-cycle verdict.
 */
export function johnsonPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, cycle = false) {
    const g = cycle ? withNegativeCycle(rng, rng.int(4, 5)) : withNegativeEdges(rng, rng.int(4, 5));
    const ops: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), defaults, 1, [...ops, ['run']]);
    const r: JohnsonRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { g, ops, r, watch: [['run']] as OpCall[] };
  }
  const hText = (g: { vertices: string[] }, r: JohnsonRun) =>
    g.vertices.map((v) => `h(${v}) = ${fmt(r.h[v])}`).join(', ');

  return [
    {
      id: 'h',
      title: 'Find h',
      make(rng) {
        const { g, ops, r, watch } = setup(rng);
        const v = g.vertices[rng.int(0, g.vertices.length - 1)]!;
        return {
          prompt: `Johnson adds a vertex q with a 0-weight arc to every vertex and runs Bellman-Ford from q. What is h(${v}) = δ(q, ${v})?`,
          setup: ops,
          answer: { kind: 'number', value: r.h[v]! },
          explain: `${hText(g, r)}. h(${v}) is the lightest path from q to ${v}: start with the 0 arc into any vertex and follow arcs.`,
          watch,
        };
      },
    },
    {
      id: 'reweight',
      title: 'Reweight an arc',
      make(rng) {
        const { g, ops, r, watch } = setup(rng);
        const e = g.edges[rng.int(0, g.edges.length - 1)]!;
        const w2 = r.w2[keyOf(e)]!;
        return {
          prompt: `After Bellman-Ford from q, what is the new weight w'(${e.u}, ${e.v}) = w(${e.u}, ${e.v}) + h(${e.u}) − h(${e.v})?`,
          setup: ops,
          answer: { kind: 'number', value: w2 },
          explain: `${hText(g, r)}. So w'(${e.u}, ${e.v}) = ${fmt(e.w)} + ${signed(r.h[e.u]!)} − ${signed(r.h[e.v]!)} = ${fmt(w2)}, never negative.`,
          watch,
        };
      },
    },
    {
      id: 'distance',
      title: 'Read the result',
      make(rng) {
        for (;;) {
          const { g, ops, r, watch } = setup(rng);
          const s = g.vertices[rng.int(0, g.vertices.length - 1)]!;
          const t = g.vertices[rng.int(0, g.vertices.length - 1)]!;
          const d = r.D[s]![t];
          if (s === t || d === null || d === undefined) continue;
          return {
            prompt: `What is the shortest distance from ${s} to ${t} in this graph? (Negative edges are fine; there is no negative cycle.)`,
            setup: ops,
            answer: { kind: 'number', value: d },
            explain: `Dijkstra from ${s} on the reweighted arcs, then D[${s}][${t}] = d'(${s}, ${t}) − h(${s}) + h(${t}) = ${fmt(d)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'cycle',
      title: 'Can Johnson finish?',
      make(rng) {
        const cycle = rng.int(0, 1) === 1;
        const { ops, r, watch } = setup(rng, cycle);
        const neg = r.phase === 'negative';
        const options = [
          'Yes: it fills the whole matrix',
          'No: Bellman-Ford finds a negative cycle and it stops',
        ];
        return {
          prompt: 'Run Johnson on this graph. Does it finish the distance matrix?',
          setup: ops,
          answer: { kind: 'choice', options, correct: neg ? 1 : 0 },
          explain: neg
            ? `The cycle ${r.cycle!.join(' → ')} → ${r.cycle![0]} has negative total weight, so some distances are −∞ and Johnson stops before reweighting.`
            : 'Some edges are negative, but no cycle is: Bellman-Ford finds h, every w′ is nonnegative, and Dijkstra fills every row.',
          watch,
        };
      },
    },
  ];
}
