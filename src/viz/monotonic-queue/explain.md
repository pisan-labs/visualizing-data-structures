# Monotonic queue

The maximum of every window of k values in a row: the highest temperature in each week, the busiest hour in each rolling day. A [sliding window](/sliding-window/) keeps a sum up to date easily, because subtraction undoes addition. A maximum has no undo. When the biggest value leaves the window, which one is the new maximum? Scanning the window again costs k − 1 comparisons, so O(nk) in all. A monotonic queue answers every window in O(n) with one deque.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `windowMax(A, k)` | The maximum of every window of k values | O(n) |
| `windowMin(A, k)` | The minimum of every window of k values | O(n) |

The deque holds indices whose values decrease from front to back, so the front is always the window's maximum. In the drawing it is the bottom row of boxes, front on the left, with each index under its box; the same values are outlined in the array. The row above it fills with the answers, each under the first index of its window. [Show me](#play:window-max)

## Who gets to stay

When a new value arrives, look at the back of the deque. If that value is no bigger than the new one, drop it. It is older, so it leaves the window sooner, and while both are in the window the new one is at least as big. It can never be the maximum again. Keep dropping until the back is bigger, then add the new index at the back.

That is the [monotonic stack](/monotonic-stack/) rule, working on the back of the deque. The new part is the front. An index whose window has moved past it leaves from the front, even if it is the biggest value around. In [the maximum of every window of 3](#example:window-max), 7 is the answer for the first two windows, then leaves from the front. 5 arrives in the same step and drops 1 and 4 from the back.

```check
Q: A = 4 1 3 5 and k = 3. Which values are in the deque right after index 3 (the 5) is pushed?
- 4, 3, 5
- 3, 5
* 5
- 4, 5
= 4 has left the window from the front, and 5 drops 3 from the back. Only 5 is left.
```

## Why it is linear

The while loop can drop several values at once, but each index is pushed once and popped once (from the back or the front), so there are at most 2n deque operations over the whole run. Each one is O(1). The work does not depend on k at all, which is the surprise: a window of 1,000 costs the same as a window of 3.

The deque's size does depend on the input. On [decreasing values](#example:decreasing) nothing is ever dropped from the back, so the deque holds k indices and the front leaves at every step. On [increasing values](#example:increasing) every new value drops the one before it and the deque holds one index.

```check
Q: Why may we drop a value at the back for good when a bigger or equal value arrives?
- The deque has a fixed size
* The new value is at least as big and stays in the window longer, so the old one can never be a window's maximum
- The old value has already left the window
- Values at the back are always the smallest in the array
= Every window that still contains the old value also contains the new one, which is at least as big.
```

## Variants

Flip the comparison for the minimum: drop values at the back that are no smaller, and the deque's values increase. Switch **Find each window's** in the options. [The minimum of every window of 3](#example:window-min)

`≤` or `<` at the back? Both give the right answers. With `≤`, equal older values are dropped, so the deque holds fewer indices. With `<`, it keeps them and they leave from the front later. A heap of the window also works, in O(n log k), with lazy deletion of values that have left. The deque is simpler and faster.

The same deque appears in bigger algorithms: dynamic programming with a sliding range (the best of the last k states), the shortest subarray with sum at least S when values can be negative, and the "jump game" family of problems.

## When to use it

Use it whenever you need the maximum or minimum of a window that slides one way: rolling maxima in a time series, the range of the last k readings, DP transitions over the last k states.

Avoid it when the window does not slide. For the maximum of arbitrary ranges A[i..j], asked in any order, use a [segment tree](/segment-tree/) or a sparse table. And for a sum or a count, the deque is overkill: a plain [sliding window](/sliding-window/) updates those in O(1).

## Common mistakes

- Storing values instead of indices. Then you cannot tell when the front has left the window.
- Checking the front with `D.front < i − k`. The front has to leave as soon as it is k behind i, so the test is `==` (or `≤`); with `<` it stays one window too long.
- Writing an answer before the first window is full. The first answer comes at i = k − 1.
- Popping from the front when a bigger value arrives. Bigger values drop values at the back; only age removes the front.

## Try this

- [k = 1](#example:window-of-one): every value is its own window. What does the deque do?
- [k = n](#example:one-window): one window. Which values are left in the deque at the end, and why those?
- Load 5 5 5 5 5 and slide a window of 2. How many pops from the back?
- Load 1 3 2 5 4 6 and slide a window of 3, for the maximum and then for the minimum.
