/**
 * Directed graphs for the SCC page's presets, practice questions and tests. Vertices are named
 * A, B, C, ...
 *
 *   clusters(rng, n)    the letters, shuffled, split into groups of 1 to 4. Each group of two or
 *                       more is a cycle plus maybe a chord; a few arcs join earlier groups to
 *                       later ones, never back. So the groups are exactly the components.
 *   bigCycle(n)         A>B>...>A: one component
 *   reversedCycle(n)    the same cycle with every arc reversed
 */
import type { Rng } from '../../engine/rng';
import {
  MAX_EDGES,
  MAX_VERTICES,
  letters,
  makeGraph,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { shuffle } from '../_graph/presets';

const clampN = (n: number) => Math.max(2, Math.min(MAX_VERTICES, Math.round(n)));

function build(names: string[], pairs: [string, string][]): Graph {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const [u, v] of pairs) {
    if (u === v || seen.has(`${u}>${v}`) || edges.length >= MAX_EDGES) continue;
    seen.add(`${u}>${v}`);
    edges.push({ u, v, w: 1 });
  }
  return makeGraph({ directed: true, weighted: false, vertices: names, edges });
}

export function clusters(rng: Rng, n: number): Graph {
  const names = letters(clampN(n));
  const order = shuffle(rng, names);
  const groups: string[][] = [];
  for (let i = 0; i < order.length;) {
    const size = Math.min(order.length - i, rng.int(1, 4));
    groups.push(order.slice(i, i + size));
    i += size;
  }
  const pairs: [string, string][] = [];
  for (const g of groups) {
    if (g.length < 2) continue;
    g.forEach((v, i) => pairs.push([v, g[(i + 1) % g.length]!]));
    if (g.length >= 3 && rng.int(0, 1)) pairs.push([g[0]!, g[2]!]);
  }
  for (let a = 0; a < groups.length; a++)
    for (let b = a + 1; b < groups.length; b++)
      if (rng.int(0, 2) === 0 || b === a + 1) {
        const u = groups[a]![rng.int(0, groups[a]!.length - 1)]!;
        const v = groups[b]![rng.int(0, groups[b]!.length - 1)]!;
        pairs.push([u, v]);
      }
  return build(names, pairs);
}

export function bigCycle(n: number): Graph {
  const names = letters(clampN(n));
  return build(
    names,
    names.map((v, i) => [v, names[(i + 1) % names.length]!]),
  );
}

export function reversedCycle(n: number): Graph {
  const names = letters(clampN(n));
  return build(
    names,
    names.map((v, i) => [names[(i + 1) % names.length]!, v]),
  );
}
