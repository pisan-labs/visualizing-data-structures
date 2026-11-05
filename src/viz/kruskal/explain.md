# Kruskal's minimum spanning tree

Kruskal's algorithm is the greedy idea in its plainest form. Sort the edges, lightest first. Take each one, unless it would close a cycle. When you run out of edges, what you kept is a minimum spanning tree. The only hard part is the cycle check, and disjoint sets make it almost free.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `MST-KRUSKAL(G, w)` | a minimum spanning tree A | O(E log V) |
| sort the edges | lightest first | O(E log E) = O(E log V) |
| check one edge u-v | FIND-SET(u) ≠ FIND-SET(v)? | O(α(V)) amortized |

A spanning tree of a connected graph uses V − 1 of its edges and reaches every vertex. A minimum one has the smallest total weight. Prim grows one tree from a start vertex. Kruskal grows a forest everywhere at once: lots of small trees that merge until one is left. [Show me](#play:lightest-first)

## How it works

1. A = ∅, and every vertex is a tree of its own: MAKE-SET(v).
2. Sort the edges by weight.
3. For each edge u-v in that order: if u and v are in different trees, add u-v to A and UNION the two trees. If they are in the same tree, skip u-v: there is already a path from u to v in A, so u-v would close a cycle.

In [Lightest first, skip the cycles](#example:lightest-first), Kruskal keeps C-D, A-C, E-G, B-E, F-H, A-B and D-F, total weight 19. The other seven edges are rejected. B-D (5) is the first: by then B and D are already joined through A and C.

In the drawing, edges not looked at yet are faint. Tree edges turn solid, with green weights and a ✓ in the sorted list. Rejected edges turn red and dashed, with a ✗ beside the weight and in the list. The union-find forest under the list shows who is joined with whom. Each vertex points at its parent, and the root names the tree.

```check
Q: Kruskal has kept A-B and B-C. The next edge in sorted order is A-C. What happens?
- A-C joins the tree, because it is the lightest edge left
* A-C is rejected: A and C are already joined through B
- Kruskal swaps A-C for the heavier of A-B and B-C
= FIND-SET(A) and FIND-SET(C) give the same root, so A-C would close the triangle A, B, C.
```

## Why the lightest edge is safe

The argument is the cut property again. Take the edge u-v that Kruskal adds. u's tree is on one side of a cut, everything else on the other side. Every lighter edge has been looked at already: each one is either in A or inside one tree. So no lighter edge crosses this cut, and u-v is the lightest crossing edge. The lightest crossing edge is always in some minimum spanning tree.

The [Prim page](/prim/) has the full argument. The two algorithms use the same fact with different cuts.

## The cycle check: disjoint sets

How do you know whether u and v are already joined? You could search A from u, but that costs O(V) per edge. Kruskal keeps a disjoint-set forest instead, one set per tree of A. FIND-SET(u) names u's tree, so two FIND-SETs answer the question, and UNION merges two trees when an edge joins them.

This page uses the CLRS version: union by rank with path compression. In [Path compression inside Kruskal](#example:compression), A ends up two steps below its root, D. When A-D comes up, FIND-SET(A) walks A → B → D, and on the way points A straight at D. [Show me](#play:compression) The [disjoint sets page](/disjoint-sets/) has the other variants.

```check
Q: Why does Kruskal use union-find instead of a search from u to check for a cycle?
- A search would give the wrong answer
* A search costs O(V) per edge; two FIND-SETs cost almost O(1)
- Union-find also sorts the edges
= Both give the right answer. With E edges, searching costs O(EV) in total, while union-find adds only O(E α(V)) to the sort.
```

## Variants: stopping early, ties and pieces

CLRS looks at every edge. Once A has V − 1 edges, though, every edge left would close a cycle, so many implementations stop there. Turn on **Stop as soon as the tree has V − 1 edges** and have a look at [Stop at V − 1 edges](#example:stop-early). Kruskal stops after D-F and never looks at the seven heavier edges. Same tree.

Equal weights are sorted in name order here, A-D before B-C. With ties there can be several minimum spanning trees, and the rule decides which one you get. In [Equal weights](#example:ties), the four sides of a square weigh 1, and C-D is the one rejected.

On a graph in pieces, Kruskal needs nothing special. It just ends with one tree per piece: a minimum spanning forest. [Two pieces](#example:forest).

Negative weights are fine: only the order of the edges matters. A directed graph is refused, because a spanning tree of a directed graph is a different problem.

## When to use it

Use Kruskal for a sparse graph given as a list of edges, or when the edges come sorted already (then the sort is free). It is short to write: a sort and twenty lines of union-find. It also gives clustering almost for free: stop when k trees are left, and they are k clusters with the widest possible gaps between them.

On a dense graph most edges are rejected, and sorting them all is wasted work. In [A complete graph](#example:dense), only 5 of 15 edges join the tree. Prim with an array is O(V²) there, with no sort at all. Open [Prim and Kruskal side by side](/kruskal/#compare=prim) on the same graph.

## Common mistakes

- Checking for a cycle with "have I seen both ends before?". Two vertices can both be in A and still be in different trees. Only FIND-SET tells you.
- Calling UNION on u and v without checking FIND-SET first. That merges nothing new and hides the cycle.
- Sorting by weight but forgetting that ties need some rule. The weight is the same either way; the tree is not.
- Expecting V − 1 edges from a graph that is not connected.
- Stopping at V − 1 edges and then using the "rejected" count as if every edge had been checked.

## Try this

- [Lightest first](#example:lightest-first). Before each edge, say whether it will be kept. Which is the first one rejected, and why?
- Turn on the stop option and run it again. How many edges are never looked at?
- Load `A-B:1, B-C:1, C-A:1` here and on the [Prim page](/prim/). Same tree?
- [Path compression inside Kruskal](#example:compression): which vertex moves in the forest when A-D is checked?
- Run the dense preset with 8 vertices. How many edges are rejected? Can you say before you press Run?
