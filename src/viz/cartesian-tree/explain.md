# Cartesian tree

A Cartesian tree turns an array into a binary tree. Two rules decide the shape: the values are in heap order (every node is smaller than its children, so the smallest value is the root), and an inorder walk gives back the array, left to right. Jean Vuillemin described it in 1980.

That's it. No keys, no comparisons with a search key. The array decides everything, and the drawing puts each node right under its array cell, so you can see the second rule: read the nodes left to right and you read the array.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `append(x)` | Adds x at the end of the array and links it into the tree | O(1) amortized, O(n) worst |
| build from n values | n appends | O(n) |
| `rmq(i, j)` | Smallest value in A[i..j], by walking down to a common ancestor | O(depth) |

## Build it with a stack

The slow way: find the minimum, make it the root, and build the two halves on each side the same way. That's quicksort's recursion, and it's O(n²) on sorted input.

The fast way goes left to right. The new value is the last one in the array, so it has to end up on the right spine: the path from the root going right, right, right. Keep that spine on a stack. When x arrives:

1. Pop every node on the stack that's bigger than x. They belong below x.
2. The last node popped becomes x's left child, and brings its whole subtree along.
3. x becomes the right child of whatever is now on top of the stack, or the root if the stack is empty.
4. Push x.

[Build with the right-spine stack](#example:build-right-spine) does this for eight values. [Show me](#play:build-right-spine).

Why O(n)? A single append can pop a lot. [A new minimum empties the stack](#example:new-minimum) pops five nodes at once. But every node is pushed once and popped at most once, so n appends make fewer than n pops in all. This is the same argument as the amortized cost of a stack with multipop: expensive steps are paid for by the cheap ones before them. Watch the pops counter.

```check
Q: The stack holds 2, 6, 9 (bottom to top). You append 5. What happens?
- 5 becomes the right child of 9
* 9 and 6 are popped; 6 becomes 5's left child and 5 becomes 2's right child
- Everything is popped and 5 becomes the root
= Pop while the top is bigger than 5: 9, then 6. The last one popped (6) hangs on 5's left, and 5 hangs on the right of 2, which stays.
```

## Range minimum is a common ancestor

Here's the neat part. Take two positions i ≤ j. The smallest value in A[i..j] is the lowest common ancestor of nodes i and j. Why? Walk down from the root. If the node's index is left of the range, the whole range is in its right subtree (inorder is array order). If it's right of the range, go left. The first node inside the range splits i and j into different subtrees (or is one of them), and as an ancestor of everything between them it's the smallest. [A range minimum is a common ancestor](#example:range-minimum) runs three queries. [Show me](#play:range-minimum).

The walk costs the depth of the tree. Serious range-minimum structures go one step further: they build the Cartesian tree in O(n), then answer lowest-common-ancestor queries in O(1) with a table on top. That gives O(n) preprocessing and O(1) queries, which is the theory answer to range minimum (see [prefix sums and sparse tables](/range-queries/) for the simpler O(1) structure). The tree is the bridge between the two problems.

## The link to treaps

A treap is a Cartesian tree on pairs. Sort the (key, priority) pairs by key, and build the Cartesian tree with the priorities as the values: you get exactly the treap. The keys give the inorder, the priorities give the heap order. So everything here carries over: with random priorities the shape is a random BST, and a sorted list of pairs can be turned into a treap in O(n) with this stack, no rotations needed. Have a look at the [treap](/treap/) page.

The same is true here. Values in random order give a tree of expected depth about 2 ln n. Sorted values give a chain: [Sorted input makes a chain](#example:sorted-chain). The build is still O(n), but a query near the end walks the whole chain.

```check
Q: Which array gives a Cartesian tree (smallest on top) that is a chain going left?
- 1 2 3 4 5
* 5 4 3 2 1
- 3 1 4 1 5
= Each new value is smaller than everything before it, so it pops the whole stack and becomes the root, with the old tree on its left.
```

## Variants

- **Largest on top.** Flip the comparison and you get range maximums. Switch **Heap order** in Options, or load [Largest value on top](#example:max-on-top).
- **Ties.** With equal values, someone has to be on top. Here the earlier one stays higher (we pop only strictly bigger values). Popping equal values too gives the other tie rule; both are fine as long as you pick one.
- **Only the stack.** Many problems (next smaller element, largest rectangle in a histogram) use the same stack without building the tree. The pops are the answers.

## When to use one

Use it when an array is fixed and you want range minimums, or when you need to turn sorted (key, priority) pairs into a treap quickly. It also shows up inside suffix-array algorithms. Avoid it if the array changes in the middle (an insert in the middle can change a lot of the tree), and for a simple fixed array of a few thousand values, a sparse table is easier to get right.

## Common mistakes

- Popping while the top is *smaller* than x. Smaller values belong above x, so they stay.
- Forgetting the left child. The last node popped has to hang on x's left, or that whole subtree disappears.
- Thinking the stack is something extra. It's exactly the right spine of the tree built so far.
- Calling the build O(n log n) or O(n²) because one append can pop many nodes. Count the pops over the whole build instead.
- Expecting a balanced tree. The shape follows the array; sorted input gives a chain.

## Try this

- [Build with the right-spine stack](#example:build-right-spine). Before each append, predict how many nodes it pops.
- Pick **Sorted, falling** with 9 values. How many pops in all? Then **Rising, then a new minimum**.
- In [A range minimum is a common ancestor](#example:range-minimum), try `rmq 0 7`. How many nodes does the walk visit?
- Append `3 1 4 1 5 9 2 6` and draw the tree on paper first. Where does the second 1 go?
