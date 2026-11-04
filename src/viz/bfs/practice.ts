import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { inNeighbours, listWords, type Graph } from '../_graph/graph';
import { loadCall, randomGraph, shuffle } from '../_graph/presets';
import { defaults, type BfsExtra, type BfsRun, type BfsSettings, type BfsState } from './model';

type Def = VizDef<BfsState, BfsSettings, BfsExtra>;
type BfsStep = Step<BfsState, BfsExtra>;

const code = (s: string) => `\`${s}\``;

/** A connected graph of 6 to 8 vertices, sometimes directed. */
function practiceGraph(rng: Rng, directed: boolean): Graph {
  return randomGraph(rng, rng.int(6, 8), { density: directed ? 0.12 : 0.22, directed });
}

/** The path from s to v, following π back from v. */
export function treePath(r: BfsRun, v: string): string[] {
  const path = [v];
  while (r.pi[path[0]!]) path.unshift(r.pi[path[0]!]!);
  return path;
}

/**
 * Practice for BFS. Every answer comes from running the model: the order, distances and
 * parents are read from the run's last step, and the queue from the step where a vertex turns
 * black.
 */
export function bfsPractice(def: () => Def): PracticeKind[] {
  const runSteps = (setup: OpCall[], s: string): BfsStep[] => {
    const t = new Timeline(def(), defaults, 1, [...setup, ['run', s]]);
    return t.entries.at(-1)!.steps;
  };
  const finalRun = (steps: BfsStep[]) => steps.at(-1)!.extra!.run!;

  /** A graph, a start vertex, and the run from it. */
  function setupRun(rng: Rng, directed = rng.int(0, 3) === 0) {
    const g = practiceGraph(rng, directed);
    const s = rng.int(0, 2) === 0 ? g.vertices[rng.int(0, g.vertices.length - 1)]! : 'A';
    const setup = [loadCall(g)];
    const steps = runSteps(setup, s);
    return { g, s, setup, steps, r: finalRun(steps), watch: [['run', s]] as OpCall[] };
  }
  const intro = (g: Graph, s: string) =>
    `Run BFS from ${s} on this ${g.directed ? 'directed ' : ''}graph. Neighbours are taken in name order.`;

  return [
    {
      id: 'order',
      title: 'In what order?',
      make(rng) {
        for (;;) {
          const { g, s, setup, r, watch } = setupRun(rng);
          if (r.order.length < 4) continue;
          return {
            prompt: `${intro(g, s)} Type the vertices in the order they leave the queue.`,
            setup,
            answer: { kind: 'sequence', value: r.order },
            explain: `The queue is first in, first out, so vertices leave in the order they were found: all at distance 1, then all at distance 2, and so on. ${r.order.join(', ')}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'distance',
      title: 'How far?',
      make(rng) {
        for (;;) {
          const { g, s, setup, r, watch } = setupRun(rng);
          const far = g.vertices.filter((v) => (r.d[v] ?? 0) >= 2);
          if (far.length === 0) continue;
          const v = far[rng.int(0, far.length - 1)]!;
          const d = r.d[v]!;
          return {
            prompt: `${intro(g, s)} What is ${code(`${v}.d`)}?`,
            setup,
            answer: { kind: 'number', value: d },
            explain: `${v} is ${d} edges from ${s}: one shortest path is ${treePath(r, v).join(' → ')}, the path back along π. BFS finds every vertex at distance ${d - 1} before any at distance ${d}, so no shorter path exists.`,
            watch,
          };
        }
      },
    },
    {
      id: 'queue',
      title: 'What is in the queue?',
      make(rng) {
        for (;;) {
          const { g, s, setup, steps, r, watch } = setupRun(rng, false);
          // The queue at the moment each vertex turns black.
          const done = steps.filter((st) => st.lines.includes('black'));
          const options = done.filter((st) => st.extra!.run!.queue.length >= 2);
          if (options.length === 0 || r.order.length < 4) continue;
          const st = options[rng.int(0, options.length - 1)]!;
          const u = st.extra!.run!.u!;
          const q = st.extra!.run!.queue;
          return {
            prompt: `${intro(g, s)} Right after ${u} turns black, what is in the queue? Type it front to back.`,
            setup,
            answer: { kind: 'sequence', value: q },
            explain: `By then ${listWords(st.extra!.run!.order)} ${st.extra!.run!.order.length === 1 ? 'has' : 'have'} left the queue, and every vertex they discovered waits behind the ones found before it: ${q.join(', ')}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'parent',
      title: 'Who found it?',
      make(rng) {
        for (;;) {
          const { g, s, setup, r, watch } = setupRun(rng);
          // A vertex with at least two discovered neighbours it could have been found from.
          const candidates = g.vertices.filter((v) => {
            if (v === s || r.pi[v] === null) return false;
            return inNeighbours(g, v).filter((x) => r.d[x] !== null).length >= 2;
          });
          if (candidates.length === 0) continue;
          const v = candidates[rng.int(0, candidates.length - 1)]!;
          const p = r.pi[v]!;
          const from = inNeighbours(g, v).filter((x) => r.d[x] !== null);
          const others = shuffle(
            rng,
            from.filter((x) => x !== p),
          ).slice(0, 3);
          const options = shuffle(rng, [p, ...others]);
          return {
            prompt: `${intro(g, s)} What is ${code(`${v}.π`)}, the vertex ${v} is discovered from?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(p) },
            explain: `${v} is discovered by the first of ${listWords(from)} to leave the queue${g.directed ? ' with an edge into it' : ''}. That is ${p}, at distance ${r.d[p]}, so ${v}.d = ${r.d[v]}.`,
            watch,
          };
        }
      },
    },
  ];
}
