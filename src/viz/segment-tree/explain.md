# Segment tree (lazy propagation)

[Prefix sums](/range-queries/) are fast until the array changes. A [Fenwick tree](/fenwick-tree/) handles changes, but only for sums of prefixes. A segment tree does more than both: range sums or range minimums, changes to one value, and adding to a whole range at once, all in O(log n). It costs more memory and more code. Usually it's worth it.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `build(A)` | Make the tree from A | O(n) |
| `query(l, r)` | Sum (or minimum) of `A[l..r]` | O(log n) |
| `update(i, x)` | Set `A[i]` to x | O(log n) |
| `add(l, r, x)` | Add x to every value in `A[l..r]` | O(log n) |

The ranges include both ends and A starts at 0. The **Each node holds** option switches between sums and minimums.

## A tree of ranges

The root covers all of A. Every node splits its range in half, at `mid = ⌊(lo + hi)/2⌋`, and gives one half to each child. The halving stops at single values, which are the leaves. Each node holds the sum of its range, which it gets by adding up its two children. With n values there are 2n − 1 nodes and about log₂ n levels.

The drawing puts every node right over the part of A it covers, with its range on top: the box labeled 4–7 sits over `A[4]` to `A[7]`. A leaf's range is a single index, the one under it in A. Building the tree visits each node once, children first. [Ten values](#example:uneven-tree) show what happens when n is not a power of two: the halves come out uneven, and some leaves end up one level higher than others.

In code, nodes are numbered like a binary heap. The root is 1 and the children of v are 2v and 2v + 1, so the tree fits in an array with no pointers. With uneven halves the numbers have gaps, and the safe size for that array is 4n.

## A query: three cases

`query(l, r)` starts at the root. At every node it meets one of three cases:

- **No overlap.** The node's range and `[l, r]` share nothing. Return 0, which adds nothing (for minimums, return ∞).
- **Full overlap.** The node's range lies inside `[l, r]`. Return the node's value and stop. Nothing below it is needed.
- **Partial overlap.** Some of the node's range is inside `[l, r]` and some is not. Ask both children and add up what they return.

The answer ends up as the sum of a few nodes taken whole. `query(2, 9)` on 16 values uses `[2, 3]`, `[4, 7]` and `[8, 9]`. [Show me](#play:three-cases).

Why O(log n)? Only a node that crosses an end of the range, l or r, gets a partial overlap and goes deeper. Each level has at most two of those, so each level has at most four nodes visited. [A query that visits the most nodes](#example:worst-query) visits 15 of 31. [A query of the whole array](#example:whole-array) visits one: the root is a full overlap.

```check
Q: On 16 values, how many nodes does query(2, 9) take whole?
- 2
* 3
- 4
- 8
= [2, 3], [4, 7] and [8, 9]. Each is the biggest node that fits inside [2, 9] where it is, and together they cover it exactly.
```

## Changing one value

`update(i, x)` walks from the root down to the leaf for i, going left or right at each node depending on which half i is in. It sets the leaf, then fixes every node on the way back up, each one from its two children. One node per level: O(log n). [Update a value, then query](#example:update-then-query).

## Adding to a range, lazily

Now add 3 to every value in `A[2..7]`. Doing it one value at a time is six updates; for a big range it's O(n log n), slower than rebuilding the tree. The trick is to do as little as possible and leave a note.

`add(l, r, x)` uses the same three cases as a query. No overlap: nothing to do. Partial overlap: go down to both children, then recompute the node. Full overlap is where it gets lazy. Every value under the node goes up by x, so its sum goes up by x times the number of values, and the node can fix itself without looking at its children. It also keeps a tag, +3, that says its children still owe the add. Then it stops.

The children below a tag are out of date, and that's fine as long as nobody looks at them. Anyone who goes through a tagged node on the way down, a query or an update or another add, first pushes the tag down: both children take the add and the tag, and the node's own tag is cleared. In the drawing a tag sits under its node, and the values it still owes are gray. [Tags wait until a query passes through](#example:lazy-tags). [Show me](#play:lazy-tags).

So every operation is O(log n) again, however long the range. [Adding to the whole array](#example:add-everything) touches one node, the root.

```check
Q: Node [4, 7] has the tag +3, and its child [4, 5] still shows 11. A query passes through [4, 7] and pushes the tag down. What does [4, 5] hold afterwards?
- 14
* 17
- 23
- 11
= [4, 5] covers two values, and each goes up by 3: 11 + 3 × 2 = 17. Its own tag becomes +3 too, for its children.
```

## Sums, minimums and other operations

A node can hold anything you can compute from its two children: a sum, a minimum, a maximum, a gcd. The operation has to be associative, so that the order of grouping doesn't matter. It does not have to be undoable, which is why a segment tree can do range minimums and a Fenwick tree can't.

Lazy tags need one more thing: a node has to be able to apply an update to itself without its children. Adding x to a sum adds x times the length. Adding x to a minimum adds just x, since every value moved up by the same amount. [Range minimums with range adds](#example:range-minimum). Setting every value in a range to x works too, with a different kind of tag.

## When to use one, and when not to

Use a segment tree when the array changes and you need range answers: sums, minimums, maximums, or several at once in the same node. Use the lazy version when whole ranges change at once, as in scheduling, intervals on a timeline, or many problems that give you "add x to everything from l to r" a thousand times.

If the array never changes, [prefix sums or a sparse table](/range-queries/) answer in O(1) and are simpler. If you only need sums with point updates, a [Fenwick tree](/fenwick-tree/) is shorter and uses n numbers instead of 4n. A segment tree is a good default when you're not sure which one you need.

## Variants

- **Iterative.** A tree of exactly 2n entries, leaves in the second half, walked bottom up with loops instead of recursion. Faster and shorter, but the lazy version is harder to write.
- **Persistent.** Every update copies only the O(log n) nodes on its path, so old versions of the array stay queryable.
- **More in a node.** A node can hold the answer and extra data, such as the best prefix sum and the best suffix sum, to answer questions like "largest sum of a subarray in `A[l..r]`".
- **The other segment tree.** Computational geometry uses the same name for a tree that stores intervals. Different structure, same name.

## Common mistakes

- Forgetting to push a tag before going into the children. The children are out of date, and the answer is wrong only when a tag happens to be on the path, which makes it a fun bug to find.
- Forgetting to recompute a node after its children change, in update or add.
- Multiplying the add by the length for minimums, or not multiplying it for sums.
- Making the node array 2n long with the recursive numbering. Use 4n.
- Getting the full overlap test backwards. It is `l ≤ lo and hi ≤ r`: the node inside the query, not the query inside the node.
- Pushing from a leaf. A leaf has no children, and `2v` may be past the end of the array.

## Try this

- [The three cases of a query](#example:three-cases). Before pressing play, say which nodes will be taken whole.
- [A range of one cell](#example:single-cell). A partial overlap at every level on the way down, and a quick no overlap on the side.
- [Tags wait until a query passes through](#example:lazy-tags). Find the gray values, then watch the query make them right.
- [Range minimums with range adds](#example:range-minimum). Why does the tag not get multiplied here?
- Start over with **Random values** and 16 values, then try `add(0, 15, 5)` followed by `query(7, 7)`. Count the pushes.
