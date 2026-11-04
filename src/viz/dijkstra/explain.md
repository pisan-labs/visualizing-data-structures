# Dijkstra's shortest paths

BFS finds the fewest edges. Most real graphs care about something else: kilometres, minutes, dollars. Each edge has a weight, and the shortest path is the lightest one, however many edges it takes. Dijkstra's algorithm finds the lightest path from one vertex to every other vertex, as long as no weight is negative.

## The idea

| Operation | What it finds | Cost (binary heap) |
|---|---|---|
| `DIJKSTRA(G, w, s)` | d (distance from s) and π (parent) for every vertex | O((V + E) log V) |
| `RELAX(u, v, w)` | whether going through u gives v a shorter path | O(log V) when it lowers a key |

Dijkstra grows a set S of settled vertices, whose distances are final. Every other vertex waits in a priority queue Q, keyed by its best distance so far. Each round takes the vertex with the smallest key, settles it, and relaxes its edges: if going through it is shorter, the neighbour's key drops. [Show me](#play:closest-first)

The π pointers form the shortest-path tree. Follow π back from any vertex to read its lightest path, backwards.

## How it works

Every vertex starts with d = ∞ and π = NIL, and s gets d = 0. Then, until Q is empty:

1. Take u, the vertex in Q with the smallest d. It joins S.
2. For each edge u → v, relax it: if d[u] + w(u, v) < d[v], set d[v] = d[u] + w(u, v) and π[v] = u, and lower v's key in Q.

