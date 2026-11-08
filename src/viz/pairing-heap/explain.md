# Pairing heap

A [Fibonacci heap](/fibonacci-heap/) has wonderful bounds and a reputation: marked nodes, cascading cuts, a degree table, four pointers per node. Few people write one for fun. The pairing heap is what you get if you keep the lazy idea and throw out the bookkeeping. One heap-ordered tree, any number of children per node, and one operation that does all the work: link two roots.

It came from Fredman, Sedgewick, Sleator and Tarjan in 1986. They could not quite prove how fast it is. Forty years later we still can't, exactly. In practice it is one of the fastest priority queues around, and it fits on a page.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `meld(a, b)` | Compare the roots; the larger becomes the first child of the smaller | O(1) |
| `insert(key)` | Meld with a one-node heap | O(1) |
| `findMin()` | The root | O(1) |
| `decreaseKey(x, k)` | Cut x's subtree off, meld it with the root | O(1) actual, o(log n) amortized |
| `deleteMin()` | Remove the root, pair up its children | O(log n) amortized |

## Insert and meld are one link

To meld two heaps, compare their roots. The smaller key wins and stays the root; the other root becomes its first (leftmost) child, with its whole tree hanging under it. That's it. No walking, no rebalancing. Insert is a meld with a heap of one node.

[Meld two heaps with one comparison](#example:meld-two) builds a second heap and melds it in. Look at the comparisons counter: one, however big the heaps.

The catch is easy to see. [Ascending inserts make a flat root](#example:flat-root): every new key loses to the root and joins its children. Ten inserts, nine comparisons, and a root with nine children. Someone has to sort that out later.

## deleteMin: pairing in two passes

Remove the root. Its children are now separate heaps, and the new minimum is one of their roots. We could meld them left to right, one after another. That works, but it can leave a root with almost as many children as before, and the next deleteMin pays again.

The two-pass rule does better. Pass 1 goes left to right and melds the trees in pairs: the first with the second, the third with the fourth, and so on. That halves the number of trees. Pass 2 goes right to left: start with the last tree and meld each earlier one into the result. [deleteMin in two passes](#example:two-pass-delete) shows both passes on twelve keys. [Show me](#play:two-pass-delete).

One deleteMin on a root with k children costs k − 1 links, so the flat root above costs 8 links in one go. Amortized, though, deleteMin is O(log n): cheap inserts leave work behind, and the pairing cleans it up in a way that leaves the next root with few children.

```check
Q: The root of a pairing heap has 6 children. How many links does deleteMin make?
- 3
* 5
- 6
= Every link turns two trees into one. Six trees need five links to become one, whatever the order.
```

## Decrease-key by cutting

Lowering a key can break heap order with its parent. A binary heap would sift it up. A pairing heap cuts it off: the node takes its whole subtree with it, and both pieces are still heap-ordered, since everything under the node was already at least its old key. Then meld the piece with the root. One cut, one comparison. [Decrease-key by cutting](#example:decrease-by-cut) does it twice.

The real cost hides in the analysis. Each cut adds a child to the root, and deleteMin pays for those later. How much exactly is still open: Fredman showed it can't be O(1) amortized, and the best upper bound known is somewhere around O(2^(2√(log log n))). Hmmm. In practice it's fast. Dijkstra on a pairing heap usually beats Dijkstra on a Fibonacci heap.

```check
Q: Why can decrease-key cut x off with its whole subtree, instead of moving x alone?
* Everything under x was at least x's old key, so it is still at least the new, smaller one
- The subtree is always empty
- Cutting is only allowed at leaves
= Lowering x keeps x above its own children. Only the edge to x's parent can break, and the cut removes exactly that edge.
```

## How it's stored

The drawing shows each node with all its children. In memory, a node has a key and two pointers: its first child and its next sibling, the left-child right-sibling trick. A third pointer back to the left sibling (or the parent, for a first child) makes the cut O(1). Set **Draw the nodes** to **As stored** to see the sibling lists.

## Variants

The **multipass** option melds the first two trees, puts the result at the back of the list, and repeats until one tree is left. [Multipass pairing](#example:multipass) runs the same keys as the two-pass example. Fredman and friends analysed both; two-pass is the one everybody uses. There are more (auxiliary two-pass, front-to-back, the rank-pairing heap), mostly for people chasing the open question.

## When to use one, and when not to

Use it when you need decrease-key or meld and want something you can actually write: Dijkstra and Prim on big graphs, schedulers, simulations. It is short, it has no balance information, and its constant factors are small.

Avoid it when you need a hard bound on every single operation; one deleteMin can take O(n). If you never decrease a key and never meld, a [binary heap](/binary-heap/) in an array is simpler and friendlier to the cache.

## Common mistakes

- Melding the children left to right in one pass. It is correct, but it loses the amortized bound.
- Pairing in pass 2 from the left. Pass 2 goes right to left, into the last tree.
- Forgetting to detach a cut node from its siblings. In the stored form that means fixing the sibling pointers on both sides.
- Expecting the tree to look balanced. It never is; the cost is in the totals.

## Try this

- [Ascending inserts make a flat root](#example:flat-root). Count the links in the first deleteMin, then in the second.
- [deleteMin in two passes](#example:two-pass-delete). Before each link in pass 1, say which root wins.
- [Decrease-key by cutting](#example:decrease-by-cut). What would a binary heap do instead?
- Pick **Descending** with 12 keys and delete the minimum. Why is it so cheap?
