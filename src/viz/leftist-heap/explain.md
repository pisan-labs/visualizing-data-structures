# Leftist heap

A [binary heap](/binary-heap/) is great until you need to merge two of them. Then you're stuck copying one array into the other and building again: O(n). A leftist heap gives up the array. It's a binary tree with pointers, it keeps heap order (every parent is no bigger than its children, so the minimum is at the root), and it merges two heaps in O(log n).

The whole trick is one number per node and one rule about it.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `merge(h1, h2)` | Combine two heaps into one | O(log n) |
| `insert(key)` | Merge with a one-node heap | O(log n) |
| `deleteMin()` | Remove the root, merge its two subtrees | O(log n) |
| `findMin()` | The root | O(1) |

Insert and deleteMin are both merges in disguise. Get merge right and you're done.

## Null path length

The null path length of a node, npl, is the length of the shortest path from it down to a node with fewer than two children. A leaf has npl 0, a node with one child has npl 0, and an empty tree has npl −1. The drawing shows each node's npl under it.

The leftist property: at every node, npl(left) ≥ npl(right). The tree leans left, which is where the name comes from. So the shortest way down from any node is to keep going right, and npl(x) = npl(x.right) + 1.

Why care? Because the right path is then short. If the right path from the root has r nodes, the tree has at least 2^r − 1 nodes, because the top r levels of the tree are full. Flip it around: the right path has at most log₂(n + 1) nodes. Every operation walks right paths only.

```check
Q: A leftist heap has 7 nodes. At most how many nodes can its right path have?
- 2
* 3
- 4
- 7
= A right path with r nodes needs at least 2^r − 1 nodes in the tree. 2³ − 1 = 7 fits; 2⁴ − 1 = 15 does not.
```

## Merge: down the right paths, then back up

Merge is recursive. Compare the two roots. The smaller one wins: it becomes the root of the result, and its right subtree is merged with the other heap. That's the recursive call, and it keeps going until one side runs out. Then the other side is the answer for that call.

On the way back up, each winner checks its children. If npl(left) < npl(right), the merge made the right side too long, so swap the two children. Then npl(winner) = npl(right) + 1. The narration names every swap, and the list under the trees shows the calls still running. [Show me](#play:merge-two-heaps): the merge goes back and forth between the two right paths, and then 5 and 4 swap their children on the way back.

A swap moves a whole subtree, so it's O(1). The work is one call per node on the two right paths: O(log n).

```check
Q: On the way back up, a winner has npl(left) = 1 and npl(right) = 1. What happens?
- Swap the children
* No swap; its npl becomes 2
- No swap; its npl stays the same
= Equal is fine: the rule is npl(left) ≥ npl(right). The npl is recomputed anyway, npl(right) + 1 = 2, because the right subtree may have changed.
```

## Insert and deleteMin are merges

Insert makes a heap of one node and merges it in. [An insert that swaps children](#example:insert-swaps): 25 lands under 15, npl(15) goes up to 1, and the root swaps its children because its left side is now the shorter one.

deleteMin removes the root and merges its two subtrees, which are leftist heaps already. [deleteMin is one merge](#example:delete-min-merge).

## Tall but fast

Leftist doesn't mean balanced. Insert keys from largest to smallest and each new key becomes the root with the old heap as its left child. You get a chain down the left, height n − 1. [Show me](#play:descending-chain). The operations don't care. They only walk the right path, and here it's a node or two long.

## Two conventions for npl

Weiss sets npl(nil) = −1, so a leaf has npl 0. Other books count one more: npl(nil) = 0 and a leaf has 1. You'll see that number called the rank or the s-value. Same heap, same swaps, every number one bigger. The **Null path length of an empty tree** option switches between them. [The other convention](#example:rank-convention).

## When to use one, and when not to

Use a leftist heap when you merge priority queues often. Merging is the point. It's also simple to write without arrays, which is why leftist heaps show up a lot in functional languages, where you build new nodes rather than update old ones.

If you never merge, use a binary heap. It's an array, it has no pointers to chase, and it's faster in practice. If you need decrease-key on a heap that also merges, have a look at [binomial queues](/binomial-queue/) and [Fibonacci heaps](/fibonacci-heap/).

## Common mistakes

- Swapping when npl(left) = npl(right). Only a strictly shorter left side needs a swap.
- Forgetting to recompute npl after the swap. The swap changes which child is on the right.
- Checking npl on the way down. The right subtree isn't final until the recursive call returns.
- Mixing up the conventions: with npl(nil) = 0, a leaf has npl 1.
- Merging along the left paths. The left path can be n − 1 long.
- Assuming a leftist heap is balanced.

## Try this

- [Merge two heaps along their right paths](#example:merge-two-heaps). Before each step, say which root wins.
- [An insert that swaps children](#example:insert-swaps). Predict the npl under each node after 25 goes in.
- [deleteMin is one merge](#example:delete-min-merge). Which two nodes swap their children?
- [Tall but fast](#example:descending-chain). Count the calls in the insert and in the deleteMin.
- Start over with **Descending** and 15 keys, then with **Random keys**. Compare the height with the npl of the root.
