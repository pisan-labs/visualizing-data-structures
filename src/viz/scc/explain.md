# Strongly connected components

In a directed graph, u reaching v says nothing about v reaching u. A strongly connected component is a group of vertices where every one reaches every other one. Two vertices are in the same component exactly when they sit on a common cycle. Shrink each component to a single vertex and what is left, the component graph, is always a DAG.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| Kosaraju: DFS, transpose, DFS | the components, in topological order | Θ(V + E) |
| Tarjan: one DFS with low-links | the components, in reverse topological order | Θ(V + E) |

Every vertex is in exactly one component, even if it is alone. In [Four components](#example:four-components), A, B and E share a cycle, so do C and D, so do F and G, and H is on its own. [Show me](#play:four-components)

Each component gets a color and a number. Colors repeat after eight, so check the number in the **SCCs** row. Turn on **Show the component graph** to see the DAG that is left.

## Kosaraju's algorithm

This is the CLRS version, and the default here. Three steps:

1. Run DFS on G and record when each vertex finishes.
2. Reverse every arc. That is G^T, the transpose.
3. Run DFS on G^T, but take the starting vertices by decreasing finish time. Each tree of this search is one component.

Why does it work? The vertex that finishes last in pass 1 is in a source component: nothing outside its component reaches it. In G^T every arc flips, so that source becomes a sink. The search from it can reach its own component and nothing else. Take it away and repeat with the next latest finish.

[Why the second pass uses G^T](#example:why-transpose) shows what goes wrong without the flip. B>C joins two components. In G, a search from A would wander over B>C and swallow everything. In G^T that arc is C>B, and the search from A stops at B. [Show me](#play:why-transpose)

```check
Q: In Kosaraju's second pass, which vertex starts the first search?
- The first vertex in name order
* The vertex with the largest finish time from pass 1
- The vertex with the smallest finish time from pass 1
- Any vertex with no arcs in
= Latest finish first. That vertex is in a source component of G, which is a sink in G^T, so its search stays inside its own component.
```

## Tarjan's algorithm

Set **Algorithm** to Tarjan. One DFS, no transpose. Each vertex gets an index d, in discovery order, and a low-link, low, which starts at d. Every vertex goes on a stack when it is discovered.

- For a tree edge u → v, after exploring v: u.low = min(u.low, v.low).
- For an arc u → v to a vertex still on the stack: u.low = min(u.low, v.d).
- An arc to a vertex in a finished component is ignored.

When u finishes with u.low == u.d, nothing in u's subtree climbs above u. So u is the root of a component: pop the stack down to u, and that is it. If u.low < u.d, u stays on the stack and waits for its root.

In [Low-links climbing back](#example:low-links), F → D drops F's low to D's index, and the drop carries back up through E. D finishes with low equal to d and pops {D, E, F}. Then C → A drops C's low to 1, and A pops {A, B, C}. [Show me](#play:low-links)

Tarjan finds components sink first, the reverse of Kosaraju. Compare [Four components, Tarjan's way](#example:four-components-tarjan) with the Kosaraju run.

```check
Q: In Tarjan's algorithm, u finishes with u.low = 2 and u.d = 5. What happens?
- Pop the stack down to u: a new component
* u stays on the stack: it belongs to a component rooted higher up
- u is a component on its own
- The algorithm has found a mistake
= low < d means something in u's subtree reaches a vertex with a smaller index that is still on the stack. The component's root is above u.
```

## When to use it

Use it whenever cycles get in the way. Shrink each component to one vertex and you have a DAG, so anything that needs a DAG (topological sort, longest paths, dynamic programming) can run on the components. 2-SAT is solved this way: a formula is satisfiable exactly when no variable shares a component with its negation. Other uses are finding groups of web pages that all link to each other and spotting deadlocks, which are cycles of processes waiting on each other.

Kosaraju is easier to explain and easier to get right. Tarjan does one pass and needs no copy of the graph, so it uses less memory. On an undirected graph both just find the connected pieces, see [Undirected](#example:undirected), and a plain DFS or BFS does that with less fuss.

## What it costs

Both are Θ(V + E) with adjacency lists. Kosaraju runs two searches and builds G^T, which is a second copy of every arc. Tarjan runs one search and keeps d, low and a stack, Θ(V) extra. Both are recursive, so a long path of V vertices means V calls on the stack. [One big cycle](#example:one-cycle) is the deepest it gets for its size.

A [DAG](#example:dag) is the dull case. No cycles, so every vertex is alone, and both algorithms still look at everything to be sure.

## Common mistakes

- Running the second pass of Kosaraju in name order. It has to go by decreasing finish time.
- Running the second pass on G instead of G^T. The first search then leaks into other components.
- In Tarjan, updating low from an arc to a vertex that is already in a finished component. Those are ignored. Only vertices still on the stack count.
- Thinking a vertex alone is not a component. It is, with one vertex.
- Confusing weakly connected (connected if you ignore direction) with strongly connected.

## Try this

- [Four components](#example:four-components): before you play it, guess which vertex finishes last in pass 1.
- Switch [Four components](#example:four-components) to Tarjan. Which component comes off the stack first, and why that one?
- Load `A>B, B>C, C>D, D>A` and then add `D>B`. Does the number of components change?
- [A DAG](#example:dag): which one arc, added, makes all five vertices a single component?
