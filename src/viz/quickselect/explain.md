# Quickselect

Say you want the median of a million numbers. You could sort them and read the middle one, which costs O(n log n). Quickselect does it in O(n) on average, by doing only the part of quicksort that matters. Hoare published it in 1961, right next to quicksort.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `select(k)` | Returns the k-th smallest value (k = 1 is the smallest) | O(n) on average; O(n²) in the worst case |

In sorted order, the k-th smallest value would sit in `A[k - 1]`, the target slot. Partition the array around a pivot, exactly as quicksort does. Lomuto's partition puts the pivot in its final place, `A[q]`. If q is the target slot, you are done. If the target is left of q, the answer is somewhere left of the pivot, and everything right of it can be ignored for good, and the other way round. The drawing fades the part that is out of play. As on the quicksort page, the swaps counter skips a value swapped with itself, such as a pivot that is already in place. [Show me](#play:median)

```check
Q: Quickselect wants the 3rd smallest of 8 values, so the target is A[2]. The first partition puts the pivot in A[5]. Where does it look next?
* A[0..4]
- A[6..7]
- Both sides
- A[0..7] again, with a new pivot
= The target slot A[2] is left of the pivot, so only A[0..4] can hold the answer.
```

## Why it is O(n)

Quicksort recurses into both sides of every partition. Quickselect recurses into one. With a random pivot, each partition throws away a good share of the range on average, so the work adds up like n + 3n/4 + (3/4)²n + ..., which is O(n). Compare [the median](#example:median), found in 11 comparisons, with sorting the same 7 values.

CLRS calls this RANDOMIZED-SELECT, and a random pivot is the default here. The random choices come from the example's seed, so a replay picks the same pivots. CLRS also counts the rank relative to the current range (the i-th smallest of `A[p..r]`); this page keeps the absolute target slot `A[k - 1]` instead, which is easier to watch. The two are the same algorithm.

```check
Q: Why is quickselect O(n) on average when quicksort is O(n log n)?
* It continues into only one side of each partition
- Its partition is faster than quicksort's
- It stops as soon as it sees the k-th value
= Both partition the same way. Quicksort has to sort both sides; quickselect throws one side away every time, so the ranges shrink geometrically.
```

## Best case, worst case

When the first pivot happens to be the answer, one partition does it: [a lucky pivot](#example:lucky) finds the 4th smallest of 8 values in 7 comparisons.

The worst case is the same as quicksort's: a pivot that peels off one value at a time. [Sorted input with the last value as pivot and k = 1](#example:sorted-worst) makes 28 comparisons for 8 values, as many as sorting them. A random pivot makes that very unlikely. If you need a guarantee, CLRS's SELECT picks the pivot as a median of medians and runs in O(n) even in the worst case, at the price of a much bigger constant.

The **Partition scheme** option switches to [Hoare's partition](#example:hoare). The pivot does not end up in its final place, so there is no early hit; quickselect narrows the range until one value is left.

## When to use it

Medians, percentiles, "the 10 largest": anything where you need one rank, or the values on one side of it, and not the whole sorted order. C++'s `std::nth_element` does exactly this. [Repeated values](#example:duplicates) are fine; any of the equal values is a correct answer.

Keep in mind that it reorders the array. If the original order matters, work on a copy. And for k = 1 or k = n, a single scan is simpler: [the smallest value](#example:smallest) takes n - 1 comparisons with a plain loop.

## Common mistakes

- Comparing q with k instead of k - 1. Ranks start at 1, indices at 0.
- Recursing into both sides. That is quicksort, and it costs O(n log n).
- With CLRS's relative rank, forgetting to subtract the size of the left part when going right.
- Expecting the array to be sorted afterwards. Only the target slot is guaranteed; everything left of it is no bigger and everything right of it is no smaller.

## Try this

- [Find the median](#example:median). Before each partition ends, guess which side quickselect keeps.
- [The smallest value](#example:smallest).
- [A lucky pivot](#example:lucky) and [the worst case](#example:sorted-worst). Then switch the worst case to a random pivot.
- [Hoare's partition](#example:hoare).
- [Repeated values](#example:duplicates).
- Load 20 random values and select k = 10. Count how much of the array is faded by the end.
