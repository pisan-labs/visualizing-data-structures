# Shortest paths in a DAG

Dijkstra needs weights of at least 0. Bellman-Ford takes negative weights but pays Θ(VE) for them. If the graph has no cycles, there is a much better deal: sort the vertices so every edge points forward, then relax each edge once. Negative weights and all, that is O(V + E).

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `DAG-SHORTEST-PATHS(G, w, s)` | d and π for every vertex, or a cycle that stops it | Θ(V + E) |
| Topological sort (DFS) | an order where every edge goes left to right | Θ(V + E) |

A DAG is a directed graph with no cycles. Its vertices can be lined up so that every edge goes from left to right: a topological order. Take the vertices in that order and relax the edges out of each one. When a vertex's turn comes, every edge into it has been relaxed already, so its d is final. [Show me](#play:sort-then-relax)

## How it works

The order comes from depth-first search, as in CLRS. Search the whole graph, taking vertices and neighbours in name order. When a vertex finishes, because everything it leads to has finished, put it at the front of a list L. The last vertex to finish ends up first.

Then every d starts at ∞, s gets 0, and each vertex of L, in turn, relaxes its edges: if d[u] + w(u, v) < d[v], then d[v] = d[u] + w(u, v) and π[v] = u.

In [Sort first, then relax](#example:sort-then-relax), G finishes first and A last, so L = A, C, B, E, F, D, G. D's d drops from 8 to 7 to 6 while C, B and E take their turns, all before D's own turn. By the time D relaxes D→G, its d is final. Each of the 10 edges is relaxed exactly once.

In the drawing, the search colors vertices teal while it is inside them and green when they finish, and L fills from the front. Then the vertex whose edges are relaxed is marked u, finished vertices turn green, and the π edges become arrows.

```check
Q: Why can d[u] not change after u's turn in L?
- Because u is the closest vertex left, as in Dijkstra
* Every edge into u comes from a vertex earlier in L, and those have all been relaxed
- Because the weights are not negative
- It can change; that is why each vertex is relaxed twice
= In a topological order every edge points forward. So all of u's incoming edges belong to vertices before u, and they are done before u's turn.
```

## Negative weights

Nothing in the argument above needs a weight to be positive. In [Negative weights are fine in a DAG](#example:negative-weights), B→C weighs -4 and C→E weighs -2. Dijkstra would refuse this graph; here it is just another graph. [Show me](#play:negative-weights)

## Cycles

A cycle has no topological order: some edge on it has to point backwards. Depth-first search notices this for free. If it follows an edge to a vertex that is still gray, a vertex the search is still inside of, that edge closes a cycle. In [A cycle](#example:cycle), the search goes A, B, C, D, and D→B leads back to B. The page stops there, names B → C → D → B and draws it. [Show me](#play:cycle)

An undirected edge goes both ways, so every undirected graph with an edge has a cycle, and [the page refuses it](#example:undirected) straight away. For graphs with cycles, use [Dijkstra](/dijkstra/) or [Bellman-Ford](/bellman-ford/).

## Starting in the middle

The order is the same whatever the start vertex. Vertices before s in L cannot be reached from s, because every edge points forward. They keep d = ∞, and relaxing their edges changes nothing. In [Starting in the middle](#example:middle-start), A comes before C, so a run from C never reaches A. [Show me](#play:middle-start)

## Longest paths: the critical path

Set **Find** to longest paths. Now every d starts at -∞ and RELAX keeps the larger total. That is the same as negating every weight and finding shortest paths: the heaviest path with w is the lightest with -w.

This is how project schedules work. Each edge is a task, its weight is how long it takes, and a task can start once everything before it is done. The longest path is the critical path: no schedule can finish sooner, and a delay on any task along it delays the whole project. In [The critical path of a project](#example:critical-path), it is A → C → D → F → G, 12 days. [Show me](#play:critical-path)

The trick only works because a DAG has no cycles. In a graph with a cycle, the negated weights could make a negative cycle, and finding the longest simple path is NP-hard.

```check
Q: Why can't we find longest paths in any graph by negating the weights and running Bellman-Ford?
- Bellman-Ford does not accept negative weights
- The answer would come out negative
* A cycle of positive weight becomes a negative cycle, so there is no shortest path to find
- It works, it is just slower
= Negating turns every positive cycle into a negative one. Bellman-Ford would report the cycle instead of an answer. In a DAG there are no cycles, so negating is safe.
```

## When to use it

Use it whenever the graph is a DAG: task schedules, build dependencies, course prerequisites, stages of a pipeline. Many dynamic programming problems are shortest or longest paths in a DAG in disguise, with subproblems as vertices.

Even [every pair joined](#example:dense) is still one relaxation per edge. [Show me](#play:dense)

Avoid it when the graph might have cycles: it will stop at the first one. If you are not sure, run it anyway; the search finds out.

## Common mistakes

- Relaxing in name order, or in the order vertices are discovered, instead of topological order.
- Putting vertices in L when they are discovered rather than when they finish.
- Using BFS layers as the order. In [the first example](#example:sort-then-relax), B and C are both one edge from A, but C→B means C has to come first.
- Starting the longest-path d at 0 instead of -∞. Then unreachable vertices look reachable.
- Expecting the order to be unique. A DAG can have many topological orders; any of them gives the same distances.

## Try this

- [Sort first, then relax](#example:sort-then-relax). Before the sort, guess which vertex finishes first.
- Run the same graph on the [Dijkstra page](/dijkstra/). Same distances, different order of work?
- [The critical path](#example:critical-path): which single task could take one day longer without delaying the project?
- Load `A>B:1, B>C:1, C>A:1` and run it. Which edge does the search catch?
