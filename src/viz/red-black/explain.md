# Red-black tree

A red-black tree is a binary search tree that paints every node red or black and keeps a few rules about the paint. The rules don't make the tree perfectly balanced. They make sure no path from the root is more than twice as long as any other, which is enough for O(log n) everything.

Rudolf Bayer described the structure in 1972. Leonidas Guibas and Robert Sedgewick gave it the colors in 1978. Today it's the tree behind Java's `TreeMap` and C++'s `std::map`, and the Linux kernel has its own copy.

## The rules

CLRS lists five properties:

1. Every node is red or black.
2. The root is black.
3. Every leaf (NIL) is black.
4. A red node has two black children. No red node has a red child.
5. For every node, all paths from it down to a NIL have the same number of black nodes.

The NILs in rule 3 are the empty children. CLRS treats each one as a real black leaf, which makes the rules easier to state. Turn on **Draw the NIL leaves** in Options to see them as small black squares.

The number in rule 5 is the black-height, bh(x): the black nodes on a path from x down to a NIL, counting the NIL but not x itself. The drawing writes it to the left of each node.

Here, black nodes are dark with white keys and red nodes are light with a red outline. The two differ in lightness as well as color, so you can tell them apart in grayscale, in the high-contrast theme, and if you can't tell red from black.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Finds the node with key k | O(log n) |
| `insert(k)` | Adds k as a red leaf, then repairs the colors | O(log n), at most 2 rotations |
| `delete(k)` | Removes k as a BST would, then repairs the colors | O(log n), at most 3 rotations |
| `min()`, `max()` | Smallest and largest key | O(log n) |
| `inorder()` | Every key, in sorted order | O(n) |

## Why the rules keep it short

Rule 4 says red nodes can't come two in a row, so at least half the nodes on any path from the root are black. Rule 5 says every path has the same number of black nodes. So the longest path is at most twice the shortest one. Push that through the numbers and you get CLRS's bound: a red-black tree with n keys has height at most 2 log₂(n + 1).

That's looser than an AVL tree (about 1.44 log₂ n), but it's still O(log n), and it's cheaper to maintain. [Sorted input stays shallow](#example:sorted-input): seven keys in increasing order, which would make a chain in a plain BST, end up with height 3. [Show me](#play:sorted-input).

## Insert: color it red, then fix

Insert the key as a BST would, as a new leaf, and color it red. Why red? A black node would add one black to every path through it and break rule 5 everywhere above. A red node can only break rule 4, and only in one place: when its parent is red too.

```check
Q: Why does insert color the new node red?
- Red nodes are faster to search
* A red node adds no black node to any path, so only rule 4 can break, and only at the new node
- So the root can stay black
- Because the tree always has more red nodes than black ones
= A black node would make every path through it one black node longer, breaking rule 5 along the whole path. A red one can only clash with a red parent.
```

If the parent is black, you're done. If the parent is red, the fixup looks at z's uncle, the parent's sibling:

