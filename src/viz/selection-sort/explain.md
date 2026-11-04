# Selection sort

Find the smallest value. Swap it to the front. Now find the smallest value in the rest, swap it into the second slot, and keep going. That is the whole algorithm. It fits in six lines, and it does the same amount of comparing no matter what you give it.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | O(n²) comparisons, always; n - 1 swaps |

Pass i scans `A[i..n-1]` with j and keeps `min` pointing at the smallest value seen so far. At the end of the pass, one swap puts that value into `A[i]`, and it never moves again. The sorted part grows from the front by exactly one value per pass. [Show me](#play:smallest-first)

CLRS leaves selection sort as an exercise, with the minimum version. The **Each pass selects** option switches to the mirror image: find the maximum and swap it to the end. [Show me](#play:largest-last)

## No best case

Selection sort does not look at the data before deciding how much work to do. Pass 1 makes n - 1 comparisons, pass 2 makes n - 2, and so on, n(n - 1)/2 in total, whatever the input. [Sorted input](#example:sorted-input) still takes 21 comparisons for 7 values, plus 6 swaps of a value with itself. [Reverse order](#example:reverse) is sorted after 4 passes, and the last 3 passes check it anyway.

```check
Q: How many comparisons does selection sort make on 10 values that are already sorted?
- 9
* 45
- 0
- 90
= Selection sort always makes n(n - 1)/2 comparisons: 9 + 8 + ... + 1 = 45. Sorted input does not help.
```

## Few swaps

The one thing selection sort does well is moving data. Each pass makes exactly one swap, so the whole sort makes n - 1 swaps, about 3n writes. Bubble sort and insertion sort can make around n²/4 swaps or shifts on random input. When writing is much more expensive than comparing (big records, or memory that wears out when you write to it), that difference can matter.

## Not stable

The swap at the end of a pass can send a value a long way, right over an equal value. [Equal values can change order](#example:not-stable) has two 27s. The first swap moves the 27 in `A[0]` behind the other one, nothing swaps them back, and they finish in the opposite order. The narration points out every swap that does this. Because the long-distance swap is the whole idea, there is no cheap fix: a stable version has to shift values over instead of swapping, which costs the few-writes advantage.

```check
Q: Selection sort (minimum version) runs on 5, 5, 1. Which 5 ends up first in the sorted array?
- The one that started first
* The one that started second
- It depends on the random seed
= The first swap trades A[0] = 5 with the 1, which moves the first 5 to the back, past the second 5. Nothing swaps them again.
```

## When to use it

For small arrays when writes are expensive, selection sort is a reasonable choice. Otherwise insertion sort is better at everything: same worst case, O(n) on sorted input, and stable.

Selection sort is still worth knowing well, because heap sort is selection sort with a better way to find the maximum. A heap hands over the largest remaining value in O(log n) instead of O(n), which turns n(n - 1)/2 comparisons into O(n log n).

## Common mistakes

- Swapping every time a smaller value turns up, instead of once at the end of the pass. That is a different (and worse) algorithm.
- Comparing `A[j]` with `A[i]` instead of with `A[min]`, the smallest so far.
- Starting j at i instead of i + 1. Harmless, but it wastes one comparison per pass.
- Claiming selection sort is stable. Try 5, 5, 1.

## Try this

- [Select the smallest, swap it to the front](#example:smallest-first). Before each pass, guess which value min will end on.
- [Select the largest, swap it to the end](#example:largest-last): same values, same counts.
- [Sorted input saves nothing](#example:sorted-input).
- [Reverse order](#example:reverse). Find the step where the array is already sorted.
- [Equal values can change order](#example:not-stable).
- Sort the same 8 values here and on the bubble sort page. Compare the swap counters.
