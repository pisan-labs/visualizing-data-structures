# Stack (linked list)

The same stack as before, built from nodes instead of an array. Each node holds a value and a pointer to the node under it. `top` points at the first node, and the last node's `next` is null.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `push(x)` | Make a node, point it at the old top, make it the top | O(1) |
| `pop()` | Read the top value and move `top` to the next node | O(1) |
| `peek()` | Read the top value | O(1) |

All O(1), and there is no capacity. This stack is full only when the computer runs out of memory.

## Push at the front

Push is three lines, and their order matters. [Show me](#play:lifo)

1. `node = new Node(x)` makes the node.
2. `node.next = top` points it at the current top.
3. `top = node` makes it the new top.

Swap lines 2 and 3 and you get `top = node` followed by `node.next = top`, which points the node at itself. The rest of the stack is still in memory, but nothing points at it, so it is lost.

Pushing onto an empty stack needs no special case. `top` is null, so `node.next` becomes null and the new node is also the last one. [The first push and the last pop](#example:first-push) shows both ends of that.

```check
Q: Suppose push runs top = node first and then node.next = top. What happens?
- It still works, just in a different order
- The new node is lost
* The new node points at itself, and the rest of the stack is lost
- Nothing changes: the two lines do the same thing
= After top = node, top and node are the same node, so node.next = top makes it point at itself. Nothing points at the old top any more.
```

## Pop, and the old node

Pop copies the top value, then moves `top` one link along. The old node itself doesn't change: it still holds its value and still points at the new top. But nothing points at it, and that makes it garbage. Java and Python find garbage and reclaim it by themselves. In C++ the code has to free it, which is the job of the `unique_ptr` in the C++ tab.

## Why the front and not the back?

You could push and pop at the tail of the list instead. Push would be fine with a tail pointer, but pop needs the node before the tail, and a singly linked list can only reach that by walking from the front. That makes pop O(n). At the front, everything push and pop need is one pointer away.

## Array or linked list?

The array stack has to pick a capacity, and growing it means copying. The linked stack never fills up and never copies. In exchange, every item carries a `next` pointer (for small items like numbers, the pointer can take more memory than the item), every push asks the memory allocator for a node, and the nodes end up scattered around memory, which the cache doesn't like. For most stacks, an array that doubles, like Python's `list` or Java's `ArrayDeque`, is faster in practice. The linked version earns its place when items are big, or when you want every push to be O(1) with no copying at all.

## Common mistakes

- Setting `top = node` before `node.next = top`.
- Forgetting the empty check. `top.value` on a null `top` is a `NullPointerException` in Java and undefined behavior in C++.
- Using a pointer to the popped node in C++ after it has been freed.
- Pushing and popping at the tail of a singly linked list, which makes pop O(n).

## Try this

- [Last in, first out](#example:lifo). Predict the final peek before pressing play.
- [Underflow on an empty stack](#example:underflow).
- [No capacity, no overflow](#example:no-overflow). Compare it with the overflow example on the array stack.
- [Reverse a word](#example:reverse-word).
