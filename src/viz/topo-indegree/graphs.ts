/** Graphs for the topological sort page's presets and practice. */
import type { Rng } from '../../engine/rng';
import { letters, makeGraph, neighbours, type Graph } from '../_graph/graph';
import { randomDag } from '../_graph/presets';

/** Shuffle the names, so a DAG's arcs no longer always go from earlier to later letters. */
export function renamed(rng: Rng, g: Graph): Graph {
  const names = [...g.vertices];
  for (let i = names.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  const to = new Map(g.vertices.map((v, i) => [v, names[i]!]));
  return makeGraph({
    ...g,
    vertices: names,
    edges: g.edges.map((e) => ({ u: to.get(e.u)!, v: to.get(e.v)!, w: e.w })),
  });
}

/** A random DAG whose names are mixed up, so the order is not just A, B, C. */
export function mixedDag(rng: Rng, n: number, density = 0.2): Graph {
  return renamed(rng, randomDag(rng, n, density));
}

/**
 * A DAG plus one arc back: from a vertex to one of its ancestors at least two arcs up, so
 * there is a cycle of three or more.
 */
export function dagWithCycle(rng: Rng, n: number): Graph {
  for (;;) {
    const g = randomDag(rng, Math.max(4, n), 0.15);
    const pairs: [string, string][] = [];
    for (const a of g.vertices) {
      // Vertices two or more arcs below a.
      const one = new Set(neighbours(g, a));
      const far = new Set<string>();
      for (const b of one) for (const c of neighbours(g, b)) far.add(c);
      for (const c of far) if (!one.has(c)) pairs.push([c, a]);
    }
    if (pairs.length === 0) continue;
    const [u, v] = pairs[rng.int(0, pairs.length - 1)]!;
    return renamed(rng, makeGraph({ ...g, edges: [...g.edges, { u, v, w: 1 }] }));
  }
}

/** Sources that all point at one sink: the queue holds them all at once. */
export function fanIn(n: number): Graph {
  const names = letters(Math.max(2, n));
  const sink = names.at(-1)!;
  return makeGraph({
    directed: true,
    weighted: false,
    vertices: names,
    edges: names.slice(0, -1).map((u) => ({ u, v: sink, w: 1 })),
  });
}

/** A directed path: exactly one topological order. */
export function chain(n: number): Graph {
  const names = letters(Math.max(2, n));
  return makeGraph({
    directed: true,
    weighted: false,
    vertices: names,
    edges: names.slice(1).map((v, i) => ({ u: names[i]!, v, w: 1 })),
  });
}
