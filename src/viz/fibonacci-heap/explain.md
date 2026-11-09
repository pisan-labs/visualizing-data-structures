# Fibonacci heap

A Fibonacci heap is the [binomial queue](/binomial-queue/)'s lazy cousin. It keeps a list of heap-ordered trees and a pointer to the smallest root, and it puts off every bit of tidying it can. Insert just adds a tree. Union just joins two lists. The bill comes due in extractMin, which cleans up everything at once. Fredman and Tarjan designed it to make decreaseKey cheap, because Dijkstra's and Prim's algorithms call decreaseKey far more often than anything else.

The bounds are amortized: any one operation can be slow, but a sequence of them never is.

## The operations

| Operation | What it does | Amortized cost |
|---|---|---|
| `insert(key)` | Add a one-node tree to the root list | O(1) |
| `minimum()` | Read H.min | O(1) |
| `union(H1, H2)` | Join the two root lists | O(1) |
| `extractMin()` | Remove the minimum, then consolidate | O(log n) |
| `decreaseKey(x, k)` | Lower a key, cutting where needed | O(1) |
| `delete(x)` | decreaseKey to −∞, then extractMin | O(log n) |

Compare that with a [binary heap](/binary-heap/), where decreaseKey is O(log n). Dijkstra with a Fibonacci heap runs in O(E + V log V) instead of O(E log V).

## Lazy: a list of trees and a pointer

The roots form a circular, doubly linked list, and H.min points at the smallest one. Insert makes a one-node tree, puts it in the root list next to H.min, and checks whether it's the new minimum. That's it. Union splices two circular lists together, a few pointer changes, and keeps the smaller of the two minimums. Nothing is ever linked.

[Lazy inserts, then one big tidy-up](#example:lazy-inserts) starts with thirteen inserts: thirteen trees, one node each.

## extractMin pays the bill

extractMin removes H.min, and its children join the root list. Now someone has to find the new minimum, and that means looking at every root. While we're looking anyway, we tidy up. That's consolidate.

Consolidate keeps a table A with a slot for each degree. It goes through the roots one at a time and files each tree under its degree. If the slot is taken, the two trees of that degree get linked (the larger root becomes a child of the smaller) and the result, one degree bigger, tries the next slot. When every root has been filed, each degree has at most one tree. Read the root list back out of A and the smallest root is H.min.

[Show me](#play:lazy-inserts): extractMin removes 6, and consolidate links the other twelve one-node trees into a B₃ and a B₂. One operation, ten links. Watch the table A under the trees.

```check
Q: Thirteen inserts into an empty Fibonacci heap, then one extractMin. How many trees are left?
- 1
* 2
- 12
= Twelve keys are left after the minimum goes, and linking one-node trees in pairs works like a binary counter: 12 = 1100 in binary, so a tree of 8 and a tree of 4.
```

## decreaseKey: cut, mark, cascade

Lowering a key might break heap order with the parent. A binary heap would sift the key up. A Fibonacci heap just cuts the node, with its whole subtree, and makes it a new root. O(1).

Cutting freely would leave the trees skinny, though, and skinny trees mean high degrees and slow consolidates. So each node keeps a mark: it gets marked the first time it loses a child. If a marked node loses a second child, it gets cut too, and its parent gets the same treatment. That's a cascading cut. A node is never more than one child short without being cut itself. (Here a node also loses its mark whenever it becomes a root, since roots don't need marks.)

The drawing puts a dashed ring around marked nodes. [Show me](#play:cascading-cut): two decreaseKeys mark 19 and 17, and then lowering 31 cuts 31, then 19, then 17. Three cuts, and every mark is gone.

```check
Q: decreaseKey cuts x from its parent y, and y was already marked. What happens next?
- y is marked again
- Nothing: only x moves
* y is cut too, and the same check runs at y's parent
= y has now lost two children, so it is cut and becomes a root. Then cascadingCut looks at y's parent: mark it if it is unmarked, cut it if it is marked.
```

## delete

Lower the key to −∞, so the node is the minimum, then extractMin. [delete: decrease to −∞, then extract](#example:delete-node).

## Why it's fast: the potential

The trick to the analysis is a potential, Φ = t(H) + 2m(H): the number of trees plus twice the number of marked nodes. Think of it as money saved up for later work. The page shows all three numbers above the trees.

- insert adds a tree: Φ goes up by 1. Cheap now, a little debt for later.
- union changes nothing: the trees and marks are the same.
- consolidate does one link per tree beyond the first of each degree, and every link removes a tree, so the potential pays for the links. What's left is the O(log n) for the table and at most D(n) + 1 trees.
- A cascading cut unmarks a node (Φ drops by 2) and adds a tree (Φ rises by 1). The extra unit pays for the cut, so a whole cascade costs O(1).

So [Lazy inserts](#example:lazy-inserts) is honest: thirteen cheap inserts save up Φ = 13, and the one expensive extractMin spends it, ending at Φ = 2.

## Why "Fibonacci"

The O(log n) for extractMin needs the degree of every node to stay small. The marks guarantee it. A node of degree k has at least F(k + 2) nodes in its subtree, where F is the Fibonacci sequence, and F(k + 2) grows like φ^k with φ ≈ 1.618. So the degree is at most D(n) = ⌊log_φ n⌋, about 1.44 log₂ n. That's where the name comes from, and why the table A has D(n) + 1 slots.

## Two ways to draw it

The logical view draws the trees and the root list. The internal view draws the pointers CLRS keeps in every node: a child pointer, left and right pointers for the circular sibling list, and the degree. Parent pointers and the wrap-around of each child list are left out to keep the picture readable; the root list's wrap-around is drawn. [The same heap, as pointers](#example:pointers-view).

## When to use one, and when not to

Use a Fibonacci heap when decreaseKey dominates and n is large: shortest paths and minimum spanning trees on dense graphs are the classic case. It's also the reference point for every analysis of those algorithms.

In practice, though, the constants are bad. Every node carries four pointers, a degree and a mark, and consolidate jumps around memory. A binary heap usually wins on real hardware, even with its O(log n) decreaseKey. Hmmm, so why learn it? Because it shows how laziness plus a potential function buys bounds that are hard to get any other way. (Brodal queues get them in the worst case, with far more code.)

## Common mistakes

- Linking on insert. Insert never links: that's the whole point.
- Forgetting that the children of the minimum join the root list in extractMin.
- Marking the node that was cut. The parent gets the mark, not the child.
- Stopping the cascade too early. A marked parent is cut, and its parent is checked next.
- Expecting every operation to be fast. One extractMin after many inserts does a lot of work; it's the total that is bounded.
- Thinking the trees are binomial trees. With no cuts they are; cuts break that, and that's fine.

## Try this

- [Lazy inserts, then one big tidy-up](#example:lazy-inserts). Before the extractMin, predict the trees from 12 in binary.
- [A cascading cut](#example:cascading-cut). Watch m(H) and Φ in the variables after each decreaseKey.
- [Union in O(1)](#example:union-lazy). Count the links in the union, and then in the extractMin after it.
- [delete](#example:delete-node). Which node gets a mark?
- Start over with **Random, then extract min** and 15 keys, then decrease a few keys deep in the trees. Can you set up a cascade of two cuts?
