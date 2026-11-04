# AVL tree

A binary search tree is fast when it's short and slow when it's tall, and a plain BST has no say in which one it gets. The order of the inserts decides. An AVL tree adds one rule: at every node, the two subtrees differ in height by at most 1. When an insert or a delete breaks the rule, the tree fixes itself with a rotation or two on the way back up.

Georgy Adelson-Velsky and Evgenii Landis published the idea in 1962. It was the first balanced search tree, and the letters in the name are theirs.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Finds the node with key k | O(log n) |
| `insert(k)` | Adds k as a leaf, then rebalances on the way back up | O(log n) |
| `delete(k)` | Removes k as a BST would, then rebalances on the way back up | O(log n) |
| `min()`, `max()` | Smallest and largest key | O(log n) |
| `inorder()` | Every key, in sorted order | O(n) |

Everything still costs O(h), as in any BST. The rule keeps h below about 1.44 log₂ n, so O(h) is O(log n) whatever order the keys arrive in.

## Height and balance factor

The height of a node is the number of edges on the longest path from it down to a leaf. A leaf has height 0, and a missing child counts as −1. The balance factor of a node is its left subtree's height minus its right subtree's height. In an AVL tree every balance factor is −1, 0 or +1. The drawing writes the height to the left of each node and the balance factor to the right, and a +2 or −2 shows up in red.

Each node stores its own height. Otherwise every balance factor would need a walk down the whole subtree, and O(log n) would quietly turn into O(n).

Textbooks disagree on two details, so Options has a switch for each. Some count nodes instead of edges, so a leaf has height 1 and an empty tree has height 0. Some subtract the other way round, so +2 means too tall on the right. Neither switch changes a single rotation. They change the numbers you write on the exam, which matters more than it should.

## Rotations

A rotation moves one node up and its parent down, and keeps every key in order. Rotate right at x: x's left child y moves up into x's place, x becomes y's right child, and y's old right subtree moves across to become x's left subtree.

Why is that last move allowed? Everything in that middle subtree is bigger than y (it was on y's right) and smaller than x (it was on x's left). It fits on either side. Only a few pointers change, so a rotation is O(1), and only x and y get new heights. A left rotation is the mirror image.

