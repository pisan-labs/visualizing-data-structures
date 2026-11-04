# Queue (linked list)

A queue on a singly linked list keeps two pointers: `head` at the front, where items leave, and `tail` at the back, where they join. Both operations touch one end only, so both are O(1), and the list never fills up.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `enqueue(x)` | Hang a new node after `tail` and move `tail` to it | O(1) |
| `dequeue()` | Read the value at `head` and move `head` to the next node | O(1) |
| `peek()` | Read the value at `head` | O(1) |

## Which end is which?

Why join at the tail and leave at the head, and not the other way round? Adding a node after the last one is easy: `tail.next = node`. Removing the last node is not. You would need the node before it, and in a singly linked list the only way to find that node is to walk from the front, which is O(n). Removing the first node is easy: `head = head.next`. So items join at the tail and leave at the head, and both ends stay O(1). [Show me](#play:fifo)

And why keep `tail` at all? Without it, enqueue has to walk the whole list to find the end every time.

## Empty and one-node queues

Most of the bugs in linked queues live in two special cases.

The first enqueue has no last node to hang the new node on: `tail` is null. So instead of `tail.next = node`, enqueue sets `head = node`, and then `tail = node` as usual. After that one enqueue, `head` and `tail` point at the same node. [The first enqueue sets both pointers](#example:first-enqueue).

The last dequeue has the opposite problem. `head = head.next` makes `head` null, but `tail` still points at the node that just left. Dequeue has to notice that `head` is now null and set `tail = null` too. [The last dequeue clears tail too](#example:last-dequeue) shows it step by step.

```check
Q: A dequeue forgets the "if head == null then tail = null" step. The queue held one node. What goes wrong next?
- Nothing: head is null, so the queue looks empty anyway
- The next dequeue returns the same value again
* The next enqueue sees tail is not null, links the new node after the departed one, and head stays null
- The program runs out of memory
= Enqueue checks tail, not head. With a stale tail it takes the "else" branch and never sets head, so the new item is unreachable from the front.
```

## Garbage

Dequeue never touches the old front node itself. It moves `head` past it, and once nothing points at it, the node is garbage. Java and Python reclaim it by themselves; C++ frees it, here through `unique_ptr`. In the drawing, the old node turns grey for a step before it goes.

## Variants

Two other designs show up in textbooks. One keeps a dummy node in front of the real ones, so the queue is never truly empty and enqueue needs no special case. Another uses a circular list with only a `tail` pointer: the node after `tail` is the front, so one pointer does the job of two.

## When to use it

A linked queue never fills up and never copies anything, so every operation is O(1), every time. That suits a producer that can't predict how many items it will make. The cost is memory and speed: a `next` pointer per item, an allocation per enqueue, and nodes scattered around memory. A circular array that doubles when it fills, like Java's `ArrayDeque`, is usually faster in practice.

## Common mistakes

- Enqueueing at the head and dequeueing at the tail, which makes dequeue O(n).
- Forgetting to set `head` on the first enqueue.
- Forgetting to clear `tail` on the last dequeue.
- Reading `head.value` before checking that `head` is not null.

## Try this

- [First in, first out](#example:fifo). Predict the final peek before pressing play.
- [Underflow on an empty queue](#example:underflow).
- [A long line, and no capacity](#example:long-line). Watch how little each enqueue changes.
- Enqueue one value, dequeue it, and step through the dequeue slowly. Where does `tail` point after each line?
