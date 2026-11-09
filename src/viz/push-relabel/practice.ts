import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import { listWords } from '../_graph/graph';
import { arrow, residual, type Network } from '../_flow/network';
import { loadText, randomNetwork } from '../_flow/presets';
import { defaults, type PrExtra, type PrRun, type PrSettings, type PrState } from './model';

type Def = VizDef<PrState, PrSettings, PrExtra>;
type PrStep = Step<PrState, PrExtra>;

/**
 * Practice for push-relabel. Every answer comes from running the model: the preflow's queue, a
 * relabel's new height, a push's amount and the flow value are read from its steps.
 */
export function pushRelabelPractice(def: () => Def): PracticeKind[] {
  const runOn = (setup: OpCall[], settings: Settings = defaults) => {
    const t = new Timeline(def(), settings as PrSettings, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    return { steps, r: steps.at(-1)!.extra!.run! };
  };

  /** A network with 5 or 6 vertices whose run needs at least `ops` pushes and relabels. */
  function setupRun(rng: Rng, ops = 4) {
    for (;;) {
      const net = randomNetwork(rng, rng.int(5, 6), { density: 0.3 });
      const setup = [loadText(net)];
      const { steps, r } = runOn(setup);
      if (r.pushes + r.relabels < ops) continue;
      return { net, setup, steps, r, watch: [['run']] as OpCall[] };
    }
  }
  const runOf = (s: PrStep): PrRun => s.extra!.run!;
  const pick = <T>(rng: Rng, xs: T[]): T => xs[rng.int(0, xs.length - 1)]!;

  return [
    {
      id: 'preflow',
      title: 'Who overflows first?',
      make(rng) {
        for (;;) {
          const { net, setup, steps, watch } = setupRun(rng);
          // The step after INITIALIZE-PREFLOW: every arc out of s full, the queue made.
          const after = steps.find((s) => s.lines.includes('list'));
          if (!after) continue;
          const q = runOf(after).list;
          if (q.length < 2) continue;
          return {
            prompt: `INITIALIZE-PREFLOW fills every arc out of ${net.s}. With the FIFO rule, the vertices that now overflow join the queue in the order of ${net.s}'s arcs, by name. Type the queue, front first.`,
            setup,
            answer: { kind: 'sequence', value: q },
            explain: `The arcs out of ${net.s} go to ${listWords(net.graph.edges.filter((e) => e.u === net.s).map((e) => e.v))}. Each one is filled, so each vertex at its end gets that much excess, except ${net.t}, which never joins the queue. The queue is ${q.join(', ')}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'relabel',
      title: 'How high does it rise?',
      make(rng) {
        for (;;) {
          const { net, setup, steps, watch } = setupRun(rng, 6);
          // A relabel that lifts a vertex by more than one level, if there is one.
          const lifts = steps
            .map((s, i) => ({ s, before: steps[i - 1] }))
            .filter(({ s }) => s.lines.includes('rl') && s.level === 2);
          if (!lifts.length) continue;
          const jumpy = lifts.filter(({ s, before }) => {
            const r = runOf(s);
            const u = r.u!;
            return before && r.h[u]! - runOf(before).h[u]! > 1;
          });
          const { s, before } = pick(rng, jumpy.length ? jumpy : lifts);
          if (!before) continue;
          const r0 = runOf(before);
          const u = runOf(s).u!;
          const res = neighbours(net, r0, u);
          return {
            prompt: `Partway through, ${u} overflows at height ${r0.h[u]} and has no admissible arc. Its residual arcs go to ${listWords(res.map((v) => `${v} (height ${r0.h[v]})`))}. What height does RELABEL(${u}) give it?`,
            setup,
            answer: { kind: 'number', value: runOf(s).h[u]! },
            explain: `RELABEL lifts ${u} to one above its lowest residual neighbour: 1 + ${Math.min(...res.map((v) => r0.h[v]!))} = ${runOf(s).h[u]}. Then at least one arc out of ${u} goes exactly one level down, so ${u} can push again.`,
            watch,
          };
        }
      },
    },
    {
      id: 'push',
      title: 'How much does a push send?',
      make(rng) {
        for (;;) {
          const { net, setup, steps, watch } = setupRun(rng, 6);
          // Pushes after the preflow, with the state just before each.
          const pushes = steps
            .map((s, i) => ({ s, before: steps[i - 1] }))
            .filter(({ s, before }) => s.lines.includes('push') && before && runOf(s).arc);
          if (!pushes.length) continue;
          const { s, before } = pick(rng, pushes);
          const r0 = runOf(before!);
          const [u, v] = runOf(s).arc!;
          const room = residual(net, r0.flow, u, v);
          return {
            prompt: `Partway through, ${u} has excess ${r0.e[u]} at height ${r0.h[u]}, and ${arrow(u, v)} has room ${room} in the residual network, down to ${v} at height ${r0.h[v]}. How much does PUSH(${u}, ${v}) send?`,
            setup,
            answer: { kind: 'number', value: runOf(s).delta! },
            explain: `A push sends Δ = min(u.e, c_f(u, v)) = min(${r0.e[u]}, ${room}) = ${runOf(s).delta}. ${runOf(s).delta === room ? `That fills ${arrow(u, v)}: a saturating push.` : `That empties ${u}: a non-saturating push, and ${u} is done for now.`}`,
            watch,
          };
        }
      },
    },
    {
      id: 'value',
      title: 'How much reaches t?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng, 4);
        return {
          prompt:
            'Push-relabel runs to the end on this network. How much flow reaches t? Each arc shows 0/capacity.',
          setup,
          answer: { kind: 'number', value: r.e[r.t]! },
          explain: `When nothing overflows, the excess at t is the flow: ${r.e[r.t]}. It took ${r.pushes} pushes and ${r.relabels} relabels; whatever left s and could not reach t (${-r.e[r.s]! - r.e[r.t]!}) climbed back to s. The arcs out of S = {${r.side!.join(', ')}} are full and add up to the same.`,
          watch,
        };
      },
    },
  ];
}

/** u's residual neighbours, in name order, for a run's state. */
function neighbours(net: Network, r: PrRun, u: string): string[] {
  return net.graph.vertices.filter(
    (v) =>
      v !== u &&
      net.graph.edges.some((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u)) &&
      residual(net, r.flow, u, v) > 0,
  );
}
