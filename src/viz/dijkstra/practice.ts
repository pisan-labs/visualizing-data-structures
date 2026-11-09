import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { loadCall, shuffle } from '../_graph/presets';
import { pathOf, pathWords } from '../_paths/kit';
import { randomWeighted } from '../_paths/presets';
import {
  defaults,
  type DijkstraExtra,
  type DijkstraRun,
  type DijkstraSettings,
  type DijkstraState,
} from './model';

type Def = VizDef<DijkstraState, DijkstraSettings, DijkstraExtra>;
type DStep = Step<DijkstraState, DijkstraExtra>;

/** The vertices just before x on some shortest path: more than one means π could be either. */
function bestWaysIn(g: Graph, d: Record<string, number | null>, x: string): string[] {
  const arcs = g.edges.flatMap((e) => (g.directed ? [e] : [e, { u: e.v, v: e.u, w: e.w }]));
  return arcs
    .filter((e) => e.v === x && typeof d[e.u] === 'number' && d[e.u]! + e.w === d[x])
    .map((e) => e.u);
}

const code = (s: string) => `\`${s}\``;

/** The run as it stands right after vertex `u` is settled and all its edges are relaxed. */
export function afterSettling(steps: DStep[], u: string): DijkstraRun {
  const runs = steps.map((st) => st.extra!.run!);
  const at = steps.findIndex((st) => st.lines.includes('addS') && st.extra!.run!.S.at(-1) === u);
  // The next extraction (or the end) comes right after u's last relaxation.
  const next = steps.findIndex((st, i) => i > at && st.lines.includes('extract'));
  return runs[next === -1 ? runs.length - 1 : next - 1]!;
}

/**
 * Practice for Dijkstra. Every answer comes from running the model: the settle order, the
 * distances and the parents are read from its steps.
 */
export function dijkstraPractice(def: () => Def): PracticeKind[] {
  const runSteps = (setup: OpCall[], s: string): DStep[] => {
    const t = new Timeline(def(), defaults, 1, [...setup, ['run', s]]);
    return t.entries.at(-1)!.steps;
  };

  /** A weighted graph of 6 to 8 vertices that A reaches, and the run from A. */
  function setupRun(rng: Rng) {
    const directed = rng.int(0, 1) === 1;
    const g = randomWeighted(rng, rng.int(6, 8), { directed, density: directed ? 0.15 : 0.2 });
    const setup = [loadCall(g)];
    const steps = runSteps(setup, 'A');
    const r = steps.at(-1)!.extra!.run!;
    return { g, setup, steps, r, watch: [['run', 'A']] as OpCall[] };
  }
  const intro = (g: Graph) =>
    `Run Dijkstra from A on this ${g.directed ? 'directed' : 'undirected'} graph. Ties go to the name that comes first.`;

  return [
    {
      id: 'next',
      title: 'Which vertex is next?',
      make(rng) {
        for (;;) {
          const { g, setup, steps, r, watch } = setupRun(rng);
          // A moment with at least two vertices waiting at a finite key.
          const moments = r.S.slice(1, -1).filter((u) => {
            const at = afterSettling(steps, u);
            return at.Q.filter((q) => q.k !== null).length >= 2;
          });
          if (moments.length === 0) continue;
          const u = moments[rng.int(0, moments.length - 1)]!;
          const at = afterSettling(steps, u);
          const next = r.S[r.S.indexOf(u) + 1]!;
          const waiting = at.Q.filter((q) => q.k !== null);
          const others = shuffle(
            rng,
            waiting.map((q) => q.v).filter((v) => v !== next),
          ).slice(0, 3);
          const options = shuffle(rng, [next, ...others]);
          return {
            prompt: `${intro(g)} Right after ${u} is settled and its edges are relaxed, which vertex does ${code('EXTRACT-MIN')} settle next?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(next) },
            explain: `By then ${r.S.slice(0, r.S.indexOf(u) + 1).join(', ')} are settled, and Q holds ${waiting.map((q) => `${q.v} at ${q.k}`).join(', ')}. The smallest key is ${next}'s, ${at.d[next]}.`,
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
          const { g, setup, r, watch } = setupRun(rng);
          // A vertex whose shortest path has at least two edges.
          // A path with a tie along it would let another path count as shortest too.
          const far = g.vertices.filter(
            (v) =>
              (pathOf(r.pi, v)?.length ?? 0) >= 3 &&
              pathOf(r.pi, v)!
                .slice(1)
                .every((x) => bestWaysIn(g, r.d, x).length === 1),
          );
          if (far.length === 0) continue;
          const v = far[rng.int(0, far.length - 1)]!;
          const p = pathOf(r.pi, v)!;
          return {
            prompt: `${intro(g)} What is ${code(`${v}.d`)} when it finishes?`,
            setup,
            answer: { kind: 'number', value: r.d[v]! },
            explain: `The lightest path from A to ${v} is ${pathWords(p)}, with total weight ${r.d[v]}. Dijkstra settles ${v} at that distance and never changes it.`,
            watch,
          };
        }
      },
    },
    {
      id: 'path',
      title: 'Which path?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          // A path with a tie along it would let another path count as shortest too.
          const far = g.vertices.filter(
            (v) =>
              (pathOf(r.pi, v)?.length ?? 0) >= 3 &&
              pathOf(r.pi, v)!
                .slice(1)
                .every((x) => bestWaysIn(g, r.d, x).length === 1),
          );
          if (far.length === 0) continue;
          const v = far[rng.int(0, far.length - 1)]!;
          const p = pathOf(r.pi, v)!;
          return {
            prompt: `${intro(g)} Type the shortest path from A to ${v} that its π pointers give, starting with A.`,
            setup,
            answer: { kind: 'sequence', value: p },
            explain: `Follow π back from ${v}: ${[...p].reverse().join(' ← ')}. Read forwards, that is ${pathWords(p)}, total ${r.d[v]}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'key',
      title: 'What is the key?',
      make(rng) {
        for (;;) {
          const { g, setup, steps, r, watch } = setupRun(rng);
          // A vertex whose key drops at least twice, asked about between two of the drops.
          const drops = new Map<string, string[]>();
          for (const st of steps) {
            if (!st.lines.includes('dec')) continue;
            const run = st.extra!.run!;
            drops.set(run.v!, [...(drops.get(run.v!) ?? []), run.u!]);
          }
          const choices = [...drops].filter(([, us]) => us.length >= 2);
          if (choices.length === 0) continue;
          const [v, us] = choices[rng.int(0, choices.length - 1)]!;
          const u = us[rng.int(0, us.length - 2)]!;
          const at = afterSettling(steps, u);
          const key = at.d[v]!;
          return {
            prompt: `${intro(g)} Right after ${u} is settled and its edges are relaxed, what is ${v}'s key in Q?`,
            setup,
            answer: { kind: 'number', value: key },
            explain: `${v}'s key is its d so far: the lightest path to ${v} through settled vertices only. Right after ${u}, that is ${pathWords(pathOf(at.pi, v)!)}, total ${key}. It drops again later, to ${r.d[v]} in the end.`,
            watch,
          };
        }
      },
    },
  ];
}
