# Treap

A treap is a binary search tree where every node also carries a random number, its priority. The keys follow the BST rule and the priorities follow the heap rule, both at once. The name is tree plus heap. Cecilia Aragon and Raimund Seidel came up with it in 1989.

Why bother? A plain BST is only as good as the order the keys arrive in. A treap ignores that order: the random priorities decide the shape, and a random shape is a good shape.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `search(k)` | Finds the node with key k, as in any BST | O(log n) expected |
| `insert(k)` | Adds k as a leaf with a random priority, then rotates it up | O(log n) expected |
| `delete(k)` | Rotates k down until it has at most one child, then removes it | O(log n) expected |
| `min()`, `max()` | Smallest and largest key | O(log n) expected |
| `inorder()` | Every key, in sorted order | O(n) |

Expected means averaged over the random priorities, not over your keys. There's no bad input. There are only unlucky coin flips, and long chains are very unlikely.

## Two orders at once

Look at the keys and you see a BST: smaller keys to the left, bigger to the right. Look at the priorities (the small numbers to the right of each node) and you see a heap: every node's priority is smaller than its children's, so the smallest priority sits at the root. CLRS puts smaller priorities on top. Some books put larger ones on top, and **Heap order** in Options switches between the two.

Here's the neat part. If no two priorities are equal, the keys and priorities decide the whole shape. The root must be the key with the smallest priority. Every smaller key goes into its left subtree, every bigger key into its right subtree, and the same rule picks the root of each subtree. Insert the same pairs in any order and you get the same treap. [Same keys and priorities, same treap](#example:typed-priorities).

That also tells you what a treap looks like: the BST you'd get by inserting the keys in order of priority. With random priorities, that's a BST built from a random insertion order.

```check
Q: A treap holds keys 10, 20 and 30 with priorities 3, 1 and 2, and smaller priorities sit higher. Which key is at the root?
- 10
* 20
- 30
- It depends on the order of the inserts
= The root has the smallest priority, 1, which belongs to 20. Then 10 goes left and 30 goes right. The insertion order does not matter.
```

## Insert: add a leaf, rotate it up

Give the new key a random priority and insert it as a BST would, as a leaf. The keys are in order, but the new priority may be smaller than its parent's, which breaks the heap rule. Fix it with a rotation that lifts the new node above its parent. Rotations keep the keys in order, so the BST rule is safe. Repeat until the parent's priority is smaller, or the new node is the root. [Show me](#play:insert-rotate-up).

How many rotations does that take? Most new nodes have large priorities and stay near the bottom. CLRS works out that the expected number of rotations per insert is less than 2.

## Delete: rotate it down

Delete is insert backwards. Find the node, then push it down with rotations until it has at most one child. At each step, the child with the smaller priority moves up, so the heap rule holds everywhere except at the node that's leaving. Once it has one child or none, splice it out as in a BST. [Show me](#play:delete-rotate-down).

## Random priorities make it shallow

Seven keys in increasing order make a plain BST a chain of height 6. Give them random priorities and the treap comes out shaped like a BST built in random order. [Sorted keys, random priorities](#example:sorted-keys) has height 3. [Show me](#play:sorted-keys).

The expected depth of a node is about 1.39 log₂ n, the same as in a randomly built BST. The difference is that nobody had to shuffle the input. The priorities did it.

Pick bad priorities by hand, though, and you can still get a chain. [Bad priorities make a chain](#example:chain-priorities) gives each key a priority that rises with the key, and the tree is as tall as it can be. That's why the priorities have to be random, and why your program's random number generator shouldn't be predictable to whoever chooses the keys.

## Typed priorities

The priorities here come from a seeded random generator, so a saved example replays exactly. You can also choose a priority yourself: type `50:7` for key 50 with priority 7. Switch **Priorities** in Options to typed by hand, and every insert needs one. That's useful for exercises, since everyone gets the same tree.

## When to use one, and when not to

Use a treap when you want a balanced BST and don't want to write AVL or red-black code. Insert and delete are a few lines each, and there's no case analysis. Treaps also split and join easily: give a key the smallest priority and it rotates to the root, with every smaller key on its left and every bigger one on its right.

Avoid it when you need a guarantee for every single operation. The bounds hold on average over the random priorities, and an AVL or red-black tree promises O(log n) every time. If you never need the keys in order, a hash table is simpler.

```check
Q: You insert the same five key-priority pairs into two empty treaps, in two different orders. All priorities are different. What can you say about the two treaps?
* They are the same tree
- They have the same height, but maybe different shapes
- They can be completely different
= With distinct priorities, the keys and priorities decide the shape on their own: the smallest priority is the root, and the same rule applies inside each subtree.
```

## Common mistakes

- Rotating the wrong way on insert. The new node has to move up, so rotate at its parent: right if it's a left child, left if it's a right child.
- Picking the child with the larger priority during delete. With smaller priorities on top, the smaller one has to move up, or the heap rule breaks.
- Mixing up the two conventions. Check whether your course puts smaller or larger priorities on top.
- Choosing priorities with a pattern, such as a counter. That brings back the chains that random priorities were supposed to remove.
- Forgetting that the BST rule still decides where a new key starts. The priority only decides how far it climbs.

## Try this

- [A new key rotates up](#example:insert-rotate-up). Before you press play, predict how many rotations 40 needs.
- [Delete rotates the key down](#example:delete-rotate-down), then [same keys and priorities, same treap](#example:typed-priorities).
- Pick **Sorted keys (still shallow)** with 31 keys a few times and note the heights. Then pick **Sorted keys and priorities (a chain)**.
- Switch **Heap order** in Options and replay [the rotation example](#example:insert-rotate-up). Which key is the root now? Compare with [a max-heap of priorities](#example:max-heap).
- Turn on typed priorities, insert `50:5 30:3 70:7 20:2`, and draw the treap on paper before you look.
