# Disjoint sets (union-find)

Some questions are only about who is with whom. Are these two computers on the same network? Are these two pixels in the same blob? Would this edge close a cycle? Disjoint sets answer them fast. Each element is in exactly one set, sets can be joined, and they never split.

## The idea

| Operation | What it does | Cost (by rank, with path compression) |
|---|---|---|
| `MAKE-SET(x)` | a new set holding only x | O(1) |
| `FIND-SET(x)` | the name of x's set: the root of its tree | O(α(n)) amortized |
| `UNION(x, y)` | joins the sets of x and y | O(α(n)) amortized |

Each set is a tree. Every node points at its parent, and the root points at itself. The root names the set, so two elements are in the same set exactly when FIND-SET gives the same root for both. The parent pointers are the whole data structure: the parent array under the drawing is all the computer stores.

α(n) is the inverse Ackermann function. It grows so slowly that it is at most 4 for any n that fits in this universe. For every practical purpose, each operation costs a constant.

## How it works

FIND-SET(x) walks up the parent pointers until it reaches a node that is its own parent. UNION(x, y) finds both roots and, if they differ, LINK puts one root under the other. That is it. Nothing moves except one pointer.

Which root goes under matters. Union by rank (the CLRS version, and the default here) keeps a rank for each root, an upper bound on its height. The root with the smaller rank goes under. When the ranks are equal, either one can go under, and the new root's rank grows by one. This site puts the first root under the second on a tie, as CLRS does.

In [By rank, height stays at most log n](#example:rank-keeps-short), the tallest tree union by rank can build on 8 elements has height 3. A tree of rank r has at least 2ʳ nodes, so with n elements no tree gets taller than log₂ n. [Show me](#play:rank-keeps-short)

```check
Q: Root a has rank 2 and root b has rank 1. What does LINK(a, b) do with union by rank?
- a goes under b, because a comes first
* b goes under a, and a keeps rank 2
- b goes under a, and a's rank grows to 3
= The smaller rank goes under. b's tree is shorter than a's, so hanging it under a does not make a taller. Ranks only grow on a tie.
```

## Path compression and path halving

Find does a second job on the way: it flattens the path it walked. With path compression, every node on the path ends up pointing straight at the root. The recursive version does this on the way back from the root.

Have a look at [Path compression flattens the path](#example:compression). The first find(0) walks 0 → 1 → 3 → 7 and then points 0 and 1 at 7. The second find(0) takes one step. [Show me](#play:compression)

Path halving is a one-pass version: every node on the way points at its grandparent, and find jumps to that grandparent. It does half the flattening, needs no recursion and no second pass, and gets the same O(α(n)) bound. Compare [Path halving skips every other node](#example:halving) with the compression example. [Show me](#play:halving)

Note that compression does not update ranks. After a few finds, a root's rank can be bigger than its real height. That is fine. Rank was only ever an upper bound.

## Variants

| Setting | Which root goes under | Tallest tree |
|---|---|---|
| By rank (CLRS) | the smaller rank | log₂ n |
| By size | the tree with fewer nodes | log₂ n |
| Naive | always the first | n − 1 |

Union by size counts nodes instead of ranks, which some books prefer because size is useful on its own ("how many computers are on this network?"). [By size: the smaller tree goes under](#example:by-size). Both rules give the same bounds.

Naive union ignores the trees and always puts the first root under the second. It works, and it can build a chain. In [Naive union builds a chain](#example:chain), union(0, 1), union(0, 2), and so on stack all 8 elements into one path, and find(0) walks 7 pointers. Switch **Union** to by rank and replay it: the same unions make a star. [Show me](#play:chain)

```check
Q: With naive union and no compression, you run union(0, 1), union(0, 2), ..., union(0, 99) on 100 elements. How many pointers does the last find(0) follow?
- 1
- About log₂ 100, so 7
* 99
= Each union puts the current root under the next element, so the tree is a single path of 100 nodes, with 0 at the bottom.
```

## When to use it

Use disjoint sets when sets only ever merge and you need to ask whether two things are together: Kruskal's minimum spanning tree (does this edge join two trees, or close a cycle?), connected components of a graph that arrives one edge at a time, image segmentation, percolation, and unification in type checkers. On the [Kruskal page](/kruskal/), the union-find forest sits next to the graph.

Avoid it when sets need to split, or when you need to list a set's members quickly. Union-find cannot undo a union, and it has no pointer from a root down to its children. To list a set, you would have to look at every element.

## Common mistakes

- Linking x under y instead of root under root. `x.p = y` attaches x and leaves the rest of x's tree behind, so the sets are no longer what they seem. UNION must call FIND-SET first.
- Forgetting the same-set check. Linking a root under itself makes a loop, and the next find never ends. [Union inside one set does nothing](#example:same-set).
- Updating rank on every link, instead of only on a tie. Ranks then grow too fast, and the tree heights stop matching them.
- Expecting compression to fix ranks. It does not need to.
- Writing recursive find in a language with a small stack, with naive union. A chain of a million nodes overflows it. Path halving has no recursion.

## Try this

- [Naive union builds a chain](#example:chain). Predict the height before you play it. Then switch Union to by rank and Find to path compression, and count the steps again.
- Make sets 8 to 15, then union every element with 0. What is the height by rank? By size?
- [Path compression flattens the path](#example:compression): after the first find(0), which nodes point straight at 7? Which ones did not move?
- Run the pairs preset with 16 elements and no compression. Does the height reach log₂ 16 = 4?
