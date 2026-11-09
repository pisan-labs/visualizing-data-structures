# Bubble sort

Bubble sort looks at two neighbors. If they are out of order, it swaps them. A pass does this all the way along the array, and at the end of each pass one more value is in its final place. Keep making passes until nothing is left to fix.

It is slow. It is also the sort most people can write from memory, which is why every first course has it.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | O(n²); O(n) on sorted input with early exit |

Every swap fixes exactly one pair of values that was out of order (an inversion). Random input has about n²/4 inversions, so bubble sort makes about n²/4 swaps, one at a time. There is no shortcut. The swaps counter goes up only when a pair is out of order, so on sorted input it stays at 0. [Show me](#play:smallest-first)

## One pass

CLRS walks j from the back of the array to the front. Whenever `A[j]` is smaller than its left neighbor `A[j - 1]`, the two swap. The smallest value gets picked up on the way and carried to the front, one swap per step. After pass i, `A[0..i]` holds the i + 1 smallest values in order, and nothing will move them again. That is the green "sorted" part of the drawing.

Have a look at the 4 in [the smallest value moves to the front](#example:smallest-first). It starts in `A[5]` and takes five swaps to reach `A[0]`.

## Two directions

Most other books walk j from the front instead, so the largest value sinks to the end. The code is the mirror image: compare `A[j]` with `A[j + 1]` and swap if `A[j]` is bigger. Same number of comparisons, same number of swaps; the sorted part just grows from the other end. The **Direction of a pass** option switches between the two. [Show me](#play:largest-last)

## Stopping early

The CLRS version always makes n - 1 passes, even when the array was sorted to begin with. On 7 sorted values that is 21 comparisons for nothing.

The fix is one flag. Set `swapped = false` at the start of each pass and `swapped = true` on every swap. If a whole pass goes by without a swap, every neighbor pair is in order, so the array is sorted and we can stop. Sorted input now costs one pass of n - 1 comparisons. This is where the O(n) best case for bubble sort comes from; without the flag, the best case is O(n²) too. [Show me](#play:already-sorted)

```check
Q: With early exit on, how many comparisons does bubble sort make on 10 values that are already sorted?
- 45
* 9
- 10
- 0
= One pass compares the 9 neighbor pairs, finds nothing to swap, and stops.
```

## The last swap

We can do a little better than a flag. Remember where the last swap of the pass happened. In the CLRS direction everything in front of that spot is final, so the next pass can stop there instead of creeping forward one position at a time. On [nearly sorted input](#example:last-swap) this cuts 18 comparisons down to 8. A pass with no swaps ends the sort, so the rule includes early exit.

## What it costs

The worst case is reverse order: every comparison ends in a swap. Eight values need 28 comparisons and 28 swaps, which is n(n - 1)/2 of each. [Show me](#play:reverse)

The average is O(n²) as well; the swaps alone are about n²/4. The best case is O(n), and only with early exit. The extra space is O(1), since everything happens inside A.

Bubble sort is stable. It swaps only when a value is strictly smaller than its neighbor, so [equal values never swap](#example:duplicates) and stay in the order they came in.

## When to use it

Almost never in real code. Insertion sort does the same O(n²) amount of work with fewer writes (a shift is one write, a swap is three), and it also notices sorted input in a single pass. Knuth's verdict in *The Art of Computer Programming* was that bubble sort has nothing going for it except a catchy name and some interesting theory. I think that is fair.

Bubble sort earns its spot in a course because the invariant is easy to see: after each pass, one more value is final. It is also the cleanest way to meet inversions, which come back when you analyze insertion sort and merge sort.

```check
Q: CLRS bubble sort (j walks from the back) has just finished its first pass on 29, 64, 51, 18, 73, 4, 36. What is in A[0]?
* 4
- 29
- 36
- 73
= Each pass carries the smallest remaining value to the front, so after the first pass A[0] holds 4.
```

## Common mistakes

- Running j one step too far and reading `A[n]`, or `A[-1]` when walking from the back.
- Forgetting that each pass can stop one position earlier. The end that is already sorted does not need checking again.
- Swapping equal values. The sort still works, but it is no longer stable.
- Quoting O(n) for the best case without the early-exit flag. Without it, sorted input still costs n(n - 1)/2 comparisons.

## Try this

- [The smallest value moves to the front](#example:smallest-first). Before pressing play, predict how many swaps the first pass makes.
- [The largest value moves to the end](#example:largest-last): same values, the other direction.
- [Sorted input](#example:already-sorted). Then turn early exit off and run it again. Count the wasted comparisons.
- [Reverse order](#example:reverse), the worst case.
- [The last-swap rule](#example:last-swap) on nearly sorted input.
- [Equal values never swap](#example:duplicates).
- Load 20 random values and set the detail level to Milestones. Each step is now one whole pass.
