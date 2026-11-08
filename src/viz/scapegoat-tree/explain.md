# Scapegoat tree

A scapegoat tree is a binary search tree that never rotates. Nodes store a key and two children, nothing else: no heights, no colors, no priorities. Most of the time it's a plain BST. When an insert lands a node too deep, the tree walks back up, finds someone to blame (the scapegoat), and rebuilds that one subtree perfectly balanced. Igal Galperin and Ronald Rivest published it in 1993; Arne Andersson had a similar idea a few years earlier.

It sounds lazy. It is lazy. It still gives O(log n) search in the worst case and O(log n) amortized updates.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | A plain BST search | O(log n) worst case |
| `insert(k)` | BST insert; if the new node is too deep, rebuild the scapegoat's subtree | O(log n) amortized, O(n) worst |
| `delete(k)` | BST delete; after enough deletes, rebuild the whole tree | O(log n) amortized, O(n) worst |

## Two rules with one number

Pick α between 1/2 and 1. This page uses 2/3 unless you change **Balance factor α** in Options.

- **Weight balance.** A node w is α-weight-balanced when neither child holds more than α of w's subtree: size(child) ≤ α · size(w).
- **Depth limit.** No node may sit deeper than log base 1/α of n. With α = 2/3 that's log base 3/2 of n. Since 1.5³ = 3.4 and 1.5⁴ = 5.1, a tree with 4 or 5 nodes may go down to depth 3 and no further. The dashed line in the drawing shows the limit.

The two rules are linked. If every node on a path were weight-balanced, each step down would leave at most α of the nodes below you, so after d steps you'd have at most αᵈ · n nodes left, and that has to be at least 1. Turn that around: a node deeper than log base 1/α of n means some ancestor on its path is *not* weight-balanced. That ancestor is the scapegoat. It always exists.

## Insert: blame an ancestor

1. Insert k as a leaf, as in any BST, and count its depth d.
2. If d is within the limit, stop. Most inserts end here.
3. Otherwise walk back up. At each ancestor w, work out size(w) = size(child) + 1 + size(other child). The first w where size(child) > α · size(w) is the scapegoat.
4. Rebuild w's subtree.

[The scapegoat is partway up](#example:scapegoat-halfway) builds a perfect tree, then pushes a run of keys down the right edge. When 97 lands at depth 6 with a limit of 5, the walk passes 95 and 90 and stops at 85. Only 85's little subtree is rebuilt. [Show me](#play:scapegoat-halfway).

Note the walk recomputes sizes as it goes. Nodes don't store their sizes, which is the whole point. Counting the sibling's subtree costs time, but it's paid for by the rebuild that follows anyway.

## Rebuild: flatten, then hang from the middle

Rebuilding a subtree of m nodes takes O(m):

- **Flatten.** An inorder walk lists the nodes in sorted order. In the drawing they line up in the band above the tree.
- **Build.** The middle node becomes the root, the left half builds its left subtree and the right half its right subtree, the same way down.

The nodes keep their identities, so you can watch each one move to its new spot. The result is as low as m nodes allow.

[Sorted keys trigger rebuilds](#example:sorted-rebuilds) is the case that wrecks a plain BST: 10, 20, 30, ... in order. Here the chain grows until a key lands too deep, then it folds up. [Show me](#play:sorted-rebuilds).

```check
Q: The walk up reaches w with size(w) = 6, and the child on the path has size 5. With α = 2/3, is w the scapegoat?
* Yes, because 5 > 2/3 × 6 = 4
- No, because 5 < 6
- Only if w is the root
= The test is size(child) > α · size(w). 5 is more than 4, so w is not weight-balanced and gets rebuilt.
```

## Delete: just count

Deletes don't look for scapegoats. A delete is a plain BST delete (with the successor, as in CLRS), and the tree keeps one extra number: max N, the largest N since the last time the whole tree was rebuilt. When N drops below α · max N, rebuild the whole tree and set max N = N.

Why does that work? Deletes never make a node deeper. They make the tree sparser, so the depth limit (which depends on N) shrinks. Once enough nodes are gone, one full rebuild brings everything back in line. [Enough deletes rebuild the whole tree](#example:delete-rebuild-all). [Show me](#play:delete-rebuild-all).

## Why the cost is fine

A single insert can rebuild the whole tree, which is O(n). That sounds bad. But right after a rebuild, the subtree is perfectly balanced, and it takes a lot of inserts into that subtree (about a constant fraction of its size) before any node in it can be unbalanced again. Charge the rebuild to those inserts and each pays O(log n) extra. Same trick as a dynamic array that doubles: rare expensive steps, spread over many cheap ones.

Search never pays anything. Every insert leaves its new node within the depth limit, and deletes can leave the tree at most one level taller than the limit before the full rebuild kicks in. So the height stays O(log n), and search is O(log n) in the worst case, not just on average. That's better than a treap or a splay tree can promise.

## Choosing α

- α close to 1/2 keeps the tree very low, but almost every insert triggers a rebuild.
- α close to 1 rarely rebuilds, but lets the tree get tall.

[A looser α allows taller trees](#example:alpha-three-quarters) runs the same sorted keys with α = 0.75. Compare its height with the α = 2/3 run. Common choices are between 0.55 and 0.75.

## When to use one

Use it when nodes have to stay small, or when rotations are awkward. Rotations are a pain in some augmented trees, where every rotation has to fix up extra data; rebuilding a whole subtree from a sorted list is often simpler. Scapegoat trees are also easy to get right: the only clever part is the rebuild, and that's twenty lines.

Avoid it when every single operation needs a fast bound (a real-time system, say), since one unlucky insert rebuilds a big subtree. A red-black or AVL tree promises O(log n) for each operation.

## Common mistakes

- Mixing up the two counts. The depth limit uses the current N; only the delete rule uses max N.
- Checking weight balance at every node on every insert. Only check when the new node is too deep, and stop at the first scapegoat.
- Rebuilding at the parent of the new node instead of walking up. The parent is almost never the scapegoat.
- Forgetting that the rebuild needs the sorted order. Flatten with an inorder walk, not level order.
- Picking the upper middle on even sizes in one place and the lower middle in another. Either works, but be consistent (this page uses the lower middle).

## Try this

- [Sorted keys trigger rebuilds](#example:sorted-rebuilds): before each insert, predict whether the new key will be too deep.
- [The scapegoat is partway up](#example:scapegoat-halfway): at each step of the walk up, compute size(child) and α · size(w) yourself.
- Pick **Sorted keys (rebuilds keep it low)** with 15 keys and watch the height and the rebuilds counter. Then try α = 0.6 and α = 0.75.
- Pick **Insert, then delete half** and find the delete that rebuilds everything.

```check
Q: A scapegoat tree has max N = 9 and α = 2/3. Deletes leave N = 6. Is the whole tree rebuilt?
- Yes, because N went down
* No, because 6 is not less than 2/3 × 9 = 6
- Yes, because 6 < 9
= The rule is N < α · max N. 6 < 6 is false, so nothing happens yet. One more delete and it rebuilds.
```
