# Singly linked list

A linked list is a chain of nodes. Each node holds a value and a pointer to the next node, and the last node points to null. The list itself is one pointer, `head`, to the first node. Lose `head` and you have lost the whole list.

An array keeps its items side by side, so `A[5]` is one calculation away. A linked list puts each node wherever there was room and strings them together with pointers. To reach index 5 you start at `head` and follow `next` five times. There is no shortcut.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insertHead(x)` | Put `x` in front | O(1) |
| `insertTail(x)` | Put `x` at the end | O(1) with a tail pointer, O(n) without |
| `insertAt(i, x)` | Put `x` so it ends up at index `i` | O(n) |
| `removeHead()` | Remove the first node, return its value | O(1) |
| `removeTail()` | Remove the last node, return its value | O(n), tail pointer or not |
| `removeAt(i)`, `removeValue(x)` | Remove a node from the middle | O(n) |
| `search(x)` | Index of the first `x`, or -1 | O(n) |
| `get(i)` | Value at index `i` | O(n) |
| `reverse()` | Turn the list around in place | O(n) |

Notice the pattern. Changing pointers is always O(1). Finding the node whose pointers need changing is what costs O(n), and the front is the only place you can find for free.

## Order matters

Inserting at the head takes two pointer changes:

```
new.next = head
head = new
```

What happens if we swap them? After `head = new`, nothing points at the old first node. Then `new.next = head` points the new node at itself. The rest of the list is still in memory, but nobody can reach it. Java and Python will eventually collect it as garbage. In C++ it is a memory leak.

So link the new node in before you let go of anything. Every insert on this page follows that rule, and the narration says which pointer changes first. [Show me](#play:head-order).

```check
Q: Inserting at the head, what goes wrong if we run head = new before new.next = head?
- Nothing, the order does not matter
- The new node ends up at the end of the list
* The rest of the list is lost and the new node points at itself
= After head = new, nothing points at the old first node any more. new.next = head then points the new node at itself.
```

## The tail pointer

With only `head`, inserting at the tail means walking the whole list to find the last node: n - 1 hops, every time. Building a list of n values with `insertTail` costs O(n²) that way. Keep a second pointer, `tail`, to the last node, and `insertTail` drops to O(1): `tail.next = new`, then `tail = new`.

The **Pointers into the list** option turns the tail pointer off. Try [inserting at the tail with no tail pointer](#example:no-tail) and watch the `hops` counter climb.

The tail pointer is not free. Every operation that can change the last node has to keep `tail` up to date, including the ones that empty the list. Forgetting `tail = null` there is an easy bug to write and a hard one to spot.

## Removing the tail still walks

You'd think a tail pointer makes `removeTail` O(1) as well. It doesn't. To remove the last node we have to change the `next` of the node *before* it, and nodes only point forward. `tail` knows where the end is, not who points at it. So we walk from `head` until `prev.next == tail`. [Show me](#play:remove-tail).

A doubly linked list fixes this by giving every node a `prev` pointer as well.

## prev and cur

To remove a node you need the node before it. `removeAt` and `removeValue` walk two pointers together: `cur` on the node we are looking at, and `prev` one step behind. When `cur` reaches the target, one assignment takes it out:

```
prev.next = cur.next
```

If the target is the first node there is no `prev`, so `head` moves instead. A lot of linked list bugs live in that special case. (Sentinel nodes get rid of it; the doubly linked list page shows how.)

The removed node is not erased. It sits in memory, still pointing into the list, until nothing points at it. The drawing greys it out and labels it garbage, then drops it when it is collected. [Insert and remove in the middle](#example:middle) shows both halves. [Show me](#play:middle).

## Reversing a list

Reversing a list in place is a favorite exercise because it only works if you get the order of the pointer changes right. It takes three pointers: `prev`, `cur` and `next`.

```
prev = null
cur = head
while cur != null
  next = cur.next
  cur.next = prev
  prev = cur
  cur = next
head = prev
```

Each pass turns one arrow around. `next` is there because the moment we set `cur.next = prev`, we have cut the only link to the rest of the list. Save it first. No node moves; only pointers change. That makes it O(n) time and O(1) extra space. Halfway through, the drawing turns the reversed nodes around so their arrows stay short. [Show me](#play:reverse).

```check
Q: In reverse(), why do we set next = cur.next before cur.next = prev?
- To count how many nodes there are
* After cur.next = prev, nothing else leads to the rest of the list
- So that prev can move before cur
= Once cur.next points back, the saved next is the only way forward to the nodes we have not reversed yet.
```

## When to use one

Linked lists are good when you add and remove at the front a lot, when you already hold a pointer to the place that changes, or when copying a big array to grow it is not an option. Stacks and queues built on lists, the chains in a hash table and adjacency lists in graphs all use them.

They are a poor choice when you need `get(i)`, because every access is a walk. They also lose to arrays in practice more often than Big-O suggests. The nodes are scattered around memory, so the processor's cache helps very little, and every node carries a pointer on top of its value. Python's `list` is an array. In Java, `ArrayList` is the usual default; in C++, `std::vector`. When you do want a list, Java's `LinkedList` and C++'s `std::list` are doubly linked, and `std::forward_list` is singly linked.

## Common mistakes

- Moving `head` before the new node is linked in.
- Forgetting the empty list. `head.next` on an empty list is a null pointer error.
- Forgetting the one-node list. Removing its only node has to set both `head` and `tail` to null.
- Not updating `tail` when you insert or remove at the end.
- Losing the rest of the list in a reversal because `next` was not saved.
- Walking one node too far. To insert at index `i` you need the node at `i - 1`.
- Assuming the removed node is gone. In C++ it stays until you `delete` it.

## Try this

- [Reverse a list in place](#example:reverse). Before each step, predict where `prev`, `cur` and `next` will move.
- [Insert at the head](#example:head-order) three times. Why does 10 end up first?
- [Insert at the tail with no tail pointer](#example:no-tail). Then turn the tail pointer on and replay it.
- [Removing the tail still walks](#example:remove-tail).
- [The empty list and the one-node list](#example:empty-and-one), then [index boundaries](#example:boundaries). Most bugs live at the edges.
- Type `1 2 3 4 5 6 7 8 9` and press **Insert at tail** to watch a long list wrap onto rows. Then reverse it with the detail level set to Milestones: one step per node.
