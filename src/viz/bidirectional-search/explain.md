# Bidirectional search

You want a shortest path from s to t in an unweighted graph. BFS from s works, but it explores everything closer to s than t is, in every direction. Bidirectional search runs two BFSs at once, one from s and one from t, and stops when they meet. Two small balls instead of one big one.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `BIDIRECTIONAL-BFS(G, s, t)` | a shortest s-t path | O(V + E) worst case |
| on a graph that branches b ways | each side goes about d/2 deep | O(b^(d/2)) instead of O(b^d) |
| check for a meeting | is v seen by the other side? | O(1) |
| join the halves | follow π back to s and on to t | O(d) |

If every vertex has 10 neighbours and t is 6 edges away, plain BFS looks at around 10⁶ vertices. Each half-search goes 3 deep: about 2 × 10³. That's the whole trick. [Show me](#play:bushy)

## How it works

1. Start one frontier at s and one at t. Each side keeps its own distances and parents.
2. Pick a side (take turns, or the one with the smaller frontier) and expand its whole layer: every vertex in the frontier looks at its neighbours.
3. A neighbour this side has seen is skipped. A new one gets a distance and a parent and joins the next layer.
4. If the new vertex was already seen by the *other* side, the searches meet. The path is s ⇝ v from this side's parents, then v ⇝ t from the other side's.
5. If either frontier runs empty first, there is no path.

In [Two searches meet in the middle](#example:meet-in-the-middle), A's side finds B and C, H's side finds F and G, and C finds F on A's second turn: A → C → F → H. Four vertices expanded. Plain BFS from A expands six.

The drawing colors each side differently. Badges show distances: `s2` is two from s, `t1` is one from t. The table under the graph has both.

```check
Q: The s side has seen A (0), B (1), C (1). The t side has seen H (0), G (1). Now the s side expands B and finds G. How long is the path?
- 2
* 3
- 4
= B is 1 from s, G is 1 from t, plus the edge B-G: 1 + 1 + 1 = 3. Equivalently G.ds = 2 and G.dt = 1.
```

## Why the first meeting is a shortest path

Both sides discover vertices at their true distances, because each is a BFS. We check for a meeting the moment a vertex is *discovered*. Suppose a shorter path existed. Its vertices would be closer to s or to t than the ones we are finding now, so one side would have found one of them earlier, and the other side would have seen it already. The meeting would have happened on an earlier turn. The property test on this page checks the answer against plain BFS on thousands of random graphs.

Careful with variants. Bidirectional Dijkstra, for weighted graphs, can *not* stop at the first vertex both sides settle: the best path may cross between the frontiers somewhere else. It needs an extra check.

## Taking turns or the smaller side

Taking turns is the simple version. It wastes work when one end is much busier than the other. In [Expand the smaller frontier](#example:smaller-side), A has six neighbours and J has one. Expanding the smaller side lets J's thin chain do the walking: 5 vertices expanded, against 11 for plain BFS. Switch the option and run it again to compare.

## When to use it, and when not

Use it when you know the target, the graph branches a lot, and you can walk edges backwards (directed graphs need in-neighbours for the t side; [Directed](#example:directed) shows it). Route planners, word ladders and puzzle solvers (Rubik's cube, sliding tiles) are the classic uses.

It doesn't help much when nothing branches. On [A path](#example:path), both sides crawl toward the middle and expand exactly as many vertices as plain BFS. It also needs a single, known target. "Find the nearest gas station" has no t to start from.

A nice side effect: [No path](#example:no-path). If t sits in a small piece of the graph, the t side runs dry quickly and proves there is no path, while plain BFS from s sweeps all of s's piece first.

```check
Q: When does bidirectional search save the most work over plain BFS?
- On a long path
* On a graph where every vertex has many neighbours
- When s and t are in different pieces of the graph
= The work grows like b^d. Two searches of depth d/2 cost about 2·b^(d/2), far less when b is big. On a path b is 1, so there is nothing to save.
```

## Common mistakes

- Stopping when a vertex is seen by both sides but forgetting the edge between them, or counting it twice. Length = ds + dt for the meeting vertex.
- Searching from t along out-edges in a directed graph. The t side has to follow arcs backwards.
- Sharing one visited set between the two sides. Then you can't tell "seen by me" from "seen by the other side", which is the whole point.
- Expecting savings everywhere. On thin graphs it is just BFS with extra bookkeeping.

## Try this

- [Two small balls](#example:bushy). Before running, guess where they meet. How many vertices does plain BFS expand?
- [Corner to corner on a grid](#example:grid): which diagonal do they meet on?
- Load `A-B, B-C, C-D, D-E, E-F` and search A F, then A A. What happens?
- Run the Random graph preset a few times and watch `expanded` against `plain BFS` in the variables.