That is all of it. In [Closest first](#example:closest-first), D's key goes from 8 to 7 to 6, as C, B and E are settled in turn. Each one offers D a shorter way in. Then F→G fails: G already has 9, and going through F would cost 10.

In the drawing, settled vertices are green with a thick outline. They sit on the left of the S | Q row, in the order they were settled, with their final d. Vertices waiting in Q with a finite key wear a dashed ring, the vertex being relaxed is marked u, and the edge being relaxed is blue. The current π edges are arrows from parent to child, edges that RELAX looked at and did not keep turn dashed, and edges nobody has looked at yet stay faint. At the end only the tree stays solid.

## Why the closest vertex is safe

Settling a vertex is a promise: its d will never change again. Why can Dijkstra make that promise?

Say u has the smallest key in Q, d[u] = 5. Any other path to u has to leave S at some point, through an edge into a vertex x in Q. Getting to x already costs at least x's key, and x's key is at least 5, because u's is the smallest. The rest of the path, from x to u, cannot cost less than 0 if no weight is negative. So no path to u beats 5. [Show me](#play:closest-first)

This is why Dijkstra is called greedy. It never reconsiders a settled vertex, and it never needs to.

```check
Q: Q holds B with key 7 and D with key 4, and nothing else. Every weight is at least 0. What can you say about D?
- Nothing yet: B might still offer D a shorter path
* d[D] = 4 is final: any path through B already costs at least 7
- D's key can still drop, but only by relaxing B's edges
- D should wait until B is settled
= Any other way to D goes through B, which already costs 7 or more, and weights cannot bring that back down to 4.
```

## The priority queue

CLRS puts every vertex in Q at the start, keyed by d, and lowers a key with DECREASE-KEY when a relaxation succeeds. That is the default here. Most code with a binary heap does something lazier: it puts s in alone, and when d[v] drops, it inserts a new entry for v instead of changing the old one. The old entry stays in the heap. When it comes out later, v is already settled, so the entry is stale and gets skipped.

Switch **Priority queue** to the lazy version and have a look at [the same graph](#example:lazy-queue). D goes in three times, with keys 8, 7 and 6, and two of those entries come out stale. [Show me](#play:lazy-queue) Both versions settle the vertices in the same order and find the same d and π. The code tabs use the lazy version, because Python's `heapq` has no DECREASE-KEY.

What the queue is made of decides the cost:

| Queue | EXTRACT-MIN | Lowering a key | Dijkstra |
|---|---|---|---|
| Unsorted array | O(V) | O(1) | O(V²) |
| Binary heap | O(log V) | O(log V) | O((V + E) log V) |
| Fibonacci heap | O(log V) amortized | O(1) amortized | O(E + V log V) |

On a dense graph, with E close to V², the plain array wins over the binary heap: O(V²) against O(V² log V). On a sparse graph, the heap wins by a lot. The worst case for a heap is a graph where [every edge lowers a key](#example:lowers-every-key): 15 relaxations, 15 DECREASE-KEYs. [Show me](#play:lowers-every-key)

## Negative edges

Dijkstra refuses a graph with a negative edge. It does not quietly run anyway, and it does not change your weights.

In [A negative edge](#example:negative-edge), C→B weighs -3. Dijkstra settles B at d = 2 before it ever looks at C, because 2 is smaller than C's 4. But A → C → B costs 4 - 3 = 1. The promise in the previous section broke: the rest of the path came back cheaper than 0. [Show me](#play:negative-edge)

Bellman-Ford handles negative edges. It also notices when a negative cycle makes "shortest" meaningless. Load the same graph on the [Bellman-Ford page](/bellman-ford/) and compare. In a DAG, [DAG shortest paths](/dag-shortest-paths/) handles negative weights in O(V + E).

A tempting fix is to add a constant to every weight until they are all positive. It does not work. A path with more edges picks up more of the constant, so the lightest path can change.

```check
Q: Every weight in a graph is 1 except one edge with weight -1. What does Dijkstra on this site do?
- Runs, because one small negative edge cannot do much harm
- Adds 1 to every weight and runs
* Refuses, and explains why the greedy choice can go wrong
- Runs, but skips the negative edge
= Settling the closest vertex is only safe when no weight is negative. One negative edge is enough to break it, so the page refuses and points to Bellman-Ford.
```

## Unreachable vertices

With every vertex in Q, the unreachable ones come out last, still at ∞. In [Unreachable vertices stay at ∞](#example:unreachable), E and F are extracted after D, and relaxing their edges changes nothing, because ∞ plus anything is still ∞. The lazy queue never inserts them at all. [Show me](#play:unreachable)

## When to use it

Use Dijkstra for one source, non-negative weights, and every distance from it: road maps, network routing, the cheapest way through a game level. On [a small road map](#example:roads), each road goes both ways, so RELAX looks at it from both ends. [Show me](#play:roads)

When every weight is the same, BFS gives the same answer in O(V + E) with a plain queue. When weights differ, fewer edges is not lighter. In [Fewer edges is not lighter](#example:fewest-edges), the direct edge A→D weighs 9, but A → B → C → D weighs 3. BFS would pick the direct edge.

Avoid Dijkstra when weights can be negative (Bellman-Ford, or DAG shortest paths for a DAG), and when you need every pair of vertices on a small dense graph (Floyd-Warshall is shorter to write). If you only need one target, you can stop as soon as that target is settled.

## Common mistakes

- Settling a vertex when its key first drops, instead of when it leaves the queue. A key can drop several times before it is final.
- Forgetting to skip stale entries in a lazy heap. Without the check, a vertex is settled twice and its edges are relaxed with an old distance.
- Running on negative weights and trusting the answer. Sometimes it even comes out right, which makes it worse.
- Using `d[u] + w` when d[u] is ∞. In code, ∞ is often a large integer, and adding to it can overflow.
- Expecting the same tree with a different tie rule. Distances do not change, but π can. This site breaks ties by name, so B before C.

## Try this

- [Closest first](#example:closest-first). Before each extraction, say which vertex comes out next and why.
- Run the same graph with the lazy queue. How many entries go into Q in total, and how many come out stale?
- [A negative edge](#example:negative-edge): predict the wrong distance before you press Run.
- Load `A>B:4, A>C:1, C>B:1, B>D:1, C>D:5` and run from A. Then change C>B to C>B:4. What happens to B's key?
- Load a graph with every weight 1, then try it on the [BFS page](/bfs/). Do the distances match?
