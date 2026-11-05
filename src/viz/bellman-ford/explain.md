# Bellman-Ford

Dijkstra refuses a negative edge, and for good reason: its greedy choice breaks. Bellman-Ford does not make a greedy choice at all. It relaxes every edge, over and over, until nothing can change. That is slower, but it works with negative weights, and when a negative cycle makes "shortest" meaningless, it says so.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `BELLMAN-FORD(G, w, s)` | d and π for every vertex, and TRUE, or FALSE when s can reach a negative cycle | Θ(VE) |
| `RELAX(u, v, w)` | whether going through u gives v a shorter path | O(1) |

Each pass relaxes every edge once, always in the same order. After V - 1 passes, every shortest path has been found, because a shortest path without a cycle has at most V - 1 edges. One more pass checks the answer. [Show me](#play:passes)

## How it works

Every vertex starts with d = ∞ and π = NIL, and s gets d = 0. Then:

1. Repeat V - 1 times: for each edge u → v, in the fixed order, if d[u] + w(u, v) < d[v], set d[v] = d[u] + w(u, v) and π[v] = u.
2. Check every edge once more. If one can still be relaxed, return FALSE: a negative cycle can be reached from s. Otherwise return TRUE.

The order is just the edges sorted by their start vertex, then their end vertex. An undirected edge counts twice, once each way. The order row under the graph shows it, with the edge being relaxed in blue and the edges that lowered a d in this pass in teal. Edges that start at a vertex still at ∞ are faded: they cannot help yet. The pass table counts the distances each pass changed.

In [Pass by pass](#example:passes), the passes change 8, 5 and 1 distances. Then nothing changes, but CLRS makes all 6 passes anyway, and checks.

## Why V - 1 passes

Take a shortest path s, x1, x2, ..., v. The first pass relaxes s → x1 at some point, after which d[x1] is right. The second pass relaxes x1 → x2 after d[x1] is right, so d[x2] is right too. Each pass gets at least one more edge of the path right. A path without a cycle has at most V - 1 edges, so V - 1 passes are enough.

Often far fewer passes are needed, because one pass can fix a whole path when its edges come in the right order. In the [worst order](#example:worst-order), the path runs H, G, F and so on down to A, but the edges are listed from B>A up to H>G. Each pass gets exactly one more vertex right, and all 7 passes count. [Show me](#play:worst-order)

```check
Q: After 2 passes, which distances are guaranteed to be right?
- Every distance: two passes are always enough
* Those with a shortest path of at most 2 edges
- Only the 2 vertices relaxed most recently
- None: only the last pass makes them right
= Pass k gets the k-th edge of every shortest path right. Longer paths might be right already, if their edges came in a lucky order, but nothing guarantees it.
```

## Negative cycles

If a cycle has negative weight, every lap around it makes paths lighter, so the vertices it reaches have no shortest path. After V - 1 passes the distances would have settled if there were no such cycle. So an edge that can still be relaxed is proof that there is one.

In [A negative cycle](#example:negative-cycle), B → C → D → E → B weighs 2 - 6 + 1 + 2 = -1, and every pass lowers all of them again. In the check, B→C can still be relaxed. The page relaxes it once more and follows π back from C until a vertex repeats: C ← B ← E ← D ← C. That walk always ends up in the cycle. [Show me](#play:negative-cycle)

An undirected edge with a negative weight is a negative cycle all by itself: go across it and back. [Have a look](#example:undirected-negative).

```check
Q: The check pass finds an edge u → v that can still be relaxed. What does that tell you?
- The V - 1 passes were not enough, so run one more
* s can reach a negative cycle, so some vertices have no shortest path
- v cannot be reached from s
- u → v has a negative weight
= With no negative cycle in reach, V - 1 passes always finish the job. An edge that still relaxes means some path keeps getting lighter, which only a negative cycle can do.
```

## What s cannot reach

Bellman-Ford only reports cycles that s can reach. In [A negative cycle A cannot reach](#example:cycle-out-of-reach), D → E → F → D weighs -1, but no edge leads from A's side to it. D, E and F stay at ∞, no edge from them can be relaxed, and the answer is TRUE. That is correct: no distance from A is affected. [Show me](#play:cycle-out-of-reach)

To find a negative cycle anywhere in a graph, start every d at 0 instead of ∞, as if a new source had a 0-weight edge to every vertex.

## Stopping early

If a pass changes nothing, no later pass can change anything either: the same edges, the same order, the same d. Such a pass is the negative-cycle check already, so the algorithm can return TRUE right there. Turn on **Stop early** and try [the best order](#example:best-order): the first pass finds every distance, the second changes nothing, and that is it. [Show me](#play:best-order)

Stopping early helps a lot on most graphs, but not in the worst case. [The worst order](#example:worst-order) has early stopping on and still needs every pass.

## When to use it

Use Bellman-Ford when weights can be negative, or when you need to know whether a negative cycle exists. Currency exchange is a classic case: with the negative logarithm of each rate as the weight, a negative cycle is a way to make money by trading in a loop. Distance-vector routing protocols use the same relaxation, one router at a time.

Avoid it when every weight is at least 0: Dijkstra gives the same answer in O((V + E) log V) instead of Θ(VE). If the graph is a DAG, [DAG shortest paths](/dag-shortest-paths/) handles negative weights in O(V + E). The [negative edge Dijkstra refuses](#example:negative-edge) is no trouble here. [Show me](#play:negative-edge)

## Common mistakes

- Running only V - 2 passes, or stopping when a single edge does not relax. Only a whole pass with no change means it is done.
- Reporting a negative cycle when an edge relaxes during the V - 1 passes. Edges are supposed to relax then; only the check pass counts.
- Forgetting that an undirected negative edge is a negative cycle.
- Adding to ∞ in code. Skip an edge whose start is still at ∞, or the sum can overflow.
- Expecting the check to find cycles that s cannot reach.

## Try this

- [Pass by pass](#example:passes): before each pass, predict how many distances it will change.
- Run [the worst order](#example:worst-order), then load the same path with the edges named the other way round. How many passes now?
- [A negative cycle](#example:negative-cycle): change C>D:-6 to C>D:-4. Is there still a negative cycle?
- Load `A>B:4, A>C:2, C>B:-3, B>D:1` and run it here and on the [Dijkstra page](/dijkstra/). What does each one do?
