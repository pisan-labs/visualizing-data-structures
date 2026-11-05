import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { listWords, type Graph } from '../_graph/graph';
import { loadCall, randomGraph, shuffle } from '../_graph/presets';
import { randomBipartite, treePlusOdd } from './graphs';
import {
  defaults,
  sideList,
  type BipExtra,
  type BipRun,
  type BipSettings,
  type BipState,
} from './model';

type Def = VizDef<BipState, BipSettings, BipExtra>;

/** A mix: bipartite graphs, trees with one odd cycle, and plain random graphs. */
function practiceGraph(rng: Rng, kind: 'any' | 'yes' | 'no' = 'any'): Graph {
  const n = rng.int(6, 8);
  if (kind === 'yes') return randomBipartite(rng, n, 0.4);
  if (kind === 'no')
    return rng.int(0, 1) ? treePlusOdd(rng, n) : randomGraph(rng, n, { density: 0.2 });
  const pick = rng.int(0, 2);
  return pick === 0
    ? randomBipartite(rng, n, 0.4)
    : pick === 1
      ? treePlusOdd(rng, n)
      : randomGraph(rng, n, { density: 0.15 });
}

const cycleText = (c: string[]) => [...c, c[0]].join(' → ');

/**
 * Practice for the bipartite check. Every answer comes from running the model (with BFS, the
 * default): the verdict, the sides, the clashing edge and the odd cycle are read from the
 * run's last step.
 */
export function bipartitePractice(def: () => Def): PracticeKind[] {
  const runOf = (setup: OpCall[]): BipRun => {
    const t = new Timeline(def(), defaults, 1, [...setup, ['run']]);
    return t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
  };
  const setupRun = (rng: Rng, kind: 'any' | 'yes' | 'no' = 'any') => {
    const g = practiceGraph(rng, kind);
    const setup = [loadCall(g)];
    return { g, setup, r: runOf(setup), watch: [['run']] as OpCall[] };
  };

  return [
    {
      id: 'verdict',
      title: 'Bipartite or not?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          if (g.edges.length < 4) continue;
          const yes = r.verdict === 'yes';
          return {
            prompt:
              'Can the vertices of this graph be split into two sides so that every edge joins the two sides?',
            setup,
            answer: {
              kind: 'choice',
              options: ['Yes, it is bipartite', 'No'],
              correct: yes ? 0 : 1,
            },
            explain: yes
              ? `Yes. One split is ${listWords(sideList(g, r, 0))} on one side and ${listWords(sideList(g, r, 1))} on the other. Every edge crosses.`
              : `No. The cycle ${cycleText(r.cycle!)} has ${r.cycle!.length} edges. Around a cycle the sides must alternate, and an odd cycle cannot.`,
            watch,
          };
        }
      },
    },
    {
      id: 'side',
      title: 'Which side?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng, 'yes');
          const rootOf = (v: string): string => (r.pi[v] ? rootOf(r.pi[v]!) : v);
          // Vertices in A's piece, found from A by the search.
          const reached = g.vertices.filter((v) => v !== 'A' && rootOf(v) === 'A');
          if (r.verdict !== 'yes' || reached.length < 3) continue;
          const v = reached[rng.int(0, reached.length - 1)]!;
          const path = [v];
          while (r.pi[path[0]!]) path.unshift(r.pi[path[0]!]!);
          const k = r.side[v]!;
          return {
            prompt: `The check puts A on side 0. Which side does ${v} end up on?`,
            setup,
            answer: { kind: 'choice', options: ['Side 0, with A', 'Side 1'], correct: k },
            explain: `Each step along an edge switches sides. ${v} is found along ${path.join(' → ')}, ${path.length - 1} ${path.length === 2 ? 'edge' : 'edges'} from A, so it is on side ${k}. Any path from A to ${v} has ${k === 0 ? 'an even' : 'an odd'} number of edges.`,
            watch,
          };
        }
      },
    },
    {
      id: 'clash',
      title: 'Where does it break?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng, 'no');
          if (r.verdict !== 'no' || g.edges.length < 4) continue;
          const { u, v } = r.clash!;
          const key = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
          const right = key(u, v);
          const others = shuffle(
            rng,
            g.edges.map((e) => `${e.u}-${e.v}`).filter((x) => x !== right),
          ).slice(0, 3);
          const options = shuffle(rng, [right, ...others]);
          return {
            prompt:
              'Check this graph with breadth-first search, starting at A, with neighbours in name order. At which edge does the check find two ends on the same side?',
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(right) },
            explain: `${u} and ${v} are both on side ${r.side[u]} when the search looks at ${right}. Up the tree from both ends, that edge closes the odd cycle ${cycleText(r.cycle!)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'cycle',
      title: 'How long is the odd cycle?',
      make(rng) {
        for (;;) {
          const { setup, r, watch } = setupRun(rng, 'no');
          if (r.verdict !== 'no') continue;
          const c = r.cycle!;
          return {
            prompt:
              'This graph is not bipartite. Check it with breadth-first search from A, with neighbours in name order. How many edges does the odd cycle it finds have?',
            setup,
            answer: { kind: 'number', value: c.length },
            explain: `The check stops at ${r.clash!.u}-${r.clash!.v}. Following π up from both ends to where they meet, plus that edge, gives ${cycleText(c)}: ${c.length} edges, an odd number, as it must be.`,
            watch,
          };
        }
      },
    },
  ];
}
