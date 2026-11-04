# B-tree

A B-tree is a search tree with many keys in every node. A binary search tree makes one comparison per node and moves to one of two children. A B-tree reads a whole node, compares the key with everything in it, and moves to one of many children. Fewer levels, more work per level.

Why would you want that? Because a node can be a page on disk. Reading from a spinning disk takes milliseconds and reading from memory takes nanoseconds, a factor of about a hundred thousand. Once you have paid for a disk read, comparing a few hundred keys in memory is close to free. So the goal is to read as few nodes as possible, and the way to do that is a short, fat tree.

## The operations

| Operation | What it does | Disk reads | CPU time |
|---|---|---|---|
| `search(k)` | Finds k, reading one node per level | O(log_t n) | O(t log_t n) |
| `insert(k)` | Puts k in a leaf, splitting full nodes | O(log_t n) | O(t log_t n) |
| `delete(k)` | Takes k out, borrowing or merging so no node gets too small | O(log_t n) | O(t log_t n) |

t is the minimum degree, below. log_t n is the height of the tree, and with t in the hundreds it is 2 or 3 for any data you are likely to have.

## The rules

CLRS describes a B-tree by its minimum degree t, which is at least 2.

- Every node except the root holds between t - 1 and 2t - 1 keys. The root holds at least 1 (unless the tree is empty).
- A node with k keys has k + 1 children, and its keys separate them: everything under the pointer between 20 and 30 is between 20 and 30.
- All the leaves are at the same depth.

The last rule is the clever one. A B-tree never gets lopsided, because it only grows and shrinks at the root. With n keys, the height is at most log_t((n + 1) / 2). If every node holds 1000 keys, a tree of height 2 holds 1000 + 1001 × 1000 + 1001² × 1000 keys, just over a billion, and any of them is at most 3 disk reads away. Keep the root in memory and it's 2.

The **Minimum degree t** option goes from 2 to 4 so that the trees fit on a screen. t = 2 gives nodes of 1 to 3 keys, which is a [2-4 tree](/two-four-tree/). Some books describe a B-tree by its order m instead, the most children a node may have. Under CLRS's rules, m = 2t.

```check
Q: With t = 3, how many keys can a node other than the root hold?
- 1 to 5
* 2 to 5
- 3 to 6
- 2 to 6
= Every node except the root holds t - 1 to 2t - 1 keys, so 2 to 5 when t = 3.
```

## Search

