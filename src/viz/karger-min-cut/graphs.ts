import type { Rng } from '../../engine/rng';
import { letters, makeGraph, type Edge, type Graph } from '../_graph/graph';
import { shuffle } from '../_graph/presets';

/** Two dense halves joined by `bridges` edges: the bridges are the minimum cut. */
export function clustersGraph(rng: Rng, n: number, bridges = 1): Graph {
  const m = Math.max(4, Math.min(12, n));
  const names = letters(m);
  const half = Math.ceil(m / 2);
  const left = names.slice(0, half);
  const right = names.slice(half);
  const edges: Edge[] = [];
  const dense = (vs: string[]) => {
    for (let i = 0; i < vs.length; i++)
      for (let j = i + 1; j < vs.length; j++)
        if (j === i + 1 || rng.int(0, 9) < 7) edges.push({ u: vs[i]!, v: vs[j]!, w: 1 });
    if (vs.length > 2) edges.push({ u: vs[0]!, v: vs.at(-1)!, w: 1 });
  };
  dense(left);
  dense(right);
  const pairs = shuffle(
    rng,
    left.flatMap((u) => right.map((v) => [u, v] as const)),
  ).slice(0, Math.max(1, bridges));
  for (const [u, v] of pairs) edges.push({ u, v, w: 1 });
  const seen = new Set<string>();
  const unique = edges.filter((e) => {
    const k = `${e.u}-${e.v}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return makeGraph({ directed: false, weighted: false, vertices: names, edges: unique });
}
