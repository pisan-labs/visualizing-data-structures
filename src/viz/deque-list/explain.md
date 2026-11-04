# Deque (linked list)

A deque lets items join and leave at both ends. On a linked list that takes one more pointer per node: besides `next`, each node keeps `prev`, the node before it. With `head` at one end and `tail` at the other, all four add and remove operations are O(1).

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `addFirst(x)`, `addLast(x)` | Link a new node in before `head` or after `tail` | O(1) |
| `removeFirst()`, `removeLast()` | Unlink the node at `head` or `tail` | O(1) |
| `peekFirst()`, `peekLast()` | Read the value at `head` or `tail` | O(1) |

## Why two links per node?

The queue on a singly linked list could add at the tail but only remove at the head. Removing the last node needs the node before it, and with only `next` pointers the only way to find that node is to walk from the front. That is O(n).

`prev` fixes it. `removeLast` reads the value at `tail`, moves `tail` to `tail.prev`, and cuts the new last node's `next`. [Show me](#play:remove-last)

The price is one more pointer per node, and more pointers to keep consistent. Every link between two neighbours now exists twice, once in each direction, and every operation has to update both.

## The two-way links in order

Here is `addFirst`. Make the node, point its `next` at the current first node, point that node's `prev` back at the new one, then move `head`. `addLast` is the mirror image, with `prev` and `next` swapped and `tail` for `head`.

The empty deque is the special case again. There is no first node whose `prev` could point back, but the new node becomes the last node as well, so `addFirst` sets `tail` instead. [The first add sets head and tail](#example:first-add) shows it.

Removing the only node is the same story backwards. `removeLast` moves `tail` to null, but `head` still points at the node, so it has to clear `head` too. [Removing the only node clears both pointers](#example:last-remove) walks through both ends.

```check
Q: A deque holds 4, 5, 6. removeFirst() has just run head = head.next. Which pointers still lead to the node holding 4?
- None: it is gone already
* The prev pointer of the node holding 5
- head and tail
- The next pointer of the node holding 5
= head has moved on to 5, but 5's prev still points back at 4. The next line, head.prev = null, cuts that link, and only then is 4 garbage.
```

## When to use it

A linked deque is O(1) at both ends every time, with no capacity and no copying. Java's `LinkedList` is a doubly linked list that implements the `Deque` interface, and Python's `collections.deque` is a doubly linked list of blocks of items. The same two-way links do more work elsewhere: an LRU cache keeps its items in a doubly linked list so it can move any node to the front in O(1).

If you only need the ends and you care about speed, a circular array that doubles (like Java's `ArrayDeque`) usually wins: no `prev` and `next` per item, and the items sit together in memory.

## Common mistakes

- Updating one direction and forgetting the other: setting `head.prev = node` but not `node.next = head`, or the reverse. Walking forward and walking backward then give different lists.
- Forgetting the empty case in `addFirst` and `addLast`, and the one-node case in the removes.
- Leaving the new end's link to the removed node in place. In Java or Python that keeps the old node alive (and reachable from the wrong end); in C++ with raw pointers it leaves a dangling pointer.
- Reading `tail.prev` before checking that `tail` is not null.

## Try this

- [Adding and removing at both ends](#example:both-ends). Predict both peeks before pressing play.
- [removeLast in one step, thanks to prev](#example:remove-last).
- [Empty at either end](#example:underflow).
- Add `1 2 3` with **Add first**, then the same with **Add last**, and compare the order.
