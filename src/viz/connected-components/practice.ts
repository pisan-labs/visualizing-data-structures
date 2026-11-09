import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { listWords, type Graph } from '../_graph/graph';
import { loadCall, randomGraph } from '../_graph/presets';
import {
  defaults,
  groups,
  type CcExtra,
  type CcRun,
  type CcSettings,
  type CcState,
  type Method,
} from './model';

type Def = VizDef<CcState, CcSettings, CcExtra>;
type CcStep = Step<CcState, CcExtra>;

/** 6 to 9 vertices with no spanning tree underneath, so there are often several pieces. */
function practiceGraph(rng: Rng, density = rng.int(8, 18) / 100): Graph {
  return randomGraph(rng, rng.int(6, 9), { connected: false, density });
}

/**
 * Practice for connected components. Every answer comes from running the model: the count and
 * the numbers from the run's last step, the order from the steps, and the skipped edges from
 * the union-find run's edge marks.
 */
export function ccPractice(def: () => Def): PracticeKind[] {
  const runSteps = (setup: OpCall[], method: Method): CcStep[] => {
    const t = new Timeline(def(), { ...defaults, method }, 1, [...setup, ['run']]);
    return t.entries.at(-1)!.steps;
  };
  const setupRun = (rng: Rng, method: Method = 'bfs', density?: number) => {
    const g = practiceGraph(rng, density);
    const setup = [loadCall(g)];
    const steps = runSteps(setup, method);
    const r: CcRun = steps.at(-1)!.extra!.run!;
    return { g, setup, steps, r, watch: [['run']] as OpCall[] };
  };

  return [
    {
      id: 'count',
      title: 'How many pieces?',
      make(rng) {
        const { g, setup, r, watch } = setupRun(rng);
        const parts = groups(g, r).map((m) => (m.length === 1 ? `${m[0]} alone` : listWords(m)));
        return {
          prompt: 'How many connected components does this graph have?',
          setup,
          answer: { kind: 'number', value: r.count },
          explain:
            r.count === 1
              ? 'One: every vertex can reach every other, so a single search labels them all.'
              : `${r.count}: ${parts.join('; ')}. A vertex with no edges is a component by itself.`,
          watch,
        };
      },
    },
    {
      id: 'together',
      title: 'Same piece?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          if (r.count < 2) continue;
          const v = g.vertices;
          const a = v[rng.int(0, v.length - 1)]!;
          // Half the time, pick a partner from the same piece when there is one.
          const same = v.filter((x) => x !== a && r.cc[x] === r.cc[a]);
          const pool = rng.int(0, 1) && same.length ? same : v.filter((x) => x !== a);
          const b = pool[rng.int(0, pool.length - 1)]!;
          const yes = r.cc[a] === r.cc[b];
          const piece = (x: string) => groups(g, r)[r.cc[x]! - 1]!;
          const where = (x: string) =>
            piece(x).length === 1 ? `${x} is alone` : `${x} is in the piece ${listWords(piece(x))}`;
          return {
            prompt: `Are ${a} and ${b} in the same connected component?`,
            setup,
            answer: { kind: 'choice', options: ['Yes', 'No'], correct: yes ? 0 : 1 },
            explain: yes
              ? `Yes. They are both in component ${r.cc[a]}: ${listWords(piece(a))}. A path of edges joins them.`
              : `No. ${where(a)}, and ${where(b)}. No path joins them, so a search from one never reaches the other.`,
            watch,
          };
        }
      },
    },
    {
      id: 'order',
      title: 'In what order?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          if (r.count < 2 || g.edges.length < 3) continue;
          return {
            prompt:
              'Find the components with breadth-first search. The outer loop takes vertices in name order, and so do the adjacency lists. Type the vertices in the order they get their component number.',
            setup,
            answer: { kind: 'sequence', value: r.order },
            explain: `Each search labels a vertex when it goes in the queue. The first search starts at ${g.vertices[0]}; the next starts at the first vertex in name order still without a number. ${r.order.join(', ')}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'skipped',
      title: 'Edges that add nothing',
      make(rng) {
        for (;;) {
          // Denser than the other kinds, so some edges close cycles.
          const { g, setup, r } = setupRun(rng, 'union-find', rng.int(15, 30) / 100);
          if (g.edges.length < 3) continue;
          const skipped = Object.values(r.edges).filter((x) => x === 'seen').length;
          // Sparse random graphs are mostly forests; keep an answer of 0 only now and then.
          if (skipped === 0 && rng.int(0, 3)) continue;
          const merged = g.vertices.length - r.count;
          return {
            prompt:
              'Union-find reads the edges in order (A-B before A-C before B-C) and merges the sets at their ends. How many edges join two vertices that are already in the same set?',
            setup,
            settings: { ...defaults, method: 'union-find' },
            answer: { kind: 'number', value: skipped },
            explain: `Each edge that merges two sets cuts the number of sets by one: ${g.vertices.length} vertices end in ${r.count} sets, so ${merged} edges merge. ${skipped === 0 ? `That is all ${g.edges.length} of them, so none finds both ends in the same set: the graph has no cycle.` : `The other ${g.edges.length} − ${merged} = ${skipped} ${skipped === 1 ? 'finds both ends in the same set already: it closes a cycle' : 'find both ends in the same set already: each of them closes a cycle'}.`}`,
            watch: [['run']],
          };
        }
      },
    },
  ];
}
