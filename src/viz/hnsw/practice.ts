import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { two } from '../_lm/numbers';
import { d2, randomPoints } from '../_retrieve/points';
import {
  bruteForce,
  defaults,
  K,
  levelFor,
  topOf,
  type HnswExtra,
  type HnswSettings,
  type HnswState,
  type InsertDone,
  type SearchDone,
} from './model';

type Def = VizDef<HnswState, HnswSettings, HnswExtra>;

/**
 * Practice for HNSW with M = 2. The picture shows the graph after the setup's inserts (its
 * layers and links); every answer comes from running the model with the same seed the page uses
 * for "Show me".
 */
export function hnswPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: HnswSettings = defaults) => new Timeline(def(), settings, 1, ops);

  function graph(rng: Rng, n: number) {
    const pts = randomPoints(rng, n, 0, 10);
    const ops: OpCall[] = [['insert', writePoints(pts)]];
    return { ops, s: run(ops).endState() };
  }

  /** A query point that is not a node, so no distance is 0. */
  function query(rng: Rng, s: HnswState) {
    for (;;) {
      const q = { x: rng.int(0, 10), y: rng.int(0, 10) };
      if (!s.nodes.some((n) => n.x === q.x && n.y === q.y)) return q;
    }
  }

  return [
    {
      id: 'path',
      title: 'The path down the layers',
      make(rng) {
        for (;;) {
          const { ops, s } = graph(rng, rng.int(8, 11));
          if (topOf(s) < 1) continue;
          const q = query(rng, s);
          const watch: OpCall[] = [['search', `${q.x},${q.y}`]];
          const done = run([...ops, ...watch]).endState().last as SearchDone;
          // A path that moves at least once, so the question is more than "the entry point".
          if (done.path.length < 2) continue;
          const names = done.path.map((id) => s.nodes[id]!.name);
          return {
            prompt: `Search for q = (${q.x}, ${q.y}). On the layers above 0 the search is greedy: from the entry point it moves to a neighbour closer to q while there is one, then goes down a layer from where it stands. List the nodes it stands on, in order, from the entry point to the node where layer 0 starts.`,
            setup: ops,
            answer: { kind: 'sequence', value: names },
            explain: `The entry point is ${names[0]} on layer ${topOf(s)}. The greedy steps go ${names.join(' → ')}; each one is closer to q (squared distances ${done.path.map((id) => d2(q, s.nodes[id]!)).join(', ')}). Layer 0 starts at ${names.at(-1)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'links',
      title: 'The links of a new point',
      make(rng) {
        for (;;) {
          const { ops, s } = graph(rng, rng.int(5, 8));
          const p = query(rng, s);
          const watch: OpCall[] = [['insert', `${p.x},${p.y}`]];
          const t = run([...ops, ...watch]);
          const done = t.endState().last as InsertDone;
          const name = t.endState().nodes[done.id]!.name;
          const steps = t.entries.at(-1)!.steps;
          const draw = steps[0]!.extra!.draw!;
          const ids = done.links[0]!;
          // The nearest few must be clearly ordered, and the search must have found the true
          // nearest, so the answer can be worked out from the picture.
          const ds = s.nodes.map((n) => d2(p, n)).sort((a, b) => a - b);
          if (ds[0] === ds[1] || ds[1] === ds[2]) continue;
          if (ids.join() !== bruteForce(s.nodes, p, ids.length).join()) continue;
          const w = steps.find((st) => st.extra?.linked?.layer === 0)!.extra!.found!;
          const names = ids.map((id) => s.nodes[id]!.name);
          return {
            prompt: `Insert ${name} = (${p.x}, ${p.y}). It draws level ${draw.level}. With M = 2, which nodes does ${name} link to on **layer 0**? List them nearest first.`,
            setup: ops,
            answer: { kind: 'sequence', value: names },
            explain: `The search on layer 0 (efConstruction = 4) finds ${w.map(([d, id]) => `${s.nodes[id]!.name} (d² ${d})`).join(', ')}, and ${name} links to the M = 2 nearest of them: ${names.join(' and ')}. Here they are also the two nearest of all the points.`,
            watch,
          };
        }
      },
    },
    {
      id: 'recall',
      title: 'Recall against brute force',
      make(rng) {
        for (;;) {
          const settings: HnswSettings = { ...defaults, ef: rng.int(1, 2) };
          const pts = randomPoints(rng, rng.int(9, 12), 0, 10);
          const ops: OpCall[] = [['insert', writePoints(pts)]];
          const s = run(ops, settings).endState();
          const q = query(rng, s);
          const watch: OpCall[] = [['search', `${q.x},${q.y}`]];
          const done = run([...ops, ...watch], settings).endState().last as SearchDone;
          const ds = s.nodes.map((n) => d2(q, n)).sort((a, b) => a - b);
          if (ds[K - 1] === ds[K]) continue;
          const hit = done.found.filter((id) => done.truth.includes(id)).length;
          const nm = (ids: number[]) => ids.map((id) => s.nodes[id]!.name).join(', ');
          return {
            prompt: `Search for q = (${q.x}, ${q.y}) with **ef = ${settings.ef}**. The answer is the ${K} nearest of the search's list W. How many of them are among the true ${K} nearest (brute force)?`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: hit },
            explain: `HNSW returns ${nm(done.found)}; brute force gives ${nm(done.truth)}. ${hit} in common, so the recall is ${hit}/${K}.${settings.ef < K ? ` With ef = ${settings.ef} the list holds only ${settings.ef}, so it can never return all ${K}.` : ''}`,
            watch,
          };
        }
      },
    },
    {
      id: 'level',
      title: 'The level a point draws',
      make(rng) {
        for (;;) {
        const { ops, s } = graph(rng, rng.int(3, 6));
        const p = query(rng, s);
        const watch: OpCall[] = [['insert', `${p.x},${p.y}`]];
        const t = run([...ops, ...watch]);
        const draw = t.entries.at(-1)!.steps[0]!.extra!.draw!;
        const check = levelFor(draw.u, 2);
        // u is shown to two decimals: keep away from the edges between levels.
        if ([0.5, 0.25, 0.125].some((edge) => Math.abs(draw.u - edge) < 0.006)) continue;
        return {
          prompt: `The next insert draws **u = ${two(draw.u)}**. With M = 2, mL = 1/ln 2 ≈ 1.44, and the level is ⌊−ln(u) · mL⌋ (this page stops at 3). What level does the new point get?`,
          setup: ops,
          answer: { kind: 'number', value: draw.level },
          explain: `−ln(${two(draw.u)}) = ${two(-Math.log(draw.u))}, times 1.44 is ${two(check.raw)}, and the floor is ${Math.floor(check.raw)}${check.capped ? ', stopped at 3' : ''}. Half of all points stay on layer 0 (u above 0.5); a quarter reach layer 2 or more: the coin flips of a skip list.`,
          watch,
        };
        }
      },
    },
  ];
}
