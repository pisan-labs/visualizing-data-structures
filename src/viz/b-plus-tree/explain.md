# B+ tree

A B+ tree is a B-tree with two changes. Every key lives in a leaf, and the keys in the internal nodes are only copies, signposts that tell a search which way to go. And the leaves are linked left to right, so once you have found one key, the next one is in the same leaf or one link away.

Most relational databases build their indexes this way. The reason is the query you'll write a hundred times: every order between two dates, every student with a grade from 80 to 89. A B+ tree answers it with one trip down the tree and then a walk along the leaves, reading pages in order.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Walks down to the leaf where k belongs | O(log_m n) |
| `insert(k)` | Puts k in a leaf; splits nodes that overflow | O(log_m n) |
| `delete(k)` | Takes k out of its leaf; borrows or merges | O(log_m n) |
| `range(a, b)` | Every key from a to b, in order | O(log_m n + k) |

m is the order: the most children a node may have, so a node holds at most m - 1 keys. k in the last row is the number of keys the range returns. Each node is one disk read. With m around 500, four levels hold tens of millions of keys even when every node is as empty as it may be, so a lookup is four disk reads, fewer when the top levels stay in memory.

Books disagree about what "order" means. Some use the most children, as here; others use the fewest keys a node must hold. Check which one your book means before you trust a number. This page keeps an internal node (other than the root) at ⌈m/2⌉ children or more, and a leaf (other than the root) at ⌈(m - 1)/2⌉ keys or more. The **Order m** option goes from 3 to 5.

## Search always ends in a leaf

At each internal node, go down the pointer just after every separator that is at most k. A key equal to a separator is in the subtree on its right. Keep going until you reach a leaf, then look for k there. A search never stops at an internal node, even when k is sitting right there as a separator: that copy might be all that is left of a deleted key. [Show me](#play:search-signpost).

## Insert: copy up, push up

Insert finds the leaf, puts k in, and if the leaf now has m keys, splits it. The left leaf keeps ⌈m/2⌉ keys and a new leaf takes the rest, linked into the chain right after it. Then the new leaf's first key is **copied up** into the parent. The key itself stays in the leaf, because every key lives in a leaf. [A leaf split copies its key up](#example:leaf-split).

The parent now has one more key. If that makes m, the parent splits too, but an internal split is different. Its middle key is **pushed up**: it leaves the node, and nothing stays behind, since an internal key is only a signpost anyway. If the root splits, the pushed-up key starts a new root and the tree is one level taller. [Show me](#play:push-up) both kinds of split in one insert.

Mixing up the two is the classic B+ tree mistake. Leaf splits copy; internal splits move.

```check
Q: With m = 4, 40 goes into the leaf [10 20 30], which then splits. What does the parent get?
- 20, and it leaves the leaf
* A copy of 30; the leaves are [10 20] and [30 40]
- 30, and it leaves the leaf
- Nothing: the leaf only grows
= The left leaf keeps 2 keys and the new leaf takes [30 40]. A copy of its first key, 30, goes up as a signpost, and 30 stays in its leaf.
```

## Range queries walk the leaves

`range(a, b)` walks down once, to the leaf where a would be. From there it reads keys in order, following the link to the next leaf whenever it runs out, and stops at the first key bigger than b. It never goes back up the tree. [A range query walks along the leaves](#example:range-walk).

In a plain B-tree the next key after k might be in k's parent, or in a leaf two levels away, so walking a range means going up and down the tree all the time. In a B+ tree the next key is always in the same leaf or the next one. On a disk, reading the next leaf is often reading the next page.

## Delete: borrow or merge

Delete finds the leaf and takes k out. If the leaf still has enough keys, that's it. [Delete from a leaf with keys to spare](#example:delete-leaf). The separator above might still say 70 after 70 is gone, maybe for a long time. That is fine: it still sends every search the right way.

If the leaf has too few keys, it underflows, and there are two fixes:

- **Borrow.** A sibling with a key to spare gives one up. For leaves, the key moves over, and the separator between them changes to the new first key of the right leaf. [Borrow from a sibling](#example:borrow).
- **Merge.** If no sibling can spare a key, the leaf merges with one and the separator between them is dropped from the parent. Nothing comes down: it was only a copy. [Merge with a sibling](#example:merge).

A merge takes a key out of the parent, so the parent can underflow too. Internal nodes borrow and merge like B-tree nodes: a borrowed key goes up and the separator comes down, and a merge pulls the separator down between the two halves. If the root ends up with no keys, its only child becomes the root and the tree is one level shorter. [Merges climb to the root](#example:merge-cascade).

```check
Q: You delete 70, and 70 is still a separator in the root. What should you do?
- Delete it from the root as well
- Rebuild the tree
* Nothing: the separator still sends searches the right way
- Swap it with its predecessor
= Separators are signposts, not keys. 70 still sits between the keys below 70 and the keys from 70 up, so every search still goes the right way.
```

## B-tree or B+ tree?

In a B-tree each key appears once, and a search can stop at an internal node. In a B+ tree a search always goes to a leaf, and a key can appear twice: once in its leaf, and maybe once more as a separator. That sounds wasteful, but the internal nodes hold only keys and pointers, no records, so more of them fit in a disk page. More children per node means a shorter tree. Add the leaf links and range queries become cheap, which is why databases nearly always pick the B+ tree.

## When to use one, and when not to

Use a B+ tree for data on disk that you search by key and by range: database indexes, file system directories, a key-value store. If the data fits in memory and you only look up exact keys, a hash table is simpler and faster. For sorted data in memory, your library's balanced tree (a red-black tree in Java's `TreeMap`) is easier. The leaf links pay off when there is a disk underneath.

## Common mistakes

- Pushing a key up from a leaf split. A leaf split copies; the key has to stay in its leaf.
- Forgetting to link the new leaf into the chain. The tree still searches fine and range queries quietly skip keys.
- Stopping a search at an internal node that holds k. The copy is a signpost; the leaf is the answer.
- Pulling the separator down into a leaf merge. It was a copy, so it just goes away.
- Forgetting to update the separator after a leaf borrows from its right sibling.
- Treating a leftover separator as a bug.
- Mixing up the two meanings of order.

## Try this

- [A leaf split copies its key up](#example:leaf-split), then [an internal split pushes its key up](#example:push-up). Before each split, say which key goes up and whether it stays.
- Insert `10 20 30 40 50 60 70 80 90 100`, then try `range` with `25 65`, `5 15` and `95 200`. Count the leaves each one reads.
- [Borrow](#example:borrow) and [merge](#example:merge). Before each, say which fix the leaf will need.
- Switch **Order m** to 3 and insert the same ten keys. Compare the heights.
- Pick **Random, then a range query** with 30 keys and watch `visited`, the leaves the walk reads.
