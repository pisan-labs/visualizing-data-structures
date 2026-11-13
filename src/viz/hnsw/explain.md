# HNSW graph search

You have a million embeddings and a query vector. Which stored vectors are nearest? Brute force measures all million, every query. That is exact, and slow. HNSW (Malkov and Yashunin, 2018) builds a graph instead: each point is linked to some of its near neighbours, and a search walks along the links toward the query, measuring only the points it passes. It is approximate: it can miss a true neighbour. Many vector databases offer it, because the trade is usually worth it.

The twist is the H, for hierarchical. Points live on layers, like the levels of a [skip list](/skip-list/): every point is on layer 0, about one in M is also on layer 1, one in M² on layer 2, and so on. The upper layers are sparse and their links are long, so a search crosses the plane in a few hops before it slows down on layer 0.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| insert(q) | draw a level; walk down to it greedily; on each layer it joins, find near points and link to the M nearest | O(log N) on average |
| search(q) | greedy down the upper layers; on layer 0, keep a list of the ef nearest found | O(log N) on average |
| brute force | measure every point | Θ(N) |

Here M is the number of links a new point makes on each layer (a node keeps at most M, and 2M on layer 0), and ef is the length of the search's list on layer 0. The O(log N) is what the paper measured and argues for; it is not a worst-case bound. The answer is the K = 3 nearest of the list, and the page checks it against brute force: the recall is how many of the true 3 it found. [Show me](#play:twelve-points)

## Levels, as in a skip list

A new point draws a uniform number u and gets level ⌊−ln(u) · mL⌋. Malkov and Yashunin suggest mL = 1/ln(M), which makes the chance of reaching layer l exactly M⁻ˡ, a skip list with p = 1/M. With M = 2, half the points stay on layer 0 (u above 0.5), a quarter reach layer 2, and so on. In [Twelve points on four layers](#example:twelve-points) the counts came out 12, 6, 3 and 1: about as neat as a coin can manage. This page stops at layer 3 so the drawing fits.

```check
Q: With M = 2, a new point draws u = 0.3. What is its level, ⌊−ln(u) / ln 2⌋?
- 0
* 1
- 2
- 3
= −ln(0.3) = 1.20 and ln 2 = 0.69, so 1.20 / 0.69 = 1.74, and the floor is 1. Any u from 0.25 to 0.5 gives level 1.
```

## Searching

Every search starts at the entry point, a node on the top layer. On each upper layer it is plain greedy search: look at the neighbours of where you stand, move to one closer to the query, stop when none is. Then drop a layer and do it again from the same node.

In [Twelve points on four layers](#example:twelve-points) the query is (1, 6). The entry point is K at (9, 4), d² = 68 from the query. On layer 2 the search moves to H (34); on layer 1 it goes H, L, B, J, each one closer, and J is at d² 2. Four layers, and the search has crossed the whole plane after measuring a handful of points.

Layer 0 has every point and the shortest links, and greedy search can get stuck there: a node with no neighbour closer to the query is a local minimum, but not necessarily the nearest point. So on layer 0 the search keeps two lists, a [beam](/beam-search/) as in beam search. C holds the candidates still to expand, nearest first. W holds the ef nearest found so far. Expand the nearest candidate, measure each neighbour not seen yet, and keep it if it beats the farthest point in W. Stop when the nearest candidate is farther than everything in W. Both lists are priority queues, so a [binary heap](/binary-heap/) is the natural fit (a min-heap for C, a max-heap for W).

## Why ef matters

[Greedy search gets stuck](#example:greedy-misses) searches for (6, 3) with ef = 1. It comes down to H at d² 8. H's neighbours on layer 0 are A, F and L, all farther, so the search stops and returns H. Brute force knows better: C and D are both at d² 5. Recall 1/3, after 8 distance computations.

[A longer list gets around it](#example:beam-finds) is the same search with ef = 3. W now has room for L (9) and even F (17), which are worse than H. F is the useful mistake: F links to D, and D links to C. The search returns C, D and H, recall 3/3, after 13 distance computations against brute force's 12. On twelve points that is no saving at all. On a million points it is the whole point.

```check
Q: The search on layer 0 has ef = 3 and W holds points at d² 5, 8 and 9. The nearest candidate left in C is at d² 17. What happens?
- It is expanded, since C is not empty
* The search stops: nothing reached through it can get into W
- It replaces the point at d² 9
= The candidate is farther than the farthest point in W (9). Its neighbours could still be closer, but the search bets they won't be and stops. A larger ef makes that bet less often.
```

## Inserting

An insert is a search for the new point itself, followed by linking. In [A new entry point](#example:new-top) J at (0, 7) draws u = 0.07, level 3, above every other point, so it becomes the new entry point. On each layer it joins, the search (with a list of efConstruction = 4) finds near points and J links to the M = 2 nearest. They link back, and a node with too many links keeps only its nearest. On layer 1, F and A both drop J straight away: J links to them, but they no longer link to J. Links go one way, which is why the drawing shows one-way links as dashed arrows. [A full neighbour drops a link](#example:links-dropped) shows the same thing on layer 0: B already has 2M = 4 links, takes J and drops A.

This page links to the M nearest, the paper's simple selection. The paper also gives a heuristic that skips a neighbour when it is closer to an already chosen neighbour than to the new point, which keeps links pointing in different directions. Malkov and Yashunin found that with the simple selection, search on clustered data gets stuck at the cluster boundaries, and the heuristic fixes it. Try the Two groups preset with ef = 1 to see the problem.

## When to use it

HNSW is a good default for in-memory nearest-neighbour search when you can live with an occasional miss: semantic search over embeddings, recommendations, deduplication. Raise ef for better recall, at the cost of more distance computations per query; ef is chosen per search, so one index can serve fast and careful queries. M is fixed at build time.

Avoid it when you need exact answers (use brute force with a heap, as on the [embeddings page](/embeddings/)), when the data is small enough that brute force is fast anyway, or when memory is tight: every point stores up to 2M links on layer 0 plus more on its upper layers. Deleting points is awkward, since other nodes' links point at them. In two dimensions, as here, a [k-d tree](/kd-tree/) finds exact neighbours quickly; HNSW earns its keep in hundreds of dimensions, where k-d trees stop helping.

## Common mistakes

- Expecting exact results. Recall below 1 is normal; measure it on your own data.
- Setting ef below K. The list can't hold K points, so the search returns fewer.
- Treating links as two-way. A node that drops a link may still be pointed at, and not the other way round.
- Confusing efConstruction with ef. The first shapes the graph when points are inserted; the second is per search.
- Measuring speed on tiny data. With 12 points, HNSW does about as much work as brute force.

## At real scale

The paper suggests M between 5 and 48 (memory grows with M), mL = 1/ln(M) and 2M links on layer 0, and an efConstruction large enough that inserts find their neighbours with a recall near 1 (0.95 is enough for most uses). Its tests include 5 million SIFT image descriptors of 128 numbers each. The toy here has M = 2 and at most 12 points in 2 dimensions, so every number fits on the screen.

## Try this

- [Greedy search gets stuck](#example:greedy-misses): raise ef one step at a time. Which is the smallest ef that finds C, D and H?
- [Twelve points on four layers](#example:twelve-points): search for (9, 1). Which layers does the search move on, and which does it just pass through?
- Set M to 4 and insert 12 random points (type 12). How many layers do you get? Why fewer than with M = 2?
- Load the Two groups preset and search with ef = 1 a few times, from queries in the group the entry point is not in. How often does greedy search get stuck?
- [A new entry point](#example:new-top): which links does J have on layer 1, and who links back to it?
