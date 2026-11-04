# Breadth-first search

Which vertices can you reach from A in one step? In two? In three? Breadth-first search answers those questions in that order. It explores the graph in rings around the start, and the ring a vertex lands in is its distance: the fewest edges it takes to get there.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `BFS(G, s)` | d (distance from s) and π (parent) for every vertex | O(V + E) |

BFS keeps a queue of vertices that have been found but not yet explored. It takes the vertex at the front, looks at each of its neighbours, and puts the new ones at the back. First in, first out: the vertices one edge away all leave the queue before any vertex two edges away. [Show me](#play:layers)

The π pointers form a tree, the breadth-first tree. Follow π back from any vertex and you get a shortest path from s to it, read backwards.

## How it works

Every vertex starts white, with d = ∞ and π = NIL. Then:

1. Color s gray, set s.d = 0, and put s in the queue.
2. Take u from the front of the queue.
3. For each neighbour v of u, in order: if v is white, color it gray, set v.d = u.d + 1 and v.π = u, and put v at the back.
4. Color u black. Repeat from 2 until the queue is empty.

White means not found yet. Gray means found and waiting in the queue. Black means done: all its neighbours have been looked at. In the drawing, the queue's vertices wear a dashed ring, the vertex being explored is marked u, done vertices are green, and each found vertex carries its d. Tree edges become arrows from parent to child, edges that were looked at and passed over turn dashed, and edges nobody has looked at yet stay faint.

The queue never holds more than two distances at once: some vertices at distance k at the front, and the ones they found, at k + 1, at the back. That is the whole reason the distances come out right. Nothing at distance k + 1 can leave the queue while something at distance k is still in it.

```check
Q: After BFS from A, D.d = 3. What does that tell you?
- D is the third vertex BFS found
- There is exactly one path from A to D
* The shortest path from A to D has 3 edges
- D has 3 neighbours
= d counts edges along a shortest path. There may be several shortest paths, and longer ones too. Follow π back from D to read one of the shortest.
```

## Colors or a visited flag

CLRS uses three colors. BFS itself only ever asks one question: "is v white?" So a single visited flag does the same job, and that is how most code is written. Switch **Keep track with** to the visited flag and [run the same search](#example:visited-flag). The order, d and π do not change. [Show me](#play:visited-flag)

The gray and black distinction earns its keep in proofs about BFS, and in depth-first search, where gray means "still on the stack" and finds cycles.

## Directed graphs and unreachable vertices

In a directed graph, BFS only follows edges forward. In [the directed example](#example:directed), E has an edge into A, but no edge leads to E, so E stays white with d = ∞. [Show me](#play:directed)

BFS from s explores only what s can reach. In [Two pieces](#example:disconnected) the search from A never touches E, F, G or H. To explore the whole graph, start another BFS from each vertex that is still white. That is also how you count connected components.

## When to use it

Use BFS when every edge costs the same and you want the fewest steps: the shortest route through a maze, the fewest moves in a puzzle, the fewest hops in a network. On a [grid](#example:grid), the distances from a corner grow one diagonal at a time.

Avoid it when edges have weights. BFS counts edges, so a path of two long roads beats a path of three short ones. Dijkstra's algorithm handles weights. Also watch the memory: the queue can hold a whole ring at once. In [the star](#example:star), all 7 other vertices sit in the queue together. [Show me](#play:star)

```check
Q: A graph has weights on its edges. What does BFS's d give you?
- The total weight of the lightest path
* The number of edges on the path with the fewest edges
- Nothing: BFS refuses weighted graphs
- The total weight of the path BFS happens to find
= BFS never looks at weights. It counts edges, so it finds the path with the fewest edges, which is not always the lightest one.
```

## What it costs

With adjacency lists, each vertex goes through the queue at most once, and each list is read once when its vertex leaves the queue. That is O(V) for the queue and O(E) for the lists: O(V + E). In [the complete graph](#example:dense), 6 vertices and 15 edges take 30 edge checks, two per edge.

With an adjacency matrix, every vertex that leaves the queue reads a whole row of V cells, so BFS takes Θ(V²) whatever the number of edges. On [a path](#example:path) of 1000 vertices that is a million cells to find 999 edges.

## Common mistakes

- Marking a vertex when it leaves the queue instead of when it enters. Then a vertex can be put in the queue several times, once by each neighbour that sees it while it waits.
- Using a stack instead of a queue. The search still visits everything, but d is no longer the distance.
- Assuming every vertex gets a distance. Unreachable vertices keep d = ∞; check before you use it.
- Using BFS distances on a weighted graph.
- Expecting the same tree from a different neighbour order. The distances are the same; the tree and the order can change. This site always takes neighbours in name order, so B comes before C.

## Try this

- [Rings around A](#example:layers). Before each dequeue, say which vertex leaves the queue next.
- [Start in the middle](#example:middle-start): the same graph from E. How far is the farthest vertex now?
- [A path](#example:path), then [a star](#example:star). Which one makes the queue longer, and which one makes the search deeper?
- Set **Layout** to Layers on [Rings around A](#example:layers): each row is one distance.
- Load `A>B, B>C, C>A, C>D` and run from D. Then from A.
