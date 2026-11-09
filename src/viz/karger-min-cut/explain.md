# Karger's min cut

What is the fewest edges you can delete to break a graph into two pieces? That is a **minimum cut**. You could try every way of splitting the vertices in two, but there are 2^(n−1) − 1 of them. David Karger's idea, from 1993, sounds too silly to work: pick a random edge, glue its two ends together, and repeat until two lumps are left. The edges between the lumps are your cut.

It often gets the wrong answer. That turns out to be fine.

| Operation | What it does | Cost |
|---|---|---|
| contract an edge | merge its two ends into one super-vertex, drop the self-loops | O(n) |
| one trial | contract random edges until two super-vertices are left | O(n²), or O(m α(n)) with a union-find |
| one trial finds a given minimum cut | with probability at least 2/(n(n−1)) | |
| T = n² ln n / 2 trials | all miss with probability at most 1/n | O(n⁴ log n) |

[Show me](#play:bridge)

## Contraction

Contracting the edge u-v merges u and v into one **super-vertex**. Every other edge stays, even when that leaves two or three edges between the same pair of super-vertices. So after a few contractions the graph is a **multigraph**: it has parallel edges. The edges between u and v themselves would become loops from the new super-vertex to itself, and those go.

The page keeps every original vertex in the drawing. A super-vertex is a box around its members, and the lines between two boxes are the parallel edges between them. Have a look at [By hand: parallel edges pile up](#example:by-hand). After A-B and A-C, the box {A, B, C} has three edges to D, one from each member. You can do this yourself: type an edge such as `A-B` and press **Contract edge**.

A cut of the contracted graph is a cut of the original graph too: every super-vertex is just a set of original vertices. So when two super-vertices are left, the edges between them really are a cut. The only question is whether it is the smallest one.

```check
Q: Super-vertex {A, B} has edges A-D and B-D. After contracting the edge A-D, what happens to B-D?
- It stays as an edge to the new super-vertex
* It becomes a self-loop and is removed
- It becomes a second edge between {A, B} and D
- It is merged with A-D into one edge
= After the contraction, A, B and D are all in one super-vertex. B-D has both ends inside it, so it is a self-loop now and goes, just like A-D.
```

## Why it works (often enough)

Say the minimum cut has c edges. Then every vertex has at least c edges, or cutting it off alone would be smaller. With k super-vertices left, there are at least kc/2 edges, so a random edge is one of the cut's c edges with probability at most c/(kc/2) = 2/k.

The trial finds that cut if it never picks one of its edges. It survives the first contraction with probability at least 1 − 2/n, the second 1 − 2/(n−1), and so on down to 1 − 2/3. Multiply them and almost everything cancels:

(n−2)/n · (n−3)/(n−1) · … · 1/3 = 2/(n(n−1)).

For 8 vertices that is 1/28, about 3.6%. Not great. So run many trials and keep the smallest cut. After T trials, all of them miss with probability at most (1 − 2/n²)^T, and T = n² ln n / 2 trials push that below 1/n.

In [A hundred trials against the bound](#example:many-trials), the two squares joined by D-E find the bridge 43 times in 100. The bound is for the worst graph, and this is not it. In [A trial that misses](#example:missed), the very first pick is the bridge itself, and nothing after that can fix it. [Show me](#play:missed)

```check
Q: A graph has 10 vertices. Karger's bound says one trial finds a given minimum cut with probability at least what?
- 1/10
- 1/90
* 1/45
- 1/100
= 2/(n(n−1)) = 2/90 = 1/45, which is 1 over 10 choose 2.
```

## When the bound is exact

Take a cycle of n vertices. Any two of its edges make a minimum cut, so it has n(n−1)/2 of them, and each one comes up with probability exactly 2/(n(n−1)). In [A cycle: every trial wins](#example:cycle-cuts) every trial finds *a* minimum cut, but each particular one only about 1 time in 15.

That gives a nice side result for free. The chances of all the minimum cuts add up to at most 1, so no graph has more than n(n−1)/2 minimum cuts.

At the other end, [a tree](#example:tree-always): every edge is a bridge, so whatever edge is left at the end is a minimum cut.

## Picking the edges

The default picks one of the remaining edges at random each time, counting every parallel edge. The other setting, **Shuffle once, skip self-loops**, puts all the edges in a random order once and goes through them, skipping any edge whose ends are already together. That is Kruskal's algorithm on random weights, and with a union-find it is how you would write it for real. Both give every cut the same chance. [Shuffle once, then go in order](#example:shuffled)

## When to use it

Karger's algorithm finds a **global** minimum cut: the smallest cut between any two parts. It is the easy way to measure how well connected a network is, and it works for weighted graphs too (pick edges with probability proportional to weight). For a cut that separates two given vertices s and t, use [maximum flow](/max-flow/) instead.

It is slow if you repeat it the plain way, O(n⁴ log n). Karger and Stein made it fast: contract down to about n/√2 super-vertices, then recurse twice on the result. The early contractions are almost always safe, so they share them between trials. That runs in O(n² log³ n) and is still one of the fastest methods for dense graphs. If you want an answer that is always right, Stoer-Wagner is deterministic and O(nm + n² log n).

## Common mistakes

- Dropping parallel edges after a contraction. They are the whole point: a pair joined by three edges should be three times as likely to merge.
- Picking a random pair of super-vertices instead of a random edge.
- Keeping self-loops. A self-loop can never be in a cut, and picking one wastes a contraction.
- Trusting one trial. Even on easy graphs a single run misses often.
- Confusing the global minimum cut with a minimum s-t cut. Karger does not care which two vertices end up apart.

## Try this

- Run [One trial finds the bridge](#example:bridge) step by step. When does it become impossible to miss?
- Contract the graph by hand and try to *miss* the bridge on purpose. How early must you pick D-E?
- Load `A-B, B-C, C-D, D-A, A-C` and guess the success rate before you press **Run trials**.
- Set **Trials per run** to 10, then 1000, on [the cycle](#example:cycle-cuts). Watch how the counts settle.
