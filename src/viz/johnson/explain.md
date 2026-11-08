# Johnson's all-pairs shortest paths

You want the shortest distance between every pair of vertices. Dijkstra from every vertex is fast on a sparse graph, but one negative edge breaks Dijkstra. Floyd-Warshall handles negative edges, but costs Θ(V³) whatever the graph. Johnson's trick gets both: change the weights so none is negative, without changing which paths are shortest, then run Dijkstra from everywhere.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| add q | a new vertex with a 0 arc to every vertex | O(V) |
| Bellman-Ford from q | h(v) = δ(q, v), or finds a negative cycle | O(VE) |
| reweight | w′(u, v) = w(u, v) + h(u) − h(v) ≥ 0 | O(E) |
| V × Dijkstra | one per source, on w′ | O(VE log V) |
| un-reweight | D[s][t] = d′(s, t) − h(s) + h(t) | O(V²) |

All of it is O(VE log V) with a binary heap. On a sparse graph that beats Floyd-Warshall's V³ easily. [Show me](#play:negative-edges)

## Why reweighting works

Give every vertex a number h(v) and set w′(u, v) = w(u, v) + h(u) − h(v). Take any path from s to t. Along the path the h terms telescope: each h(v) in the middle is added once and subtracted once. So every path from s to t changes by exactly h(s) − h(t), the same amount. The shortest path stays shortest.

That works for *any* h. The trick is picking an h that makes every w′ nonnegative. Shortest-path distances do it: if h(v) = δ(q, v), the triangle inequality says h(v) ≤ h(u) + w(u, v), which is exactly w′(u, v) ≥ 0.

Where do we measure distances from? A new vertex q with a 0-weight arc to every vertex. It reaches everything, so h is defined everywhere, and h(v) ≤ 0.

```check
Q: h(A) = 0, h(B) = −3, and w(A, B) = −3. What is w′(A, B)?
- −6
* 0
- 3
- −3
= w′ = w + h(A) − h(B) = −3 + 0 − (−3) = 0. Arcs on shortest paths from q always end up with w′ = 0.
```

## How it runs

1. Add q and run Bellman-Ford from it. The page relaxes q's arcs first (every h drops to 0) and then passes over the graph's arcs until nothing changes. If an arc can still be relaxed after V passes, there is a negative cycle, and Johnson stops: [A negative cycle stops everything](#example:negative-cycle).
2. Reweight every arc. The graph now shows w′ instead of w. In [Arcs on q's shortest paths get weight 0](#example:zero-on-path) you can see the zeros appear.
3. Run Dijkstra from every vertex on w′. Each run fills one row.
4. Undo the reweighting in that row: D[s][t] = d′(s, t) − h(s) + h(t).

In [Negative edges, every pair](#example:negative-edges), h runs from 0 down to −5, every arc gets a nonnegative w′, and five Dijkstras fill the 5 × 5 matrix. Unreachable pairs stay ∞: [Unreachable pairs](#example:unreachable).

```check
Q: Dijkstra from A on the reweighted graph gives d′(A, C) = 2. With h(A) = 0 and h(C) = −5, what is the real distance from A to C?
* −3
- 7
- 2
- −5
= D[A][C] = d′(A, C) − h(A) + h(C) = 2 − 0 + (−5) = −3.
```

## When to use it

Use Johnson for all pairs on a sparse graph with some negative edges: road networks with tolls and rebates, currency or energy graphs, scheduling constraints. With E close to V, it is about V² log V against Floyd-Warshall's V³.

On a dense graph (E close to V²), Floyd-Warshall is simpler and faster: three loops, no heap. And if no weight is negative, skip the first half entirely. [No negative weights](#example:all-positive): h is 0 everywhere and Johnson is just Dijkstra from every vertex.

The reweighting idea shows up elsewhere too: min-cost flow uses the same potentials to keep running Dijkstra on residual graphs with negative arcs. See [min-cost flow](/min-cost-flow/).

## Common mistakes

- Adding a constant to every weight to make them nonnegative. That punishes paths with more edges and changes the answer. Johnson's h is per vertex, not per edge.
- Forgetting to undo the reweighting. d′ is a distance in the reweighted graph, not the real one.
- Using the sign the wrong way round: w′ = w + h(u) − h(v), with h(u) for the tail.
- Running Bellman-Ford from one of the graph's own vertices instead of q. Vertices it can't reach get no h.
- Expecting it to work with a negative cycle. No algorithm can give shortest distances there; Johnson's job is to say so.

## Try this

- [Negative edges, every pair](#example:negative-edges): after Bellman-Ford, check by hand that every w′ is ≥ 0.
- Compare the result with the [Floyd-Warshall page](/floyd-warshall/) on the same graph.
- Load `A>B:-1, B>A:1` and run. Then change `B>A:1` to `B>A:0`. What changes?
- Run the Negative cycle preset and find the cycle in the drawing.
