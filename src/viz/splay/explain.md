# Splay tree

A splay tree is a binary search tree with no balance rule at all. It stores no heights, no colors, no priorities. It does one thing: every time you touch a key, it moves that key to the root with a series of rotations called splaying. Keys you use often end up near the top, and keys you never use sink.

Daniel Sleator and Robert Tarjan published splay trees in 1985. The surprising part is the analysis. A single operation can be slow, but any long run of operations is fast on average.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Finds k, then splays it (or the last node visited) to the root | O(log n) amortized |
| `insert(k)` | Adds k as a leaf, then splays it to the root | O(log n) amortized |
| `delete(k)` | Splays k to the root, removes it, joins the two halves | O(log n) amortized |
| `min()`, `max()` | Finds the smallest or largest key and splays it | O(log n) amortized |
| `inorder()` | Every key, in sorted order | O(n) |

Amortized means "averaged over a sequence". Any m operations on a tree with n keys take O((m + n) log n) time in total. One of those operations can still take O(n): the tree can be a long chain, and nothing stops you from asking for its bottom key.

## Splaying: zig, zig-zig and zig-zag

To splay x, look at its parent p and grandparent g, and repeat until x is the root:

- **Zig.** p is the root. One rotation at p lifts x to the top. [Show me](#play:zig).
- **Zig-zig.** x and p are both left children, or both right children. Rotate at g first, then at p. [Show me](#play:zig-zig).
- **Zig-zag.** x is a left child and p a right child, or the other way round. Rotate at p, then at g, exactly like an AVL double rotation. [Show me](#play:zig-zag).

The zig-zig order matters more than it looks. If you rotate at p first and then at g, you only move x to the root, and a chain stays about as long as it was. Rotating at the grandparent first folds the path, so a splay roughly halves the depth of every node on it. That folding is where the speed comes from.

```check
Q: x is the left child of p, and p is the left child of g. Which rotation does the splay do first?
* A rotation at g, which lifts p
- A rotation at p, which lifts x
- A double rotation, as in an AVL tree
= x and p lean the same way, so this is zig-zig: rotate at the grandparent g first, then at p. Rotating at p first would just move x up and leave the rest of the path as long as before.
```

## Search, insert and delete

Search walks down as in any BST. If it finds k, it splays k to the root. If it doesn't, it splays the last node it visited. That isn't optional: an unsuccessful search can walk a long path too, and the splay is what pays for it. [A search that misses still splays](#example:search-miss).

Insert adds k as a leaf, as in a BST, and splays it. If k is already there, that node gets splayed instead.

Delete comes in two textbook versions, and **Delete** in Options switches between them. Sleator and Tarjan splay k to the root and remove it, which leaves two subtrees. Every key on the left is smaller than every key on the right, so they splay the largest key on the left up to the top of the left subtree. That key has no right child, and the right subtree hangs there. [Delete: splay, remove, join](#example:delete-join). The other version deletes k as a plain BST would and then splays the parent of the node that was removed. [Delete as in a BST, then splay the parent](#example:delete-bst).

## Why it's fast on average

Insert 10, 20, ..., 80 in increasing order. Each new key goes to the right of the root and gets splayed up with one zig, so the old tree slides down to the left. You get a chain of height 7, and each of those inserts was cheap. Now search for 10, at the bottom: 8 comparisons. The splay folds the path, and the height drops to 5. Search for 20, 30 and 40 as well, and the tree is down to height 3. [Repeated accesses make the tree shallow](#example:repeated-access).

The cheap inserts built up a debt, and the expensive search paid it off and made the next searches cheaper. Sleator and Tarjan made this precise with a potential function, the sum of the logs of the subtree sizes, and showed that a splay costs at most 3 log₂ n plus a constant in amortized terms.

A few more facts fall out of the same analysis. The keys you use often stay near the root, so a splay tree does about as well as the best fixed tree for your access pattern, without knowing that pattern in advance. Searching the same key twice in a row costs one comparison the second time.

```check
Q: A splay tree with 1,000 keys is a chain, and you search for the key at the bottom. What can you say about the cost?
- It's O(log n), because splay trees are balanced
* That search costs about 1,000 comparisons, but the splay leaves the path about half as deep
- It can't happen: a splay tree never becomes a chain
= Splay trees keep no balance rule, so one operation can cost O(n). The guarantee is amortized: the splay folds the long path, so a sequence of operations averages O(log n) each.
```

## When to use one, and when not to

Use a splay tree when some keys are used much more than others, or when recent keys are likely to be used again soon: caches, the symbol table of a compiler, a list of open files. It's also simpler to write than an AVL or red-black tree: there's no extra field in each node and no case analysis for colors or heights.

Avoid it when every single operation has to be fast, as in a real-time system, since one operation can take O(n). Avoid it when many threads read the tree at once: in a splay tree even a search changes the shape. And if your accesses are spread evenly over all the keys, an AVL or red-black tree does the same job without moving things around on every read.

## Common mistakes

- Rotating at the parent first in the zig-zig case. You still get x to the root, but the long path never gets shorter, and the amortized bound is gone.
- Forgetting to splay after a search that misses. The walk still cost something; splay the last node visited.
- Using a zig on its own when x has a grandparent. Zig only happens when the parent is the root, or when the parent is where the splay has to stop.
- Expecting O(log n) for every operation. It's amortized: one search can take O(n).
- Treating search as read-only. It rotates, so it changes the tree.

## Try this

- [Zig](#example:zig), [zig-zig](#example:zig-zig) and [zig-zag](#example:zig-zag). Before each step, say which case it is.
- [Repeated accesses make the tree shallow](#example:repeated-access). Count the comparisons in each search.
- Pick **Sorted, then search every key in order** with 15 keys. The tree ends up a chain again, and yet the whole run took O(n) rotations. Watch the rotation count.
- Type `10 20 30 40 50` and press **Insert**, then type `10 10 10` and press **Search**. How much does the second search for 10 cost?
- [A search that misses still splays](#example:search-miss). Which node ends up at the root, and why that one?
