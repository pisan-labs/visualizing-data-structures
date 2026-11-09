# Floyd-Warshall

Dijkstra and Bellman-Ford answer "how far is everything from s?" Sometimes you want every pair: a table of distances between all the cities on a map. Floyd-Warshall fills that table with three nested loops and nothing else. No queue, no heap, no sorting.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `FLOYD-WARSHALL(W, n)` | D[i][j] for every pair, and Π to read the paths | Θ(V³) |
| `PATH(Π, i, j)` | the vertices of one shortest path | O(V) |

Start with D as the edge weights. Then take the vertices one at a time, in order, and ask of every pair i, j: is it shorter to go through k? After round k, D holds the shortest paths whose inner vertices all come from the first k. After the last round, nothing is left out. [Show me](#play:every-round)

## How it works

D starts with w(i, j) for every edge, 0 on the diagonal and ∞ everywhere else. That is the shortest path between every pair when no path may pass through another vertex. Then, for k = 1 to n, for every i and j:

    if D[i][k] + D[k][j] < D[i][j]
        D[i][j] = D[i][k] + D[k][j]

A shortest path from i to j that may use the first k vertices either skips k, and D already has it, or goes through k once. Then it is a path from i to k and a path from k to j, both using only the first k - 1 vertices, and D has those too.

In [Every round opens new paths](#example:every-round), round A finds 2 new paths through A, round B 3, round C 2 and round D 3. In the drawing, k's row and column are blue, the entry being updated is blue and the two it reads, D[i][k] and D[k][j], are orange.

CLRS writes a new matrix D(k) each round. This page updates one matrix in place, as most code does. It gives the same numbers when there is no negative cycle: row k and column k cannot change in round k, because going from k to k through k adds D[k][k] = 0.

```check
Q: After round 2 (k = B), D[C][A] = ∞. What does that tell you?
- There is no path from C to A at all
* No path from C to A has only A and B in between
- C and A are not connected by an edge, but the next round will add one
- Round 3 cannot change it
= After round k, D only knows paths whose inner vertices come from the first k. A path through C's other neighbours may still turn up in a later round.
```

## Reading a path

D only holds distances. To get the paths back, keep a second matrix. CLRS keeps Π: Π[i][j] is the vertex just before j on a shortest path from i. When going through k wins, the last step of the new path is the last step of the part from k to j, so Π[i][j] = Π[k][j].

To read a path, start at j and step back: j, Π[i][j], Π[i][Π[i][j]], until you reach i. In [Reading a path backwards](#example:read-a-path), Π[A][D] = C, Π[A][C] = B and Π[A][B] = A, so the path is A → B → C → D. [Show me](#play:read-a-path)

Plenty of code keeps a next-hop matrix instead: next[i][j] is the first step from i toward j, updated with next[i][j] = next[i][k]. It reads a path forwards. Switch **Keep paths with** and try [the same graph](#example:next-hop). [Show me](#play:next-hop)

## Negative weights and negative cycles

Negative edges are fine, as long as no cycle is negative. In [Negative edges, no negative cycle](#example:negative-edges), C→B weighs -3, and D[A][B] ends at -1.

A negative cycle shows up on the diagonal. D[v][v] starts at 0, and it only drops if there is a way from v back to v with negative weight. In [A negative cycle on the diagonal](#example:negative-cycle), D[C][C] drops to -2 in round B, and by the end A, B and C all have negative diagonal entries. The page says so as soon as it happens. Every pair whose paths can pass through the cycle has no shortest path, and its entry means nothing. [Show me](#play:negative-cycle)

An undirected edge with a negative weight is a negative cycle by itself: across and back.

```check
Q: At the end, D[B][B] = -3. What does it mean?
- The shortest path from B to B weighs -3
* B lies on a negative cycle, so pairs that can pass through B have no shortest path
- There is a mistake: the diagonal is always 0
- B has a negative edge to itself
= A path from B back to B with negative weight can be repeated forever, each lap lighter. So "shortest" makes no sense for any pair whose paths can reach B.
```

## When to use it

Use Floyd-Warshall when you want every pair, the graph is small or dense, and you want short code: a few hundred vertices is fine. It takes negative weights and finds negative cycles on the way.

On a large sparse graph with weights of at least 0, running [Dijkstra](/dijkstra/) from every vertex is faster: O(V (V + E) log V) against Θ(V³). With negative weights on a sparse graph, Johnson's algorithm reweights the edges once with Bellman-Ford and then runs Dijkstra from every vertex.

Pairs with no path stay at ∞. In [Some pairs stay at ∞](#example:unreachable), no round can join two pieces that no edge joins. [Show me](#play:unreachable) An [undirected graph](#example:undirected) gives a symmetric matrix all the way through.

## Common mistakes

- Putting the k loop inside. k has to be the outer loop: the rounds are what make the argument work. With i or j outside, some paths are missed.
- Adding to ∞. In code, ∞ is often a large number, and ∞ + ∞ overflows. Skip the pair when D[i][k] or D[k][j] is ∞.
- Forgetting 0 on the diagonal.
- Updating Π[i][j] with k instead of Π[k][j]. k is somewhere on the path, not necessarily just before j.
- Ignoring the diagonal at the end. A negative D[v][v] means some answers are meaningless.

## Try this

- [Every round opens new paths](#example:every-round): before each round, predict which entries will change.
- Read the path from B to A in the same graph, with Π and then with next.
- [A negative cycle](#example:negative-cycle): change C>A:-1 to C>A:2. What happens to the diagonal?
- This page starts on the same graph as the [Dijkstra page](/dijkstra/). Run both and compare row A of D with Dijkstra's distances from A.
