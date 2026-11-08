# Rope

A string in most languages is an array of characters. Reading character i is instant. Inserting a word in the middle of a 10 MB document means moving 5 MB of characters to make room, and if strings are immutable, copying all 10 MB. Every keystroke. Your editor does not do that. (Some old ones did. You could tell.)

A rope keeps the text as a binary tree of short pieces. The leaves hold the text, left to right. Each internal node joins a left rope and a right rope and remembers one number, its **weight**: how many characters are in its left subtree. That number is all you need to find your way around. Boehm, Atkinson and Plass named it in 1995, for long strings in the Cedar system; text editors have used ideas like it ever since.

## The operations

| Operation | What it does | Rope | Flat string |
|---|---|---|---|
| `index(i)` | The character at position i | O(log n) | O(1) |
| `concat(a, b)` | Join two ropes | O(1) | O(n) |
| `split(i)` | Cut into the first i characters and the rest | O(log n) | O(n) |
| `insert(i, text)` | split, then two concats | O(log n) | O(n) |
| `delete(i, len)` | two splits, one concat | O(log n) | O(n) |

The rope's costs assume the tree stays balanced. The **flat string** readout in the variables panel says what a plain string would have copied or moved.

## Index: follow the weights

Start at the root with i. If i is less than the node's weight, the character is in the left subtree: go left. Otherwise skip the left subtree's characters: subtract the weight from i and go right. At a leaf, read character i of its piece.

[Index by following the weights](#example:index-weights) finds position 10 in "the quick brown fox". Two internal nodes, then a leaf: three nodes visited. A flat string would have done it in one step, which is the honest price of a rope.

```check
Q: The root's weight is 8 and you call index(11). Where do you go next?
- Left, with i = 11
* Right, with i = 3
- Right, with i = 11
= 11 is not less than 8, so the character is in the right subtree. The left subtree holds 8 characters, so it is character 11 − 8 = 3 over there.
```

## Concat is one node

To join two ropes, make a new node with one on the left and the other on the right. Its weight is the length of the left one. Nothing is copied. [Appends are cheap, until you index](#example:concat-cheap) appends five pieces, each with one new root.

But look at the shape: a long path leaning left. Concat never rebalances, so a rope built only by appends is a linked list wearing a tree costume, and index(0) walks all of it. Real ropes rebalance now and then. Boehm's version rebuilds the tree when it gets too deep, a bit like the Fibonacci numbers deciding how deep is too deep. This page doesn't rebalance, so you can see the problem.

## Split, insert and delete

Split is index with scissors. Walk down to position i. If the cut lands inside a leaf, cut that leaf's text in two; that's the only text copied. On the way back up, every subtree to the right of the path goes to the right part and every subtree to the left stays in the left part, with a new node wherever two pieces have to be joined. [Split one rope into two](#example:split-two) does it, and **Join R2** puts them back with one node.

With split and concat, everything else is short:

- **insert(i, text)**: split at i, then concat(concat(left, leaf(text)), right). [Insert in the middle without copying](#example:insert-middle). [Show me](#play:insert-middle).
- **delete(i, len)**: split at i, split the rest at len, concat the outer two. [Delete a range with two splits](#example:delete-range).

```check
Q: A rope holds 1,000,000 characters in a balanced tree. You insert one word in the middle. Roughly how many characters get copied?
- About 500,000, everything after the insertion point
- All 1,000,000
* A leaf's worth: only the leaf at the cut is split
= Split cuts one leaf in two and makes new internal nodes along one path. Everything else is shared, untouched.
```

## Variants

**What a node stores**: the usual rope stores the weight, the left subtree's length. Some books store each node's own length instead; then index compares i with the left child's length. Same walk, one extra pointer hop. [Storing lengths instead of weights](#example:total-lengths) shows it.

**Longest leaf** sets how long the pieces are when you build. Real ropes use leaves of hundreds of bytes, so that the tree is small and each leaf is a cache-friendly flat array. Tiny leaves here keep the picture readable.

Because nodes never change after they are made, two ropes can share subtrees. That makes undo cheap: keep the old root. Editors also use other structures for the same job, such as piece tables and gap buffers, and some, like the Xi editor, used ropes directly.

## When to use one, and when not to

Use a rope for long text that is edited in the middle: editors, big log buffers, strings built from many pieces. Avoid it for short strings or text you mostly read. A flat string is faster to index, faster to scan and kinder to the cache. For a 40-character name, a rope is a lot of pointers for nothing.

## Common mistakes

- Updating the weight with the whole subtree's length. The weight is the left subtree only.
- Forgetting to subtract the weight when going right.
- Never rebalancing. Appends and splits can make the tree as deep as it is long.
- Leaving empty leaves behind after a split at a leaf boundary. Return nil instead.

## Try this

- [Index by following the weights](#example:index-weights). Predict each turn before you step.
- [Appends are cheap, until you index](#example:concat-cheap). Count the nodes index(0) visits. How would a balanced rope do?
- [Delete a range with two splits](#example:delete-range). How many leaves are cut?
- Build "hello world" with the longest leaf set to 2, then to 6. Compare the heights.
