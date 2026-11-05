# Bipartite check

Can you split the vertices into two sides so that every edge goes from one side to the other? Students and courses, jobs and machines, players on two teams. If you can, the graph is bipartite. If you cannot, there is always a reason you can point at: an odd cycle.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| Two-color with BFS or DFS | a side (0 or 1) for every vertex, or an odd cycle | O(V + E) |

Put the first vertex on side 0. Its neighbours have to go on side 1. Their neighbours have to go on side 0. There is no choice at any point: once one vertex has a side, the side of everything it can reach is forced. So search, and give each vertex you find the other side from the vertex that found it. [Show me](#play:even-cycle)

If an edge ever joins two vertices on the same side, the split is impossible. Not just for this search: for any split at all.

## How it works

Every vertex starts with side = NIL. For each vertex s in name order:

1. If s already has a side, skip it.
2. Otherwise put s on side 0 and search from it.
3. For each edge u-v the search looks at: if v has no side, it goes on side 1 - u.side, with π = u. If v is on the same side as u, stop. The graph is not bipartite.

When every edge has been checked without a clash, the answer is yes. The badge beside each vertex shows its side, and the side row of the table fills in as the search goes.

A piece that is not connected to anything found so far gets a fresh start on side 0. That choice is free: nothing ties it to the earlier pieces. But every piece has to pass. In [Two pieces](#example:two-pieces), the path A, B, C splits fine, and then the triangle D, E, F does not.

## The odd cycle

Why does a clash prove anything? Say the clash is at the edge u-v, both on side 0. Follow π up from u and from v until the two paths meet. Along each path the sides alternate, so both paths have the same length parity. The two paths plus the edge u-v make a cycle with an odd number of edges.

Now walk around any odd cycle and alternate sides: 0, 1, 0, 1, ... After an odd number of steps you are back at the start, on the other side. That cannot work. So a graph with an odd cycle is never bipartite, and the cycle is the proof. The page draws it in red.

In [A clash far from the start](#example:pentagon), D and E are both on side 0. Up from D: D, B, A. Up from E: E, C, A. They meet at A, and with D-E that is the cycle D, B, A, C, E: 5 edges. [Show me](#play:pentagon)

The other way round is true too: a graph with no odd cycle is always bipartite. [An even cycle](#example:even-cycle) and [a grid](#example:grid) split cleanly.

```check
Q: A graph is a single cycle of 8 vertices. Is it bipartite?
* Yes
- No
- Only if you start at the right vertex
= An even cycle alternates 0, 1, 0, 1, ... and the last edge joins side 1 back to side 0. Only odd cycles break the split.
```

## BFS or DFS

Both give the right answer. BFS puts each vertex at distance d on side d mod 2. DFS flips the side at each step down. On a graph that is not bipartite they can stop at different edges and show a different odd cycle. Run [the same graph with DFS](#example:dfs-check): it finds the same 5-cycle from the other end, C, E, D, B, A.

Direction does not matter. If you load arcs, the check treats them as edges.

## When to use it

Use it before you use an algorithm that needs two sides: bipartite matching (assign students to projects), scheduling with two shifts, or two-coloring a map of conflicts. It also answers "can these people be split into two teams with no rivals on the same team?"

It is a special case of graph coloring. Two colors is easy: O(V + E). Three colors is NP-complete. Nobody knows a fast way.

```check
Q: The check stops at a triangle A, B, C. Could a different starting vertex make the graph bipartite?
- Yes, starting at C might work
* No: a triangle is an odd cycle, and no split works for it
- Only if DFS is used instead of BFS
= The starting vertex only changes which side is called 0. An odd cycle cannot alternate, whichever vertex you start at.
```

## What it costs

Each vertex gets a side once, and each list is read at most once: O(V + E). A yes reads everything; [the grid](#example:grid) checks all 12 edges from both ends. A no can stop early: in [the triangle](#example:triangle), the check stops after four edge checks and never looks at D or E.

Finding the cycle walks π up from two vertices: O(V) at most, as in [the odd cycle of 7](#example:odd-cycle).

## Common mistakes

- Checking only the piece that contains the first vertex. Every piece has to pass.
- Coloring a vertex when it leaves the queue. Give it a side when it is found.
- Reporting the clash edge without the cycle. "D-E is bad" is not a proof; the odd cycle is.
- Thinking a graph with a cycle is not bipartite. Only odd cycles count.
- Expecting the same cycle from BFS and DFS. Each finds an odd cycle, maybe not the same one.

## Try this

- [An even cycle](#example:even-cycle). Before each step, say which side the next vertex gets.
- [The odd cycle of 7](#example:odd-cycle). Where do the two searches around the ring meet?
- [A clash far from the start](#example:pentagon), then [the same graph with DFS](#example:dfs-check). Which edge does each one stop at?
- Load `A-B, B-C, C-D, D-A, A-C` and check it. Remove `A-C` and check again.
- Set **Layout** to Layers on [the grid](#example:grid): each row is one distance from A, and the sides alternate row by row.
