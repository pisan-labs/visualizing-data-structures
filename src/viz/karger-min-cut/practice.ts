import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { formatGraph } from '../_graph/parse';
import { randomGraph } from '../_graph/presets';
import { keyOf, type Graph } from '../_graph/graph';
import { choice, ordered } from '../_recursion/kit';
import { crossing, defaults, groupsOf, groupText, type KgSettings, type KgState } from './model';
import { clustersGraph } from './graphs';

type Def = VizDef<KgState, KgSettings, undefined>;

/**
 * Practice for Karger's min cut. Every answer comes from running the model: the minimum cut is
 * the model's own (found by trying every split), and the trial in a picture is the one the
 * model makes with the practice seed.
 */
export function kargerPractice(def: () => Def): PracticeKind[] {
  const end = (calls: OpCall[]): KgState => {
    const t = new Timeline(def(), defaults, 1, calls);
    return t.entries.at(-1)!.end;
  };
  const someGraph = (rng: Rng): Graph =>
    rng.int(0, 1) === 0
      ? clustersGraph(rng, rng.int(6, 8), rng.int(1, 2))
      : randomGraph(rng, rng.int(5, 7), { density: 0.3 });
  const load = (g: Graph): OpCall => ['load', formatGraph(g)];

  return [
    {
      id: 'min-cut',
      title: 'How small is the smallest cut?',
      make(rng) {
        const g = someGraph(rng);
        const s = end([load(g)]);
        return {
          prompt:
            'What is the fewest edges you can remove to split this graph into two pieces? That is the size of a minimum cut.',
          setup: [load(g)],
          answer: { kind: 'number', value: s.minCut! },
          explain: `A minimum cut here has ${s.minCut} ${s.minCut === 1 ? 'edge' : 'edges'}. ${
            s.minCut === Math.min(...g.vertices.map((v) => degree(g, v)))
              ? 'One of them cuts off a single vertex of smallest degree, a cut people often forget to check.'
              : 'Every vertex has more edges than that, so the cut splits off a whole group, not one vertex.'
          } Running trials finds it again and again.`,
          watch: [['trials']],
        };
      },
    },
    {
      id: 'found',
      title: 'Did this trial find it?',
      make(rng) {
        const g = someGraph(rng);
        const setup: OpCall[] = [load(g), ['contract']];
        const s = end(setup);
        const right = s.cut!.length === s.minCut ? 'Yes' : 'No';
        const [a, b] = groupsOf(s);
        return {
          prompt: `One random trial ended with two super-vertices, ${groupText(a![1])} and ${groupText(b![1])}. The red edges between them are its cut. Is it a minimum cut of the graph?`,
          setup,
          answer: ordered(['Yes', 'No'], right),
          explain: `The trial's cut has ${s.cut!.length} ${s.cut!.length === 1 ? 'edge' : 'edges'}, and a minimum cut has ${s.minCut}. ${right === 'Yes' ? 'So this trial was lucky (or the graph made it easy).' : 'So this trial missed: somewhere it contracted an edge of every minimum cut.'}`,
          watch: [['trials']],
        };
      },
    },
    {
      id: 'bound',
      title: "Karger's bound",
      make(rng) {
        const g = someGraph(rng);
        const n = g.vertices.length;
        const s = end([load(g)]);
        const c = (s.graph.vertices.length * (s.graph.vertices.length - 1)) / 2;
        return {
          prompt: `This graph has ${n} vertices. Karger's bound says one trial finds a given minimum cut with probability at least 1 in how many?`,
          setup: [load(g)],
          answer: { kind: 'number', value: c },
          explain: `2/(n(n−1)) = 2/(${n}·${n - 1}) = 1/${c}. That is n choose 2: as if the trial picked one pair of vertices to keep apart at random.`,
          watch: [['trials']],
        };
      },
    },
    {
      id: 'parallel',
      title: 'Parallel edges',
      make(rng) {
        for (;;) {
          const g = someGraph(rng);
          // Contract two edges by hand, then ask how many edges join two super-vertices.
          const e1 = g.edges[rng.int(0, g.edges.length - 1)]!;
          const s1 = end([load(g), ['merge', keyOf(e1)]]);
          const next = crossing(s1);
          if (!next.length) continue;
          const e2 = next[rng.int(0, next.length - 1)]!;
          const setup: OpCall[] = [load(g), ['merge', keyOf(e1)], ['merge', keyOf(e2)]];
          const s = end(setup);
          const groups = groupsOf(s);
          const big = groups.find(([rep]) => rep === s.group[e2.u])!;
          const others = groups.filter(([rep]) => rep !== big[0]);
          const counts = others.map(([rep]) =>
            crossing(s).filter(
              (e) =>
                (s.group[e.u] === big[0] && s.group[e.v] === rep) ||
                (s.group[e.v] === big[0] && s.group[e.u] === rep),
            ),
          );
          const k = counts.findIndex((c, i) => c.length >= 2 || i === counts.length - 1);
          const other = others[k];
          if (!other) continue;
          const right = counts[k]!.length;
          return {
            prompt: `After contracting ${keyOf(e1)} and then ${keyOf(e2)}, how many parallel edges join the super-vertex ${groupText(big[1])} and ${groupText(other[1])}?`,
            setup: [load(g)],
            answer: choice(
              rng,
              String(right),
              [right + 1, right - 1, right + 2, 0].filter((x) => x >= 0).map(String),
            ),
            explain: `Contraction keeps every edge that leaves the merged vertices. The edges from ${groupText(big[1])} to ${groupText(other[1])} are ${counts[k]!.map(keyOf).join(', ') || 'none'}: ${right}.`,
            watch: [
              ['merge', keyOf(e1)],
              ['merge', keyOf(e2)],
            ],
          };
        }
      },
    },
  ];
}

function degree(g: Graph, v: string): number {
  return g.edges.filter((e) => e.u === v || e.v === v).length;
}
