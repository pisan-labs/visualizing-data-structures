# General matching (blossom)

A matching is a set of edges where no two share a vertex. Pair up roommates, chess players for a round, or atoms in a molecule: each one gets at most one partner. A maximum matching has as many edges as possible.

When the graph is bipartite (two sides, edges only across), augmenting paths and a breadth-first search do the job. In a general graph that breaks, and the reason is odd cycles. Jack Edmonds fixed it in 1965 with blossoms, in a paper called "Paths, trees, and flowers". It was also one of the first papers to argue that "polynomial time" is what efficient should mean.

| Operation | What it does | Cost |
|---|---|---|
| One phase | Grow the forest, find one augmenting path | O(V²) here |
| Contract a blossom | Shrink an odd cycle to its base | O(V) |
| Whole run | At most V/2 phases | O(V³) |

## Augmenting paths

An augmenting path starts at a free vertex, ends at another free vertex, and alternates edges outside and inside the matching. Flip it (out becomes in, in becomes out) and the matching grows by one. Berge's theorem says the converse too: a matching is maximum exactly when no augmenting path exists. So the whole algorithm is: find an augmenting path, flip it, repeat until there isn't one.

```check
Q: An augmenting path has 7 edges. How many of them are in the matching before the flip?
- 4
* 3
- 7
= It starts and ends with unmatched edges and alternates, so 4 are unmatched and 3 are matched. After the flip the matching has one more edge.
```

## The forest

Each phase makes every free vertex the root of its own tree and calls it even (+). Then it takes even vertices from a queue and looks at their edges. For an edge v-w from an even vertex v:

- w is in no tree. Then w is matched (every free vertex is already a root), so hang w off v as odd (−) and its mate off w as even. Queue the mate.
- w is even in another tree. Root to v, the edge v-w, w to its root: an augmenting path. Flip it and start the next phase.
- w is odd. Skip it.
- w is even in the same tree. That's the interesting one.

## Blossoms

Two even vertices in the same tree, joined by an edge, close a cycle. Count its edges: the two tree paths down from their common ancestor have the same parity, plus the one new edge, so the cycle is odd. That odd cycle is a blossom, and the vertex where it hangs off the rest of the tree is its base.

In a bipartite search we would now be stuck, because whether a vertex is even or odd depends on which way round the cycle you go. Edmonds' idea is to stop caring. Contract the blossom into a single vertex, its base, and treat everything in it as even. Every vertex in a blossom can be reached from the base by an even-length alternating path, going round one way or the other, so any augmenting path that finds the shrunken vertex can be continued into the real graph. The odd vertices of the cycle become even and join the queue.

When a path is found, expand the blossoms on it. Inside each one, the path goes round the side that keeps it alternating. [Show me](#play:through-a-blossom)

Blossoms can nest: a cycle through an earlier blossom is another blossom, and it simply takes over the old base. [Two blossoms](#example:two-blossoms) has a pair of them.

```check
Q: The search finds an edge between two even vertices of the same tree. The tree paths from their common ancestor have 2 and 4 edges. How long is the cycle?
- 6 edges, even
* 7 edges, odd: a blossom
- It depends on the matching
= 2 + 4 + 1 = 7. Both tree paths from an even vertex to an even vertex have even length, so the extra edge always makes the cycle odd.
```

## When to use it

Use it when the pairing has no natural two sides: roommates, partners in a tournament round, pairing up delivery stops for two-drop vans. If the graph is bipartite, plain bipartite matching (or Hopcroft-Karp) is simpler and does the same thing. If the edges have weights and you want the best total, you need the weighted version of the blossom algorithm, which adds potentials like the Hungarian algorithm. That one is famously fiddly, and it is not on this page.

## Failure cases and common mistakes

- Running the bipartite algorithm on a graph with an odd cycle. It misses augmenting paths, and the matching it returns can be too small.
- Greedy matching. Taking any free edge gives a maximal matching (nothing can be added), but it can be half the size of a maximum one.
- Forgetting the base. The blossom keeps the base's label, its place in the tree and its single unmatched edge out. Pick the wrong vertex and the expansion breaks.
- Expecting to always match every vertex. [Five in a ring](#example:odd-cycle) must leave one free, and [a star](#example:star) leaves all but two free.
- Thinking blossoms are rare. Any triangle can become one.

## Try this

- [A path through a triangle](#example:through-a-blossom). Pause when the blossom appears and predict which vertices become even.
- [Two blossoms](#example:two-blossoms). Pause at each blossom and find its base before the narration says it.
- [Five in a ring](#example:odd-cycle). The last phase contracts the whole ring and then gives up. Why is that a proof?
- [No odd cycles, no blossoms](#example:bipartite). Count the blossoms (zero) and compare with the bipartite matching page.
- Pick **Triangles along a path** from the presets, or type your own graph, such as `A-B, B-C, C-A, C-D, D-E`, and press **Load**.
