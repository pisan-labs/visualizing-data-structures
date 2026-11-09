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
/**
 * Whether the minimum spanning tree is the only one: every pair of cities that is not a tree
 * edge is longer than the longest tree edge on the path between them. With a tie, another
 * spanning tree weighs the same, and its walk can give a tour of a different length.
 */
function uniqueTree(g: TspState['graph'], tree: TspRun['tree']): boolean {
  const d = distances(g);
  const adj = new Map<string, [string, number][]>(g.vertices.map((v) => [v, []]));
  for (const e of tree ?? []) {
    adj.get(e.parent)!.push([e.child, e.w]);
    adj.get(e.child)!.push([e.parent, e.w]);
  }
  const heaviest = (from: string, to: string): number => {
    const go = (v: string, prev: string, most: number): number | null => {
      if (v === to) return most;
      for (const [x, w] of adj.get(v)!)
        if (x !== prev) {
          const got = go(x, v, Math.max(most, w));
          if (got !== null) return got;
        }
      return null;
    };
    return go(from, '', 0)!;
  };
  const inTree = new Set(
    (tree ?? []).flatMap((e) => [`${e.parent}|${e.child}`, `${e.child}|${e.parent}`]),
  );
  return g.vertices.every((u, i) =>
    g.vertices.slice(i + 1).every((v) => inTree.has(`${u}|${v}`) || d(u, v) > heaviest(u, v)),
  );
}

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
        // The prompt does not say how Prim breaks ties, so keep only trees without one.
        let q = setupRun(rng, rng.int(5, 6), { ...defaults, method: 'mst' });
        while (!uniqueTree(q.g, q.r.tree))
          q = setupRun(rng, rng.int(5, 6), { ...defaults, method: 'mst' });
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
