# Binary search tree

A binary search tree keeps one rule at every node: every key in the left subtree is smaller than the node's key, and every key in the right subtree is larger. That's it. The rule turns search into a walk down one path. Compare with the node you're at, go left or right, repeat. You never look at the other side.

Read the keys in inorder (left subtree, node, right subtree) and they come out sorted. A BST is a sorted list you can insert into without shifting anything.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Finds the node with key k | O(h) |
| `insert(k)` | Adds k as a new leaf | O(h) |
| `delete(k)` | Removes k and keeps the order | O(h) |
| `min()`, `max()` | Smallest and largest key | O(h) |
| `successor(k)`, `predecessor(k)` | The next key up or down | O(h) |
| `select(i)` | The i-th smallest key | O(h) |
| `rank(k)` | k's place in sorted order | O(h) |
| `lowerBound(k)` | The smallest key that is at least k | O(h) |
| `inorder()` | Every key, in sorted order | O(n) |

h is the height of the tree: the number of edges on the longest path down from the root. Everything except inorder walks one path, so everything costs O(h). How big is h? Anywhere from about log₂ n to n - 1. The shape decides, and the shape comes from the order of the inserts.

## Search

Start at the root. If k is smaller than the key there, go left; if it's larger, go right; if it's equal, you're done. If you fall off the tree, k isn't there. [Show me](#play:search-miss) a search that finds the root in one comparison, then one that misses. A miss is useful too: the empty spot where the search fell off is exactly where k would go.

## Insert

Insert is an unsuccessful search plus one pointer. Walk down as if you were searching for k, keeping y one step behind x. When x falls off the tree, y is the last real node you saw, and k becomes its left or right child. A new key always arrives as a leaf. Nothing else moves.

What if k is already there? Textbooks disagree. The **Inserting a key that is already there** option rejects it (the default) or counts it, so the node remembers how many copies it holds. CLRS sends equal keys to the right instead, which works, but then a run of equal keys becomes a chain. [Counting duplicate keys](#example:duplicates) shows the counting version.

Switch **What the tree stores** to key-value pairs and the tree becomes a map. Type `42=apple` to insert; inserting a key that's already there replaces its value, and search hands back the value. [A map: keys with values](#example:key-value).

## Delete: three cases

Find the node z that holds k. Then:

- **z is a leaf.** Remove it. [Delete a leaf](#example:delete-leaf).
- **z has one child.** That child's whole subtree moves up into z's place. Everything in it was already on the correct side of z's parent, so the order holds. [Delete a node with one child](#example:delete-one-child).
- **z has two children.** Something has to take z's place, and it has to be bigger than everything on the left and smaller than everything on the right. Two keys qualify: z's successor (the smallest key in its right subtree) and its predecessor (the largest in its left subtree).

CLRS uses the successor y. Since y is the smallest key in z's right subtree, it has no left child, so taking it out is one of the easy cases. Then y moves into z's place and takes over both of z's subtrees. [Show me](#play:delete-two-children), and watch 57 move up into 55's spot before 55 replaces 50.

CLRS does this with a helper called `transplant(u, v)`, which puts the subtree rooted at v where the subtree rooted at u was, parent pointer included. Some books copy the successor's key into z and delete the successor's old node instead. You end up with the same keys in the same shape; the only difference is which node objects survive. The **Deleting a node with two children** option switches to the predecessor: [two children, the predecessor way](#example:delete-predecessor).

```check
Q: Insert 50 30 70 20 40 60 80, then delete 50 using its successor. Which key ends up at the root?
- 40
* 60
- 70
- 80
= The successor is the smallest key in 50's right subtree: go right to 70, then left as far as you can, which is 60. 60 is a leaf, so it lifts out cleanly and takes 50's place.
```

## Min, max, successor and predecessor

The minimum is as far left as you can go from the root; the maximum is as far right as you can go. Successor has two cases. If x has a right subtree, the answer is the minimum of that subtree. If it doesn't, climb up: as long as you're coming up from a right child, keep going. The first node you reach from its left side is the successor. If you climb past the root, x was the largest key and has no successor. [Successor by climbing up](#example:successor-climb) shows both cases. Predecessor is the mirror image.

The climb needs parent pointers. Without them, search from the root and remember the last node where you went left. Same answer, same O(h).

## Select and rank need one more number

How do you find the 5th smallest key without listing all of them? Store in every node the size of its subtree. At node x, the left subtree holds size(x.left) keys, so x is number r = size(x.left) + 1 in its own subtree. To select the i-th key: if i = r, it's x; if i < r, go left; if i > r, skip those r keys and go right looking for the (i - r)-th. Rank answers the opposite question with the same kind of walk, adding up the smaller keys on the way down. [Show me](#play:select-rank). The sizes appear under the nodes while select and rank run.

The sizes have to stay right, of course. Insert and delete only change sizes on one path, so keeping them up to date costs O(h) extra, which is free in big-O terms. Here, `select` and `rank` count from 1, as CLRS does.

## Lower bound

`lowerBound(k)` finds the smallest key that is at least k. Walk down from the root. When a key is big enough, remember it as the best so far and go left to look for a smaller one. When it's too small, go right. The last candidate you remembered is the answer. [Lower bound](#example:lower-bound). Java's `TreeMap.ceilingKey` and C++'s `std::map::lower_bound` do this.

## Shape is everything

Insert 10, 20, 30, 40, 50, 60, 70 in that order and every key is bigger than everything before it. Each one becomes the right child of the last, and you get a chain of height 6. [Show me](#play:sorted-chain). It's a linked list wearing a tree costume, and search is O(n) again. The same seven keys inserted medians first, [the same keys, a better order](#example:balanced-order), give a perfect tree of height 2. Sorted input isn't the only trap: [a zigzag is as bad as a chain](#example:zigzag).

With keys in random order things are fine on average. A successful search takes about 1.39 log₂ n comparisons, around 39% more than a perfectly balanced tree. But real data is rarely random: logs arrive in time order, IDs count up, and people paste sorted lists. That's why libraries use balanced trees (AVL, red-black) that fix their shape as they go. Java's `TreeMap` is a red-black tree, and so is `std::map` in every major C++ library.

```check
Q: Insert 10 20 30 40 50 into an empty tree, in that order. What is the height of the tree?
- 2
* 4
- 5
= Each key is bigger than all the keys before it, so it becomes the right child of the previous one. Five nodes in a chain have four edges from top to bottom.
```

## When to use one, and when not to

Use a BST when you need keys in order as well as fast lookups: the next key after this one, everything between two keys, the 10th smallest. A hash table can't do any of that. If all you ever do is look up exact keys, use a hash table; it's O(1) on average and doesn't care about insertion order. And unless you can promise the keys arrive in random order, use a balanced tree in real code. The plain BST is the version you learn so that AVL and red-black trees make sense.

## Common mistakes

- Checking the rule against the parent only. Every key in the left subtree has to be smaller, not just the left child. A tree can pass the parent check at every node and still be wrong.
- Deleting a node with two children by moving one child up. One of the two subtrees has nowhere to go.
- Forgetting the parent pointers. `transplant` updates the child pointer above u and v's parent pointer; miss one and the tree breaks quietly.
- Mixing up 0-based and 1-based select. Here the smallest key is `select(1)`.
- Forgetting to update the sizes after insert and delete. Select and rank then give wrong answers with complete confidence.
- Assuming O(log n). It's O(h), and h can be n - 1.

## Try this

- [Delete a leaf](#example:delete-leaf), [a node with one child](#example:delete-one-child) and [a node with two children](#example:delete-two-children). Before each delete, say which case it is.
- Insert `50 30 70 20 40 60 80`, delete 50, then switch to the predecessor option in Options and compare the trees.
- [Sorted input makes a chain](#example:sorted-chain), then [the same keys, a better order](#example:balanced-order). Count the comparisons in each search for 70.
- [Select and rank use subtree sizes](#example:select-rank). Predict each answer from the sizes before you press play.
- Pick **Random order** with 31 keys a few times and look at the height. Then try **Sorted** with the same size.