Search is binary search tree search with a loop inside each node. Compare k with the keys from left to right until one is not smaller than k. If it's equal, you're done. Otherwise follow the pointer just left of that key (or the last pointer, if k is bigger than every key) and repeat. If you reach a leaf and k isn't there, k isn't in the tree. [Show me](#play:search-path) three searches: one finds its key in the root, one in a leaf, and one misses. Watch `reads`. It never goes past 3.

CLRS scans each node from left to right. With hundreds of keys in a node, real implementations use binary search inside the node. That cuts the CPU work to O(log n) and leaves the disk reads alone.

## Insert: split on the way down

A new key always goes into a leaf. The trouble is a full leaf, with 2t - 1 keys and no room. The fix is to split it: the middle key moves up into the parent, and the keys on either side become two nodes of t - 1 keys each. But now the parent has one more key, and the parent might be full too.

CLRS avoids that with a trick. Every time insert is about to go down into a full node, it splits that node first. The parent was checked one level earlier, so it has room for the middle key, and when insert reaches the leaf, the leaf has room. One trip down, never back up.

The root is the special case. A full root splits into two nodes, and its middle key goes into a new root above them. That is the only way a B-tree gets taller, and it keeps every leaf at the same depth. [The root splits and the tree grows](#example:root-split), and [a full child splits on the way down](#example:split-down).

Splitting early has a cost. CLRS splits a full node even when the leaf below it has room, so the tree can grow taller than it had to. In [splitting early can make the tree taller](#example:split-early), the root splits for an insert that needed no split at all.

## Insert: split on the way back up

The other way, the one Goodrich and Tamassia use for 2-4 trees, goes down to the leaf first and puts the key in. If the leaf now holds 2t keys, one too many, it overflows. Split it and push its middle key up into the parent. If that overflows the parent, split the parent, and so on up the tree. A split that reaches the root makes a new root. [Show me](#play:split-cascade) two splits in a row making a new root.

Switch **When a full node splits** to try it. Both versions keep the same rules; they split different nodes, so the same keys can end up in different trees. Insert [ascending keys](#example:ascending) both ways and compare the heights.

## Delete: never enter a node at the minimum

Delete is where B-trees earn their reputation. The problem is the mirror image of insert: take a key out of a node with t - 1 keys and it has too few. CLRS uses the same trick as insert. On the way down, it makes sure that every node it enters (except the root) has at least t keys, one more than the minimum. Then a key can always come out without going back up.

There are three cases, and two of them have sub-cases.

**Case 1: k is in a leaf.** Take it out. The leaf had at least t keys, so it still has enough. [Delete from a leaf](#example:delete-leaf).

**Case 2: k is in an internal node x.** You can't just take it out, because it separates two children and they would have nothing between them. Look at those two children.

- 2a: if the child before k has at least t keys, find k's predecessor (the largest key under that child), move it up in place of k, and delete the predecessor from the child. [Show me](#play:predecessor). The old copy of 25 stays in the leaf, dashed, until the delete reaches it.
- 2b: otherwise, if the child after k has at least t keys, do the same with k's successor. [The successor moves up](#example:successor).
- 2c: if both children have only t - 1 keys, merge them, with k in the middle, into one node of 2t - 1 keys, and delete k from that. [Merge the children around the key](#example:merge-around).

**Case 3: k is not in x.** Then it can only be under one child, c. If c has only t - 1 keys, fix it before going down.

- 3a: if a sibling next to c has at least t keys, borrow through the parent. A key of x moves down into c, a key of the sibling moves up into x, and the sibling's child pointer on that side moves over to c. [Borrow from the left](#example:borrow-left), or [from the right](#example:borrow-right).
- 3b: if the siblings next to c have only t - 1 keys too, merge c with one of them, pulling the key between them down from x. [Merge on the way down](#example:merge-down).

A merge takes a key out of x. If x is the root and that was its last key, the merged node becomes the root and the tree is one level shorter. That is the only way a B-tree loses height. [Show me](#play:merge-shrinks) a delete with two merges, the first of which lowers the tree.

Which sibling? CLRS doesn't say. This page borrows from the left sibling when it can, and merges with the right sibling unless c is the last child. Other books choose differently, so their trees end up with different shapes. They are all correct.

```check
Q: With t = 3, the root is [30 60] and its children are [10 20], [40 50] and [70 80 90]. What happens first in delete(30)?
- 20 moves up in place of 30
- 40 moves up in place of 30
* [10 20], 30 and [40 50] merge into one node
- 30 comes out and the root becomes [60]
= Both children around 30 have only t - 1 = 2 keys, so neither can spare one for 30's spot. Case 2c merges them with 30 in the middle, and then 30 comes out of the merged leaf.
```

## When to use one, and when not to

Use a B-tree when the data lives on disk, or anywhere one read costs much more than a comparison. Most databases keep their indexes in B-trees (usually the B+ tree variant), and many file systems use them for directories. They work in memory too: scanning a node that sits in a few cache lines is cheaper than chasing a pointer per comparison. Rust's standard `BTreeMap` is a B-tree with t = 6.

If everything fits in memory and you only look up exact keys, a hash table is simpler and faster. If you need sorted keys in memory, a [red-black tree](/red-black/) is easier to get right. And if you mostly read ranges of keys, have a look at the [B+ tree](/b-plus-tree/), which keeps every key in the leaves and links the leaves in order.

## Common mistakes

- An off-by-one in the split. With CLRS's t, a full node has 2t - 1 keys. The middle key is number t, and each half keeps t - 1.
- Moving keys without their child pointers. In a split, a borrow or a merge, the pointers travel with the keys around them, or a subtree ends up under the wrong range.
- Holding the root to the minimum. The root may have a single key.
- Stopping halfway through case 2a or 2b. The predecessor is now in two places, and the copy in the leaf still has to go.
- Assuming that deleting a missing key changes nothing. CLRS fixes nodes on the way down before it knows whether k is there, and those borrows and merges stay. The tree is still valid. It is just different.
- Mixing up the minimum degree and the order. A B-tree of order 4 in one book is t = 2 in CLRS.

## Try this

- [The root splits and the tree grows](#example:root-split). Before you press play, say which key ends up in the new root.
- Insert `10 20 30 40 50 60 70 80 90 100` with t = 2 and count the splits. Then do it again with t = 4.
- [Ascending keys leave nodes half full](#example:ascending). Then switch to splitting on the way back up and compare the heights.
- Go through the delete cases in order: [1](#example:delete-leaf), [2a](#example:predecessor), [2b](#example:successor), [2c](#example:merge-around), [3a](#example:borrow-left) and [3b](#example:merge-down). Before each one, say which case it is.
- Pick **Insert, then delete half** with 30 keys and watch the `merges` and `borrows` counters.
