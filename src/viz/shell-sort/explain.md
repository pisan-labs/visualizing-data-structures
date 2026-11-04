# Shell sort

Insertion sort is fast when values are already close to their places, and slow when a value has far to travel, because it only ever moves a value one slot at a time. Donald Shell's idea (1959) was to run insertion sort over values that are far apart first. Values make big jumps early, and by the time the gap is 1 the array is nearly sorted, which is exactly the input insertion sort likes.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | Depends on the gaps: O(n²) worst case with Shell's, O(n^1.5) with Knuth's |

Pick a gap h. The values `A[0], A[h], A[2h], ...` form one list, `A[1], A[h + 1], ...` another, and so on: h lists, woven together. Insertion sort each of them. Now the array is h-sorted: every value is no bigger than the one h places to its right. Then pick a smaller gap and do it again, until the gap is 1. [Show me](#play:halving)

In the drawing, the slots of the list being sorted are outlined, and `temp` hovers over the gap just like `key` does in insertion sort.

## Why the early passes help

A gap of h lets a value travel h places in one shift. In [Knuth's gaps on 16 values](#example:knuth-gaps), the first gap is 13, and one shift moves 81 from `A[0]` straight to `A[13]`, its final place. Plain insertion sort would have needed 13 shifts for that.

A later pass never undoes an earlier one: an array that is 13-sorted stays 13-sorted after you 4-sort it. (That is a theorem, and not an obvious one.) So the work adds up instead of fighting itself.

```check
Q: With Shell's original gaps (n/2, n/4, ..., 1), which gaps sort 10 values?
- 10, 5, 2, 1
* 5, 2, 1
- 4, 1
- 8, 4, 2, 1
= Start at floor(10 / 2) = 5 and keep halving: 5, 2, 1.
```

## The gaps matter

The **Gap sequence** option has three choices.

- Shell's original: n/2, n/4, ..., 1. Easy to remember, and the worst case is still O(n²).
- Knuth's: 1, 4, 13, 40, ..., each 3h + 1, starting from the first one that reaches n/3 (rounded down), so the first gap is always less than n. The worst case drops to O(n^1.5).
- Ciura's: 1, 4, 10, 23, 57, 132, 301, 701, found by experiment rather than by a formula. Nobody has proved a bound for it, but in experiments it does better than the other two. [Show me](#play:ciura-gaps)

Every sequence ends with 1. That last pass is a plain insertion sort, so the result is always sorted; the gaps before it only decide how much work is left for it.

[A trap for Shell's halving gaps](#example:halving-trap) shows why the choice matters. The 8 large values sit in the even slots and the 8 small ones in the odd slots. Gaps 8, 4 and 2 are all even, so they only ever compare even slots with even slots and odd with odd: 34 comparisons, nothing moves. The final pass then has all 36 shifts to do, for 84 comparisons in total. Plain insertion sort does the same job in 50, and Knuth's gaps (13, 4, 1) in 61, because 13 is odd. [Show me](#play:halving-trap)

```check
Q: Why does every gap sequence end with a gap of 1?
- A gap of 1 is the fastest pass
* Only a gap of 1 compares every pair of neighbors, so only it guarantees a sorted result
- It does not have to; a sequence can stop at 2
= With h = 1 the last pass is a plain insertion sort, so whatever the earlier gaps did, the array ends up sorted.
```

## What it costs

On [sorted input](#example:sorted-input) nothing moves, and each pass costs n - h comparisons: 4 + 6 + 7 = 17 for 8 values. That is the O(n log n) best case with Shell's gaps.

For the average case there is no clean formula; it depends on the gaps, and with good gaps it grows far more slowly than n². The extra space is O(1).

Shell sort is not stable. A value can jump h places over an equal value in another list. [Equal values can change order](#example:not-stable) has two 33s that finish swapped.

## When to use it

When you need something faster than insertion sort, with no extra memory, no recursion and very little code. For large arrays, merge sort, quicksort and heap sort have better guarantees.

## Common mistakes

- Forgetting the final gap of 1. Without it the array is h-sorted, not sorted.
- Comparing with `A[j - 1]` instead of `A[j - h]` inside the loop. That turns every pass into plain insertion sort.
- Writing `j >= 0` instead of `j >= h` as the loop test. Then `A[j - h]` reads before the start of the array.
- Using Shell's halving gaps on sizes that are powers of 2 and expecting O(n^1.5). Try the trap.

## Try this

- [Big gaps first](#example:halving). Watch how little the last pass has left to do.
- [Knuth's gaps](#example:knuth-gaps) and [Ciura's gaps](#example:ciura-gaps).
- [Sorted input](#example:sorted-input): comparisons only.
- [A trap for Shell's halving gaps](#example:halving-trap). Then switch to Knuth's gaps and run it again.
- [Equal values can change order](#example:not-stable).
- Set the detail level to Milestones. Each step is then one whole gap, and you can see the array get closer to sorted.
