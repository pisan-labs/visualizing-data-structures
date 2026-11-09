# Binary tree and traversals

A binary tree is a set of nodes where each node has at most two children, a left one and a right one. One node, the root, has no parent. Every other node has exactly one. That's the whole definition. Search trees, heaps, AVL and red-black trees, expression trees and Huffman trees are all binary trees with extra rules on top.

This page has no extra rules. Values can be anything, in any order, and they can repeat. So what can you do with a plain binary tree? Build one, and walk it. A walk that visits every node exactly once is a traversal, and there are four you'll meet over and over.

## The operations

| Operation | Order | Time | Extra space |
|---|---|---|---|
| `build(list)` | Builds the tree from a level-order list | O(n) | O(n) for the queue |
| `preorder()` | the node, then its left subtree, then its right subtree | O(n) | O(h) |
| `inorder()` | left subtree, the node, right subtree | O(n) | O(h) |
| `postorder()` | left subtree, right subtree, the node | O(n) | O(h) |
| `levelorder()` | row by row, left to right | O(n) | O(w) |

n is the number of nodes. h is the height, the number of edges on the longest path down from the root, so a single node has height 0 and the empty tree has height -1. w is the width of the widest level. Every traversal is O(n) because every node gets visited once. The interesting difference is the extra space, and the drawing shows it to you: the call stack, your own stack, or the queue.

## Typing a tree: level order with gaps

List the values level by level, left to right, and write `_` where a child is missing. `1 2 3 _ 5` means 1 is the root, its children are 2 and 3, and then 2 has no left child and has 5 as its right child. Nothing is listed for 3, so 3 is a leaf. Gaps at the end can be left off.

The rule that trips people up: only real nodes get children. A `_` has no children of its own, so you never write gaps under a gap. `1 _ 2 _ 3` is a chain going right. 1 has no left child and a right child 2, and 2 has no left child and a right child 3.

