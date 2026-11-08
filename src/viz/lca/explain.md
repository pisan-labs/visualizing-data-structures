# Lowest common ancestor (binary lifting)

In a rooted tree, the lowest common ancestor of u and v is the deepest vertex that has both of them below it. Family trees, file systems, the class hierarchy in your Java project: "what is the nearest thing these two share?" comes up all the time. Walking up one step at a time works, and on a tall tree it is slow. Binary lifting stores each vertex's ancestors 1, 2, 4, 8, ... steps up, and answers any query in O(log n) jumps.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `BUILD(T, r)` | fill up[k][v], the ancestor 2^k steps above v | Θ(n log n) time and space |
| `LCA(u, v)` | lift, then jump both | O(log n) |
| naive walk | step up one parent at a time | O(height), up to O(n) |

Any distance is a sum of powers of 2. Going up 13 steps is a jump of 8, then 4, then 1. If you have the table, that's three lookups instead of thirteen. [Show me](#play:build-table)

## Building the table

Row 0 is the parent, from one breadth-first search from the root. Every next row doubles: going up 2^k is going up 2^(k−1) twice, so

up[k][v] = up[k−1][ up[k−1][v] ]

[Fill the table row by row](#example:build-table) does it for ten vertices. Row 1 jumps 2 up, row 2 jumps 4, and row 3 (8 up) is all NIL, shown as –: the tree is only 3 deep. There are ⌈log₂ n⌉ rows, so the table has n log n cells.

```check
Q: up[0][E] = B and up[0][B] = A. What is up[1][E]?
- B
* A
- E
- NIL
= up[1][E] = up[0][up[0][E]] = up[0][B] = A: two steps above E.
```

## Answering a query

1. Make u the deeper vertex. Lift it by d = depth(u) − depth(v): for each 1-bit k of d, jump u = up[k][u].
2. If u = v now, v was an ancestor of u. Done. [One vertex is the other's ancestor](#example:ancestor)
3. Otherwise try k from the top row down. If up[k][u] ≠ up[k][v], the LCA is above that point: jump both. If they are equal, that jump lands at the LCA or above it, so don't take it.
4. When the loop ends, u and v are children of the LCA. The answer is up[0][u].

In [Two vertices on different branches](#example:two-branches), G and J are both 3 deep. The jumps of 8 and 4 land both on NIL: same, too far. The jump of 2 lands them on B and C: different, so take it. Their parent, A, is the answer. One jump in all. [Show me](#play:two-branches)

Step 3 is a binary search on the depth of the LCA. Never jumping onto the LCA itself, only to just below it, is what makes it work: "same" might be the LCA or something higher, while "different" is definitely below it.

```check
Q: After lifting, u and v are at the same depth and different. For k = 2, up[2][u] = up[2][v] = X. What do we know?
- X is the LCA
* The LCA is X or a descendant of X; don't jump
- u and v must be siblings
= Equal ancestors 4 up means the paths have joined by then. The LCA could be lower, so a smaller jump decides.
```

## Variants

What is above the root? This page shows NIL by default. Many programs set the root as its own parent, up[k][root] = root, so a jump past the root stays put. The answers are the same; switch the option and try [Siblings, with the root as its own ancestor](#example:siblings).

The root matters, of course. The same tree rooted somewhere else has different ancestors. [The same tree, rooted at D](#example:other-root) answers LCA(G, J) = D, not A.

Other methods: an Euler tour plus a range-minimum structure gives O(1) queries after O(n log n) preprocessing. Tarjan's offline algorithm answers a batch of queries with union-find in nearly linear time. Binary lifting is the one people write in a contest, and the table is handy for "the ancestor k steps up" too.

## When to use it

Many queries on a tree that doesn't change: distances in a tree (depth(u) + depth(v) − 2·depth(LCA)), nearest common manager in an org chart, merging version histories. On a long path the savings are biggest: [A long path](#example:long-path) goes 7 steps in 3 jumps.

For a single query, skip the table. Walking up is O(height), and the table costs n log n to build. If the tree changes a lot, the table goes stale; link-cut trees handle that, and they are a different story.

## Common mistakes

- Forgetting to lift the deeper vertex first. Jumping both from different depths compares apples and oranges.
- Jumping when the ancestors are *equal*. That overshoots to the LCA or above, and the answer comes out too high.
- Returning u instead of up[0][u] at the end. After the loop, u and v are just below the LCA.
- Too few rows. You need 2^LOG ≥ n, or a deep vertex can't be lifted all the way.
- Reading NIL as a vertex. Two NILs are "equal", which correctly means "too far".

## Try this

- [Fill the table](#example:build-table). Before each row fills in, predict up[2][J].
- Query `I J` on the starting tree. How many jumps? Then query `G I`.
- Root the starting tree at J in the options and query `G H`. Still D?
- Run the Path preset with 12 vertices and query the two ends. Count the jumps against 11 steps.