[Show me](#play:ll-case) a right rotation at the root. Watch 40 swing from 30 across to 50. The nodes keep their identity here, so you can follow each one as it moves.

## The four cases

After an insert or a delete, walk back up toward the root. The first node with a balance factor of +2 or −2 is two levels too tall on one side. Which rotation fixes it depends on its child on that tall side:

| Case | Too tall on the | That child leans | Fix |
|---|---|---|---|
| LL | left | left, or neither way | rotate right at the node |
| RR | right | right, or neither way | rotate left at the node |
| LR | left | right | rotate left at the child, then right at the node |
| RL | right | left | rotate right at the child, then left at the node |

The letters spell the path from the unbalanced node down into the tall part. LR means left child, then its right child. When the tall part is on the outside (LL, RR), one rotation fixes it. When it's on the inside (LR, RL), a single rotation just moves the problem to the other side, so the first rotation turns the inside case into an outside one. [Show me](#play:lr-case).

One example of each: [LL](#example:ll-case), [RR](#example:rr-case), [LR](#example:lr-case), [RL](#example:rl-case).

```check
Q: Insert 30, 10 and 20 into an empty AVL tree. Which case does inserting 20 run into?
- LL
- RR
* LR
- RL
= 30 is two levels taller on the left, and its left child 10 leans right because 20 went to 10's right. That's LR: rotate left at 10, then right at 30, and 20 ends up at the root.
```

## Insert: at most one fix

Insert walks down as a BST insert would and adds a leaf. Then it walks back up, recomputing heights. The walk can stop early: as soon as a node's height comes out the same as before, nothing above it can change. At the first node that's out of balance, it rotates once or twice. After that, the subtree has exactly the height it had before the insert, so the walk stops there too. One insert never needs more than two rotations.

[Sorted input stays balanced](#example:sorted-input). Seven keys in increasing order make a plain BST into a chain of height 6. Here they take four left rotations and end up as a perfect tree of height 2. [Show me](#play:sorted-input).

## Delete: fixes can cascade

Delete starts like a BST delete. A leaf just goes, a node with one child is replaced by that child, and a node with two children is replaced by its successor (or its predecessor, in Options). Then walk back up from the lowest place that changed, fixing heights and rotating where needed.

The difference from insert is in what a rotation leaves behind. After a delete, a rotation can leave its subtree one level shorter than before, and a shorter subtree can unbalance its parent. So the walk keeps going, and one delete can rotate at every level on the way to the root. [Show me](#play:delete-cascade): deleting 120 rotates at 110, and then again at the root.

A delete can also find a child with balance 0 on the tall side, something an insert never produces. That still counts as LL or RR, and one rotation is enough: [a level child needs one rotation](#example:delete-level-child). There's also [delete with the predecessor, then rotate](#example:delete-predecessor).

```check
Q: One insert never needs more than two rotations. Why can one delete need more?
- Deletes use the successor, and moving it unbalances the tree
* A rotation after a delete can leave its subtree one level shorter, which can unbalance the node above
- A delete rebalances the whole tree from the root down
= After an insert, the fix gives the subtree back its old height, so nothing above changes. After a delete, the fixed subtree can end up shorter than before, and its parent sees the change.
```

## How tall can an AVL tree get?

Turn the question around. What's the fewest nodes an AVL tree of height h can have? Call it N(h). The sparsest tree of height h is a root with a sparsest tree of height h − 1 on one side and a sparsest tree of height h − 2 on the other, so N(h) = N(h − 1) + N(h − 2) + 1. That gives 1, 2, 4, 7, 12, 20, 33, 54, and so on: each one is a Fibonacci number minus 1, which is why these are called Fibonacci trees. Fibonacci numbers grow like 1.618 to the power h, so an AVL tree with n keys has height at most about 1.44 log₂ n.

[The fewest nodes for height 4](#example:sparsest) has 12 nodes, and every node that isn't a leaf leans left. It's also the tree that makes deletes cascade.

For a sense of scale: a million keys give an AVL tree of height 27 at most, because the sparsest tree of height 28 already needs 1,346,268 nodes. A perfect tree would have height 19. Insert the same keys in sorted order into a plain BST and you get height 999,999.

## When to use one, and when not to

Use an AVL tree when you need keys in order and you look things up more often than you change them. It's more tightly balanced than a red-black tree, about 1.44 log₂ n against 2 log₂ n in the worst case, so searches visit fewer nodes. The price is more rebalancing on updates, deletes especially. Java's `TreeMap` and C++'s `std::map` went with red-black trees.

If you never need the keys in order, a hash table is simpler and faster. If the keys never change after you load them, a sorted array and binary search are hard to beat.

## Common mistakes

- Updating the heights in the wrong order after a rotation. The node that moved down is now below the one that moved up, so fix it first.
- Forgetting to update the heights at all, so the next balance factor is computed from stale numbers.
- Getting LR and RL backwards. The letters are the path from the unbalanced node: LR is left, then right.
- Using a double rotation when the child on the tall side has balance 0. That only happens after a delete, and one rotation is right.
- Stopping after the first rotation in delete. That shortcut only works for insert.
- Mixing up conventions: a leaf of height 0 or 1, left minus right or right minus left. Check which one your course uses before the exam, not during.

## Try this

- [LL](#example:ll-case), [RR](#example:rr-case), [LR](#example:lr-case) and [RL](#example:rl-case). Before you press play, find the lowest node that will be out of balance and name its case.
- Pick **Sorted** with 15 keys and look at the height. Then do the same on the binary search tree page.
- Pick **Sparsest for its height** with 15 keys, then delete the largest key and count the rotations.
- Switch **Balance factor** to right − left in Options and replay [the LR case](#example:lr-case). The numbers flip; the rotations don't.
- [A delete that rotates twice](#example:delete-cascade). Predict where the second rotation happens before it does.
