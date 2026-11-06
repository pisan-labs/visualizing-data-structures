# Minimum vertex cover

You run a museum with a lot of corridors, and you want a guard who can see every corridor. A guard standing at a junction sees every corridor that touches it. How few guards do you need? That is the vertex cover problem: pick the fewest vertices so that every edge has at least one end among them.

## The idea

| Method | What it finds | Cost |
|---|---|---|
| Brute force, smallest set first | a minimum cover | O(2ⱽ E) |
| Branching on an uncovered edge | a minimum cover | O(2ᵏ E), k the size of a minimum cover |
| APPROX-VERTEX-COVER (both ends of a matching) | a cover at most 2 × the minimum | O(V + E) |
| Greedy by degree | some cover, no factor 2 | O(E log V) with a heap |

Finding a minimum vertex cover is NP-hard. It was one of Karp's original 21 NP-complete problems in 1972, and it still is. So there are two kinds of methods on this page: exact ones, which take exponential time, and fast ones, which settle for a cover that is not too big.

Every run ends with the cover, its size, the size of a minimum cover (the page finds one by brute force), and the ratio between them. Weights are ignored here: a cover counts vertices. [Show me](#play:matching-doubles)

## The matching method

CLRS's APPROX-VERTEX-COVER is four lines long. Start with an empty cover C. While some edge has neither end in C, pick one such edge and put both of its ends in C.

That looks wasteful, and it is. Why both ends? Because you do not know which one is the right one, and taking both is the only way to be sure the edge is covered without thinking.

The proof of the factor 2 is short. The edges the method picks share no vertex: after picking u-v, every other edge touching u or v is covered and never picked. So the picked edges are a matching. Any cover, including the best one, needs at least one end of each matched edge, and those ends are all different. So the minimum is at least the number of picked edges, and C has exactly twice that many.

In [The matching takes every vertex](#example:matching-doubles), four picked edges give a cover of all 8 vertices. A minimum cover has 4 (A, C, E, G). The ratio is 2, the worst the guarantee allows. [Four separate edges](#example:disjoint-edges) is the cleanest bad case: no two edges touch, so the method takes 8 vertices where 4 would do.

```check
Q: APPROX-VERTEX-COVER picked 3 edges, so C has 6 vertices. What do you know about a minimum cover?
- It has exactly 3 vertices
* It has at least 3 and at most 6 vertices
- It has at least 6 vertices
= The 3 picked edges share no vertex, and a cover needs one end of each, so the minimum is at least 3. C is a cover of 6, so the minimum is at most 6.
```

## Greedy by degree

The obvious idea is to take the vertex that covers the most uncovered edges, cross off its edges, and repeat. The deg row under the drawing counts each vertex's uncovered edges as they go down.

It often does better than the matching method. In [Greedy gets it right here](#example:greedy-wins), on the same graph where the matching method took 8, greedy takes B, D, F and H: a minimum cover. And on [a star](#example:star), greedy takes the centre alone while the matching method takes 2.

But it has no factor 2. [Greedy takes the wrong side](#example:greedy-trap) is a bipartite graph built to fool it. The six vertices I to N cover every edge. On the other side, A has 6 edges, more than any of I to N, so greedy takes A. Then B, with 5. Then C, and so on, until it has taken all 8 vertices on the wrong side. 8 against 6 does not sound terrible. The trouble is that the same construction with k vertices on the right gives about k ln k on the left, so the ratio keeps growing, about ln n. [Show me](#play:greedy-trap)

This is a nice example of a greedy rule that sounds smarter and has a worse guarantee. The matching method does not even look at degrees.

## Exact: try every set

**Brute force** tries every set of 0 vertices, then every set of 1, then 2, and stops at the first set that covers every edge. Because it goes smallest first, that set is a minimum cover. In [Every set, smallest first](#example:brute-force), no set of 2 vertices covers the graph, so it tries 1 + 5 + 10 sets before finding a cover of 3.

That is O(2ⱽ E) in the worst case. A [complete graph](#example:complete) needs all vertices but one, so brute force grinds through nearly every smaller set first. Sixteen vertices is 65,536 sets. Fifty is about 10¹⁵. The page lists at most 60 failed sets of each size so the timeline stays usable.

## Exact: branch on an edge

There is a much better way to be exact. Take any uncovered edge u-v. Every cover contains u or v. So try both: first add u and continue, then add v and continue. A branch stops when it covers every edge (a candidate) or when it cannot beat the best cover found so far.

Each level of branching adds one vertex, so the tree of branches has depth at most k, the size of a minimum cover, and at most 2ᵏ leaves. That is O(2ᵏ E): exponential in k, not in V. A graph with a thousand vertices and a cover of 10 is fine. Problems like this, hard in general but fast when some parameter is small, are called fixed-parameter tractable, and vertex cover is the standard first example.

In [Branching on an uncovered edge](#example:branching), the first edge is A-B, so every cover has A or B. [Show me](#play:branching)

```check
Q: Branching picks the uncovered edge D-G. Why is it enough to try "add D" and "add G"?
- D and G have the most edges
* Every vertex cover contains D or G, because it has to cover D-G
- The other vertices are already in the cover
= A cover needs an end of every edge, including D-G. So every cover, and every minimum cover, is found down one of the two branches.
```

## When to use what

- Small graphs, or a small cover: branch on an edge. It is exact and fast when k is small.
- Big graphs and you need a promise: the matching method. It is linear time and never more than twice too big.
- Big graphs and you need a good cover: greedy, then check it against the matching bound. If greedy's cover is close to the number of edges in a maximal matching, it is close to optimal.
- Trees and bipartite graphs are easy. On a tree, dynamic programming finds a minimum cover in linear time. On a bipartite graph, a minimum cover has the same size as a maximum matching (König's theorem), and matching algorithms find it.

## Common mistakes

- Taking only one end of each picked edge. That is not a cover: the other edges at the skipped end can stay uncovered.
- Thinking greedy by degree is a 2-approximation. It is not; it is about ln n in the worst case.
- Confusing a vertex cover with a dominating set. A cover touches every edge; a dominating set is next to every vertex.
- Forgetting that the matching must be maximal. Stop early, and some edge is still uncovered.
- Expecting one particular minimum cover. There can be many with the same size.

## Try this

- [The matching takes every vertex](#example:matching-doubles). Before each step, say which edge is picked next.
- Run the same graph with greedy, then with branching. Which one finds a minimum cover first?
- Load `A-B, A-C, A-D, A-E` (a star) and run every method.
- Load a path, `A-B, B-C, C-D, D-E, E-F`. What is a minimum cover? How far off is the matching method?
- In [Greedy takes the wrong side](#example:greedy-trap), count the edges of A and of I before the first step. Why does greedy take A?
