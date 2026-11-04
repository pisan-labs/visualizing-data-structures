# 2-4 tree

A 2-4 tree is a search tree with two rules. Every node has 2, 3 or 4 children, so it holds 1, 2 or 3 keys. And every leaf is at the same depth. Goodrich and Tamassia call a node with 2 children a 2-node, with 3 a 3-node, and with 4 a 4-node. You'll also see the name 2-3-4 tree.

The second rule is the one that matters. If every leaf is at the same depth and every node has at least 2 children, the tree can't be more than about log₂ n levels deep. No rotations, no colors, no rebalancing step. The tree stays balanced because it only grows and shrinks at the root.

A 2-4 tree is a [B-tree](/b-tree/) with t = 2. This page uses Goodrich and Tamassia's names for everything, and their way of doing each operation.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Finds k, one node per level | O(log n) |
| `insert(k)` | Puts k in a leaf; splits nodes that overflow | O(log n) |
| `delete(k)` | Takes k out of a leaf; fixes nodes that underflow | O(log n) |

Each node has at most 3 keys, so the work in a node is O(1), and there are O(log n) levels. Stored on disk as a B-tree, that is one disk read per level.

## Search

In each node, compare k with the keys from left to right. If you find k, you're done. Otherwise follow the pointer just left of the first key bigger than k (or the last pointer), and repeat. A leaf without k means k isn't in the tree. [Search reads one node per level](#example:search-path).

## Insert: overflow and split

A new key goes into the leaf where a search for it ends. If that leaf was a 2-node or a 3-node, there's room and you're done. If it was a 4-node, it now has 4 keys and 5 children: it overflows.

The fix is a split. Call the keys k1, k2, k3 and k4. k1 and k2 stay together in a 3-node, k4 becomes a 2-node, and k3 moves up into the parent, with the two new nodes on either side of it. [Show me](#play:overflow-split) a 4-node overflowing.

The parent now has one more key, so it might overflow too. Then it splits, and so on up the tree. If the root splits, k3 becomes a new root and the tree is one level taller. That is the only way the tree gets taller, which is why every leaf stays at the same depth. [A cascade of splits makes a new root](#example:split-cascade).

```check
Q: The key 40 goes into the leaf [10 20 30]. Which key moves up into the parent?
- 10
- 20
* 30
- 40
= With 40 the leaf would be [10 20 30 40], a 5-node. The split keeps 10 and 20 together, makes 40 a 2-node, and sends the third key, 30, up.
```

## Delete: underflow, transfer and fusion

Keys only come out of leaves. If k is in an internal node, swap it with its predecessor first, the largest key in the subtree on its left. That key is always in a leaf, and once the two trade places k is in a leaf too. [Show me](#play:swap-predecessor). The **Deleting a key that is not in a leaf** option uses the successor instead; either neighbor works.

Taking k out of a 3-node or a 4-node is the end of it. Taking the only key out of a 2-node leaves an empty node, and that is an underflow. There are two fixes.

**Transfer.** If a sibling right next to the empty node is a 3-node or a 4-node, it can spare a key. The sibling's key goes up into the parent, and the parent's key comes down into the empty node. It has to go through the parent: moving a key straight from one sibling to the other would put it on the wrong side of the parent's key. [A transfer from the left](#example:transfer-left), and [one from the right](#example:transfer-right).

**Fusion.** If every sibling next to it is a 2-node, nobody can spare a key. So the empty node fuses with a sibling, and the parent's key between them comes down into the fused node. [Show me](#play:fusion).

A fusion takes a key from the parent. If that was the parent's only key, the parent underflows, and you fix it the same way one level up. If the underflow reaches the root, the empty root goes away and the tree is one level shorter. [Fusions climb to the root and the tree gets shorter](#example:fusion-cascade).

This page tries a transfer from the left sibling first, then the right, and fuses with the right sibling when there is one. Other books choose differently. The trees come out different, and all of them are correct.

```check
Q: Deleting 90 empties a leaf. Its only sibling is [70], a 2-node. What happens next?
- A transfer: 70 moves into the empty leaf
- A transfer through the parent
* A fusion: the empty leaf merges with [70], and a key comes down from the parent
- Nothing: an empty leaf is allowed
= [70] has only one key, so it can't spare it. The empty leaf fuses with [70], and the parent's key between them comes down to fill the gap.
```

## 2-4 trees and red-black trees

A [red-black tree](/red-black/) is a 2-4 tree drawn with binary nodes. To turn a 2-4 tree into one, replace each node with a little binary tree. A 2-node becomes a black node. A 3-node becomes a black node with one red child, on either side (so a 3-node can lean left or right). A 4-node becomes a black node with two red children. To go back, fold every red node into its black parent.

Under this picture, the red-black rules are the 2-4 rules. "No red node has a red child" says a node never holds more than 3 keys. "Every path from the root down passes the same number of black nodes" says every leaf is at the same depth. And the fixes match too. When a red-black insert finds a red uncle and recolors, it is splitting a 4-node: the grandparent turns red, which means it moved up into its parent's node. When it rotates instead, it is reshaping a 3-node into a 4-node.

That is why the 2-4 tree is worth learning even though few libraries use one directly. Java's `TreeMap` and the usual C++ `std::map` are red-black trees, and red-black trees are much easier to follow once you can see the 2-4 tree hiding inside.

## When to use one, and when not to

In memory, use a red-black tree or an AVL tree from your language's library. A 2-4 tree with nodes of different sizes is awkward to code and wastes space in its emptier nodes. On disk, use a B-tree with t in the hundreds, so a node fills a disk page. The 2-4 tree is the small version of both, the one you can trace by hand.

## Common mistakes

- Splitting at the wrong key. A 5-node sends up its third key, not its middle pair.
- Leaving a node with 4 keys. That is an overflow, and it has to split.
- Deleting from an internal node without swapping first. That key separates two children, and they would have nothing between them.
- Moving a key straight from one sibling to the other in a transfer. It has to go through the parent, or the order breaks.
- Stopping after one fusion. If the parent lost its only key, it underflows too.
- Forgetting that the tree gets shorter only at the root.

## Try this

- [A 4-node overflows and splits](#example:overflow-split). Before you press play, say which key goes up.
- Insert `10 20 30 40 50 60 70 80 90 100` and count the splits. Then try the same keys in random order with the **Random order** preset.
- [An internal key swaps places with its predecessor](#example:swap-predecessor). Then switch to the successor in Options and run it again.
- [Transfer from the left](#example:transfer-left), [transfer from the right](#example:transfer-right) and [fusion](#example:fusion). Before each one, say which fix it will need.
- [Fusions climb to the root](#example:fusion-cascade). Watch the `fusions` counter and the height.
