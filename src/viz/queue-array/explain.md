# Queue (circular array)

A queue is a line. New items join at the rear, and items leave from the front. The first item in is the first item out, which is why you'll see queues called FIFO (first in, first out).

Print jobs wait in a queue. So do requests to a busy web server, and the vertices that breadth-first search has found but not visited yet.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `enqueue(x)` | Add `x` at the rear | O(1) |
| `dequeue()` | Remove the front item and return it | O(1) |
| `peek()` | Return the front item and leave it there | O(1) |
| `clear()` | Make the queue empty | O(1) |

All four are O(1). The interesting part is getting dequeue to be O(1) in an array.

## Why the array is circular

Start with the obvious design. Keep the items in `A[0]`, `A[1]`, and so on, with the front item in `A[0]`. Enqueue is easy. Dequeue is not: after taking `A[0]`, every other item shifts one slot to the left. That is O(n) for every dequeue.

So don't shift. Keep an index, `front`, for the front item, and move it forward on each dequeue. Keep another index, `rear`, for the next free slot, and move it forward on each enqueue. Both operations are now O(1), but the queue creeps to the right. Sooner or later `rear` reaches the end of the array while the slots at the start, freed by dequeues, sit empty.

The fix is to wrap around. When an index runs off the end, it continues at 0:

`rear = (rear + 1) mod capacity`

The array is still a row in memory. We just treat the slot after the last one as slot 0. [Show me](#play:wraparound)

## Full or empty?

Here is the catch. An empty queue has `front == rear`. Fill every slot and `rear` wraps around until it lands on `front` again, so a full queue also has `front == rear`. Two indices can't tell the two cases apart.

Textbooks fix this in two ways, and the **Telling full from empty** option switches between them.

- **Leave one slot empty.** Call the queue full when `rear` is one step behind `front`, that is, when `(rear + 1) mod capacity == front`. An array of 8 slots holds at most 7 items, and `front == rear` always means empty. CLRS does this, and it is the default here. [Show me](#play:full-gap)
- **Keep a count.** Track the number of items in `count`. Empty is `count == 0`, full is `count == capacity`, and every slot gets used. The price is one more variable to keep up to date. [Show me](#play:full-count)

Both work. Pick one and don't mix them.

```check
Q: The array has capacity 8 and one slot always stays empty. front = 6 and rear = 1. How many items are in the queue?
- 5
* 3
- 2
- 7
= The items sit in slots 6, 7 and 0. In general the size is (rear - front + capacity) mod capacity, which is (1 - 6 + 8) mod 8 = 3.
```

## Ring or row

The ring makes the wraparound easy to see: slot 7 sits right next to slot 0. Memory doesn't look like that. The **Draw the array** option shows the same array as a row, with a dashed path from the last slot back to the first. On the ring, a dashed line marks the seam where the array really ends, and it lights up whenever an index wraps.

Have a look at [a queue split across the end of the array](#example:split-row). By the end, the queue starts at index 3, runs to the last slot, and continues at index 0. Nothing moved. Only `front` and `rear` did.

## When to use it

A circular array makes a good queue when you know the largest size ahead of time. It never allocates after it starts, and the items sit next to each other in memory. Keyboard input, audio samples and network packets often wait in circular buffers like this one.

If you don't know how big the queue will get, it has to grow. Either copy everything into a bigger array when it fills up (enqueue stays O(1) amortized, the same trick as the dynamic array) or use a linked list. Java's `ArrayDeque` grows its array when it fills. Python's `collections.deque` is a linked list of blocks.

## Common mistakes

- Forgetting the `mod`. `rear = rear + 1` works right up to the first time `rear` reaches the end of the array.
- Testing for full with `front == rear` when there is no count. Without a count, that test means empty.
- Mixing the two conventions, for example keeping a count but still refusing to fill the last slot.
- Using `rear` for the last item in one method and for the next free slot in another. Here `rear` is always the next free slot.
- Expecting dequeue to erase the value. It only moves `front`. The value stays in the array, faded, until an enqueue overwrites it.

```check
Q: There is no count, so one slot stays empty. The capacity is 5, front = 2 and rear = 1. What does enqueue(9) do?
- Stores 9 in A[1] and moves rear to 2
* Reports overflow, because the queue already holds 4 items
- Stores 9 in A[2], on top of the front item
= (rear + 1) mod 5 = 2, which is front. Storing 9 would make front == rear, and that has to keep meaning empty.
```

## Try this

- [First in, first out](#example:fifo). Before pressing play, predict what the final peek returns.
- [Rear wraps around to index 0](#example:wraparound). Watch the dashed seam light up.
- [Full with one slot left empty](#example:full-gap) and [full with a count](#example:full-count). The same five enqueues end differently.
- [Empty again, away from index 0](#example:underflow). front == rear means empty wherever it happens.
- Switch **Draw the array** to a row and step through the wraparound example again.
- Type `1 2 3 4 5 6 7 8` in the value box and press **Enqueue**. How many fit?
