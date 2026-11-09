# Sliding window

Lots of array questions are about a stretch of consecutive values: the best three days in a row, the shortest run that adds up to enough, the longest run with no repeats. Trying every stretch costs O(n²), or O(n·k) for stretches of length k. A sliding window does it in one pass. Keep a window A[l..r] and a summary of what is in it (its sum, or how many times each value appears). When a value enters on the right, update the summary. When one leaves on the left, update it again. Each value enters once and leaves at most once, so the whole thing is O(n).

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `maxSum(A, k)` | The largest sum of k values in a row | O(n) |
| `shortest(A, S)` | The shortest window whose sum is at least S | O(n) |
| `longestDistinct(A)` | The longest window with no value twice | O(n) |

The dashed box is the window, with l and r under it and its sum (or length) above it. The gray band is the best window so far. The vars panel counts `enters` and `leaves`; compare them with `brute force`, the work of trying every window. [Show me](#play:fixed-size)

## A window of fixed size

For the largest sum of k values in a row, add up the first k. Then slide: A[r] enters, A[r − k] leaves, and the sum changes by their difference. One addition and one subtraction per slide, however big k is. On [the largest sum of 3 in a row](#example:fixed-size) that is 10 enters and 7 leaves, where adding up every window from scratch takes 24 additions. With k = 100 and a million values the gap is a lot bigger.

The average of the best window is just best / k, so the same code answers "the best 7-day average".

```check
Q: A = 2 7 1 8 and k = 3. The first window sums to 10. What is the sum after one slide?
- 17
* 16
- 8
- 18
= 8 enters and 2 leaves: 10 + 8 − 2 = 16.
```

## A window that grows and shrinks

Now the size is the answer. For the shortest window with sum at least S, grow the window on the right until the sum reaches S. Then shrink it from the left while it still reaches S, recording the length each time. Then grow again. [Grow until it is enough, then shrink](#example:grow-and-shrink) finds length 3 for S = 15. [Show me](#play:grow-and-shrink)

Why can we throw values away on the left? Once A[l..r] is big enough, any window that starts at l and ends later is longer, so it cannot be the shortest. We are done with l. And when the sum drops below S, moving l further only makes it smaller, so we have to grow. Both arguments lean on one fact: **the values are never negative**. Adding a value never lowers the sum, and dropping one never raises it.

l and r both move right only, so each moves at most n times. [One big value is enough on its own](#example:one-big-value) grows to six values and then shrinks six times in a row: even the 30 alone is big enough, so it leaves too. That is still at most 2n moves in all.

```check
Q: Why does the shortest-window code need values that are never negative?
- With negative values, the sum could overflow
* With a negative value, shrinking could raise the sum, so the window might give up too early
- Negative values cannot be added to a window
- It does not; the code works for any values
= Shrinking assumes dropping A[l] never makes the sum bigger. A negative A[l] does exactly that, so a shorter window to the right could be missed. Prefix sums with a monotonic deque handle negative values.
```

## Counting what is inside

The window can keep more than a sum. For the longest run with no repeated value, keep count[v], how many times v is in the window. When A[r] enters and its count becomes 2, shrink from the left until the first copy has left. The counts row under the array shows the map as it changes. [The longest stretch with no repeat](#example:no-repeat) finds 4 1 5 9 2 6. When nothing repeats, the window never shrinks at all. [All different](#example:all-different)

This is the famous "longest substring without repeating characters" problem, with numbers in place of letters. The code is the same with a map from characters to counts. With a hash map each update is O(1), so the pass stays O(n).

## When to use it

Use it when the question is about contiguous stretches and the summary can be updated in O(1) as a value enters or leaves: sums, counts, the number of distinct values. Questions that say "subarray" or "substring" and "longest", "shortest" or "at most k" are usually sliding windows.

Avoid it when the summary cannot be undone cheaply. A window's maximum is the classic case: when the biggest value leaves, what is the new maximum? Recomputing costs O(k). A [monotonic queue](/monotonic-queue/) fixes that. And when the values can be negative, shrink-when-big-enough breaks; use prefix sums instead. If the question is about pairs, not stretches, [two pointers](/two-pointers/) is the closer tool.

## Common mistakes

- Recomputing the sum of each window. That is the brute force with extra steps.
- Using `if` where the shrink needs `while`. One step left may not be enough; [one big value](#example:one-big-value) needs six in a row.
- Forgetting the empty case. If no window works, return 0 (or none), not ∞.
- Off-by-one in the length: the window A[l..r] holds r − l + 1 values.
- Running the shrinking version on negative values. It runs, and the answer is wrong.

## Try this

- Load 5 1 1 1 5 and press **Max sum of k** with k = 2, then k = 5. When does the window never slide?
- Load 1 2 3 4 5 6 and press **Shortest sum ≥ S** with S = 11, 15 and 22. Before each run, guess the answer.
- [S is too big: no window works](#example:not-enough). How many values leave?
- Load 2 2 2 2 2 and press **Longest with no repeat**. Count the enters and leaves.
