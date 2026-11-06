import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { formatGraph } from '../_graph/parse';
import { randomGraph } from '../_graph/presets';
import {
  defaults,
  formulaText,
  parseFormula,
  setText,
  solveSat,
  type Formula,
  type NpExtra,
  type NpSettings,
  type NpState,
} from './model';

type Def = VizDef<NpState, NpSettings, NpExtra>;

function formula(rng: Rng, clauses: number): string {
  for (;;) {
    const parts = Array.from({ length: clauses }, () => {
      const vs = ['a', 'b', 'c', 'd'];
      vs.splice(rng.int(0, 3), 1);
      const size = rng.int(2, 3);
      while (vs.length > size) vs.splice(rng.int(0, vs.length - 1), 1);
      return vs.map((v) => `${rng.int(0, 1) ? '!' : ''}${v}`).join(' | ');
    });
    const t = parts.join(', ');
    const f = parseFormula(t);
    if (!(f instanceof Error) && solveSat(f)) return t;
  }
}

const graph = (rng: Rng, n: number) => formatGraph(randomGraph(rng, n, { density: 0.3 }));

/**
 * Practice for reductions. Every answer comes from running the model: the size of the graph a
 * reduction builds, the new k, and the certificate it maps across.
 */
export function npPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);

  return [
    {
      id: 'gadget',
      title: 'Count the edges of the gadget graph',
      make(rng) {
        const t = formula(rng, rng.int(2, 3));
        const end = run([['load', t], ['toIs']]).endState();
        const g = end.inst.graph!;
        const f = parseFormula(t) as Formula;
        return {
          prompt: `Reduce ${formulaText(f)} to INDEPENDENT-SET: a vertex per literal, the vertices of each clause joined to each other, and every x joined to every ¬x in another clause. How many edges does the graph have?`,
          setup: [['load', t]],
          answer: { kind: 'number', value: g.edges.length },
          explain: `${g.vertices.length} vertices. The clauses give ${f.clauses.reduce((a, c) => a + (c.length * (c.length - 1)) / 2, 0)} edges (3 per triangle, 1 per two-literal clause), and the clashes between x and ¬x give the rest: ${g.edges.length} in all.`,
          watch: [['toIs']],
        };
      },
    },
    {
      id: 'new-k',
      title: 'The new k',
      make(rng) {
        const n = rng.int(4, 7);
        const k = rng.int(1, n - 1);
        const t = `${graph(rng, n)} k=${k}`;
        const end = run([['load', t], ['toVc']]).endState();
        return {
          prompt: `The graph has ${n} vertices, and the question is whether it has an independent set of size ${k}. Reduce it to VERTEX-COVER. What k does the new question ask for?`,
          setup: [['load', t]],
          answer: { kind: 'number', value: end.inst.k },
          explain: `S is independent exactly when the other vertices, V - S, touch every edge. So ask for a cover of size n - k = ${n} - ${k} = ${end.inst.k}.`,
          watch: [['toVc']],
        };
      },
    },
    {
      id: 'carry',
      title: 'Carry the certificate across',
      make(rng) {
        const n = rng.int(4, 7);
        const t = graph(rng, n);
        const setup: OpCall[] = [['load', t], ['check']];
        const before = run(setup).endState();
        const end = run([...setup, ['toVc']]).endState();
        const s = before.inst.witness!;
        const c = end.inst.witness!;
        return {
          prompt: `Brute force found the independent set S = ${setText(s)} of size k = ${s.length}. Reduce to VERTEX-COVER. Type the vertex cover the reduction maps S to, in name order.`,
          setup,
          answer: { kind: 'sequence', value: c },
          explain: `The cover is everything not in S: V - S = ${setText(c)}, ${c.length} vertices. Every edge has at most one end in S, so at least one end in V - S.`,
          watch: [['toVc']],
        };
      },
    },
    {
      id: 'complement',
      title: 'Edges of the complement',
      make(rng) {
        const n = rng.int(4, 6);
        const t = graph(rng, n);
        const start = run([['load', t]]).endState();
        const end = run([['load', t], ['toClique']]).endState();
        const m = start.inst.graph!.edges.length;
        return {
          prompt: `The graph has ${n} vertices and ${m} edges. Reduce INDEPENDENT-SET to CLIQUE by taking the complement. How many edges does the complement have?`,
          setup: [['load', t]],
          answer: { kind: 'number', value: end.inst.graph!.edges.length },
          explain: `${n} vertices have n(n - 1)/2 = ${(n * (n - 1)) / 2} pairs. The complement joins exactly the pairs G does not: ${(n * (n - 1)) / 2} - ${m} = ${end.inst.graph!.edges.length}.`,
          watch: [['toClique']],
        };
      },
    },
  ];
}
