# Prim's minimum spanning tree

You have to connect eight towns with cable, and every possible link has a price. You want every town connected, and you want to pay as little as possible. No loops: a loop means you paid for a cable you did not need. What you want is a minimum spanning tree, and Prim's algorithm grows one from a single vertex.

## The idea

| Operation | What it finds | Cost (binary heap) |
|---|---|---|
| `MST-PRIM(G, w, r)` | π (the parent in the tree) for every vertex | O(E log V) |
| checking an edge u-v | whether u-v is the lightest way into v so far | O(log V) when it lowers a key |

A spanning tree of a connected graph uses V − 1 of its edges and reaches every vertex. A minimum one has the smallest total weight. There can be several minimum spanning trees with the same weight, but there is only one when all the weights are different.

Prim keeps one tree and grows it one vertex at a time. Every vertex not in the tree waits in a priority queue Q, keyed by the weight of the lightest edge between it and the tree. Each round takes the vertex with the smallest key and adds it, with that edge. [Show me](#play:key-drops)

## How it works

Every vertex starts with key = ∞ and π = NIL. The root r gets key = 0, so it comes out first. Then, until Q is empty:

1. Take u, the vertex in Q with the smallest key. It joins the tree with the edge (u.π, u).
2. For each edge u-v where v is still in Q: if w(u, v) < v.key, set v.key = w(u, v) and v.π = u.

If you have seen Dijkstra's algorithm, this looks very familiar. It is almost the same code. The only difference is the key. Dijkstra's key is the length of the whole path from the start, d[u] + w(u, v). Prim's key is just the one edge, w(u, v). That small change answers a different question.

In [Lightest edge out of the tree, every time](#example:key-drops), the vertices join in the order A, C, D, B, E, G, F, H. D waits at key 6 (the edge A-D) until C joins, and then C-D offers it a link of weight 1. The tree weighs 19.

In the drawing, vertices in the tree are green with a thick outline. They sit in the T part of the T | Q row, in the order they joined, with the key they joined at. Vertices waiting with a finite key wear a dashed ring and a small k= badge. The arrows are π: from each vertex to the one that offers it the lightest edge so far. At the end only the tree stays.

```check
Q: The tree holds A and C. Q holds B with key 4 and D with key 1. Which edge joins the tree next?
- The lightest edge in the whole graph
* The edge that gave D its key, of weight 1
- The edge to B, because B comes first in name order
= Prim always takes the smallest key in Q. D's key is the weight of the lightest edge from the tree to D.
```

## Why the lightest edge is safe

Cut the graph in two: the tree on one side, everything else on the other. Some edges cross the cut. The lightest crossing edge is always in some minimum spanning tree. This is the cut property.

Why? Take any minimum spanning tree that does not use that edge, call it e. Add e to it, and you get a cycle. That cycle has to cross the cut again somewhere else, through another edge f. f is at least as heavy as e, because e was the lightest crossing edge. Take f out. You have a spanning tree again, and it weighs no more than before. So a minimum spanning tree with e exists.

Prim applies the cut property every round. The tree is one side of the cut, the vertex with the smallest key is at the other end of the lightest crossing edge, so adding it is safe. Kruskal uses the same property with different cuts.

## The priority queue

CLRS puts every vertex in Q at the start and lowers a key with DECREASE-KEY. That is the default here. Most code with a binary heap is lazier: it puts r in alone and inserts a new entry whenever a key drops. The old entry stays behind. When it comes out later, its vertex is already in the tree, so it is stale and skipped.

Switch **Priority queue** to the lazy version and have a look at [the lazy queue](#example:lazy-queue). D goes in twice, at 6 and at 1. [Show me](#play:lazy-queue) Both queues add the vertices in the same order and build the same tree. The code tabs use the lazy version, because Python's `heapq` has no DECREASE-KEY.

| Queue | EXTRACT-MIN | Lowering a key | Prim |
|---|---|---|---|
| Unsorted array | O(V) | O(1) | O(V²) |
| Binary heap | O(log V) | O(log V) | O(E log V) |
| Fibonacci heap | O(log V) amortized | O(1) amortized | O(E + V log V) |

On a dense graph, the plain array wins over the binary heap. [Every edge lowers a key](#example:dense) shows the worst case for a heap: a complete graph where all 15 edges lower a key. On [a graph that is already a tree](#example:already-a-tree), there is nothing to choose, and every key is set once.

## Start vertex, ties and pieces

**Start vertex r** in the options picks the root. With distinct weights, every root gives the same tree. In [Start somewhere else](#example:other-root), Prim starts at H and adds the vertices in a different order, but ends with the same edges and weight 19. [Show me](#play:other-root)

When weights are equal, there can be several minimum spanning trees. Prim breaks ties in Q by name, so B before C. In [Equal weights](#example:ties), the four sides of a square all weigh 1, and which three end up in the tree depends on that rule. The weight does not.

A graph in pieces has no spanning tree. With every vertex in Q, CLRS's version notices on its own: when one piece is done, every key left is ∞, and the next vertex out starts a new tree. The lazy version restarts at the first vertex left. Either way you get a minimum spanning forest. [Two pieces](#example:forest). [Show me](#play:forest)

Negative weights are fine. A spanning tree has no paths to get confused about, so Prim does not care about signs. A directed graph is not fine: this page refuses one, because a spanning tree of a directed graph is a different problem (an arborescence).

```check
Q: Every edge weight in a graph goes up by 10. What happens to its minimum spanning tree?
* Nothing: the same edges are still a minimum spanning tree
- It can change, because paths with more edges get heavier
- It changes only if some weights were negative
= Every spanning tree has exactly V − 1 edges, so every tree gets 10(V − 1) heavier. The order between trees does not change. (Shortest paths are different: there the number of edges varies.)
```

## When to use it

Use Prim for a minimum spanning tree of a dense graph, or a graph stored as an adjacency matrix: the O(V²) array version is short and fast there. Networks (cable, roads, pipes), clustering (build the tree, then cut its heaviest edges), and approximations for the travelling salesperson problem all start with a minimum spanning tree.

For a sparse graph given as a list of edges, Kruskal is usually simpler: sort the edges and use union-find. Load the same graph on the [Kruskal page](/kruskal/), or open [Prim and Kruskal side by side](/prim/#compare=kruskal).

## Common mistakes

- Using Dijkstra's key, u.key + w(u, v), instead of w(u, v). The result is a shortest-path tree, which is usually not a minimum spanning tree.
- Forgetting the "v is still in Q" check. Without it, an edge back into the tree can change a parent that is already final.
- Forgetting to skip stale entries in a lazy heap. A vertex is then added twice and the weight comes out too big.
- Expecting a spanning tree from a graph that is not connected. Check the number of tree edges: V − 1 means connected.
- Expecting one particular tree when weights tie. The weight is fixed; the edges are not.

## Try this

- [Lightest edge out of the tree](#example:key-drops). Before each extraction, say which vertex comes out and through which edge.
- Run the same graph with the lazy queue. How many entries go in, and how many come out stale?
- Change the start vertex to E. Is the tree the same? Is the order?
- Load `A-B:1, B-C:1, C-A:1` and run it. Then run it on the [Kruskal page](/kruskal/). Same tree?
- Load a graph and give every edge weight 1. Which tree does Prim pick, and why that one?
