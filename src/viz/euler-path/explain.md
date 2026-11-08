# Euler paths (Hierholzer)

Can you draw the house without lifting your pen and without going over a line twice? Most of us tried this as kids, by trial and error. An Euler path walks every edge of a graph exactly once; an Euler circuit also ends where it started. Unlike the Hamiltonian path (every *vertex* once), this one is easy. Count the degrees and you know the answer before you start drawing.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| check the conditions | degrees (or in/out degrees) and one piece | O(V + E) |
| `EULER-PATH(G)` | Hierholzer's walk with a stack | O(V + E) |
| splice a detour | the stack does it for free | O(1) per vertex |

Euler settled the seven bridges of Königsberg this way in 1736. The city had four land masses, every one of them touched by an odd number of bridges, so no stroll crosses each bridge once. [The seven bridges of Königsberg](#example:bridges)

## The conditions

Walk into a vertex, walk out of it: each time you pass through, you use two of its edges. So every vertex in the middle of the walk has even degree. Only the two ends can be odd.

- **Undirected:** 0 odd vertices gives a circuit; exactly 2 gives a path from one odd vertex to the other. Any other count, no path. (The count of odd vertices is always even, so "1 odd vertex" never happens.)
- **Directed:** every vertex has in = out for a circuit. For a path, one start has out = in + 1, one end has in = out + 1, and the rest are balanced.
- **Both:** all the edges have to be in one piece. [Even degrees, but two pieces](#example:pieces) passes the degree test and still fails.

The page checks these first and refuses with the reason when they fail. The badges show each vertex's degree (`d=3`), or out and in degrees for a directed graph (`o2 i1`).

```check
Q: A graph is in one piece and its degrees are 2, 3, 4, 3, 2. What does it have?
- An Euler circuit
* An Euler path between the two vertices of degree 3, but no circuit
- No Euler path
= Two odd vertices: the path must start at one and end at the other. A circuit would need every degree even.
```

## Hierholzer's algorithm

Knowing a path exists is one thing. Finding it by "just walk and hope" can strand you: walk the wrong edge first and you are stuck with edges left over. Hierholzer (1873) doesn't mind getting stuck. It keeps a stack.

1. Push the start: an odd vertex for a path, any vertex with an edge for a circuit.
2. Look at the top vertex v. If v has an unused edge, walk it and push the other end.
3. If v has no unused edges, pop it and put it at the *front* of the circuit.
4. Repeat until the stack is empty.

[Draw the house](#example:envelope) is the easy case: from D, the walk uses all 8 edges in one go and only then gets stuck. [Show me](#play:envelope)

## Getting stuck, and splicing

The interesting case is getting stuck early. In [Stuck early, then a detour](#example:detour), the walk goes A, B, C and back to A while C-D and C-E are still unused. A is stuck, so it pops onto the circuit. Now C is on top, and C still has edges: the walk continues from C, around D and E and back to C. That detour comes off the stack later, and lands in the circuit right after C. Final answer A → B → C → D → E → C → A. [Show me](#play:detour)

That's the whole trick. Every stuck moment closes a loop, and the stack remembers where to splice the next loop in. [Two detours from two places](#example:two-detours) does it twice.

```check
Q: Why does Hierholzer put popped vertices at the front of the circuit?
- To save memory
* Vertices come off the stack from the end of the walk backwards
- Because the start vertex must be last
= The last vertex popped is the start, and the first vertex popped is where the walk ends. Building at the front puts them in walking order.
```

## Directed graphs and the arrows option

A directed walk must follow the arrows, so in and out degrees matter, not the total. In [Directed: one extra out, one extra in](#example:directed), A has one more arc out than in and D one more in than out: a path from A to D.

The option **Ignore the arrows** treats every arc as a plain edge. [The same square, arrows ignored](#example:ignore-arrows): following the arrows there is no path at all; ignoring them, every degree is 2 and it's a circuit.

## When to use it

Route inspection: snow ploughs, street sweepers and mail delivery want to cover every street once. De Bruijn sequences and genome assembly (piece together DNA reads by walking edges of overlaps) are Euler paths in disguise. Drawing machines and laser cutters want to trace a shape without lifting the tool.

If you need every *vertex* once, this is the wrong page: that is the Hamiltonian path, NP-complete, and no degree count will save you.

## Common mistakes

- Checking degrees and forgetting the "one piece" rule.
- Starting a path at an even vertex. When two vertices are odd, the path must start at one of them.
- Walking greedily and declaring "no path" when stuck. Hierholzer never gives up; it backs up and takes a detour.
- Using total degree on a directed graph. A vertex with 2 in and 0 out has even degree and still breaks the path.
- Fleury's algorithm (never cross a bridge unless you have to) works, but checking for bridges before every step makes it O(E²).

## Try this

- [Draw the house](#example:envelope). Can you find a second Euler path by hand? Where must it start?
- Add a vertex X joined to D and E (`D-X, X-E`) to the house. Path or circuit now?
- Load `A-B, B-C, C-D, D-A, A-C` and predict the start before you press Find.
- Run the Grid preset. How many odd vertices does a grid have, and where are they?
