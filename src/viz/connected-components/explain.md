# Connected components

A graph can come in pieces. Two vertices are in the same piece, the same connected component, when a path of edges joins them. Finding the components answers questions like: is this network connected? Which computers can talk to each other? Which pixels belong to the same blob?

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| Search from every unlabeled vertex (BFS or DFS) | cc, the component number of each vertex, and the count | Θ(V + E) |
| Union-find over the edges | the same numbers | O((V + E) α(V)) |

Take the vertices in order. If a vertex has no number yet, it starts a new component: add one to the count and search from it. Everything the search reaches gets the same number. Then move on to the next vertex without a number. [Show me](#play:three-pieces)

A search from s reaches exactly the vertices that have a path from s. So one search labels one whole component, nothing more and nothing less. The outer loop makes sure no piece is missed.

## How it works

Every vertex starts with cc = NIL, and count = 0. Then, for each vertex s in name order:

1. If s already has a number, skip it. Some earlier search found it.
2. Otherwise, count = count + 1 and s.cc = count.
3. Search from s. Every vertex the search finds gets cc = count.

In the drawing, each component gets its own color and a badge with its number (#1, #2, ...). The queue (or the call stack) sits beside the graph, and the cc row of the table fills in as vertices are found. Edges the search used are solid arrows; edges it looked at and skipped are dashed.

Every edge is checked twice, once from each end. In [the connected graph](#example:one-piece) that is 20 checks for 10 edges, and one search does all the labeling.

```check
Q: The search from A labels A, B, C and D. The outer loop then reaches E, which has no number. What does that tell you?
- E is a neighbour of D
* There is no path from A to E
- The graph has exactly two components
- The search from A made a mistake
= If a path from A to E existed, the search from A would have found E. E starts a new component. There may be more after it.
```

## BFS, DFS or union-find

Any search works. Breadth-first search uses a queue; depth-first search goes as deep as it can. They find the same components with the same numbers, in a different order. Switch **Find them with** and run the same graph to see it.

DFS by recursion has a catch. On [a long path](#example:deep-path), every vertex is open on the call stack at once. Seven calls is fine. A million is not.

Union-find does not search at all. Every vertex starts as a set of its own. It reads each edge once: if the two ends are in different sets, merge them. When the edges run out, each set is a component. This is how CLRS does it. [Merge sets, edge by edge](#example:union-find) shows the edges that add nothing: their ends are already in the same set. [Show me](#play:union-find)

Union-find keeps a parent p for each vertex; the root of a tree names the set. Two tricks keep the trees flat. Union by rank hangs the shorter tree under the taller one. Path compression points every vertex on a FIND-SET path straight at the root. In [Ranks grow](#example:late-merge), FIND-SET(C) walks C → D → E, and after that C points at E directly.

Why bother with union-find? It handles edges that arrive one at a time. Add an edge, and the components are up to date after two finds and a union. A search would have to start over.

## Directed graphs

Components ignore direction here: an arc A>B joins A and B just like A-B. These are the weakly connected components. In [the directed example](#example:directed-weak), nothing leads from B back to C, but they are still in the same piece.

Strongly connected components ask for paths both ways, and need a different algorithm.

## When to use it

Use it to check that a graph is connected (one component), to count islands in a map, to group duplicates that are linked by "same as" pairs, or as a first step before running something that needs a connected graph.

Use a search when you have the whole graph. Use union-find when edges keep arriving, or when you only need to ask "are u and v connected?" many times.

```check
Q: A graph has 10 vertices and 3 components. Union-find reads all its edges. How many unions does it do?
- 3
- 10
* 7
- It depends on the order of the edges
= Every union merges two sets into one. Ten sets end as three, so there are 7 unions, whatever the order. Every other edge finds its ends in the same set.
```

## Common mistakes

- Starting one search from A and calling it done. A disconnected graph needs the outer loop.
- Forgetting isolated vertices. A vertex with no edges is a component by itself. [No edges](#example:isolated) has six of them.
- Marking a vertex when it leaves the queue instead of when it enters. It can then go in the queue twice.
- Treating a directed graph's weak components as strong ones. C>B joins C and B here, but B cannot reach C.
- Union-find without rank or path compression. It still works, but a long chain can make each find cost O(V).

## Try this

- [Three pieces](#example:three-pieces). Before each search starts, say which vertex starts it and what it will label.
- Run [Three pieces](#example:three-pieces) with all three settings. Do the numbers change? Does the order?
- [A path with DFS](#example:deep-path): watch the calls row grow to seven.
- [Ranks grow](#example:late-merge): predict p for every vertex at the end.
- Load `A-B, C-D, E-F, B-C` and run with union-find. How many sets are left after the first three edges?
