# Maximum flow and minimum cut

A network of pipes, roads or links, each with a capacity. How much can get from s to t per second? Two questions that look different turn out to have the same answer: the most you can send, and the cheapest way to cut s off from t.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `EDMONDS-KARP(G, s, t)` | a maximum flow, using the shortest augmenting path each time | O(VE²) |
| `FORD-FULKERSON(G, s, t)` with DFS | a maximum flow, using whatever path DFS finds first | O(E · f*), f* the flow |
| the minimum cut | the s side S: whatever s can still reach at the end | O(V + E) |

A flow puts f(u, v) units on each arc, never more than its capacity c(u, v), and everything that flows into a vertex flows out again (except at s and t). The value |f| is what leaves s.

Start with nothing. Find a path from s to t that still has room on every arc. Push as much as the tightest arc allows. Repeat until no such path is left. [Show me](#play:three-paths)

## The residual network

"Room" needs one twist. If 12 units go along a→c, the residual network G_f has 12 - 12 = 0 left on a→c, but it also has a reverse arc c→a with room 12: sending flow from c to a is allowed, because it means taking back some of the flow that went from a to c.

So G_f has, for every arc, the room left going forward, plus the flow on it going backward:

- r(u, v) = c(u, v) - f(u, v) on the arc itself,
- r(v, u) = f(u, v) on its reverse.

An augmenting path is any path from s to t in G_f. Its bottleneck c_f(p) is the smallest r on it. Turn on **Draw the residual network** and run [the residual network](#example:residual-view): the dashed arcs are the reverse arcs. [Show me](#play:residual-view)

Without reverse arcs a greedy choice can paint you into a corner. In [Taking flow back](#example:take-flow-back), every capacity is 1. The first path, s→a→d→t, uses up a→d and d→t, and now neither obvious route works. The second path goes s→c→d→a→b→e→t: along the reverse arc d→a it cancels the unit on a→d, and both units find a way through. [Show me](#play:take-flow-back)

```check
Q: An arc u→v has capacity 7 and carries flow 5. What does the residual network have between u and v?
- Only u→v, with room 2
* u→v with room 2 and v→u with room 5
- Only v→u, with room 5
- u→v with room 7 and v→u with room 5
= Forward, 7 - 5 = 2 more units fit. Backward, up to 5 units can be taken back.
```

## Cuts, and why the answer is right

A cut (S, T) splits the vertices, with s in S and t in T. Its capacity is the total capacity of the arcs from S to T; arcs from T back to S do not count. Every unit of flow has to cross from S to T somewhere, so no flow is larger than any cut.

When the algorithm stops, let S be what s can still reach in G_f. Every arc from S to T is full (or it would be in G_f), and every arc from T to S is empty (or its reverse would be). So the flow across the cut is exactly its capacity. A flow that equals a cut cannot get bigger, and the cut cannot get smaller. That is the max-flow min-cut theorem.

In [Three shortest paths](#example:three-paths) the flow is 23, and the last search reaches s, a, b and d. The arcs leaving that set are a→c (12), d→c (7) and d→t (4): 23 again. The page shades S and draws the cut in red. [One narrow arc](#example:narrow-arc) makes the point bluntly: however wide the rest is, c→d with capacity 3 decides everything.

```check
Q: The flow is maximum. Which arcs cross the minimum cut from S to T?
* Full ones: no room is left on any of them
- Empty ones: no flow crosses the cut
- Some full and some empty, depending on the network
- Only the arcs into t
= An arc from S to T with room left would be in the residual network, and s could reach past it. So at the end, every one is full.
```

## BFS or DFS: which path?

Ford-Fulkerson works with any augmenting path, so the choice is how to find one.

- **Edmonds-Karp** (CLRS's choice, the default) uses breadth-first search, so each path has the fewest arcs. Those lengths never go down, and that bounds the number of paths by O(VE), whatever the capacities.
- **Depth-first search** takes the first path it stumbles on. With whole-number capacities each path adds at least 1, so it stops, but the number of paths can be as large as the flow.

In [DFS wanders](#example:dfs-detours), DFS needs 11 paths, many of them long, narrow and busy taking flow back. Switch to Edmonds-Karp on the same network and it takes 4. [Show me](#play:dfs-detours)

Here both searches look at neighbours in name order, so the same network always gives the same paths. Real code just uses whatever order its adjacency lists happen to have.

## When to use it

Maximum flow is a modelling tool more than an algorithm you call. Lots of problems turn into it:

- How many paths from s to t share no arc? Give every arc capacity 1. [Unit capacities](#example:unit-paths) gets 3.
- Matching workers to jobs: a source to every worker, worker to job arcs, every job to a sink, all capacity 1. The [bipartite matching](/bipartite-matching/) page does this directly.
- Image segmentation, project selection, baseball elimination: each is a minimum cut in disguise.

For big networks, push-relabel and Dinic's algorithm are faster than Edmonds-Karp. For a lecture-sized network, any of them is instant.

## Common mistakes

- Forgetting the reverse arcs. Without them the greedy paths can get stuck below the maximum.
- Counting arcs from T back to S in the cut's capacity. Only S to T counts.
- Taking the cut from the network instead of from the residual network: S is what s reaches in G_f at the end.
- Expecting a unique answer. The maximum value is unique; the flow on each arc and the minimum cut often are not.
- Irrational capacities with DFS. Ford-Fulkerson might never stop. Whole numbers are safe.

If nothing joins s to t, the first search already fails and the flow is 0. [Have a look](#example:no-path).

## Try this

- Run [Three shortest paths](#example:three-paths) step by step. Before each push, predict the bottleneck.
- In [Taking flow back](#example:take-flow-back), find the second path yourself in the residual network before the page does.
- Load `s>a:3, s>b:2, a>b:1, a>t:2, b>t:3`. Guess the minimum cut first, then run it.
- Run [DFS wanders](#example:dfs-detours) with each setting and compare the **paths** counter.
- Use **Compare** to put this page next to [min-cost flow](/min-cost-flow/) on the same network. Same amount, different paths.
