# Interval tree

You have a pile of intervals: meetings in a calendar, reserved time slots, genes on a chromosome, rectangles on a screen projected onto one axis. You want to ask: which of these overlap [9, 21]? Scanning the whole list is O(n) every time. An interval tree answers in O(log n) for one overlap, and not much more for all of them.

It's a plain binary search tree with one extra number per node. CLRS uses it as the worked example of augmenting a data structure, and that's the real lesson here: pick the right extra field, keep it correct when the tree changes, and a search gets to skip most of the tree.

## The operations

| Operation | What it does | Cost (balanced tree) |
|---|---|---|
| `insert(i)` | BST insert by low end, raising max on the way down | O(log n) |
| `delete(i)` | BST delete, then fix max on the way up | O(log n) |
| `overlap(i)` | One interval that overlaps i, or nil | O(log n) |
| `all(i)` | Every interval that overlaps i | O(k log n) for k answers |

Closed intervals: [5, 9] and [9, 12] overlap, since both contain 9. Two intervals [a, b] and [c, d] overlap exactly when a ≤ d and c ≤ b.

## Keyed on the low end, plus max

Each node holds an interval, and the tree is a BST on the low ends (ties broken by the high end). On its own, that ordering doesn't help much: an interval that starts early can end very late.

So every node also stores **max**, the largest high end anywhere in its subtree. In the drawing it's the small number under each interval. The root's max is the latest end of all.

Keeping max right is cheap:

- **Insert.** The new interval ends up below every node on the path down, so set max = max(max, new high end) at each one as you pass. [Insert raises max on the way down](#example:insert-raises-max). [Show me](#play:insert-raises-max).
- **Delete.** Remove the node as in any BST (CLRS uses the successor). Only the nodes on the path from the lowest changed spot up to the root can have the wrong max now. Work each one out again from its own high end and its children's max. [Delete fixes max on the way up](#example:delete-fixes-max).

Each fix is O(1) per node and only touches one path. That's the test for a good augmentation: the extra field of a node can be computed from the node and its children alone. A rotation also changes only two nodes' subtrees, so a red-black version (the one CLRS builds) keeps max right for O(1) extra per rotation. This page uses a plain BST so you can watch max without rotations getting in the way.

## Finding one overlap

CLRS's INTERVAL-SEARCH walks down one path:

1. If x overlaps i, done.
2. If x has a left child and that child's max ≥ i's low end, go left.
3. Otherwise go right.

Why is going left safe? If the left max is too small, every interval on the left ends before i starts, so nothing there can overlap: going right loses nothing. The surprising part is the other case. If the left max reaches i's low end, some interval on the left ends late enough. Either it overlaps i (and we'll find something on the left), or it starts after i ends. In that case every interval on the right starts even later (BST order), so nothing on the right overlaps either. Either way, left is the only side worth looking at.

[One overlap: max says which way](#example:overlap-goes-left) and [Nothing overlaps: still one path](#example:no-overlap). [Show me](#play:overlap-goes-left).

```check
Q: The search is at a node that does not overlap i = [11, 14]. Its left child has max 9. Where does it go?
- Left, because the left subtree holds smaller intervals
* Right, because every interval on the left ends by 9, before 11
- It stops: nothing overlaps
= max 9 means nothing on the left reaches 11. The only place an overlap could be is on the right.
```

## Finding all overlaps

To list every overlap, you can't stop at the first one, but you can still skip subtrees:

- visit the left subtree only if its max ≥ i's low end;
- check the node itself;
- visit the right subtree only if the node's low end ≤ i's high end (otherwise everything on the right starts too late).

[Every overlap, pruning with max](#example:all-overlaps) faded out the subtrees it skipped. [Show me](#play:all-overlaps). Each visited subtree either contains an answer or gets cut off within a step or two, so on a balanced tree the cost is about O(k log n) for k answers. Fancier structures get O(k + log n), but this is the one you can write in ten minutes.

## The number line

The panel next to the tree draws every interval as a bar, in the tree's inorder (by low end), with the query as a band. A bar that crosses the band overlaps. It's a good way to check the search: the bars the tree skipped should all be outside the band.

## When to use one

Use an interval tree when the intervals change (insert and delete) and you query them often: calendars, schedulers, collision detection along one axis, genome browsers. If the intervals never change, sort them once and use a simpler structure, or a segment tree over the endpoints. If you only need to know whether a point is covered, a sweep or a sorted list of endpoints is enough.

Use a balanced tree underneath for real. Intervals often arrive sorted by start time (a calendar fills up in order), and a plain BST turns that into a chain. Try the **Sorted by low end** preset to see it.

```check
Q: Why can't a node just store its own interval, and the search use the low ends to decide where to go?
- It can; max is only an optimization for deletes
* A low end says nothing about how far the intervals in a subtree reach, so the search could not rule out a side
- Because the tree is keyed on the high ends
= An interval that starts early can end very late. Without max, a search has to look on both sides; max is what tells it one side is hopeless.
```

## Common mistakes

- Keying the tree on the high end, or on the midpoint. CLRS keys on the low end; the search argument depends on it.
- Forgetting to update max during insert, or updating it only at the new leaf.
- Fixing max only at the parent of a deleted node. The successor's old parent can be deep down, and every node from there to the root needs a check.
- Using open intervals in one place and closed in another. Decide whether [5, 9] and [9, 12] overlap, and stick to it.
- Expecting `overlap` to return a particular interval, such as the earliest. It returns the first one on its path.

## Try this

- [Insert raises max on the way down](#example:insert-raises-max): before each insert, predict which maxes change.
- Run `overlap 22-25` and then `all 22-25` on the same tree. How many nodes does each look at?
- In [Delete fixes max on the way up](#example:delete-fixes-max), which nodes' max goes down, and why not the others?
- Pick **Long intervals (many overlaps)** with 12 intervals and run `all 50`. How much does max prune when nearly everything overlaps?
