import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { inNeighbours, listWords } from '../_graph/graph';
import { loadCall } from '../_graph/presets';
import { dagWithCycle, mixedDag } from './graphs';
import {
  defaults,
  type Ready,
  type TopoExtra,
  type TopoRun,
  type TopoSettings,
  type TopoState,
} from './model';

type Def = VizDef<TopoState, TopoSettings, TopoExtra>;
type TopoStep = Step<TopoState, TopoExtra>;

/**
 * Practice for topological sort by in-degree. Every answer comes from running the model: the
 * orders and the leftover vertices from the run's last step, and an in-degree from the step
 * just before the next vertex is taken.
 */
export function topoPractice(def: () => Def): PracticeKind[] {
  const runSteps = (setup: OpCall[], ready: Ready): TopoStep[] => {
    const t = new Timeline(def(), { ...defaults, ready }, 1, [...setup, ['run']]);
    return t.entries.at(-1)!.steps;
  };
  const last = (steps: TopoStep[]): TopoRun => steps.at(-1)!.extra!.run!;
  const dag = (rng: Rng) => {
    const g = mixedDag(rng, rng.int(6, 8), 0.2);
    return { g, setup: [loadCall(g)] };
  };
  const watch: OpCall[] = [['run']];

  return [
    {
      id: 'order',
      title: 'In what order? (queue)',
      make(rng) {
        const { setup } = dag(rng);
        const r = last(runSteps(setup, 'fifo'));
        return {
          prompt:
            'Sort this DAG by in-degree, with the ready vertices in a first-in, first-out queue. The vertices with in-degree 0 go in the queue in name order, and arcs out of a vertex are removed in name order. Type the topological order.',
          setup,
          answer: { kind: 'sequence', value: r.order },
          explain: `Start with every vertex that has no arc in. Each time a vertex leaves the queue, its arcs go, and any vertex left with no arc in joins the back. ${r.order.join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'smallest',
      title: 'Smallest name first',
      make(rng) {
        for (;;) {
          const { setup } = dag(rng);
          const r = last(runSteps(setup, 'smallest'));
          const fifo = last(runSteps(setup, 'fifo'));
          // Only graphs where the two rules give different orders.
          if (r.order.join() === fifo.order.join()) continue;
          return {
            prompt:
              'Sort this DAG by in-degree, but always take the ready vertex with the smallest name next. Type the topological order.',
            setup,
            settings: { ...defaults, ready: 'smallest' },
            answer: { kind: 'sequence', value: r.order },
            explain: `Among the vertices with no arc left coming in, take the smallest name each time: ${r.order.join(', ')}. A first-in, first-out queue would give ${fifo.order.join(', ')}, which is also a topological order.`,
            watch,
          };
        }
      },
    },
    {
      id: 'indegree',
      title: 'How many arcs left?',
      make(rng) {
        for (;;) {
          const { g, setup } = dag(rng);
          const steps = runSteps(setup, 'fifo');
          const r = last(steps);
          // The steps where a vertex is taken; the one before each shows the previous one done.
          const takes = steps
            .map((st, i) => ({ st, i }))
            .filter(({ st }) => st.lines.includes('deq'));
          if (takes.length < 4) continue;
          const k = rng.int(1, Math.min(3, takes.length - 2));
          const y = takes[k]!.st.extra!.run!.u!;
          const after = steps[takes[k + 1]!.i - 1]!.extra!.run!;
          const waiting = g.vertices.filter((v) => !after.order.includes(v) && after.indeg[v]! > 0);
          if (waiting.length === 0) continue;
          const x = waiting[rng.int(0, waiting.length - 1)]!;
          const n = after.indeg[x]!;
          const from = inNeighbours(g, x).filter((p) => !after.order.includes(p));
          const gone = inNeighbours(g, x).filter((p) => after.order.includes(p));
          const all = inNeighbours(g, x).length;
          const arcs = (k: number) => `${k} ${k === 1 ? 'arc' : 'arcs'}`;
          return {
            prompt: `Sort this DAG by in-degree with a first-in, first-out queue. The order starts ${r.order.slice(0, k + 1).join(', ')}. Right after ${y} is taken and its arcs are removed, what is the in-degree of ${x}?`,
            setup,
            answer: { kind: 'number', value: n },
            explain: gone.length
              ? `${x} has ${arcs(all)} in. The ${gone.length === 1 ? 'one' : 'ones'} from ${listWords(gone)} ${gone.length === 1 ? 'is' : 'are'} gone, taken out with ${gone.length === 1 ? 'it' : 'them'}, so ${n} ${n === 1 ? 'is' : 'are'} left, from ${listWords(from)}.`
              : `${x} has ${arcs(all)} in, from ${listWords(from)}, and no vertex taken so far is one of them, so its in-degree is still ${n}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'leftover',
      title: 'Who never gets out?',
      make(rng) {
        const g = dagWithCycle(rng, rng.int(6, 8));
        const setup = [loadCall(g)];
        const r = last(runSteps(setup, 'fifo'));
        const left = r.leftover!;
        const cycle = r.cycle!;
        return {
          prompt:
            'This graph has a cycle. Sort it by in-degree. Which vertices are never put in the order? Type them in name order.',
          setup,
          answer: { kind: 'sequence', value: left },
          explain: `${[...cycle, cycle[0]].join(' → ')} is a cycle, so its vertices wait on each other forever. ${left.length > cycle.length ? `Every vertex that some vertex on the cycle leads to waits too. ` : ''}Left over: ${listWords(left)}.`,
          watch,
        };
      },
    },
  ];
}
