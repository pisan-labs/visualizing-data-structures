import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { inNeighbours, type Graph } from '../_graph/graph';
import { loadCall, shuffle } from '../_graph/presets';
import { pathOf, pathWords } from '../_paths/kit';
import { randomWeightedDag } from '../_paths/presets';
import {
  criticalEnd,
  defaults,
  type DagExtra,
  type DagRun,
  type DagSettings,
  type DagState,
} from './model';

type Def = VizDef<DagState, DagSettings, DagExtra>;

const code = (s: string) => `\`${s}\``;

/** The vertices just before x on some shortest path: more than one means π could be either. */
function bestWaysIn(g: Graph, d: Record<string, number | null>, x: string): string[] {
  const arcs = g.edges.flatMap((e) => (g.directed ? [e] : [e, { u: e.v, v: e.u, w: e.w }]));
  return arcs
    .filter((e) => e.v === x && typeof d[e.u] === 'number' && d[e.u]! + e.w === d[x])
    .map((e) => e.u);
}

/**
 * Practice for DAG shortest paths. Every answer comes from running the model: the order, the
 * distances, the parents and the critical path are read from its last step.
 */
export function dagPractice(def: () => Def): PracticeKind[] {
  const finalRun = (setup: OpCall[], settings: Settings = defaults): DagRun => {
    const t = new Timeline(def(), settings as DagSettings, 1, [...setup, ['run', 'A']]);
    return t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
  };

  /** A DAG of 5 to 7 vertices that A reaches, with the other names shuffled. */
  function setupRun(rng: Rng, settings: Settings = defaults) {
    const g = randomWeightedDag(rng, rng.int(5, 7), { density: 0.3, lo: 1, hi: 9 });
    const setup = [loadCall(g)];
    return { g, setup, r: finalRun(setup, settings), watch: [['run', 'A']] as OpCall[] };
  }
  const intro =
    'Run DAG shortest paths from A on this graph. The depth-first search takes vertices, and neighbours, in name order.';

  return [
    {
      id: 'order',
      title: 'In what order?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng);
        return {
          prompt: `${intro} Type the topological order it relaxes in, the list L, from front to back.`,
          setup,
          answer: { kind: 'sequence', value: r.order },
          explain: `Each vertex goes to the front of L when it finishes, so the last to finish comes first. L = ${r.order.join(', ')}: every edge goes from left to right.`,
          watch,
        };
      },
    },
    {
      id: 'distance',
      title: 'How far?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          const far = g.vertices.filter((v) => (pathOf(r.pi, v)?.length ?? 0) >= 3);
          if (far.length === 0) continue;
          const v = far[rng.int(0, far.length - 1)]!;
          return {
            prompt: `${intro} What is ${code(`${v}.d`)} at the end?`,
            setup,
            answer: { kind: 'number', value: r.d[v]! },
            explain: `The lightest path is ${pathWords(pathOf(r.pi, v)!)}, total ${r.d[v]}. By the time ${v}'s turn in L comes, every edge into it has been relaxed.`,
            watch,
          };
        }
      },
    },
    {
      id: 'parent',
      title: 'Which way in?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          // A vertex with at least two reached vertices that have an edge into it.
          // Two ways in with the same total would make two answers right: leave those out.
          const choices = g.vertices.filter(
            (v) =>
              v !== 'A' &&
              inNeighbours(g, v).filter((x) => r.d[x] !== null).length >= 2 &&
              bestWaysIn(g, r.d, v).length === 1,
          );
          if (choices.length === 0) continue;
          const v = choices[rng.int(0, choices.length - 1)]!;
          const p = r.pi[v]!;
          const from = inNeighbours(g, v).filter((x) => r.d[x] !== null);
          const options = shuffle(rng, from).slice(0, 4);
          if (!options.includes(p)) options[0] = p;
          const shown = shuffle(rng, options);
          return {
            prompt: `${intro} What is ${code(`${v}.π`)}, the vertex just before ${v} on its shortest path?`,
            setup,
            answer: { kind: 'choice', options: shown, correct: shown.indexOf(p) },
            explain: `Of the edges into ${v}, the one from ${p} gives the smallest total: d[${p}] + w(${p}, ${v}) = ${r.d[v]}. The path is ${pathWords(pathOf(r.pi, v)!)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'critical',
      title: 'How long is the critical path?',
      make(rng) {
        const settings: Settings = { ...defaults, goal: 'longest' };
        const { g, setup, r, watch } = setupRun(rng, settings);
        const end = criticalEnd(g, r)!;
        return {
          prompt: `Each edge is a task that takes as many days as its weight, and a task can start once every task before it is done. Starting at A, how many days does the longest path, the critical path, take?`,
          setup,
          settings,
          answer: { kind: 'number', value: r.d[end]! },
          explain: `Longest paths keep the larger total at each step. The longest of all ends at ${end}: ${pathWords(pathOf(r.pi, end)!)}, ${r.d[end]} days.`,
          watch,
        };
      },
    },
  ];
}
