# Persistent BST

Most data structures forget. Insert a key into a BST and the tree you had a moment ago is gone. A persistent structure keeps every version: insert 40 into v4 and you get v5, and v4 is still there, unchanged, ready to be searched.

The obvious way is to copy the whole tree before each update. That's O(n) time and space per update, which is silly when an insert changes one path. **Path copying** copies just that path. Driscoll, Sarnak, Sleator and Tarjan worked out the general theory in 1986, but path copying is the simple version everyone uses, and it's how functional languages (Haskell, Clojure, Scala) implement their maps and sets.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insert(k)` | New version with k, from the version you're viewing | O(h) time, O(h) new nodes |
| `delete(k)` | New version without k | O(h) time, O(h) new nodes |
| `search(k)` | Search the version you're viewing | O(h) |
| `view(v)` | Switch to version v | O(1) |

h is the height of the version. On a balanced tree that's O(log n).

## Never change a node

The one rule: once a node exists, nobody changes it. Not its key, not its children.

So how do you insert? Walk down as usual and make a new leaf for k. Its parent would need a new child pointer, and that's not allowed, so make a copy of the parent that points at the new leaf (and at the parent's *old* other child). Now the grandparent would need to change, so copy it too. Keep going up. The copy of the root is the root of the new version.

[Insert copies one path](#example:insert-copies-path) does five inserts. Count the new nodes in each version: the depth of the new key plus one. Everything else is shared. [Show me](#play:insert-copies-path).

In the drawing, every node has its own column, in key order; copies of one key sit side by side, oldest first. The version labels on top point at their roots. The version you're viewing is solid; nodes it doesn't use are faded.

```check
Q: A version's tree has height 3, and you insert a key that lands at depth 4. How many new nodes does path copying make?
- 1
- 4
* 5
- All the nodes in the tree
= The new leaf plus a copy of each of the 4 nodes on the path above it (depths 0 to 3).
```

## Delete

Delete follows the CLRS cases, but every change becomes a copy:

- **At most one child.** The node's child (or nil) takes its place, shared as it is. Copy the nodes above.
- **Two children.** The successor y (leftmost on the right) takes its place. Copy the path from the right child down to y's parent, with y left out; make a copy of y with the old left subtree and the new right side; then copy the nodes above.

[Delete copies the path to the successor](#example:delete-shares). [Show me](#play:delete-shares). The old 60 and 70 are still there, in the old versions. Nothing is ever freed while some version can reach it.

## Old versions still work

Every version is an ordinary BST hanging from its own root, so searching an old version is a plain BST search. [Old versions still answer](#example:old-versions-answer) deletes 30, goes back to v3, and finds it.

Updates apply to the version you're viewing. Go back to v1 and insert, and the new version grows from v1: [Versions can branch](#example:branching-versions). That's full persistence, where any version can be updated. Partial persistence (only the newest can change, all can be read) is enough for many uses, and path copying gives you both for free.

```check
Q: v3 holds 50, 30 and 70. You run delete(30), making v4, then view v3 and search for 30. What happens?
* It is found: v3 was never changed
- It is not found: the delete removed it
- An error: v3 was replaced by v4
= The delete copied a path and made a new root for v4. Every node of v3 is untouched, so v3 still holds 30.
```

## How much space?

m updates on a balanced tree of n keys cost O(n + m log n) nodes, against O(n·m) for full copies. With a plain BST, though, a path can be the whole tree: [Deep paths copy more](#example:sorted-copies-more) inserts sorted keys and copies the entire chain each time. In practice the tree underneath is a red-black tree, a treap or a weight-balanced tree, and the rotations are copied along with the path (they only touch nodes near the path anyway).

There's a smarter method, the "fat node" or node-copying scheme of Driscoll and friends, which gets O(1) amortized extra space per update. It's much harder to write, and path copying is good enough for nearly everything.

## When to use one

- **Undo and history.** Keep a pointer to each version and undo is O(1).
- **Functional programming.** Immutable maps and sets are path-copied trees. Sharing makes "copying" a map before changing it cheap.
- **Concurrency.** A reader holding an old root sees a consistent snapshot while writers make new versions; no locks for readers.
- **Geometry.** Sweep a line across the plane, keeping a persistent BST of what the line crosses; afterwards, any x has its own version. That's the classic planar point location trick.

Avoid it when you never need old versions: the copying costs time and garbage, and a plain mutable tree is faster.

## Common mistakes

- Changing a node "just this once", for example a child pointer during delete. Some older version shares that node, and now it's corrupted.
- Copying only the changed node and not its ancestors. The old parent still points at the old node, so the new version isn't reachable from any root.
- Thinking a shared subtree is copied. Only nodes on the path are new; the subtrees hanging off it are the same objects in both versions.
- Freeing nodes when a version is "done". Another version may share them. Garbage collection (or reference counting, as in the C++ tab) sorts it out.

## Try this

- [Insert copies one path](#example:insert-copies-path): before each insert, predict how many new nodes it makes. Watch the "nodes in all" readout.
- Insert `50 30 70 20 40 60 80`, then view each version in turn. Which nodes are shared between v6 and v7?
- Load [Versions can branch](#example:branching-versions), then view v3 and insert 20 there too. Do v4 and the new version share anything?
- Pick **Sorted keys (long paths to copy)** with 9 keys and compare the total nodes with **Random keys**.
