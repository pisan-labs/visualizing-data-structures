# Steiner tree

You need to connect four offices with fibre. The cable can run anywhere along the roads, through any junction you like. The offices have to be connected; the junctions do not, but you may use them if that saves cable. What is the cheapest network? That is the Steiner tree problem. The offices are the terminals, and the extra junctions a tree uses are Steiner vertices.

## The idea

| Method | What it finds | Cost |
|---|---|---|
| Brute force over Steiner vertices | a minimum Steiner tree | O(2^(V − t) V²) |
| Metric-closure approximation | a tree at most (2 − 2/t) × the minimum | O(t (E + V log V)) |

Two special cases are old friends. With two terminals, a Steiner tree is a shortest path, and Dijkstra finds it. With every vertex a terminal, it is a minimum spanning tree, and Prim finds it. Everything in between is NP-hard. It was on Karp's 1972 list too.

The ringed vertices in the drawing are the terminals. Type terminals in the input field and press **Set terminals**, such as `A D F`. Loading a new graph keeps the terminals that are still there. Every run ends with the tree, its weight, the weight of a minimum Steiner tree (the page finds one by brute force), and the ratio. [Show me](#play:closure-detour)

## The approximation, in five steps

1. Find the shortest distance between every two terminals. That gives a complete graph on just the terminals, called the metric closure. The table d under the drawing holds it.
2. Build a minimum spanning tree of the closure. The row M lists its edges.
3. Put each closure edge back as the path it stands for.
4. Take a minimum spanning tree of the edges you now have, in case two paths made a cycle.
5. Cut off any leaf that is not a terminal. It connects nobody.

Why is it at most twice the best? Take a minimum Steiner tree and walk around it, the same trick as for the traveling salesperson. The walk costs 2 × the tree and passes every terminal. Read it as a cycle through the terminals in the order it meets them, using closure distances for the jumps. By the triangle inequality (shortest paths always obey it), that cycle costs at most 2 × the tree. Drop its longest jump and you have a spanning tree of the closure that weighs at most (2 − 2/t) × the best. The minimum spanning tree in step 2 is no heavier, and steps 3 to 5 only make things lighter.

In [Shortest paths are not the whole story](#example:closure-detour), the shortest way from A to E is A-C-E, so the approximation uses C-E, weight 4. The best tree reaches E through F instead, with C-F (2) and E-F (3), because F is on the way to G and H anyway. The approximation weighs 17 against 15. Each step made sense on its own. The step that compares terminals two at a time cannot see that one junction serves three of them.

```check
Q: With every vertex a terminal, what does the approximation return?
- A shortest path between the first and last terminal
* A spanning tree of the whole graph, built from shortest paths
- Nothing: there are no Steiner vertices to choose
= Every vertex has to be in the tree, so the result is a spanning tree. Here the best answer is a minimum spanning tree, and the approximation often finds it.
```

## Where the factor 2 comes from

[A hub the approximation never sees](#example:hidden-hub) is the classic bad case. Five terminals, each pair joined by an edge of weight 2, and a hub F at distance 1 from every terminal. Going through F also costs 2, so every shortest path between terminals is a tie, and the page breaks ties toward the direct edge. The closure tree takes 4 edges of weight 2: total 8. The star through F costs 5. The ratio is 1.6 = 2 − 2/5, exactly the bound. With more terminals it creeps toward 2. [Show me](#play:hidden-hub)

The fix is not to break ties better. Give the edges between terminals weight 19 and the edges to F weight 10: now the direct edge is strictly shorter than the way through F, and the approximation pays 4 × 19 = 76 against 50 for the star. The closure only knows distances between pairs. It never asks whether a vertex could serve several terminals at once.

Better approximations do ask. Zelikovsky's algorithm looks at triples of terminals and gets 11/6. The best known today is about 1.39, using linear programming. Nobody has a fast algorithm with ratio 1, and unless P = NP nobody will.

## The paths can share edges

Step 3 can give back less than the closure tree weighs. In [Paths that share edges](#example:shared-paths), two closure edges stand for paths that run along the same edges, and the shared edges are only paid once. Here the result is a minimum tree.

Steps 4 and 5 are there for safety. Two shortest paths can cross and close a cycle, and removing a cycle edge can leave a Steiner vertex dangling as a leaf. With the consistent tie-breaking used here, shortest paths from different terminals rarely do that, so on most graphs these steps say "nothing to do". The code tabs still do both. Leaving them out is a bug waiting for the right graph.

## The exact answer

A minimum Steiner tree uses the terminals plus some set S of other vertices, and once you know S, the best tree is a minimum spanning tree of those vertices. So brute force tries every S: 2^(V − t) sets, a spanning tree each.

In [Every set of Steiner vertices](#example:exact-search), four terminals leave four other vertices: 16 sets. The best uses C and F and weighs 15. [Two terminals: a shortest path](#example:two-terminals) shows the silly side of brute force: the answer is a shortest path, Dijkstra would find it in a blink, and brute force still tries all 64 sets. With [every vertex a terminal](#example:every-vertex), there is one set, the empty one.

For few terminals there is a smarter exact method, Dreyfus-Wagner dynamic programming over subsets of terminals, in about 3ᵗ V time. It is the same idea as Held-Karp for the traveling salesperson: exponential in the number of terminals, not in the size of the graph.

```check
Q: A graph has 12 vertices and 4 terminals. How many sets S does brute force try?
- 16
- 2¹²
* 2⁸ = 256
= S can be any set of the 8 vertices that are not terminals, including the empty set: 2⁸ of them.
```

## When to use what

- Two terminals: a shortest path. Every vertex a terminal: a minimum spanning tree.
- Few terminals in a big graph: Dreyfus-Wagner is exact and practical up to about 15 terminals.
- Many terminals: the metric-closure approximation, then local improvements. It is simple and never worse than twice the best.
- Chip layout, network design and phylogenetic trees all use Steiner trees, usually in the plane or on a grid, where special methods exist.

## Common mistakes

- Using the minimum spanning tree of the terminals' induced subgraph. It may not be connected, and it never uses Steiner vertices.
- Forgetting to expand closure edges into paths. The closure tree's edges are not edges of the graph.
- Skipping the pruning step. A Steiner leaf costs weight and connects nothing.
- Thinking more Steiner vertices means a heavier tree. A good Steiner vertex makes the tree lighter.
- Negative or zero weights. The proof and the shortest paths both need positive weights, so this page refuses them.

## Try this

- [Shortest paths are not the whole story](#example:closure-detour). Before step 2, guess which closure edges the spanning tree takes.
- Switch to the exact method on the same graph. Which sets S beat the approximation?
- Load the hub graph with three terminals, `A-B:2, A-C:2, B-C:2, A-D:1, B-D:1, C-D:1`, and set terminals `A B C`. What ratio do you expect?
- On the starting graph, set terminals `A H`. Is the result the shortest path from A to H?
- Change C-F to 5 in [Shortest paths are not the whole story](#example:closure-detour). Does the approximation catch up?