- **Case 1, the uncle is red.** Recolor: the parent and the uncle turn black and the grandparent turns red. Black counts stay the same, but the grandparent may now clash with its own parent, so z moves up two levels and the loop repeats. [Show me](#play:insert-case-1).
- **Case 2, the uncle is black and z is an inner child** (the right child of a left child, or the mirror). Rotate at the parent so z and its parent line up. That turns it into case 3. [Show me](#play:insert-case-2).
- **Case 3, the uncle is black and z is an outer child.** The parent turns black, the grandparent red, and a rotation at the grandparent lifts the parent up. No red pair is left, and the loop ends. [Show me](#play:insert-case-3).

Finally the root is colored black, which can only add one black to every path at once. A NIL counts as black, so a missing uncle is a black uncle. Case 1 can repeat all the way up the tree, but it never rotates. Cases 2 and 3 rotate at most twice, and then it's over. [One insert, all three cases](#example:insert-all-cases) shows the whole story in one go.

## Delete: the extra black

Delete starts like a BST delete, with CLRS's `transplant`. A node y leaves its spot: z itself when it has at most one child, or z's successor when it has two (or its predecessor; see Options). The successor then takes z's place and z's color. x is the child that moves into y's old spot, and it may be a NIL.

If y was red, nothing is broken: no path lost a black node. [Deleting a red node needs no fixup](#example:delete-red).

If y was black, every path through x is now one black node short. CLRS's trick is to give x an extra black, so the counts are right again, and x becomes doubly black (or red and black, if x is red). The drawing marks the extra black with a dashed ring. If x is red, coloring it black uses up the extra black. Otherwise the fixup looks at x's sibling w:

- **Case 1, w is red.** Swap the colors of w and the parent, then rotate at the parent. x now has a black sibling, so one of the other cases follows. [Show me](#play:delete-case-1).
- **Case 2, w is black with two black children.** Take one black off x and off w (w turns red) and push the extra black up to the parent. If the parent is red, it turns black and we're done. If it's black, it's doubly black now, and the loop repeats one level up. [Show me](#play:delete-case-2).
- **Case 3, w is black, its near child red and its far child black.** Recolor and rotate at w, which makes the red child the far one: case 4. [Show me](#play:delete-case-3).
- **Case 4, w is black and its far child is red.** Recolor and rotate at the parent. The paths through x gain the black node they were missing, and the extra black is gone. [Show me](#play:delete-case-4).

Only case 2 moves up, and it never rotates. So a delete makes at most three rotations: [case 1, then 3, then 4](#example:delete-three-rotations).

```check
Q: The fixup after a delete reaches case 2, and the parent is red. What happens next?
- The parent rotates with the sibling
* The parent turns black, the extra black is used up, and the loop ends
- The extra black moves up to the grandparent
- Case 4 runs
= Case 2 moves the extra black up to the parent. A red parent becomes red and black, so the loop stops and coloring it black finishes the job.
```

## Red-black trees are 2-3-4 trees in disguise

Glue each black node to its red children and you get a node with 1, 2 or 3 keys: a node of a 2-3-4 tree. Rule 5 says every leaf of that 2-3-4 tree is at the same depth, which is exactly the B-tree rule. Case 1 of insert is a 4-node splitting and pushing its middle key up. If the cases feel arbitrary, draw the 2-3-4 tree next to the red-black tree and they start to make sense.

## When to use one, and when not to

Use a red-black tree when you need keys in order and the set changes a lot. Inserts make at most two rotations and deletes at most three, plus some recoloring, and the height stays within 2 log₂(n + 1). That predictability is why library writers like it.

An AVL tree is shorter, so it can be a bit faster when lookups dominate. If you never need the keys in order, a hash table is simpler. And if you're writing one for an exam, practice the delete cases on paper. Nobody remembers them on the first try.

## Common mistakes

- Coloring the new node black. Rule 5 breaks on every path through it.
- Forgetting that a NIL is black. A missing uncle or sibling counts as black, and so do missing nephews.
- Forgetting to color the root black at the end of insert, after case 1 has painted it red.
- Mixing up the near and far child of the sibling in delete cases 3 and 4. "Far" means on the far side from x.
- Treating case 2 as the end. It moves the extra black up, and the loop continues unless the parent was red.
- Only writing the left-child version of the fixups. Half the time x (or z's parent) is a right child, and every left becomes a right.

## Try this

- [Insert case 1](#example:insert-case-1), [case 2](#example:insert-case-2) and [case 3](#example:insert-case-3). Before each fixup step, say which case it is from the uncle's color and the shape.
- Pick **Sorted** with 31 keys and look at the height. Then try the same on the binary search tree page.
- Turn on **Draw the NIL leaves**, insert a few keys, and count the black nodes on a few paths from the root to a NIL. Do they agree with the black-height?
- [Delete case 1](#example:delete-case-1), [2](#example:delete-case-2), [3](#example:delete-case-3) and [4](#example:delete-case-4). Watch where the dashed ring goes.
- [Three rotations, the most a delete needs](#example:delete-three-rotations). Predict each case before you step through it.
