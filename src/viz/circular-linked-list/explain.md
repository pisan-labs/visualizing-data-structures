# Circular linked list

Take a singly linked list and point the last node back at the first. Now there is no null at the end. There is no end at all, just a circle you can walk around forever if you are not careful.

This version keeps a single pointer, `tail`, to the last node. That turns out to be enough for both ends: the front is `tail.next`, one step away. It is the version many Java-based courses teach.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insertFront(x)` | Put `x` at the front | O(1) |
| `insertBack(x)` | Put `x` at the back | O(1) |
| `removeFront()` | Remove the front node, return its value | O(1) |
| `rotate()` | Move the front node to the back | O(1) |
| `traverse()` | Visit every node once, front to back | O(n) |
| `search(x)` | Index of the first `x`, or -1 | O(n) |

## One pointer, two ends

Why keep `tail` and not `head`? With only `head`, the front is easy but the back is a walk around the whole circle. With only `tail`, the back is `tail` and the front is `tail.next`. Both are O(1).

Inserting at the front puts the new node between `tail` and `tail.next`:

```
new.next = tail.next
tail.next = new
```

Same rule as every linked list: link the new node in before you let go of anything. Swap the two lines and the new node points at itself, and the rest of the circle is lost.

```check
Q: The list keeps only tail. Where is the front node?
- At tail
* At tail.next
- There is no way to reach it without walking around the circle
= The last node points back to the first one, so the front is one step after tail.
```

## Inserting at the back is inserting at the front

Here is the nice part. In a circle, the spot right after `tail` is both the front and the back. So `insertBack` does exactly what `insertFront` does, then moves `tail` one step forward, onto the new node. One extra assignment, and the new node is the back instead of the front. [Show me](#play:back-is-front).

`rotate()` uses the same idea with no new node at all: `tail = tail.next`. The old front becomes the back. Nothing else moves, which is why round-robin scheduling likes circular lists: serve the front, rotate, repeat. [Rotate](#example:rotate) does it twice.

## The empty list and the one-node list

These two cases are where circular list code breaks, so the narration calls them out every time.

- **Empty:** `tail` is null. Inserting into an empty list cannot use `tail.next`, so the new node points at itself: `new.next = new`. A one-node circle.
- **One node:** `tail.next == tail`. Removing it has to set `tail = null`; there is no other node for `tail.next` to skip to.

[The empty list and the one-node list](#example:one-node) walks through both.

## Going around once

To traverse, start at the front and stop when you get back to it:

```
cur = tail.next
do
  visit(cur)
  cur = cur.next
while cur != tail.next
```

Two things matter here. First, the test is "back at the start", not "null". There is no null, so `while cur != null` never stops. Second, it is a do-while. A plain while loop tests first, and since `cur` starts at the front, it would stop before visiting anything. [Show me](#play:traverse).

```check
Q: What happens if you traverse a circular list with while (cur != null) { visit(cur); cur = cur.next; }?
- It visits every node once
- It visits nothing
* It never stops
= No node's next is null in a circle, so cur is never null and the loop keeps going around.
```

## When to use one

Use it when the work goes around in turns, like round-robin scheduling or players taking turns in a game. It also makes a queue with one pointer: `insertBack` and `removeFront` are both O(1). [A queue with one pointer](#example:queue).

Avoid it when you need to remove from the back. That needs the node before `tail`, and finding it is a walk all the way around: O(n). A doubly linked list fixes that. Index access is a walk too, as in any linked list.

## Common mistakes

- Looping until null. In a circle there is no null.
- Using a while loop that tests before the first visit. Use do-while, or handle the first node by hand.
- Forgetting `new.next = new` for the first node, which leaves a null in a list that is not supposed to have any.
- Forgetting `tail = null` when the last node goes.
- Losing track of the front when inserting: save `tail.next` into `new.next` before changing `tail.next`.

## Try this

- [Insert at the back](#example:back-is-front). Watch 30 go in at the front and become the back when `tail` moves.
- [Rotate](#example:rotate). Before you press play, predict the order after two rotations.
- [Traverse once around](#example:traverse) and [search goes around once](#example:search). Where does each loop stop?
- [The empty list and the one-node list](#example:one-node).
- Type `1 2 3 4 5` and press **Insert at back**, then **Rotate** a few times. The circle never changes; only where it starts.
