/**
 * Where the nodes of a computation graph go: layers from the inputs to the output (a variable
 * sits just before its first reader), an edge that skips layers runs through a free slot in
 * each layer it crosses (a "dummy", as in Sugiyama's layered drawings), and the order within
 * each layer comes from a few sweeps of the barycenter heuristic, keeping the order with the
 * fewest crossings. Cached per graph.
 *
 * Positions are slots, not scene units: the view turns them into a drawing that runs left to
 * right (a laptop) or top to bottom (a phone).
 */
import { layersOf, type Graph } from './graph';

/** A slot holds a node or a stretch of a long edge (`edge` and the layer it crosses). */
export type Slot = { node: number } | { edge: number };

export interface DagLayout {
  layers: Slot[][];
  /** Each node's [layer, slot index]. */
  at: [number, number][];
  /** For each edge, the slot index in every layer it crosses (empty for a short edge). */
  via: { layer: number; index: number }[][];
  /** The most slots in a layer. */
  width: number;
}

const cache = new WeakMap<Graph, DagLayout>();

const key = (s: Slot) => ('node' in s ? `n${s.node}` : `e${s.edge}`);

export function layoutDag(g: Graph): DagLayout {
  const hit = cache.get(g);
  if (hit) return hit;
  const layer = layersOf(g);
  const depth = Math.max(...layer) + 1;
  const layers: Slot[][] = Array.from({ length: depth }, () => []);
  g.nodes.forEach((_, i) => layers[layer[i]!]!.push({ node: i }));
  // Each edge as a chain of slots from its source to its target.
  const chains = g.edges.map((e, k) => {
    const chain: string[] = [`n${e.from}`];
    for (let l = layer[e.from]! + 1; l < layer[e.to]!; l++) {
      layers[l]!.push({ edge: k });
      chain.push(`e${k}`);
    }
    chain.push(`n${e.to}`);
    return chain;
  });
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const chain of chains)
    for (let i = 0; i + 1 < chain.length; i++) {
      down.set(chain[i]!, [...(down.get(chain[i]!) ?? []), chain[i + 1]!]);
      up.set(chain[i + 1]!, [...(up.get(chain[i + 1]!) ?? []), chain[i]!]);
    }

  const crossings = (ls: Slot[][]) => {
    let n = 0;
    for (let l = 0; l + 1 < ls.length; l++) {
      const pos = new Map(ls[l + 1]!.map((s, i) => [key(s), i]));
      const pairs: [number, number][] = [];
      ls[l]!.forEach((s, i) => {
        for (const t of down.get(key(s)) ?? []) pairs.push([i, pos.get(t)!]);
      });
      for (let a = 0; a < pairs.length; a++)
        for (let b = a + 1; b < pairs.length; b++) {
          const [p, q] = pairs[a]!;
          const [r, t] = pairs[b]!;
          if ((p - r) * (q - t) < 0) n++;
        }
    }
    return n;
  };

  const order = layers.map((ls) => [...ls]);
  let best = order.map((ls) => [...ls]);
  let fewest = crossings(best);
  const sortBy = (ls: Slot[], ref: Slot[] | undefined, nbrs: Map<string, string[]>) => {
    if (!ref) return ls;
    const pos = new Map(ref.map((s, i) => [key(s), i]));
    const bary = (s: Slot, i: number) => {
      const ps = (nbrs.get(key(s)) ?? []).map((t) => pos.get(t)).filter((p) => p !== undefined);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : i;
    };
    return ls
      .map((s, i) => ({ s, b: bary(s, i), i }))
      .sort((p, q) => p.b - q.b || p.i - q.i)
      .map((x) => x.s);
  };
  for (let sweep = 0; sweep < 6; sweep++) {
    if (sweep % 2 === 0)
      for (let l = 1; l < depth; l++) order[l] = sortBy(order[l]!, order[l - 1], up);
    else for (let l = depth - 2; l >= 0; l--) order[l] = sortBy(order[l]!, order[l + 1], down);
    const c = crossings(order);
    if (c < fewest) {
      fewest = c;
      best = order.map((ls) => [...ls]);
    }
  }

  const at: [number, number][] = g.nodes.map(() => [0, 0]);
  const via: { layer: number; index: number }[][] = g.edges.map(() => []);
  best.forEach((ls, l) =>
    ls.forEach((s, i) => {
      if ('node' in s) at[s.node] = [l, i];
      else via[s.edge]!.push({ layer: l, index: i });
    }),
  );
  const out: DagLayout = {
    layers: best,
    at,
    via,
    width: Math.max(...best.map((ls) => ls.length)),
  };
  cache.set(g, out);
  return out;
}
