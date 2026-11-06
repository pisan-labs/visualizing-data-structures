/**
 * Helpers the three approximation pages share (tsp, vertex-cover, steiner-tree).
 *
 * Every run on these pages ends by setting what it found against the optimum, so the pages
 * agree on how a ratio reads and how a minimum spanning tree is built (the TSP tour and the
 * Steiner tree both start from one).
 *
 * API
 *   ratioOf(found, best)     found / best as a number (1 when both are 0, null when best is 0)
 *   ratioText(found, best)   "1.25", "1" or "–"
 *   arrayPrim(names, w)      Prim with an array: start at names[0], take the smallest key, ties
 *                            to the earlier name, lower a key only on a strictly lighter edge.
 *                            w(u, v) is the weight or null for no edge. Returns the tree edges
 *                            (parent, child, weight) in the order they joined, and whether it
 *                            reached every vertex. The code tabs do exactly the same.
 *   subsetsBySize(xs)        every subset of xs, smallest first, each in the order of xs
 */

export function ratioOf(found: number, best: number): number | null {
  if (best === 0) return found === 0 ? 1 : null;
  return found / best;
}

export function ratioText(found: number, best: number): string {
  const r = ratioOf(found, best);
  if (r === null) return '–';
  return String(Math.round(r * 100) / 100);
}

export interface TreeEdge {
  parent: string;
  child: string;
  w: number;
}

export function arrayPrim(
  names: string[],
  w: (u: string, v: string) => number | null,
): { edges: TreeEdge[]; spans: boolean; order: string[] } {
  const n = names.length;
  const key: (number | null)[] = names.map(() => null);
  const pi: (number | null)[] = names.map(() => null);
  const done = names.map(() => false);
  const edges: TreeEdge[] = [];
  const order: string[] = [];
  if (n === 0) return { edges, spans: true, order };
  key[0] = 0;
  for (let round = 0; round < n; round++) {
    let u = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && key[i] !== null && (u < 0 || key[i]! < key[u]!)) u = i;
    if (u < 0) return { edges, spans: false, order };
    done[u] = true;
    order.push(names[u]!);
    if (pi[u] !== null) edges.push({ parent: names[pi[u]!]!, child: names[u]!, w: key[u]! });
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const x = w(names[u]!, names[v]!);
      if (x !== null && (key[v] === null || x < key[v]!)) {
        key[v] = x;
        pi[v] = u;
      }
    }
  }
  return { edges, spans: true, order };
}

export function subsetsBySize<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  const n = xs.length;
  for (let k = 0; k <= n; k++) {
    const pick: number[] = [];
    const go = (from: number) => {
      if (pick.length === k) {
        out.push(pick.map((i) => xs[i]!));
        return;
      }
      for (let i = from; i <= n - (k - pick.length); i++) {
        pick.push(i);
        go(i + 1);
        pick.pop();
      }
    };
    go(0);
  }
  return out;
}
