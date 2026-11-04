# Insertion sort

Insertion sort keeps the front of the array sorted. It takes the next value, slides it left past every bigger value, and drops it into the gap. One more value is in the sorted part, and nothing outside the sorted part has been touched yet.

CLRS opens with this algorithm, and for good reason: it is short, it is easy to prove correct, and it is useful, which is rare for an O(n²) sort.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | O(n²); O(n) on sorted or nearly sorted input |

For i = 1, 2, ..., n - 1: `A[0..i-1]` is sorted, so find where `A[i]` belongs in it and put it there. The gray band in the drawing is the sorted part. Unlike selection sort, values in the band are not final yet; a later value can still push them right. [Show me](#play:shift-right)

## Shift or swap

CLRS lifts the new value out into a variable, `key`. Then it walks j left through the sorted part, and every value bigger than `key` shifts one slot right. When j finds a value that is not bigger (or falls off the front), `key` drops into the gap. In the drawing, the key hovers above the gap and the faded numbers are old copies that the next write will overwrite.

The other version, common in code you will find online, swaps the new value with its left neighbor until it fits. [Same values, swapping](#example:swap-left). The comparisons are identical. The difference is the writes: a shift is one write, a swap is three. The **Make room by** option switches between them.

```check
Q: How many shifts does insertion sort make on 3, 1, 2?
- 0
- 1
* 2
- 3
= One shift per pair that is out of order. 3 is bigger than both 1 and 2, so there are two such pairs.
```

## Why it is fast on nearly sorted input

Every shift fixes exactly one pair of values that was out of order (an inversion). So the number of shifts equals the number of inversions, and the comparisons are at most the shifts plus n - 1. On [sorted input](#example:already-sorted) that is 7 comparisons and no shifts for 8 values. On [nearly sorted input](#example:nearly-sorted) with two pairs out of order, it is two shifts. [Show me](#play:nearly-sorted)

The worst case is [reverse order](#example:reverse): every new value travels all the way to the front. 8 values take 28 comparisons and 28 shifts, n(n - 1)/2 of each. Random input has about n²/4 inversions, so the average is O(n²) too.

## Stable and online

The loop stops at the first value that is not bigger than `key`, so a value never moves past an equal one. [Equal values stay in order](#example:duplicates); insertion sort is stable. It is also online: it can sort values as they arrive, because each new value only has to be inserted into what is already sorted.

```check
Q: The array is sorted except that its last value is the smallest. How much work does insertion sort do?
* O(n): about 2n comparisons and n - 1 shifts
- O(n log n)
- O(n²), because the last value has to travel the whole array
= Only the last value is out of place, so there are n - 1 inversions and n - 1 shifts. Every other value costs one comparison.
```

## When to use it

For small arrays and nearly sorted arrays, insertion sort is the right choice, not a teaching toy. Python's built-in sort uses insertion sort (with binary search to find the spot) to build short runs, and many quicksort implementations hand small pieces to insertion sort instead of recursing all the way down. Its loop is tight, it uses no extra space, and for 10 or 20 values the constant factors beat O(n log n) algorithms.

Avoid it for large arrays in random or reverse order. n²/4 shifts on a million values is about 250 billion writes.

## Common mistakes

- Comparing with `A[i]` inside the loop instead of `key`. After the first shift, `A[i]` no longer holds the value you are inserting.
- Testing `A[j] > key` before `j >= 0`. With j = -1, that reads outside the array; the order of the two tests matters.
- Using `>=` instead of `>`. The sort still works, but equal values swap places and it is no longer stable.
- Dropping `key` into `A[j]` instead of `A[j + 1]`. The loop ends one slot to the left of the gap.

## Try this

- [Lift the key, shift, drop it in](#example:shift-right). Before each drop, predict where key lands.
- [Swap the new value left](#example:swap-left). Same comparisons, different writes.
- [Sorted input](#example:already-sorted) and [nearly sorted input](#example:nearly-sorted).
- [Reverse order](#example:reverse), the worst case.
- [Equal values stay in order](#example:duplicates).
- Load 20 values in reverse order and set the detail level to Milestones. Every step is one insertion.
