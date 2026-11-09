# Topological sort (indegree)

You have courses and prerequisites, or build steps and the files they need. An arc A>B means A has to come before B. A topological order lists every vertex so that every arc goes from earlier to later. Kahn's algorithm finds one by asking a simple question over and over: what has nothing left before it?

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| Kahn's algorithm, with a queue | a topological order, or the vertices a cycle blocks | Θ(V + E) |
| The same, smallest name first | the order that comes first alphabetically | O(V log V + E) |

The in-degree of a vertex is the number of arcs coming into it. A vertex with in-degree 0 has nothing before it, so it can go first. Put it in the order and remove its arcs. Some other vertex may now have in-degree 0. Repeat. [Show me](#play:paths-dag)

## How it works

1. Count the in-degree of every vertex: one pass over the arcs.
2. Every vertex with in-degree 0 is ready. Put them in a queue.
3. Take u from the queue and append it to the order L.
4. For each arc u → v: lower v's in-degree by one. If it drops to 0, v is ready: add it to the queue.
5. Repeat from 3 until the queue is empty.

If every vertex is in L, L is a topological order. If not, the graph has a cycle.

In the drawing, each vertex wears its in-degree left (in=2) until it goes in the order, and then its place (#3). Ready vertices wear a dashed ring, vertices in the order are green, and removed arcs turn dashed. The queue Q, the order L and the in-degree table sit beside the graph.

Names do not decide the order; arcs do. In [the starting DAG](#example:paths-dag), C>B, so C has to come before B even though B comes first alphabetically. The order is A, C, B, E, D, F, G.

```check
Q: At some point Q = [D, F] and in[G] = 2. Can G be the next vertex in the order?
- Yes, it is the next letter after F
- Yes, any vertex can go next
* No: G still has 2 arcs in from vertices not in the order yet
= A vertex goes in the order only when its in-degree reaches 0. Until then, something G depends on has not been placed.
```

## Many orders

When several vertices are ready at once, any of them can go next. So a DAG can have many topological orders. The queue decides which one you get.

With a first-in, first-out queue, vertices go out in the order they became ready. In [First ready, first out](#example:fifo-order), D becomes ready before C, so the order is A, B, D, C, E. Switch **Ready vertices wait in** to the priority queue and run [the same graph](#example:smallest-first): it takes the smallest ready name each time and gives A, B, C, D, E. Both are correct. [Show me](#play:smallest-first)

The smallest-first order is the one that comes first alphabetically. That is handy when you want one fixed answer, as in a grader. It costs a heap: O(log V) per insert and extract.

A [chain](#example:chain) has exactly one order: only one vertex is ever ready.

## Cycles

If the graph has a cycle, no order exists. Each vertex on the cycle waits for the one before it, so none of them ever reaches in-degree 0. Kahn's algorithm finds this for free: the queue empties with vertices left over.

In [the cycle example](#example:cycle), A and F go out, and then nothing is ready. B, C and D wait on each other, and E waits on D. Four vertices left. The page follows arcs backwards among them until a vertex repeats, and draws that cycle in red: B → C → D → B. [Show me](#play:cycle)

The leftover vertices are the ones on a cycle and the ones after it. E is not on the cycle, but it can never go. In [No vertex with in-degree 0](#example:no-sources), nothing is ready from the start.

An undirected graph has no topological order: each edge goes both ways, a cycle of two. The page says so and does nothing.

```check
Q: Kahn's algorithm stops with 3 of 8 vertices left over. What do you know?
* The graph has a cycle, and every leftover vertex is on it or after it
- The 3 leftover vertices have no arcs
- The 5 vertices in the order are wrong
- The graph has exactly 3 cycles
= Every leftover vertex still has an arc in from another leftover vertex. Follow those arcs backwards and you must come back to a vertex you have seen: a cycle. The 5 placed vertices are fine.
```

## When to use it

Use it for anything with "do this before that": course plans, build systems (make), spreadsheet recalculation, task scheduling, installing packages with dependencies. It also checks that a set of dependencies has no cycle, and tells you which tasks are stuck.

Depth-first search gives a topological order too: list the vertices by decreasing finish time. Kahn's version is easier to explain, does not recurse, and says which vertices are blocked when there is a cycle.

## What it costs

Counting in-degrees reads every arc once: O(E). Each vertex goes through the queue once, and each arc is removed once: O(V + E) in all, even on a chain. With a priority queue, the V inserts and extracts cost O(log V) each. With [many sources](#example:wide), the queue holds six vertices at once.

## Common mistakes

- Putting a vertex in the order before its in-degree reaches 0.
- Forgetting the check at the end. If L is shorter than V, there is a cycle; returning L as an answer is wrong.
- Counting out-degrees instead of in-degrees.
- Expecting one right answer. There is only one order when a path of arcs runs through every vertex, as in a chain; otherwise there are several.
- Running it on an undirected graph.

## Try this

- [The starting DAG](#example:paths-dag). Before each step, say which vertex is taken and which vertices become ready.
- [First ready, first out](#example:fifo-order), then [smallest first](#example:smallest-first). Find the step where they part ways.
- [A cycle](#example:cycle), then load `A>B, A>F, B>C, C>D, D>E` (the same arcs without `D>B`) and sort again. Where does B go now?
- Load `A>B, B>C, C>A, C>D` and sort. Then load `A>B, B>C, A>C, C>D`.
- [The starting DAG](#example:paths-dag) is drawn in layers, so every arc points down. Is the order the same as reading the rows top to bottom?
