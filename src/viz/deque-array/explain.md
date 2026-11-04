# Deque (circular array)

A deque is a queue with two doors. You can add or remove at the front, and add or remove at the back. The name is short for double-ended queue, and it is pronounced "deck".

Use only one end and you have a stack. Add at the back and remove from the front and you have a queue. A deque does both jobs, which is why Java's own documentation recommends `ArrayDeque` over its old `Stack` class.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `addFirst(x)` | Add `x` before the first item | O(1) |
| `addLast(x)` | Add `x` after the last item | O(1) |
| `removeFirst()` | Remove the first item and return it | O(1) |
| `removeLast()` | Remove the last item and return it | O(1) |
| `peekFirst()` | Return the first item and leave it there | O(1) |
| `peekLast()` | Return the last item and leave it there | O(1) |

Six operations, all O(1). There isn't a loop anywhere.

## One ring, two directions

The deque uses the same circular array as the queue. `front` is the index of the first item, and `rear` is the slot after the last item. `addLast` and `removeFirst` are enqueue and dequeue under new names: store at `rear` and move it forward, or read at `front` and move it forward.

The new part is moving backward. `addFirst` steps `front` back one slot and then stores, and `removeLast` steps `rear` back one slot and then reads:

`front = (front - 1) mod capacity`

Stepping back from index 0 lands on the last index, because `(0 - 1) mod 8 = 7`. [Show me](#play:wraps)

Careful, though. The pseudocode's `mod` is the math one, which never goes negative (CLRS uses it the same way). Python's `%` works like that too. Java's, C's and C++'s `%` do not: `-1 % 8` is `-1`. So the Java and C++ tabs add the capacity first, `(front - 1 + capacity) % capacity`, which keeps the number from going negative.

```check
Q: An empty deque in an array of capacity 6 has front = 0 and rear = 0. After addFirst(9), where is 9?
- A[0]
- A[1]
* A[5]
- A[6]
= addFirst moves front back first: (0 - 1) mod 6 = 5. Then it stores 9 in A[5].
```

## Full or empty?

Same catch as the queue: `front == rear` describes both an empty deque and a full one. The **Telling full from empty** option picks the fix. By default one slot always stays empty, so an array of 8 slots holds 7 items. Keep a count instead and all 8 slots get used. Compare [full from both ends](#example:full-both-ends) with [every slot used, with a count](#example:full-count).

## A stack and a queue in one

Have a look at [a deque used as a stack](#example:as-stack) and [a deque used as a queue](#example:as-queue). Same values, same structure, different ends. In Python, `collections.deque` is the usual way to get a fast queue (`append` and `popleft`), since `list.pop(0)` shifts everything. In Java, `ArrayDeque` covers stacks and queues both.

## When to use it

Reach for a deque when items arrive or leave at both ends. The sliding-window maximum keeps candidate indices in a deque: new ones join at the back, and ones that slid out of the window leave from the front. An undo history with a limit adds each new action at one end and drops the oldest from the other. Checking a palindrome takes characters off both ends and compares them.

If you only ever use one end, a stack or a queue says what you mean more clearly. And like any fixed-size array, this one fills up. Growing it means copying the items into a bigger array, unwrapping them in order from `front` as you go.

## Common mistakes

- Copying `front = (front - 1) mod capacity` into Java or C++ as `(front - 1) % capacity`. At `front = 0` that gives -1, and `A[-1]` throws in Java and is undefined behavior in C++.
- Storing before moving in `addFirst`. `A[front] = x` before `front` moves overwrites the current first item.
- Reading `A[rear]` in `removeLast` or `peekLast`. `rear` is the free slot after the last item, so the last item is one step back.
- Testing for full with `front == rear` when there is no count.

```check
Q: The capacity is 8, front = 2 and rear = 5. Which slot does peekLast() read?
- A[5]
* A[4]
- A[2]
- A[6]
= rear is the free slot after the last item, so the last item sits at (5 - 1) mod 8 = 4.
```

## Try this

- [Adding and removing at both ends](#example:both-ends). Predict both peeks before pressing play.
- [Both ends wrap past index 0](#example:wraps). Watch the dashed seam light up when `front` steps back from 0.
- [Empty at either end](#example:underflow). The only item leaves from the back, and then neither end has anything.
- Type `1 2 3 4 5` and press **Add first**. Which way do the values run around the ring?
