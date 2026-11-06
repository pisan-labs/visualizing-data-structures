import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { keyOf } from '../_graph/graph';
import { arrow, cutArcs, pathText, setText, type Network } from '../_flow/network';
import { loadText, randomNetwork } from '../_flow/presets';
import { defaults, type MfExtra, type MfRun, type MfSettings, type MfState } from './model';

type Def = VizDef<MfState, MfSettings, MfExtra>;

/**
 * Practice for maximum flow. Every answer comes from running the model: the flow value, the
 * first augmenting path, the room left after it and the cut are read from its steps.
 */
export function maxFlowPractice(def: () => Def): PracticeKind[] {
  const runOn = (setup: OpCall[], settings: Settings = defaults) => {
    const t = new Timeline(def(), settings as MfSettings, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    return { steps, r: steps.at(-1)!.extra!.run! };
  };

  /** A network with 5 or 6 vertices whose flow needs at least `paths` augmenting paths. */
  function setupRun(rng: Rng, paths = 1, settings: Settings = defaults) {
    for (;;) {
      const net = randomNetwork(rng, rng.int(5, 6), { density: 0.3 });
      const setup = [loadText(net)];
      const { steps, r } = runOn(setup, settings);
      if (r.paths.length < paths) continue;
      return { net, setup, steps, r, watch: [['run']] as OpCall[] };
    }
  }
  /** The run as it stands right after the first push. */
  const afterFirst = (steps: { extra?: MfExtra }[]): MfRun =>
    steps.map((s) => s.extra!.run!).find((r) => r.paths.length === 1)!;

  return [
    {
      id: 'value',
      title: 'How much can flow?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng, 2);
        return {
          prompt:
            'What is the maximum flow from s to t in this network? Each arc shows 0/capacity.',
          setup,
          answer: { kind: 'number', value: r.value },
          explain: `The maximum flow is ${r.value}. Edmonds-Karp finds it in ${r.paths.length} paths: ${r.paths.map((a) => `${pathText(a.p)} (${a.b})`).join(', ')}. The cut with S = ${setText(r.side!)} has the same capacity, so no flow can do better.`,
          watch,
        };
      },
    },
    {
      id: 'first-path',
      title: 'Which path comes first?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng, 2);
        const first = r.paths[0]!;
        return {
          prompt:
            'Edmonds-Karp searches breadth-first and looks at neighbours in name order. Type the first augmenting path it finds, from s to t.',
          setup,
          answer: { kind: 'sequence', value: first.p },
          explain: `Breadth-first search finds ${pathText(first.p)}, a path with the fewest arcs; among those, name order breaks the tie, because each vertex's parent is the first vertex that reached it. Its bottleneck is ${first.b}.`,
          watch,
        };
      },
    },
    {
      id: 'room-left',
      title: 'How much room is left?',
      make(rng) {
        for (;;) {
          const { net, setup, steps, r, watch } = setupRun(rng, 2);
          const first = r.paths[0]!;
          const after = afterFirst(steps);
          // An arc on the first path that is not full afterwards, else the bottleneck arc.
          const arcs = first.p.slice(1).map((v, i) => ({ u: first.p[i]!, v }));
          const real = arcs.filter((a) => net.graph.edges.some((e) => e.u === a.u && e.v === a.v));
          if (real.length === 0) continue;
          const pick = real[rng.int(0, real.length - 1)]!;
          const cap = capacity(net, pick.u, pick.v);
          const left = cap - (after.flow[`${pick.u}-${pick.v}`] ?? 0);
          return {
            prompt: `Edmonds-Karp's first augmenting path is ${pathText(first.p)}. After it pushes its bottleneck, how much room is left on ${arrow(pick.u, pick.v)}?`,
            setup,
            answer: { kind: 'number', value: left },
            explain: `The bottleneck of that path is ${first.b}, the smallest capacity on it. ${arrow(pick.u, pick.v)} has capacity ${cap}, so ${cap} - ${first.b} = ${left} is left${left === 0 ? ': it is the bottleneck arc' : ''}. The residual network also gains ${arrow(pick.v, pick.u)} with ${first.b}, the flow that could be taken back.`,
            watch,
          };
        }
      },
    },
    {
      id: 'cut',
      title: 'Which arcs are cut?',
      make(rng) {
        for (;;) {
          const { net, setup, r, watch } = setupRun(rng, 2);
          const cut = cutArcs(net, r.side!);
          const right = cut.map((e) => arrow(e.u, e.v)).join(', ');
          // Wrong options: other sets of arcs with the same number of arcs, such as the arcs out of
          // s or into t, or the cut shifted by one vertex.
          const options = new Set<string>([right]);
          const tries = [
            net.graph.edges.filter((e) => e.u === net.s),
            net.graph.edges.filter((e) => e.v === net.t),
            ...net.graph.vertices
              .filter((v) => v !== net.s && v !== net.t)
              .map((v) =>
                cutArcs(
                  net,
                  r.side!.includes(v) ? r.side!.filter((x) => x !== v) : [...r.side!, v],
                ),
              ),
          ];
          for (const t of tries) {
            if (options.size >= 4) break;
            if (t.length) options.add(t.map((e) => arrow(e.u, e.v)).join(', '));
          }
          if (options.size < 2) continue;
          const list = shuffle(rng, [...options]);
          return {
            prompt:
              'After the maximum flow, which arcs cross the minimum cut that the last search finds?',
            setup,
            answer: { kind: 'choice', options: list, correct: list.indexOf(right) },
            explain: `The last search reaches S = ${setText(r.side!)}. The arcs from S to the rest are ${right}, capacity ${cut.reduce((n, e) => n + e.w, 0)}, which is the maximum flow ${r.value}. Every one of them is full.`,
            watch,
          };
        }
      },
    },
  ];
}

function capacity(net: Network, u: string, v: string): number {
  return net.graph.edges.find((e) => keyOf(e) === `${u}-${v}`)?.w ?? 0;
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
