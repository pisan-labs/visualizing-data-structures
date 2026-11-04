# Skew heap

A skew heap is a [leftist heap](/leftist-heap/) that stopped keeping track. Same tree, same heap order, same merge down the right paths. But no null path lengths, and no check on the way back up: every node on the merge path swaps its children, always.

That sounds reckless. A skew heap can grow a right path as long as the whole heap, and then one merge walks all of it. The surprise is that it can't do that often. Over any sequence of operations, merges cost O(log n) each on average. Skew heaps come from Sleator and Tarjan, the pair behind splay trees, and they have the same flavor: no balance information at all, and an amortized bound instead of a worst-case one.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `merge(h1, h2)` | Combine two heaps into one | O(log n) amortized |
| `insert(key)` | Merge with a one-node heap | O(log n) amortized |
| `deleteMin()` | Remove the root, merge its two subtrees | O(log n) amortized |
| `findMin()` | The root | O(1) |

A single merge can cost O(n). Amortized means the total: m operations cost O(m log n), however unlucky one of them is.

## Merge, without the bookkeeping

Compare the two roots. The smaller one wins; its right subtree is merged with the other heap, recursively, until one side runs out. On the way back up, every winner swaps its left and right children. That's the whole algorithm.

```
merge(h1, h2)
  if h1 == nil: return h2
  if h2 == nil: return h1
  if h2.key < h1.key: swap h1 and h2
  h1.right = merge(h1.right, h2)
  swap h1.left and h1.right
  return h1
```

Why swap? The merge just made the right side longer. The swap moves it to the left, out of the way of the next merge. A leftist heap swaps only when it has to; a skew heap doesn't bother to check. [Every winner swaps](#example:insert-swaps-all) runs the same inserts as the leftist heap page, so you can compare the two shapes.

Some books describe it a little differently: merge the two right paths all the way down, then swap every node on the merged path except the last. A few more nodes swap. The idea and the bound are the same.

```check
Q: You insert a key into a skew heap, and the merge path has 4 nodes. How many nodes swap their children?
- None, unless the leftist property breaks
- 1, the last one
* 4
= Every winner swaps its children on the way back up. There is nothing to check.
```

## Insert and deleteMin are merges

Insert merges with a one-node heap. deleteMin removes the root and merges its two subtrees. [deleteMin is one merge](#example:delete-min-merge). And merging two heaps you built yourself is the same merge: [Merge two heaps along their right paths](#example:merge-two-heaps).

## A bad merge is paid for in advance

[Show me](#play:long-right-path) a long right path. Nine inserts, a new minimum followed by a big key each time, build a right path of five: 10, 20, 30, 40, 50. Then inserting 60 walks all five, and all five swap. The right path is down to two, and the next insert is cheap again.

Here's why that always happens. Call a node heavy if its right subtree has more nodes than its left, and light otherwise. Two facts do all the work.

- A right path has at most log₂ n light nodes. Stepping right from a light node takes you into the smaller half of its subtree, so you can only do it log₂ n times.
- A merge turns every heavy node on its path into a light one. Its right subtree is the one that grows, and the swap moves it to the left.

Now think of each heavy node as a coin in the bank. A merge costs one per node on its path. Each heavy node on the path pays for itself with its coin: it turns light and its coin is spent. Each light node on the path may turn heavy, so it pays for itself and puts at most one new coin in the bank. Add it up and a merge costs at most twice the number of light nodes on the two right paths, and each path has at most log₂ n of them: O(log n). A long merge is long because it spends coins that earlier, cheap operations saved up.

```check
Q: During a merge, a heavy node is on the merge path. What is it afterwards?
- Still heavy
* Light
- It depends on the keys
= Its right subtree takes the merged keys and gets bigger, and then the swap puts that subtree on the left. Now the right side is the smaller one.
```

## Leftist or skew?

Both merge in O(log n). The leftist heap promises it for every single operation and pays with an npl in every node and a check at every step. The skew heap promises it only on average over a sequence, and in return it's shorter to write and keeps nothing extra in its nodes. If one slow operation now and then is fine, as it usually is, a skew heap is the simpler choice.

## When to use one, and when not to

Use a skew heap when you need to merge priority queues and want the least code that does it. Avoid it when every operation must be fast, for example with a hard time limit per event; a leftist heap or a binomial queue gives worst-case bounds. If you never merge, a binary heap in an array is simpler and faster than either.

## Common mistakes

- Checking something before swapping. A skew heap always swaps.
- Swapping on the way down instead of after the recursive call returns.
- Expecting each operation to be O(log n). One merge can walk n nodes; it's the total that is bounded.
- Recursing on deep right paths in real code. A right path of length n is a recursion n calls deep; an iterative merge avoids that.

## Try this

- [Every winner swaps](#example:insert-swaps-all). Compare the result with the same inserts on the leftist heap page.
- [A long right path, paid for once](#example:long-right-path). Watch the variables: how many swaps does the insert of 60 make, and how many does 70 make?
- [Merge two heaps along their right paths](#example:merge-two-heaps). Before each step, say which root wins.
- Start over with **Ascending** and 15 keys, then with **Descending**. Compare the shapes, and the swaps each insert makes.
