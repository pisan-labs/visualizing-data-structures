# Topological sort (DFS)

You have tasks, and some have to happen before others. Socks before shoes. Compile before link. A topological order lists every task so that each arc u → v has u before v. Depth-first search gives you one almost for free: list the vertices by finish time, latest first.

## The idea

| Operation | What it gives | Cost |
|---|---|---|
| `TOPOLOGICAL-SORT(G)` | the vertices in topological order, or a cycle | Θ(V + E) |

Run DFS on the whole graph. Each time a vertex finishes, put it on the front of a list L. When DFS is done, L is the answer. [Show me](#play:last-goes-first)

Why does it work? Take any arc u → v. When DFS explores it, v is white, black or gray. If v is white, it gets explored from u and finishes before u does. If v is black, it already finished. Either way v finishes first, so u lands in front of it in L. The gray case is the problem, and it gets its own section below.

## How it works

The outer loop tries every vertex in name order. A white vertex starts a new depth-first tree. Inside `DFS-VISIT(u)`:

1. Tick the clock, set u.d, and color u gray.
2. For each v that u points to: if v is white, explore it now.
3. Tick the clock, set u.f, color u black, and insert u at the front of L.

Watch the **L** row under the drawing. It grows at the front, never at the back. In [The last tree goes to the front](#example:last-goes-first), G is the last vertex in name order, so it is the last one to start a tree. It also finishes last, so it ends up first: G, A, D, E, B, C, F.

[Getting dressed](#example:getting-dressed) is the classic version. The watch has no arcs at all. It still gets a place in L, wherever its tree happens to finish.

```check
Q: DFS gives B.f = 4 and D.f = 9. Which comes first in L?
- B, since it finished first
* D, since it finished later
- It depends on the arcs
= Each vertex goes on the front as it finishes, so a later finish means further forward. L is in decreasing finish time.
```

## Cycles

Now the gray case. If u → v leads to a gray vertex, v is an ancestor of u that is still being explored. That is a back edge, and it closes a cycle: v reaches u along tree edges, and u points back to v. Then v has to come before u and after u. No order works.

So the sort checks for it. By default (the CLRS version) it stops at the first back edge, says which cycle it closes, and draws it in red. In [A cycle stops the sort](#example:cycle), D → B finds B gray, and the cycle is B → C → D → B. [Show me](#play:cycle)

A graph has a topological order exactly when DFS finds no back edge. So the same search is also a cycle detector.

Set **When DFS finds a back edge** to keep going and play [Keep going past a cycle](#example:keep-going). The search finishes, and L still comes out by decreasing finish time. But D → B points backward in it. A list by finish time always exists. It is a topological order only for a DAG.

```check
Q: DFS explores u → v and v is gray. What does that tell you?
- v is done and already in L
* There is a cycle through u and v
- v is in another depth-first tree
- Nothing: v will finish first anyway
= Gray means still being explored, so v is an ancestor of u. The tree path from v to u plus the arc u → v is a cycle.
```

## When to use it

Use it for anything with dependencies: build systems, course prerequisites, spreadsheet cells, the order to evaluate a DAG for shortest paths. It is also the first step of Kosaraju's strongly connected components, which needs the same finish-time order.

The other way to sort is by indegree (Kahn's algorithm): repeatedly take a vertex with no arcs left coming in. It finds the same kind of answer, often a different order, and it detects a cycle when it runs out of vertices with indegree 0 before the end. DFS is short to write. Kahn's is easier to stop early and does not recurse.

A topological order is usually not unique. [A chain named backwards](#example:backward-chain) has exactly one. So does [Every pair joined](#example:dense). Most DAGs have many, and DFS just gives you one of them.

## What it costs

Θ(V + E) with adjacency lists: one depth-first search, plus O(1) per vertex to put it on the front of L. That needs a linked list, or an array you append to and reverse at the end. Inserting at the front of an array shifts everything every time, O(V²) in all, which is a silly way to lose a linear algorithm.

## Common mistakes

- Listing vertices by discovery time. A vertex can be discovered before something it depends on.
- Appending finished vertices and forgetting to reverse.
- Calling the outer loop from one vertex only. Vertices it cannot reach never get a place.
- Forgetting the gray check, and printing a "topological order" for a graph with a cycle.
- Expecting the same order as Kahn's algorithm. Both are right.

## Try this

- [The last tree goes to the front](#example:last-goes-first): before you play it, guess which vertex finishes first.
- [A chain named backwards](#example:backward-chain): how many depth-first trees are there, and why?
- [A cycle stops the sort](#example:cycle): change D>B to B>D and load it again. Is it a DAG now?
- Load `A>B, B>C, A>C` and sort. What kind of edge is A>C, and does it point the right way in L?
