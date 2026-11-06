import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { distances } from './cities';
import {
  defaults,
  tourText,
  type TspExtra,
  type TspRun,
  type TspSettings,
  type TspState,
} from './model';
import { loadCities, randomCities } from './presets';

type Def = VizDef<TspState, TspSettings, TspExtra>;

/**
 * Practice for the TSP page. Every answer comes from running the model: tours, lengths and
 * Held-Karp entries are read from its steps.
 */
export function tspPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, n: number, settings: TspSettings) {
    const pts = randomCities(rng, n);
    const setup: OpCall[] = [loadCities(pts)];
    const t = new Timeline(def(), settings, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    const r = steps.at(-1)!.extra!.run! as TspRun;
    const g = t.entries.at(-1)!.end.graph;
    return { setup, steps, r, g, settings: settings as Settings, watch: [['run']] as OpCall[] };
  }

  return [
    {
      id: 'nearest',
      title: 'Nearest neighbour tour',
      make(rng) {
        const q = setupRun(rng, rng.int(5, 6), { ...defaults, method: 'nearest' });
        return {
          prompt: `Build a tour by nearest neighbour from A: always go to the closest city not visited yet (ties to the name that comes first). Type the cities in the order you visit them, starting with A.`,
          setup: q.setup,
          settings: q.settings,
          answer: { kind: 'sequence', value: q.r.tour },
          explain: `From each city the closest one left: ${tourText(q.r.tour)}, length ${q.r.cost}. The best tour has length ${q.r.opt}.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'tree-walk',
      title: 'Length of the tree-walk tour',
      make(rng) {
        const q = setupRun(rng, rng.int(5, 6), { ...defaults, method: 'mst' });
        const w = q.r.tree!.reduce((a, e) => a + e.w, 0);
        return {
          prompt: `APPROX-TSP-TOUR builds a minimum spanning tree from A, walks it in preorder (children in name order) and lists the cities in the order it meets them. The distances are the straight lines, rounded up. How long is the tour it returns?`,
          setup: q.setup,
          settings: q.settings,
          answer: { kind: 'number', value: q.r.cost },
          explain: `The tree has edges ${q.r.tree!.map((e) => `${e.parent}-${e.child} (${e.w})`).join(', ')}, weight ${w}. The walk lists ${tourText(q.r.tour)}: length ${q.r.cost}, no more than 2 × ${w} = ${2 * w}.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'held-karp',
      title: 'A Held-Karp entry',
      make(rng) {
        for (;;) {
          const q = setupRun(rng, 5, { ...defaults, method: 'exact' });
          const cells = q.steps.filter(
            (st) =>
              st.level === 3 && st.lines.includes('hk.min') && st.extra!.run!.tour.length === 4,
          );
          if (cells.length === 0) continue;
          const st = cells[rng.int(0, cells.length - 1)]!;
          const r = st.extra!.run!;
          const [s, a, b, c] = r.tour as [string, string, string, string];
          const set = [a, b, c].sort();
          const d = distances(q.g);
          return {
            prompt: `Held-Karp: C(S, j) is the length of the shortest path that starts at ${s}, visits every city of S once and ends at j. What is C(${set.join('')}, ${c})?`,
            setup: q.setup,
            settings: q.settings,
            answer: { kind: 'number', value: r.cost },
            explain: `The path ends at ${c}, so it comes from one of the other two cities of ${set.join('')}, after visiting both of them from ${s}. The best is ${r.tour.join(' → ')}: ${d(s, a)} + ${d(a, b)} + ${d(b, c)} = ${r.cost}.`,
            watch: q.watch,
          };
        }
      },
    },
    {
      id: 'ratio',
      title: 'How far from the best?',
      make(rng) {
        for (;;) {
          const method = rng.int(0, 1) ? 'nearest' : 'mst';
          const q = setupRun(rng, rng.int(5, 7), { ...defaults, method });
          if (q.r.cost === q.r.opt) continue;
          const name =
            method === 'nearest' ? 'Nearest neighbour from A' : 'The tree walk (APPROX-TSP-TOUR)';
          return {
            prompt: `${name} finds the tour ${tourText(q.r.tour)}. How much longer is it than the best tour? (Type the difference in length.)`,
            setup: q.setup,
            settings: q.settings,
            answer: { kind: 'number', value: q.r.cost - q.r.opt },
            explain: `It has length ${q.r.cost}. The best tour, ${tourText(q.r.optTour)}, has length ${q.r.opt}: ${q.r.cost - q.r.opt} shorter. The ratio is ${q.r.cost} / ${q.r.opt} ≈ ${(q.r.cost / q.r.opt).toFixed(2)}.`,
            watch: q.watch,
          };
        }
      },
    },
  ];
}
