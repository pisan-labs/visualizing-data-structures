import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { loadCall, shuffle } from '../_graph/presets';
import { dagWithCycle, shuffledDag } from './graphs';
import { defaults, type TopoExtra, type TopoRun, type TopoSettings, type TopoState } from './model';

type Def = VizDef<TopoState, TopoSettings, TopoExtra>;

const code = (s: string) => `\`${s}\``;

/**
 * Practice for topological sort by DFS. Every answer comes from running the model: the order,
 * the finish times and the back edge are read from the run's last step.
 */
export function topoPractice(def: () => Def): PracticeKind[] {
  function setupRun(g: Graph) {
    const setup = [loadCall(g)];
    const watch: OpCall[] = [['run']];
    const t = new Timeline(def(), defaults, 1, [...setup, ...watch]);
    const r: TopoRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { setup, watch, r };
  }
  const intro =
    'Run topological sort by DFS on this graph: the outer loop and every adjacency list go in name order, and each vertex goes on the front of L as it finishes.';
  const dag = (rng: Rng) => shuffledDag(rng, rng.int(5, 7), 0.2);

  return [
    {
      id: 'order',
      title: 'What order comes out?',
      make(rng) {
        const g = dag(rng);
        const { setup, watch, r } = setupRun(g);
        return {
          prompt: `${intro} Type L, front first.`,
          setup,
          answer: { kind: 'sequence', value: r.order },
          explain: `Each vertex goes on the front when it finishes, so L lists the vertices by decreasing finish time: ${r.order.map((v) => `${v} (${r.f[v]})`).join(', ')}.${r.roots.length > 1 ? ` The trees start at ${r.roots.join(', ')}; a later tree finishes later, so it lands in front.` : ''}`,
          watch,
        };
      },
    },
    {
      id: 'first-in',
      title: 'Which goes in first?',
      make(rng) {
        const g = dag(rng);
        const { setup, watch, r } = setupRun(g);
        const first = r.order.at(-1)!;
        const others = shuffle(
          rng,
          g.vertices.filter((v) => v !== first),
        ).slice(0, 3);
        const options = shuffle(rng, [first, ...others]);
        return {
          prompt: `${intro} Which vertex is put into L first?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(first) },
          explain: `The first vertex into L is the first to finish: ${first}, with ${first}.f = ${r.f[first]}. The search goes down from ${r.roots[0]} until it reaches a vertex with nowhere new to go. It ends up at the back of L, since everything else goes in front of it.`,
          watch,
        };
      },
    },
    {
      id: 'back-edge',
      title: 'Is there a cycle?',
      make(rng) {
        const g = rng.int(0, 2) === 0 ? dag(rng) : dagWithCycle(rng, rng.int(5, 7));
        const { setup, watch, r } = setupRun(g);
        const none = 'None: the graph is a DAG';
        const first = r.backs[0]?.replace('-', '>');
        const arcs = g.edges.map((e) => `${e.u}>${e.v}`);
        const wrong = shuffle(
          rng,
          arcs.filter((a) => a !== first),
        ).slice(0, first ? 2 : 3);
        const options = [none, ...shuffle(rng, [...(first ? [first] : []), ...wrong])];
        const correct = first ? options.indexOf(first) : 0;
        const cycle = r.cycle ? [...r.cycle, r.cycle[0]].join(' → ') : '';
        return {
          prompt: `${intro} Which back edge stops the sort, if any?`,
          setup,
          answer: { kind: 'choice', options, correct },
          explain: first
            ? `${code(first)} reaches ${first.split('>')[1]} while it is still gray, an ancestor of ${first.split('>')[0]}. It closes the cycle ${cycle}, so there is no topological order.`
            : `DFS never meets a gray vertex, so there is no back edge and no cycle. L = ${r.order.join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'finish-time',
      title: 'Finish time',
      make(rng) {
        const g = dag(rng);
        const { setup, watch, r } = setupRun(g);
        const v = g.vertices[rng.int(0, g.vertices.length - 1)]!;
        const f = r.f[v]!;
        const pos = r.order.indexOf(v);
        return {
          prompt: `${intro} What is ${code(`${v}.f`)}, the time ${v} finishes?`,
          setup,
          answer: { kind: 'number', value: f },
          explain: `${v} is discovered at time ${r.d[v]} and finishes at ${f}. ${pos === 0 ? `Nothing finishes later, so ${v} is at the front of L.` : pos === 1 ? `The one vertex in front of it in L, ${r.order[0]}, finishes later.` : `The ${pos} vertices in front of it in L (${r.order.slice(0, pos).join(', ')}) all finish later.`}`,
          watch,
        };
      },
    },
  ];
}
