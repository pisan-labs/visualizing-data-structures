# Borůvka's minimum spanning tree

The oldest minimum spanning tree algorithm. Otakar Borůvka worked it out in 1926 to wire up the electricity network of Moravia, long before anyone said "algorithm". The idea fits in one sentence: every piece grabs its cheapest edge out, all at the same time, and the pieces merge. Repeat until one piece is left.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `MST-BORUVKA(G, w)` | a minimum spanning tree T | O(E log V) |
| one round | each component picks its cheapest edge out | O(V + E) |
| number of rounds | components at least halve each round | at most log₂ V |

Prim grows one tree from a start vertex. Kruskal grows a forest by adding the globally lightest safe edge, one at a time. Borůvka grows every tree at once. [Show me](#play:halving)

## How it works

1. Every vertex starts as a component of its own. T is empty.
2. Scan every edge once. For an edge whose ends are in different components, check whether it is the cheapest edge out of either of them so far.
3. Add every component's pick to T. Two components may pick the same edge; it goes in once.
4. Merge the components the new edges connect. If some edge still leaves a component, go back to 2.

In [Every component grabs its cheapest edge](#example:halving), round 1 adds five edges at once, and the eight pieces become three. Round 2 joins them with A-B and D-F. Total weight 19, the same tree as on the [Prim](/prim/) and [Kruskal](/kruskal/) pages.

The drawing gives each multi-vertex component its own color, and the table under it names each vertex's component by its first vertex. The `picks` row shows the cheapest edge out of each component as the scan goes.

```check
Q: Round 1 on A-B:1, B-C:5, C-D:2, A-D:6. Which edges does round 1 add?
- A-B only
* A-B and C-D
- A-B, C-D and B-C
- All four
= A and B both pick A-B (1). C and D both pick C-D (2). B-C waits for round 2, when {A, B} and {C, D} each pick it.
```

## Why it is right, and why ties matter

Each pick is the lightest edge crossing a cut: one component on one side, everything else on the other. The cut property says that edge belongs to some minimum spanning tree. So every pick is safe.

There's a catch. All the picks go in *at the same time*, and if two edges have the same weight, different components might pick different ones and close a cycle. Three vertices joined by edges of weight 1: A picks A-B, B picks B-C, C picks C-A. Oops. The fix is one tie rule everyone uses. Here a lighter edge wins, and on equal weights the edge earlier in the list (name order) wins. With a consistent rule the edge weights act as if they were all different, and no cycle can form. [Equal weights need one rule](#example:ties) shows it.

```check
Q: Why can Borůvka add many edges in one round without checking for cycles?
- It checks for cycles with union-find
* Each pick is the cheapest edge out of its component, and with consistent ties the picks cannot form a cycle
- It only adds one edge per round
= Picks along a cycle would each have to be cheaper than the next one around, which is impossible with a strict order on the edges.
```

## How many rounds?

Each component picks one edge, and each edge serves at most two components, so the number of components at least halves every round. With V vertices that's at most log₂ V rounds.

Often it is much faster. In [One round is enough](#example:all-at-once), the cheapest edge of every vertex already forms the tree. The slow case is when components pair off exactly. In [The slowest case](#example:path), eight vertices in a row take 3 rounds: pairs, then fours, then everything.

A graph in pieces needs nothing special: when each piece is joined, no edge leaves it, and the algorithm stops with a spanning forest. [Two pieces](#example:forest).

## When to use it

Borůvka shines when rounds can run in parallel, or when the graph is too big for one machine. Each component looks at its own edges, with no global priority queue (Prim) and no global sort (Kruskal). Fast parallel and distributed MST algorithms are built on it, and so is the expected linear-time randomized algorithm (Karger, Klein and Tarjan).

On one machine and a small graph, Prim or Kruskal is simpler to write. Relabeling components every round adds bookkeeping that the others don't need.

## Common mistakes

- Breaking ties differently in different places, or not at all. That is how cycles sneak in.
- Adding an edge twice when both of its ends picked it.
- Merging components while still scanning the round's edges. Picks are made against the components at the start of the round.
- Forgetting a component with no edge out. It isn't an error: that piece of the graph is done.

## Try this

- [Every component grabs its cheapest edge](#example:halving). Before running, list round 1's picks. How many components are left?
- Load `A-B:2, B-C:2, C-D:2, D-A:2` and run. Which edge is left out, and why that one?
- Run the Grid preset at size 12 and count the rounds. Is it log₂ 12, rounded down?
- Open [Prim](/prim/) on the same graph and compare the order the edges join.