Building uses a queue. The root waits in the queue. Take the node at the front, give it the next two values as its children, and send the new children to the back of the queue. If you run out of nodes before you run out of values, the list is not a tree. The page keeps your old tree and tells you which value had nowhere to go. [Gaps in a level-order list](#example:build-gaps) shows a good list and a bad one. LeetCode writes trees the same way with `null` for the gaps, and you can paste one in, brackets and all.

## Three depth-first orders

Preorder, inorder and postorder make the same trip around the tree: down the left side as far as possible, back up, then right. The only difference is when the node gets written down.

- **Preorder** writes it on the way in, before either subtree.
- **Inorder** writes it between the subtrees, after the left one and before the right one.
- **Postorder** writes it on the way out, after both subtrees.

[Show me](#play:four-orders) all four on one tree. On `1 2 3 4 5 _ 6`, preorder gives 1 2 4 5 3 6 and inorder gives 4 2 5 1 3 6. The root comes first in preorder and last in postorder. In inorder, everything before the root is in its left subtree and everything after it is in its right subtree.

```check
Q: What does inorder give for the tree `A B C _ D`?
- A B D C
* B D A C
- D B C A
- A B C D
= Inorder finishes the left subtree of A first. B has no left child, so B comes out, then its right child D. Then A, then C. (A B D C is preorder, D B C A is postorder, A B C D is level order.)
```

## The call stack keeps track

The recursive versions are three lines each, which is why everyone likes them.

```
inorder(x)
  if x ≠ nil
    inorder(x.left)
    visit(x)
    inorder(x.right)
```

Where does the bookkeeping go? Onto the call stack. When `inorder(2)` calls `inorder(4)`, the frame for 2 waits on the stack. It still has to visit 2 and then go right. The frames on the stack always form one path from the root down to where you are, so they never number more than the nodes on the longest path, h + 1 (one more while a call on nil runs). Set **Detail** to **Every detail** and you'll also see the calls on nil. Every leaf makes two of them, and a tree with n nodes has n + 1 empty children in total. Step slowly through [the call stack in a recursive inorder walk](#example:call-stack).

A balanced tree with a million nodes is only about 20 levels deep, so recursion is fine there. A chain is another story. [Show me](#play:skewed-depth) a chain of 6: at the deepest point the stack holds one frame per node. Make the chain 10,000 nodes long and Python gives up with a `RecursionError` (its default limit is 1,000 frames). Java and C++ last longer, but a long enough chain overflows their stacks too.

## Doing it with your own stack

Anything the call stack does, a stack you manage can do. The **Preorder, inorder and postorder** option switches to the iterative versions. Inorder becomes a short loop: while you're at a node, push it and go left. When you fall off the tree, pop a node, visit it, and go right. [Show me](#play:explicit-stack), then compare it with the recursive run. The nodes on your stack are the frames that were waiting on the call stack.

Preorder is even simpler. Pop a node, visit it, push its right child, then its left child. The left child is on top, so it comes off first. Postorder is the awkward one, because a node is written only after both of its subtrees. When you come back up to a node, are you coming back from the left (go right next) or from the right (write it down)? The variable `last` remembers the node written last, and that settles it. [Postorder without recursion](#example:postorder-iterative) walks through it.

The iterative versions still use O(h) space, but you're in charge of it. There is no recursion limit, and you can stop after any node and carry on later, which is what an iterator over a tree needs.

## Level order uses a queue

Level order goes row by row. It is breadth-first search on a tree. Put the root in a queue, then repeat: take the node at the front, visit it, and add its children to the back. Children wait behind everything already in line, so a whole level comes out before the next one starts. [Show me](#play:level-queue).

The queue holds about one level at a time, so its size depends on the width of the tree, not its height. A chain never has more than one node waiting. A complete tree is the worst case, because its last level holds about half of the nodes. In [the queue holds a whole level](#example:widest-level), all 8 nodes of the last row of a 15-node tree sit in the queue at once.

## Which one when?

- **Preorder** when a parent has to exist before its children: copying a tree, or saving it so it can be rebuilt. An expression tree in preorder is prefix notation, `* + 1 2 3` for (1 + 2) * 3.
- **Inorder** when left before right is the point. In a binary search tree, inorder lists the keys in sorted order. An expression tree in inorder is the usual infix notation, once you put the parentheses back.
- **Postorder** when a node needs answers from its children first: the size or height of every subtree, evaluating an expression tree (postfix, `1 2 + 3 *`), or freeing a tree in C++. Delete the parent first and you have lost the pointers to its children.
- **Level order** when the distance from the root matters: printing a tree level by level, finding the shallowest node with some property, or writing the level-order list this page builds trees from.

```check
Q: A recursive inorder walk runs on a chain of 1,000 nodes where every node has only a left child. Roughly how deep does the call stack get?
- About 10, like a balanced tree
* About 1,000, one frame per node
- 1, since each call finishes before the next one starts
= Each call waits for the call on its left child to finish, and all 1,000 nodes are on one path down. At the deepest point every frame is on the stack (1,001 counting the call on nil). In Python that is enough to hit the default recursion limit.
```

## Common mistakes

- Writing `_` under a `_` in a level-order list. Gaps don't have children.
- Mixing up the three orders. Say where the node goes: pre is before, in is between, post is after. Left always comes before right.
- Forgetting the base case. `inorder(nil)` has to return before touching `x.left`.
- Pushing the left child first in iterative preorder. A stack hands back the last thing pushed, so the right child goes in first.
- Assuming one traversal pins down a tree. Many trees share the same preorder. Preorder plus inorder does pin it down when the values are distinct; preorder plus postorder doesn't.
- Treating recursion as free. Every level costs a stack frame, and a chain costs n of them.

## Try this

- [Four ways to walk one tree](#example:four-orders). Before pressing play, write down all four orders yourself. Then check.
- [The call stack in a recursive inorder walk](#example:call-stack), then [the same walk with an explicit stack](#example:explicit-stack). Pause both when 1 is visited and compare the stacks.
- [A chain makes the stack as deep as the tree](#example:skewed-depth). Count the frames at the deepest point, then watch how short the queue stays in level order.
- Type `1 _ 2 _ 3 _ 4`, press **Build**, then **Preorder** and **Inorder**. Why do they match?
- Turn on **Draw empty children** in Options and count the little squares. There is always one more square than there are nodes.
