# Min-max heap

A [binary heap](/binary-heap/) answers one question fast: what's the smallest? Or the largest, if you built it the other way. Not both. Ask a min-heap for its largest key and it has to look at every leaf, about n/2 of them.

A min-max heap answers both. It's the same complete binary tree in the same array, but the levels take turns. The root's level is a min level, the next one is a max level, then min, then max. A key on a min level is no bigger than anything below it. A key on a max level is no smaller than anything below it. So the smallest key is the root, and the largest is one of the root's two children. Atkinson, Sack, Santoro and Strothotte came up with it in 1986, for double-ended priority queues.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `findMin()` | The root | O(1) |
| `findMax()` | The larger of the root's two children | O(1) |
| `insert(key)` | Put it in the first free slot, push it up | O(log n) |
| `extractMin()` | Take the root, move the last key there, trickle it down | O(log n) |
| `extractMax()` | Take the larger child, move the last key there, trickle it down | O(log n) |
| `build(list)` | Trickle down from the last parent back to the root | O(n) |

The faint bands in the drawing mark the max levels, and the labels on the right say which is which.

## Insert: pick a side, then skip levels

A new key goes in the first free slot, as in any heap. Then one comparison with its parent decides which levels it belongs on. Say it landed on a min level. If it is larger than its parent, which sits on a max level, it belongs on the max levels: swap the two and carry on up the max levels. Otherwise it stays on the min levels.

From then on it only ever looks at its grandparent, two levels up, on the same kind of level. The level in between doesn't need checking: the first comparison already sorted that out. [A new minimum climbs by grandparents](#example:grandparent-climb) inserts twelve keys, each smaller than everything so far. Watch each one jump two levels at a time to the root.

```check
Q: A new key lands on a max level and is smaller than its parent, which is on a min level. What happens next?
- It swaps with its grandparent
* It swaps with its parent and keeps climbing the min levels
- It stays where it is
= Being smaller than a min-level key means it belongs on the min levels. After the swap it compares only with grandparents.
```

## Extract: look two levels down

To take out the minimum, take the root, move the last key into its place, and trickle that key down. A binary heap looks at two children. A min-max heap looks at the children and the grandchildren, up to six keys, and finds the smallest.

If the smallest is a child, swap once and stop. The key lands on a max level with nothing to fix below it. If it's a grandchild and smaller than our key, swap them. Our key is now two levels down, on the next min level. But it sits under a max-level parent now, and it might be bigger than that parent. If so, swap those two as well. Then keep going from the grandchild's slot.

[Trickle down with a fix on the way](#example:trickle-fix) has one of those fixes: in the extract-max, the key lands on a max level under a min-level parent that is larger than it, and the two swap. That's the one step a binary heap never needs.

Extracting the maximum is the mirror image. Find the larger child of the root, take it, move the last key into its slot and trickle down with min and max swapped. [Take from both ends](#example:both-ends) alternates the two. [Show me](#play:both-ends).

## Why both ends are O(log n)

Each round of trickle-down jumps two levels, so it runs about (log₂ n)/2 times. Each round looks at up to six keys and maybe makes one extra comparison with a parent. That's roughly 3 log₂ n comparisons in the worst case, against 2 log₂ n for a binary heap. A bit more work per operation, but now you get both ends. Insert is cheaper still: one comparison with the parent, then one per two levels.

Could you get the same thing with two heaps, a min-heap and a max-heap holding the same keys? Yes, but deleting the minimum from one means finding it in the other too, which needs cross-links between the two. A min-max heap does it in one array with no links.

```check
Q: In a min-max heap with 15 keys, where can the largest key be?
- At the root
* At A[2] or A[3], the root's children (indexed from 1)
- At any leaf
= The root's children sit on the first max level, and each is at least as big as everything under it.
```

## Variants

Set **The root level** to max and you get a max-min heap: the largest key is the root and the smallest is a child. Everything else mirrors. [The mirror image: a max-min heap](#example:max-min) runs the same keys that way. [Build bottom-up](#example:build-bottom-up) builds in O(n), with trickle-down in place of sift-down.

There are cousins with the same job: the interval heap, the deap and the symmetric min-max heap. They differ in how they lay the keys out. I think the min-max heap is the easiest to draw.

## When to use one, and when not to

Use it when you need both the smallest and the largest, over and over: a bounded priority queue that drops its worst item when full, a sliding median, or a scheduler that sometimes evicts the lowest priority. Avoid it when you only ever need one end; a plain binary heap is simpler and does fewer comparisons.

## Common mistakes

- Comparing with the parent at every step on the way up. After the first comparison, only grandparents matter.
- Forgetting the fix after a grandchild swap. Without it the max level in between can end up smaller than a key below it.
- Assuming the maximum is at A[2]. It's the larger of A[2] and A[3], and with one key it's the root.
- Working out the level from the index wrongly. Indexed from 1, the depth of A[i] is ⌊log₂ i⌋; even depths are min levels.

## Try this

- [Take from both ends](#example:both-ends). Before each extract, find the answer in the drawing.
- [A new minimum climbs by grandparents](#example:grandparent-climb). Count the comparisons for the last insert, then check the counter.
- [Trickle down with a fix on the way](#example:trickle-fix). Predict which grandchild wins before each round.
- Pick **Random inserts** with 15 keys, then switch the root level to max and do it again.
