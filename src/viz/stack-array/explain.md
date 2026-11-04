# Stack (array)

A stack is a pile. You can add to the top, look at the top, or take from the top. That's it. The last item in is the first item out, which is why you'll see stacks called LIFO (last in, first out).

Your editor's undo works this way. Every edit gets pushed, and Ctrl-Z pops the most recent one.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `push(x)` | Put `x` on top | O(1) |
| `pop()` | Remove the top item and return it | O(1) |
| `peek()` | Return the top item and leave it there | O(1) |
| `clear()` | Make the stack empty | O(1) |

Every one of them is O(1). No loops, no searching. That is the whole appeal.

## An array and one integer

What's the simplest way to build a stack? An array `A` with a fixed capacity, and one integer, `top`, that says where the stack ends. Items sit in `A[0]`, `A[1]`, and so on, with the oldest at the bottom. Push and pop only touch the slot next to `top`, so nothing ever has to shift.

## Two meanings of top

Textbooks disagree about what `top` means, and both camps are right.

In the first version, `top` counts the items. An empty stack has `top = 0`, and `top` is also the index of the next free slot. Push stores first, then increments: `A[top] = x`, then `top = top + 1`.

In the second version, `top` is the index of the top item, so an empty stack has `top = -1`. Push increments first, then stores: `top = top + 1`, then `A[top] = x`.

Mixing the two is a reliable way to get an off-by-one error. Pick one and stay with it. The **Meaning of top** option switches between them. Run the same pushes under both and compare the order of the steps. [Show me](#play:index-convention)

```check
Q: When `top` starts at -1, which line runs first in push (after the full check)?
- `A[top] = x`
* `top = top + 1`
- They run at the same time
= In this version `top` points at the top item, so push has to move it up before it stores x.
```

## Full and empty

A fixed-size array runs out of room. Pushing onto a full stack is an overflow, and popping an empty stack is an underflow. Here both report an error and leave the stack alone. Real libraries differ. Java's `Stack.pop()` throws an `EmptyStackException`, and Python's `list.pop()` raises an `IndexError`. In C++, calling `pop()` on an empty `std::stack` is undefined behavior, which is a polite way of saying anything can happen.

The usual fix for overflow is to grow: when the array fills up, allocate one twice as big and copy everything over. Copying is O(n), but it happens rarely enough that push stays O(1) on average (amortized).

## Pop doesn't erase anything

Pop moves `top` down by one and returns the value. That's all. The value is still sitting in the array, and the visualization shows it faded. It is no longer part of the stack, and the next push into that slot overwrites it. Clear is even lazier: it resets `top` and leaves every value where it was. [Show me](#play:leftovers)

```check
Q: You push 1, 2 and 3, then pop twice. What is in `A[1]` now?
- Nothing, pop erased it
* 2
- 3
= Pop only moves `top`. The 2 stays in `A[1]` until a later push overwrites it.
```

## Where you'll meet stacks

Every function call pushes a frame onto the call stack, and every return pops one, which is why runaway recursion ends in a *stack overflow*. Compilers use a stack to check that brackets match: push each `(`, pop when you see `)`, and complain if the pop finds the wrong kind of bracket or nothing at all. Depth-first search uses a stack, either one you write or the call stack through recursion. The back button in your browser is (roughly) a stack too.

## Common mistakes

- Using `A[top]` for peek when `top` counts items. That slot is the next free one, and it holds a leftover or nothing.
- Checking `top == capacity` for full when `top` starts at -1. With that convention the stack is full at `capacity - 1`.
- Forgetting the empty check before pop or peek.
- Assuming pop erases the value. It doesn't.
- Reaching into the middle. If you need the third item from the top, you probably wanted a different data structure.

## Try this

- [Last in, first out](#example:lifo). Before pressing play, predict what the final peek returns.
- [Reverse a word](#example:reverse-word). Push S, T, A, C, K, then pop them all.
- [Popped values stay in memory](#example:leftovers). Watch the 9 overwrite the leftover 2 while the 3 above it stays put.
- [Overflow at capacity](#example:overflow) and [underflow on an empty stack](#example:underflow).
- [The other convention](#example:index-convention). Same operations as the first example, with `top` starting at -1. Step through both and spot where push and pop change order.
- Type `1 2 3 4 5` in the value box and press **Push**. Then set the detail level to Milestones and step through again.
