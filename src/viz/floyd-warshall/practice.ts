import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { loadCall, shuffle } from '../_graph/presets';
import { randomWeighted } from '../_paths/presets';
import { defaults, type FwExtra, type FwRun, type FwSettings, type FwState } from './model';

type Def = VizDef<FwState, FwSettings, FwExtra>;
type FwStep = Step<FwState, FwExtra>;

const code = (s: string) => `\`${s}\``;

/** The matrices at the end of round k (0-based): the last step of that round. */
export function afterRound(steps: FwStep[], k: number): FwRun {
  const runs = steps.map((st) => st.extra!.run!);
  let at = -1;
  runs.forEach((r, x) => {
    if (r.k === k) at = x;
  });
  return runs[at]!;
}

/**
 * Practice for Floyd-Warshall. Every answer comes from running the model: the matrices after a
 * round and at the end, and the changes each round made, are read from its steps.
 */
export function floydPractice(def: () => Def): PracticeKind[] {
  /** A directed graph of 4 or 5 vertices that A reaches, and the run on it. */
  function setupRun(rng: Rng) {
    const g = randomWeighted(rng, rng.int(4, 5), { directed: true, density: 0.25 });
    const setup: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), defaults, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    return { g, setup, steps, r: steps.at(-1)!.extra!.run!, watch: [['run']] as OpCall[] };
  }
  const intro = 'Run Floyd-Warshall on this graph, with the vertices in name order as k.';

  return [
    {
      id: 'after-round',
      title: 'After a round',
      make(rng) {
        for (;;) {
          const { g, setup, steps, watch } = setupRun(rng);
          const V = g.vertices;
          const k = rng.int(0, 1);
          const before = k === 0 ? steps[0]!.extra!.run! : afterRound(steps, k - 1);
          const after = afterRound(steps, k);
          // A pair that this round improves: going through k is new.
          const pairs: [number, number][] = [];
          V.forEach((_, i) =>
            V.forEach((__, j) => {
              if (after.D[i]![j] !== before.D[i]![j]) pairs.push([i, j]);
            }),
          );
          if (pairs.length === 0) continue;
          const [i, j] = pairs[rng.int(0, pairs.length - 1)]!;
          const K = V[k]!;
          return {
            prompt: `${intro} What is ${code(`D[${V[i]}][${V[j]}]`)} right after round ${k + 1}, k = ${K}?`,
            setup,
            answer: { kind: 'number', value: after.D[i]![j]! },
            explain: `Before round ${k + 1}, D[${V[i]}][${V[j]}] = ${before.D[i]![j] ?? '∞'}. Through ${K}: D[${V[i]}][${K}] + D[${K}][${V[j]}] = ${before.D[i]![k]} + ${before.D[k]![j]} = ${after.D[i]![j]}, which is shorter.`,
            watch,
          };
        }
      },
    },
    {
      id: 'final',
      title: 'At the end',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          const V = g.vertices;
          // A pair whose shortest path needs at least one vertex in between.
          const pairs: [number, number][] = [];
          V.forEach((_, i) =>
            V.forEach((__, j) => {
              if (i !== j && r.D[i]![j] !== null && r.P[i]![j] !== V[i]) pairs.push([i, j]);
            }),
          );
          if (pairs.length === 0) continue;
          const [i, j] = pairs[rng.int(0, pairs.length - 1)]!;
          return {
            prompt: `${intro} What is ${code(`D[${V[i]}][${V[j]}]`)} at the end?`,
            setup,
            answer: { kind: 'number', value: r.D[i]![j]! },
            explain: `D[${V[i]}][${V[j]}] ends at ${r.D[i]![j]}, the weight of the shortest path from ${V[i]} to ${V[j]}. The vertex just before ${V[j]} on it is Π[${V[i]}][${V[j]}] = ${r.P[i]![j]}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'pred',
      title: 'The vertex before',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          const V = g.vertices;
          const pairs: [number, number][] = [];
          // The vertices x with D[i][x] + w(x, j) = D[i][j]: two of them would make two answers.
          const waysIn = (i: number, j: number) =>
            g.edges
              .flatMap((e) => (g.directed ? [e] : [e, { u: e.v, v: e.u, w: e.w }]))
              .filter((e) => {
                const x = V.indexOf(e.u);
                return (
                  e.v === V[j] && x !== j && r.D[i]![x] !== null && r.D[i]![x]! + e.w === r.D[i]![j]
                );
              }).length;
          V.forEach((_, i) =>
            V.forEach((__, j) => {
              if (i !== j && r.P[i]![j] !== null && r.P[i]![j] !== V[i] && waysIn(i, j) === 1)
                pairs.push([i, j]);
            }),
          );
          if (pairs.length === 0) continue;
          const [i, j] = pairs[rng.int(0, pairs.length - 1)]!;
          const p = r.P[i]![j]!;
          const others = shuffle(
            rng,
            V.filter((v) => v !== p && v !== V[j]),
          ).slice(0, 3);
          const options = shuffle(rng, [p, ...others]);
          return {
            prompt: `${intro} At the end, what is ${code(`Π[${V[i]}][${V[j]}]`)}, the vertex just before ${V[j]} on a shortest path from ${V[i]}?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(p) },
            explain: `The shortest path from ${V[i]} to ${V[j]} weighs ${r.D[i]![j]}, and it reaches ${V[j]} from ${p}. Each time a round improves D[i][j] through k, Π[i][j] takes Π[k][j], the vertex before j on the part from k.`,
            watch,
          };
        }
      },
    },
    {
      id: 'round-changes',
      title: 'How many changes?',
      make(rng) {
        const { g, setup, r, watch } = setupRun(rng);
        const k = rng.int(0, g.vertices.length - 1);
        const n = r.changes[k]!;
        return {
          prompt: `${intro} How many entries of D does round ${k + 1}, k = ${g.vertices[k]}, change?`,
          setup,
          answer: { kind: 'number', value: n },
          explain: `Round ${k + 1} changes ${n === 1 ? '1 entry' : `${n} entries`}: the pairs i, j whose path gets shorter by passing through ${g.vertices[k]}. The rounds change ${r.changes.join(', ')} in turn.`,
          watch,
        };
      },
    },
  ];
}
