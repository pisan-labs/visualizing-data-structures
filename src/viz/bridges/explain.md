# Cut vertices and bridges

Some graphs hang by a thread. Take out one router and half the network is cut off. Close one road and the town on the other side of the river is unreachable. That router is a cut vertex (also called an articulation point), and that road is a bridge. One depth-first search finds all of them.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| low-link DFS | every cut vertex and every bridge | Θ(V + E) |

A **cut vertex** is a vertex whose removal splits its piece of the graph in two or more. A **bridge** is an edge whose removal does the same. An edge is a bridge exactly when it is on no cycle. In [Two triangles and a tail](#example:two-triangles), the triangles hold themselves together, but C-D, F-G and G-H are bridges, and C, D, F and G are cut vertices. [Show me](#play:two-triangles)

The obvious way is to remove each vertex in turn and check whether the graph is still connected. That is V searches, Θ(V(V + E)). The low-link trick does it in one.

## Low values

Run DFS. Every vertex gets a discovery time d, as usual. An undirected DFS has only tree edges and back edges, and a back edge always goes from a vertex up to one of its ancestors. So the only way to get from u's subtree to somewhere above u, without going through u, is a back edge.

That is what low measures. u.low is the smallest d you can reach from u by going down the tree any number of steps and then along at most one back edge:

- start with u.low = u.d;
- for a back edge u-w, take w.d if it is smaller;
- for a child c, after visiting it, take c.low if it is smaller.

The edge back to your own parent does not count. It is the tree edge you came in on, and counting it would make every edge look like it is on a cycle. Each vertex in the drawing carries its d/low, and the table below fills in as the search goes.

## The tests

For a tree edge from u to its child v:

- **Bridge:** v.low > u.d. Nothing below v climbs back to u or above, so u-v is the only way out of v's subtree.
- **Cut vertex:** v.low ≥ u.d, and u is not the root. Nothing below v climbs above u, so removing u leaves v's subtree on its own.

The difference is one character. With v.low = u.d, something below v climbs back to u itself. The edge u-v is on a cycle, so it is not a bridge, but u is still the only way out, so u is a cut vertex.

[One back edge saves a chain](#example:long-back-edge) shows how much a single back edge can do. F-B climbs all the way from F to B, so every edge from B to F is on a cycle. Only A-B is left as a bridge. [Show me](#play:long-back-edge)

```check
Q: Tree edge u-v, with u.d = 4 and v.low = 4. What do you know?
- u-v is a bridge
* u-v is not a bridge, but u is a cut vertex (if it is not the root)
- Neither
- Both
= v.low = u.d means something below v has a back edge to u. That puts u-v on a cycle, so it is no bridge. But nothing climbs above u, so without u, v's subtree is cut off.
```

## The root rule

The root has no ancestors, so v.low ≥ root.d is always true and the test says nothing. The root needs its own rule: **the root is a cut vertex exactly when it has two or more DFS children.**

Why? DFS from the root explores everything reachable through its first child before it comes back. If the root then finds a second child that is still undiscovered, there was no way from the first subtree to the second one except through the root. An undirected DFS has no cross edges. Take the root away and the subtrees fall apart.

In [Two triangles and a tail](#example:two-triangles), A has one child, B, so A is not a cut vertex. In [A root with two children](#example:bowtie), DFS goes round the first triangle and has to come back to A for the second, so A is a cut vertex. [Show me](#play:bowtie)

```check
Q: The DFS root has exactly one child. Is it a cut vertex?
- Yes, if that child's low equals the root's d
* No
- Only if the graph is a tree
- It depends on the back edges
= With one child, everything else is in one subtree below the root. Removing the root leaves that subtree in one piece.
```

## When to use it

Use it to find weak spots: single points of failure in a network, roads whose closure cuts a town off, or the edges to double up first. It is also the first step for splitting a graph into its 2-edge-connected or biconnected pieces.

It is for undirected graphs. For a directed graph the matching question is which vertices can all reach each other, which is strongly connected components.

[A tree](#example:tree) is as fragile as a graph gets: every edge is a bridge, and every vertex that is not a leaf is a cut vertex. [A cycle](#example:cycle) is the opposite: nothing is fragile.

## What it costs

Θ(V + E) with adjacency lists: one DFS, and O(1) work per edge end to update a low value. A graph in [two pieces](#example:two-pieces) gets one DFS tree per piece, and each root gets the root rule. The recursion goes as deep as the DFS tree, up to V calls on a long path.

## Common mistakes

- Counting the edge back to the parent as a back edge. Then low never rises above the parent's d, and you find no bridges at all.
- Using the low test for the root. It always passes, so every root with a child looks like a cut vertex.
- Mixing up the tests: > for bridges, ≥ for cut vertices.
- Taking w.low for a back edge u-w instead of w.d. For bridges it happens to give the same answer. For cut vertices it can be wrong.
- Thinking an endpoint of a bridge must be a cut vertex. A leaf hanging off a bridge is not one. Remove it and there is nothing left to split.

## Try this

- [Two triangles and a tail](#example:two-triangles): before you play it, guess H's low value.
- [A tree](#example:tree): add the edge D-F and run again. Which bridges are left?
- [A cycle](#example:cycle): remove one edge. How many bridges does that make?
- Load `A-B, A-C, A-D` (a star) and run it. Why is A a cut vertex when no low value says so?
