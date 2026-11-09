# Depth-first search

Breadth-first search spreads out in rings. Depth-first search picks one road and follows it until it cannot go any further, then backs up to the last place it had a choice and tries the next road. It does not find shortest paths. What it finds is structure: cycles, an order for tasks with dependencies, the pieces of a graph. Most of that comes from two numbers it gives every vertex, a discovery time and a finish time.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| `DFS(G)` | d, f and π for every vertex, and a kind for every edge | O(V + E) |

A clock starts at 0 and ticks every time something happens. When the search first reaches a vertex, the clock ticks and that is its discovery time, d. When the search has explored everything it can from that vertex, the clock ticks again and that is its finish time, f. [Show me](#play:deep)

The search starts at a vertex you pick. When it runs out of road, it starts again from the next vertex that is still white, in name order, until every vertex has been visited. Each start grows a new depth-first tree.

## How it works

`DFS-VISIT(u)` does the exploring:

1. Tick the clock, set u.d, and color u gray.
2. For each neighbour v of u, in order: if v is white, set v.π = u and call `DFS-VISIT(v)` right away. Everything reachable through v gets explored before u looks at its next neighbour.
3. Tick the clock, set u.f, and color u black.

White means not found yet. Gray means found and still being explored: the gray vertices are exactly the calls waiting on the stack. Black means done. In the drawing, gray vertices wear a dashed ring, the vertex being explored is marked u, and each vertex carries d/f. In [Deep first](#example:deep), the search from A runs through all eight vertices without backing up once. [Show me](#play:deep)

## The times nest

Write "(A" when A is discovered and "A)" when it finishes, and list them in time order. The parentheses always nest properly, like brackets in code: `(A (B (D D) B) A)` can happen, `(A (B A) B)` cannot. That is the parenthesis theorem.

It gives a quick test for ancestors. v is a descendant of u exactly when u's interval contains v's: u.d < v.d < v.f < u.f. Two vertices in different branches have intervals that do not overlap at all. The **nesting** row under the drawing shows the parentheses as they happen.

```check
Q: DFS gives u.d = 2 and u.f = 9, and v is discovered at time 4. What do you know about v.f?
* v.f < 9
- v.f > 9
- v.f = 9
- Nothing, without the graph
= v was discovered while u was gray (2 < 4 < 9), so v is u's descendant, and its interval sits inside u's.
```

## Four kinds of edges

When DFS explores an edge (u, v), the color of v says what kind of edge it is:

- **White v: tree edge.** v is discovered from u. Tree edges are drawn as arrows from parent to child.
- **Gray v: back edge (B).** v is an ancestor of u, still being explored. A back edge closes a cycle, and a graph has a cycle exactly when DFS finds one.
- **Black v, with u.d < v.d: forward edge (F).** v is a descendant that is already done: a shortcut down the tree.
- **Black v, with u.d > v.d: cross edge (C).** v is in a branch, or a tree, that finished before u began.

[Every kind](#example:every-kind) is a directed graph with all four, and two trees. [Show me](#play:every-kind)

An undirected graph has only tree and back edges. Each edge is classified from whichever end the search reaches first, and a forward or cross edge would have been found from the other end as a tree or back edge. Watch out for the edge back to your parent: it is the tree edge you came in on, not a back edge.

```check
Q: DFS runs on an undirected graph. Which kinds of edges can it find?
- All four
* Only tree and back edges
- Only tree edges
- Tree, back and cross edges
= Every edge is classified from the end the search reaches first. Seen from there, the other end is either white (a tree edge) or an ancestor still on the stack (a back edge).
```

## Recursion or a stack

The recursive version keeps its bookkeeping on the call stack. That is fine until the graph is deep: on [a path](#example:path) every vertex is a call waiting at once, and a big enough graph overflows the call stack.

The usual fix is an explicit stack. Push a starting vertex. Look at the top: if it is white, discover it and push all its white neighbours; if it is gray and everything it pushed is done, pop it and finish it. There is a catch. A stack takes the last thing pushed first, so if you push the neighbours in name order, the search goes to the last one first. In [the stack example](#example:stack-order), A pushes B and C, and C comes next, the opposite of the recursion. [Show me](#play:stack-order)

It is still a correct depth-first search, with a different tree. If you want the recursion's order, push the neighbours in reverse: [Push in reverse](#example:stack-reversed) gives exactly the recursive times. A vertex can also sit on the stack more than once, pushed by two different neighbours before either one is explored; the second copy is skipped when it comes up.

## When to use it

Use DFS to find cycles (a back edge), to put tasks with dependencies in order (sort by finish time, latest first: [a DAG](#example:dag)), to find connected components, and as the engine inside strongly connected components and cut vertices. It also uses little memory on wide graphs: from the middle of [a star](#example:star), the stack never holds more than two calls, where BFS would queue every leaf at once.

Do not use it for shortest paths. The path DFS takes to a vertex is the first one it stumbles on, and it can be far longer than needed. BFS finds the fewest edges.

## What it costs

With adjacency lists, DFS visits each vertex once and reads each list once, so it takes Θ(V + E). The outer loop alone touches every vertex, even when there are no edges. With an adjacency matrix, every vertex reads a row of V cells, so it is Θ(V²).

## Common mistakes

- Forgetting the outer loop. DFS-VISIT from one vertex only reaches what that vertex can reach; [three pieces](#example:disconnected) need three starts.
- Calling the edge back to the parent a back edge in an undirected graph. Every graph with an edge then seems to have a cycle.
- Expecting the stack version to visit in the same order as the recursion.
- Marking a vertex visited when it is pushed, in the stack version. A vertex pushed early is then skipped by a deeper vertex that reaches it first, so the tree is no longer depth-first: an undirected graph can show cross edges.
- Using DFS paths as shortest paths.

## Try this

- [Deep first](#example:deep): which vertex finishes first, and why that one?
- [Every kind](#example:every-kind): before you play it, guess the kind of D>B.
- [Start at E](#example:middle-start): count the back edges. Does the number change with the start?
- Set **Keep track with** to the explicit stack and run Deep first again. Which vertex comes second now?
- Load `A>B, B>C, C>D, D>B` and run from A. Where is the cycle?
