# Bipartite matching

Five workers, five jobs, and a list of who can do what. Each worker takes at most one job and each job needs at most one worker. How many pairs can you make? Students to projects, TAs to lab sections, kidneys to patients: same question.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| Kuhn's algorithm | a maximum matching, one left vertex at a time | O(VE) |
| Hopcroft-Karp | a maximum matching, in phases of shortest paths | O(E√V) |
| checking a matching | whether any augmenting path is left | O(V + E) |

The graph is bipartite: a left side L and a right side R, and every edge joins the two. A matching is a set of edges with no vertex in two of them. A vertex not in the matching is free.

On this page, names that start with a letter go on the left and names that start with a digit go on the right, so `A-1, A-2, B-1` reads as workers and jobs. Without digits, the page two-colours the graph instead (see [Sides found by two-colouring](#example:two-colours)), and it refuses a graph with an odd cycle, which cannot be bipartite.

## Augmenting paths

An augmenting path starts at a free vertex on the left, ends at a free vertex on the right, and alternates: an edge not in the matching (written –), then one in it (written =), and so on. It has one more unmatched edge than matched ones. Flip it, swapping which edges are in, and the matching grows by one.

In [Moving a partner](#example:rematch), A takes 1. B wants 1 too, so the path B – 1 = A – 2 moves A over to 2. Then C wants 2: C – 2 = A – 1 = B – 3 moves A back and B along. Nobody gives anything up; they just shuffle. [Show me](#play:rematch)

Berge's theorem says this is enough: a matching is maximum exactly when no augmenting path is left. So the algorithm is "find one, flip it, repeat". The interesting part is how to find them.

```check
Q: An augmenting path has 7 edges. How many of them are in the matching before the flip?
- 4
* 3
- 7
- It depends on the graph
= The path alternates and starts and ends with an unmatched edge: 4 unmatched, 3 matched. After the flip it is the other way round, one edge more.
```

## Kuhn's algorithm

Take the left vertices in order. For each one, depth-first search: try each neighbour v; if v is free, done; if v is matched to w, try to find w another partner, recursively. Each right vertex is visited at most once per search, so one search is O(V + E) and the whole thing is O(VE).

This is short, and it is what most people write. The code tabs have it in about 15 lines. The worst case is when every new worker pushes everyone before them along. In [Augmenting paths that keep growing](#example:longer-and-longer), the paths have 1, 3, 5, 7 and 9 edges. [Show me](#play:longer-and-longer)

A left vertex that finds no path stays free for good: later flips never make room for it. In [Too few jobs for a group](#example:too-few-jobs), A, B and C only like jobs 1 and 2, so one of them has to lose out. That is Hall's condition failing: a group of k workers who between them like fewer than k jobs.

## Hopcroft-Karp

Kuhn's algorithm finds one path per search. Hopcroft-Karp finds many per phase:

1. Breadth-first search from every free left vertex at once, giving each left vertex its layer. This finds the length of the shortest augmenting paths.
2. Depth-first searches along the layers only, from each free left vertex, find a maximal set of shortest augmenting paths that share no vertex. Flip all of them.

Each phase makes the shortest augmenting path longer. After √V phases the paths are longer than √V edges, and then fewer than √V of them can be left. So there are O(√V) phases of O(E) each.

On the chain that made Kuhn work hard, [one phase](#example:phases) does it all: five single edges, all at once. On the [starting graph](#example:two-phases) a second phase is needed, for D – 2 = C – 4. The badges show each left vertex's layer. [Show me](#play:two-phases)

```check
Q: Phase 1 of Hopcroft-Karp ends. What do you know about the shortest augmenting path left?
- It has 1 edge
* It has at least 3 edges
- There is none
- It has exactly 3 edges
= Phase 1 takes a maximal set of 1-edge paths, so none is left; the next shortest has at least 3. It may have more, or there may be none at all.
```

## Matching as a flow

Bipartite matching is a [maximum flow](/max-flow/) in disguise. Add a source s with an arc to every left vertex, an arc from every right vertex to a sink t, and direct each edge from left to right. Every capacity is 1. A flow of k units uses k edges in the middle, no two sharing a vertex: a matching. Load this on the max-flow page and compare:

`s>A, s>B, s>C, s>D, s>E, A>1, A>2, B>1, B>3, C>2, C>4, D>2, D>3, E>3, 1>t, 2>t, 3>t, 4>t`

The augmenting paths are the same ones, with s and t stuck on the ends. Edmonds-Karp's breadth-first search is Hopcroft-Karp's first step; Hopcroft-Karp then takes all the shortest paths it can before searching again.

## When to use it

Any time you pair things up, one to one, with a list of allowed pairs. If the pairs have weights and you want the best total, that is the Hungarian algorithm, or [min-cost flow](/min-cost-flow/). If the graph is not bipartite (roommates, not workers and jobs), odd cycles break the augmenting path search and you need the blossom algorithm.

For a few hundred vertices, Kuhn's algorithm is plenty. Hopcroft-Karp pays off on big, dense graphs.

## Common mistakes

- Forgetting to reset the visited marks for each new left vertex in Kuhn's algorithm. Or resetting them in the middle of a search, which can loop.
- Trying a left vertex again later, hoping it gets lucky. In Kuhn's algorithm a vertex that found no path never will.
- Greedy matching (take any free pair) without augmenting paths. It can get stuck well below the maximum.
- Running it on a graph that is not bipartite.

A [perfect matching](#example:perfect) matches every vertex. Not every graph has one; Hall's condition says when.

## Try this

- Run [Moving a partner](#example:rematch). Before each search, guess whether the left vertex will get a partner.
- Add `E-4` to the starting graph. Does the matching get larger? Now try `E-5` instead.
- Run [Augmenting paths that keep growing](#example:longer-and-longer) with each setting and compare the **checks** counter.
- Load `A-1, B-1, C-1, D-1`. How many pairs? Why is this an easy case for Hall's condition?
- Paste the network from the section above into the [maximum flow](/max-flow/) page and check you get 4.
