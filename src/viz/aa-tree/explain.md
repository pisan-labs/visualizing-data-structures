# AA tree

An AA tree is a red-black tree with most of the cases thrown out. Arne Andersson published it in 1993 under the title "Balanced search trees made simple", and he meant it. A red-black insert has a handful of cases, mirrored left and right; delete has more. An AA tree has two operations, skew and split, and both are three lines long.

The trick is one extra rule: red children may only hang on the right.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | A plain BST search | O(log n) |
| `insert(k)` | Add a leaf on level 1, then skew and split on the way up | O(log n) |
| `delete(k)` | Remove a leaf (a neighbor stands in for an inner node), then fix levels, skew and split on the way up | O(log n) |

## Levels instead of colors

Every node has a level, a small whole number. Leaves are on level 1. The rules:

1. A left child is exactly one level below its parent.
2. A right child is on its parent's level or one below.
3. A right grandchild is always below its grandparent: no two right links in a row on one level.
4. A node above level 1 has two children.

A right child on its parent's level is a **horizontal link**. The drawing puts each level in its own row, so horizontal links lie flat. A node plus its horizontal partner is one node of a 2-3 tree (the dashed boxes), and the levels are the levels of that 2-3 tree. Rule 3 says a 2-3 node never holds more than two keys.

Switch **Drawing** in Options to see the same tree as a red-black tree: a node on its parent's level is red, everything else is black. The level of a node is its black height. Rule 1 says red nodes are never left children, which is exactly the restriction that kills half the red-black cases. [The same tree as a red-black tree](#example:red-black-view).

## Skew and split

Insert and delete can break two rules, and each has its own fix.

- **Skew** removes a left horizontal link. If t's left child is on t's level, rotate right at t. The link now points right.
- **Split** removes two right horizontal links in a row. If t, its right child r and r's right child share a level, rotate left at t and move r up one level. In 2-3 terms, a node with three keys splits and pushes its middle key up.

Skew can create two right links in a row, so it always comes first: skew, then split.

```check
Q: Node 30 is on level 1 and its left child 20 is also on level 1. Which fix applies?
* Skew: rotate right at 30
- Split: rotate left at 30 and raise a level
- Nothing, a left child may share its parent's level
= A left child on its parent's level is a left horizontal link. Skew turns it into a right one by rotating right.
```

## Insert

Walk down as in a BST and add the new key as a leaf on level 1. Then, at every node on the way back up, call skew and then split. That's the whole algorithm.

Rising keys always land on the far right, so they make runs of right horizontal links, and split does the work. [Rising keys: split after split](#example:rising-splits). [Show me](#play:rising-splits). Falling keys land on the far left as left horizontal links, so every insert starts with a skew. [Falling keys: skew, then split](#example:falling-skews).

A split raises a node a level, which can start a run on the level above. Then the split at the next node up handles it. When a split reaches the root, the tree gets one level taller, the same way a B-tree grows.

## Delete

Delete is still harder than insert, but much shorter than in a red-black tree.

1. Find k. If its node is a leaf, remove it.
2. Otherwise a neighbor stands in. In an AA tree, the predecessor (or the successor, when there's no left child) is always a leaf on level 1. Remove that leaf and move it into k's place.
3. On the way back up from the removed leaf, at each node t:
   - if a child of t is now two levels below it, lower t's level (and its horizontal partner's, if that one is too high);
   - skew t, t.right and t.right.right;
   - split t and t.right.

Lowering levels can leave horizontal links on the wrong side, and three skews and two splits are enough to clean up any mess one lowered level can make. [A delete lowers levels on the way up](#example:delete-lowers-levels), and [Deleting an inner node](#example:delete-inner). [Show me](#play:delete-inner).

Real code doesn't check which skews and splits are needed. It just calls all five; most do nothing.

```check
Q: Why can a deleted inner node always be replaced by a leaf on level 1?
- Because AA trees are perfectly balanced
* Because a level-1 node has no left child, and a horizontal partner has no children, so the largest key on the left goes all the way down to level 1
- Because delete always removes the root
= Walk to the largest key on the left: you go right until you can't. A node with no right child above level 1 can't exist (rule 4), and a level-1 node has no left child (rule 1), so you stop at a leaf on level 1.
```

## When to use one

Use an AA tree when you want guaranteed O(log n) and you want to write it from memory. It's a good first balanced tree to code, and the rotations are the same ones AVL and red-black trees use. The height is at most about 2 log₂ n, the same bound as a red-black tree.

It does a few more rotations than a red-black tree, since a red-black tree may lean either way and an AA tree may not. Standard libraries use red-black trees (C++ `std::map`, Java `TreeMap`) for that reason. If you need to store a level, you need a small int per node, where red-black needs a single bit.

## Common mistakes

- Doing split before skew. Skew can create the run that split has to break.
- Forgetting to raise the middle node's level in split. The rotation alone fixes nothing.
- Lowering t's level on delete but not its horizontal partner's. Then the partner is above t, which breaks rule 2.
- Calling skew only on t during delete. A lowered level can leave left links two steps down on the right, so t.right and t.right.right need skews too.
- Thinking a level is a height. Levels count only the "black" steps; a node and its horizontal partner share one.

## Try this

- [Rising keys: split after split](#example:rising-splits). Before each insert, predict whether it splits, and how far up.
- Pick **Falling keys** with 10 keys, then switch **Drawing** to the red-black view and step through it again.
- In [Deleting an inner node](#example:delete-inner), who takes the root's place, and why is it a leaf?
- Insert `50 30 70 20 40 60 80`, then delete them one at a time from smallest to largest. Watch the root level fall.
