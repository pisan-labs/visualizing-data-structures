import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { listWords, type Graph } from '../_graph/graph';
import { loadCall, randomGraph, randomTree } from '../_graph/presets';
import { blocks, rootInMiddle } from './graphs';
import {
  defaults,
  type BridgesExtra,
  type BridgesRun,
  type BridgesSettings,
  type BridgesState,
} from './model';

type Def = VizDef<BridgesState, BridgesSettings, BridgesExtra>;

const code = (s: string) => `\`${s}\``;

/**
 * Practice for cut vertices and bridges. Every answer comes from running the model: cut
 * vertices, bridges and low values are read from the run's last step.
 */
export function bridgesPractice(def: () => Def): PracticeKind[] {
  function pick(rng: Rng): Graph {
    const n = rng.int(6, 8);
    switch (rng.int(0, 3)) {
      case 0:
        return blocks(rng, n);
      case 1:
        return rootInMiddle(n);
      case 2:
        return randomTree(rng, n);
      default:
        return randomGraph(rng, n, { density: 0.15 });
    }
  }
  function setupRun(g: Graph) {
    const setup = [loadCall(g)];
    const watch: OpCall[] = [['run']];
    const t = new Timeline(def(), defaults, 1, [...setup, ...watch]);
    const r: BridgesRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { setup, watch, r };
  }
  const intro = 'Run the low-link DFS from A, with every adjacency list in name order.';

  return [
    {
      id: 'cuts',
      title: 'Which vertices are cut vertices?',
      make(rng) {
        for (;;) {
          const g = pick(rng);
          const { setup, watch, r } = setupRun(g);
          if (r.cuts.length === 0) continue;
          return {
            prompt:
              'Type every cut vertex of this graph in name order: the vertices whose removal splits it into more pieces.',
            setup,
            answer: { kind: 'sequence', value: r.cuts },
            explain: `${listWords(r.cuts)}. ${r.cuts.includes('A') ? `A is the DFS root with ${r.kids['A']} children, which is why it counts. ` : ''}Each other cut vertex u has a child v with v.low ≥ u.d: nothing below v climbs above u.`,
            watch,
          };
        }
      },
    },
    {
      id: 'bridges',
      title: 'How many bridges?',
      make(rng) {
        const g = pick(rng);
        const { setup, watch, r } = setupRun(g);
        const n = r.bridges.length;
        return {
          prompt:
            'How many bridges does this graph have? A bridge is an edge whose removal splits the graph.',
          setup,
          answer: { kind: 'number', value: n },
          explain:
            n === 0
              ? 'None: every edge is on a cycle.'
              : `${n}: ${listWords(r.bridges)}. For each tree edge u-v that is a bridge, v.low > u.d. An edge on a cycle is never a bridge, and a back edge never is either.`,
          watch,
        };
      },
    },
    {
      id: 'low',
      title: 'Low values',
      make(rng) {
        const g = pick(rng);
        const { setup, watch, r } = setupRun(g);
        const v = g.vertices[rng.int(1, g.vertices.length - 1)]!;
        return {
          prompt: `${intro} What is ${code(`${v}.low`)}?`,
          setup,
          answer: { kind: 'number', value: r.low[v]! },
          explain:
            r.low[v] === r.d[v]
              ? `${v}.d = ${r.d[v]}, and nothing in ${v}'s subtree has a back edge above ${v}, so ${v}.low = ${v}.d = ${r.d[v]}.`
              : `${v}.d = ${r.d[v]}, but going down from ${v} and along one back edge reaches a vertex discovered at time ${r.low[v]}, so ${v}.low = ${r.low[v]}.`,
          watch,
        };
      },
    },
    {
      id: 'root',
      title: 'The root rule',
      make(rng) {
        const g = rng.int(0, 1) ? rootInMiddle(rng.int(5, 8)) : pick(rng);
        const { setup, watch, r } = setupRun(g);
        const kids = r.kids['A']!;
        const yes = r.cuts.includes('A');
        return {
          prompt: `${intro} Is A, the root of the DFS tree, a cut vertex?`,
          setup,
          answer: { kind: 'choice', options: ['Yes', 'No'], correct: yes ? 0 : 1 },
          explain: yes
            ? `Yes. A has ${kids} DFS children. An undirected DFS has no cross edges, so their subtrees meet only at A, and removing A splits them.`
            : `No. A has ${kids === 1 ? 'one DFS child' : `${kids} DFS children`}, and everything else hangs below it in one subtree, so removing A leaves that subtree in one piece. The low test does not apply to the root: every child has low ≥ A.d.`,
          watch,
        };
      },
    },
  ];
}
