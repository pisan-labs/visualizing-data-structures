import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { arrow, pathText, type Network } from '../_flow/network';
import { loadText, randomNetwork } from '../_flow/presets';
import { defaults, type McExtra, type McRun, type McSettings, type McState } from './model';

type Def = VizDef<McState, McSettings, McExtra>;

/** Every simple path from s to t in the network itself, with its cost per unit. */
function simplePaths(net: Network): { p: string[]; cost: number }[] {
  const out: { p: string[]; cost: number }[] = [];
  const walk = (p: string[], cost: number) => {
    const u = p.at(-1)!;
    if (u === net.t) {
      out.push({ p: [...p], cost });
      return;
    }
    for (const e of net.graph.edges)
      if (e.u === u && !p.includes(e.v)) walk([...p, e.v], cost + (net.cost[`${e.u}-${e.v}`] ?? 1));
  };
  if (net.s && net.t) walk([net.s], 0);
  return out;
}

/**
 * Practice for min-cost flow. Every answer comes from running the model: the total cost, the
 * first path, the cost of k units and the cost of a reverse arc are read from its steps.
 */
export function minCostPractice(def: () => Def): PracticeKind[] {
  const runOn = (setup: OpCall[], settings: Settings = defaults) => {
    const t = new Timeline(def(), settings as McSettings, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    return { steps, r: steps.at(-1)!.extra!.run! as McRun };
  };
  /** A network with 5 or 6 vertices whose min-cost flow takes at least `paths` paths. */
  function setupRun(rng: Rng, paths = 2) {
    for (;;) {
      const net = randomNetwork(rng, rng.int(5, 6), { density: 0.3, maxCap: 5 });
      const setup = [loadText(net, true)];
      const { steps, r } = runOn(setup);
      if (r.paths.length < paths) continue;
      return { net, setup, steps, r, watch: [['run']] as OpCall[] };
    }
  }

  return [
    {
      id: 'total-cost',
      title: 'What does it all cost?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng);
        return {
          prompt:
            'Send as much flow as possible from s to t at the least total cost. Each arc reads 0/capacity $cost per unit. What is the total cost?',
          setup,
          answer: { kind: 'number', value: r.cost },
          explain: `The maximum flow is ${r.value}. The cheapest paths, in order, send ${r.paths.map((a) => `${a.b} at ${a.unit}`).join(', ')}, so the cost is ${r.paths.map((a) => `${a.b} × ${a.unit}`).join(' + ')} = ${r.cost}.`,
          watch,
        };
      },
    },
    {
      id: 'first-path',
      title: 'Which path is cheapest?',
      make(rng) {
        for (;;) {
          const { net, setup, r, watch } = setupRun(rng);
          const all = simplePaths(net).sort((a, b) => a.cost - b.cost);
          // Only networks whose cheapest path is the only one at that price.
          if (all.length < 2 || all[0]!.cost === all[1]!.cost) continue;
          const first = r.paths[0]!;
          return {
            prompt:
              'Successive shortest paths starts with no flow. Type the first path it pushes flow along, from s to t.',
            setup,
            answer: { kind: 'sequence', value: first.p },
            explain: `With no flow yet, the residual network is the network itself, so the first path is simply the cheapest: ${pathText(first.p)} at ${first.unit} per unit. The next cheapest costs ${all[1]!.cost}. It pushes ${first.b}, all the room that path has.`,
            watch,
          };
        }
      },
    },
    {
      id: 'cost-of-k',
      title: 'What do k units cost?',
      make(rng) {
        for (;;) {
          const { setup, r } = setupRun(rng);
          if (r.value < 2) continue;
          const first = r.paths[0]!.b;
          // More than the first path carries, so the answer takes two paths or more.
          if (first >= r.value) continue;
          const k = rng.int(first + 1, r.value);
          const settings: Settings = { ...defaults, target: k };
          const { r: rk } = runOn(setup, settings);
          return {
            prompt: `This time send exactly ${k} units from s to t, as cheaply as possible. What is the total cost?`,
            setup,
            settings,
            answer: { kind: 'number', value: rk.cost },
            explain: `Take the cheapest paths in turn until ${k} units have gone: ${rk.paths.map((a) => `${a.b} at ${a.unit}`).join(', ')}. That is ${rk.paths.map((a) => `${a.b} × ${a.unit}`).join(' + ')} = ${rk.cost}.`,
            watch: [['run']],
          };
        }
      },
    },
    {
      id: 'reverse-cost',
      title: 'What does sending back cost?',
      make(rng) {
        const { net, setup, r, watch } = setupRun(rng);
        const first = r.paths[0]!;
        const i = rng.int(0, first.p.length - 2);
        const u = first.p[i]!;
        const v = first.p[i + 1]!;
        const c = net.cost[`${u}-${v}`] ?? 1;
        return {
          prompt: `The first cheapest path is ${pathText(first.p)}. After flow is pushed along it, the residual network has a reverse arc ${arrow(v, u)}. What does one unit along ${arrow(v, u)} cost?`,
          setup,
          answer: { kind: 'number', value: -c },
          explain: `Going along ${arrow(v, u)} means taking back a unit sent along ${arrow(u, v)}, which saves its cost of ${c}. So the reverse arc costs ${-c}. That is why the residual network can have negative costs, and why Bellman-Ford (or potentials) is needed.`,
          watch,
        };
      },
    },
  ];
}
